import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveLargeContextModel } from "@/lib/freellm";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { generateBriefing, type BriefingInputs, type BriefingPart } from "@/lib/briefing";

export const maxDuration = 300;

const BRIEFING_LIMIT = { max: 15, windowMs: 60 * 60 * 1000 }; // 15 / hour / user

type Params = { params: Promise<{ id: string }> };

interface MapNodeLite {
  id: string;
  examImportance?: number;
}

/**
 * Builds the ordered part list the briefing reasons over, joining each section
 * to its concept-map node so the model gets the per-part exam importance.
 */
function buildParts(
  sections: { order: number; conceptKey: string; title: string }[],
  mindMap: unknown
): BriefingPart[] {
  const nodes = ((mindMap as { nodes?: MapNodeLite[] } | null)?.nodes ?? []) as MapNodeLite[];
  const importanceByKey = new Map(nodes.map((n) => [n.id, n.examImportance]));
  return [...sections]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({
      index: i + 1,
      title: s.title,
      examImportance: importanceByKey.get(s.conceptKey) ?? null,
    }));
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      userId: true,
      name: true,
      code: true,
      educationLevel: true,
      examDate: true,
      status: true,
      rawText: true,
      topics: {
        orderBy: { order: "asc" },
        select: { num: true, title: true, priority: true, priorityLabel: true, why: true },
      },
    },
  });

  if (!course || course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (course.status !== "READY" || !(course.rawText ?? "").trim()) {
    return NextResponse.json(
      { error: "This course isn't ready yet — add materials and wait for processing first." },
      { status: 400 }
    );
  }

  const guide = await prisma.studyGuide.findUnique({
    where: { courseId },
    select: {
      id: true,
      language: true,
      mindMap: true,
      sections: { orderBy: { order: "asc" }, select: { order: true, conceptKey: true, title: true } },
    },
  });

  if (!guide || !guide.mindMap || guide.sections.length === 0) {
    return NextResponse.json(
      { error: "Build your study guide first — the game plan is built from its parts." },
      { status: 400 }
    );
  }

  const limit = rateLimit(`briefing:${userId}`, BRIEFING_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You've built several game plans recently. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  await prisma.studyGuide.update({
    where: { id: guide.id },
    data: { briefingStatus: "GENERATING", briefingError: null },
  });

  const inputs: BriefingInputs = {
    courseName: course.name,
    courseCode: course.code,
    educationLevel: course.educationLevel,
    language: guide.language ?? "the language of the material",
    examDate: course.examDate,
    rawText: course.rawText ?? "",
    topics: course.topics,
    parts: buildParts(guide.sections, guide.mindMap),
  };

  const model = resolveLargeContextModel(await isProUser(userId));

  try {
    const briefing = await generateBriefing(inputs, model);
    await prisma.studyGuide.update({
      where: { id: guide.id },
      data: { briefing: briefing as object, briefingStatus: "READY", briefingError: null, modelId: model },
    });
    return NextResponse.json({ briefing });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Couldn't build your game plan.";
    console.error(`[briefing:${courseId}] ${msg}`);
    await prisma.studyGuide
      .update({ where: { id: guide.id }, data: { briefingStatus: "FAILED", briefingError: msg.slice(0, 500) } })
      .catch(() => {});
    return NextResponse.json({ error: "Couldn't build your game plan. Please try again." }, { status: 502 });
  }
}
