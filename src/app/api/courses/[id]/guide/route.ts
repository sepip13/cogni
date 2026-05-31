import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveLargeContextModel } from "@/lib/freellm";
import { buildMindMap } from "@/lib/concept-map";
import { generateSection } from "@/lib/guide";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { userHasJobCapacity } from "@/lib/concurrency";

export const maxDuration = 300;

const GUIDE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 }; // 10 / hour / user

type Params = { params: Promise<{ id: string }> };

async function ownedCourse(courseId: string, userId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      userId: true,
      name: true,
      educationLevel: true,
      status: true,
      rawText: true,
      topics: {
        orderBy: { order: "asc" },
        select: { num: true, title: true, priority: true, priorityLabel: true, why: true },
      },
    },
  });
  return course && course.userId === userId ? course : null;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { userId: true },
  });
  if (!course || course.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const guide = await prisma.studyGuide.findUnique({
    where: { courseId },
    select: {
      id: true,
      status: true,
      language: true,
      mindMap: true,
      outline: true,
      briefing: true,
      briefingStatus: true,
      briefingError: true,
      error: true,
      updatedAt: true,
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          conceptKey: true,
          title: true,
          status: true,
          contentMd: true,
          quiz: true,
          quizStatus: true,
        },
      },
    },
  });

  // Mimic-mode signal: questions can mirror the student's real exam only when a
  // parsed trial paper exists. Cheap, indexed lookup; only when a guide exists.
  let examStyleAvailable = false;
  if (guide) {
    const trial = await prisma.examTrial.findFirst({
      where: { courseId, status: "READY" },
      orderBy: { createdAt: "desc" },
      select: { questions: true },
    });
    examStyleAvailable = Array.isArray(trial?.questions) && trial.questions.length > 0;
  }

  return NextResponse.json({ guide: guide ?? null, examStyleAvailable });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId } = await params;

  const course = await ownedCourse(courseId, userId);
  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (course.status !== "READY" || !(course.rawText ?? "").trim()) {
    return NextResponse.json(
      { error: "This course isn't ready yet — add materials and wait for processing first." },
      { status: 400 }
    );
  }

  const limit = rateLimit(`guide:${userId}`, GUIDE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You've built several guides recently. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  if (!(await userHasJobCapacity(userId))) {
    return NextResponse.json(
      { error: "You have several tasks still processing. Please wait for them to finish, then try again." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { model?: unknown };
  const requested = typeof body.model === "string" ? body.model : null;
  const model = resolveLargeContextModel(await isProUser(userId), requested);

  // Reset to a clean ANALYZING state (regenerate replaces the old map + sections).
  const guide = await prisma.studyGuide.upsert({
    where: { courseId },
    create: { courseId, status: "ANALYZING", modelId: model },
    update: { status: "ANALYZING", modelId: model, mindMap: undefined, outline: undefined, error: null },
  });
  await prisma.studyGuideSection.deleteMany({ where: { guideId: guide.id } });

  after(async () => {
    await buildConceptMap(guide.id, course, model);
  });

  return NextResponse.json({ guideId: guide.id }, { status: 202 });
}

type CourseForMap = NonNullable<Awaited<ReturnType<typeof ownedCourse>>>;

function topicHintsFor(course: CourseForMap): string {
  if (course.topics.length === 0) return "(none)";
  return course.topics
    .map((t) => `- ${t.num} ${t.title} [${t.priority}${t.priorityLabel ? `/${t.priorityLabel}` : ""}]`)
    .join("\n");
}

async function buildConceptMap(guideId: string, course: CourseForMap, model: string): Promise<void> {
  try {
    const map = await buildMindMap(
      {
        courseName: course.name,
        educationLevel: course.educationLevel,
        rawText: course.rawText ?? "",
        topicHints: topicHintsFor(course),
      },
      model
    );

    const byId = new Map(map.nodes.map((n) => [n.id, n]));
    const ordered = [...map.outline, ...map.nodes.map((n) => n.id).filter((id) => !map.outline.includes(id))];
    const sections = ordered.map((id, i) => ({
      guideId,
      order: i,
      conceptKey: id,
      title: byId.get(id)?.label ?? id,
      status: "PENDING" as const,
    }));

    await prisma.$transaction([
      prisma.studyGuide.update({
        where: { id: guideId },
        data: {
          status: "MAP_READY",
          language: map.language,
          mindMap: { nodes: map.nodes, edges: map.edges, clusters: map.clusters },
          outline: ordered,
        },
      }),
      prisma.studyGuideSection.createMany({ data: sections }),
    ]);

    // Session 1: auto-generate the first section so the user has content right away.
    const first = await prisma.studyGuideSection.findFirst({
      where: { guideId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (first) await generateSection(first.id, model);
  } catch (err) {
    const msg = err instanceof Error && err.message ? err.message : "Concept analysis failed.";
    console.error(`[guide:${guideId}] concept-map error:`, msg);
    await prisma.studyGuide
      .update({ where: { id: guideId }, data: { status: "FAILED", error: msg.slice(0, 500) } })
      .catch(() => {});
  }
}
