import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMComplete, resolveLargeContextModel } from "@/lib/freellm";
import { generateSection } from "@/lib/guide";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const maxDuration = 300;

const TEMPERATURE = 0.2;
const MAX_TOKENS = 8000;
const MAX_MATERIAL_CHARS = 140_000;
const MAX_NODES = 30;
const CONCEPT_MAP_TIMEOUT_MS = 240_000; // heavy call — large input + big JSON
const GUIDE_LIMIT = { max: 10, windowMs: 60 * 60 * 1000 }; // 10 / hour / user

const MindMapSchema = z.object({
  language: z.string().default("English"),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        summary: z.string().default(""),
        examImportance: z.coerce.number().default(3),
        learningImportance: z.coerce.number().default(3),
        cluster: z.string().default("general"),
        sourceRefs: z
          .array(z.object({ page: z.union([z.string(), z.number()]).optional() }))
          .default([]),
      })
    )
    .min(1),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(["prerequisite", "related", "contrast", "example_of"]).catch("related"),
        label: z.string().default(""),
      })
    )
    .default([]),
  clusters: z
    .array(z.object({ id: z.string(), title: z.string().default(""), theme: z.string().default("") }))
    .default([]),
  outline: z.array(z.string()).default([]),
});

type MindMap = z.infer<typeof MindMapSchema>;

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
      error: true,
      updatedAt: true,
      sections: {
        orderBy: { order: "asc" },
        select: { id: true, order: true, conceptKey: true, title: true, status: true, contentMd: true },
      },
    },
  });

  return NextResponse.json({ guide: guide ?? null });
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

function buildSystemPrompt(courseName: string, level: string | null): string {
  const levelLine = level ? ` The student level is: ${level}.` : "";
  return `You are a curriculum analyst. From the COURSE MATERIAL, extract the concept map a top student would build to master "${courseName}".${levelLine}
Identify the KEY concepts (aim for 12-25, never more than 30), how important each is (a) for the exam and (b) for genuine understanding, and how they relate. Group them into a few teachable clusters and give a sensible teaching order (prerequisites before dependents).
Ground EVERYTHING only in the provided material — never invent a concept or a page number. Detect the language of the material and set "language" to it.
Return JSON only:
{
  "language": "<language of the material>",
  "nodes": [{ "id": "kebab-id", "label": "short name", "summary": "1-2 sentences", "examImportance": 1-5, "learningImportance": 1-5, "cluster": "cluster-id", "sourceRefs": [{ "page": "N" }] }],
  "edges": [{ "from": "id", "to": "id", "type": "prerequisite|related|contrast|example_of", "label": "" }],
  "clusters": [{ "id": "cluster-id", "title": "Cluster name", "theme": "one line" }],
  "outline": ["nodeId in teaching order"]
}`;
}

function buildUserMessage(course: CourseForMap): string {
  const topicHints =
    course.topics.length > 0
      ? course.topics
          .map((t) => `- ${t.num} ${t.title} [${t.priority}${t.priorityLabel ? `/${t.priorityLabel}` : ""}]`)
          .join("\n")
      : "(none)";
  return `<course_material>
${(course.rawText ?? "").slice(0, MAX_MATERIAL_CHARS)}
</course_material>

<existing_topic_ranking>
${topicHints}
</existing_topic_ranking>`;
}

function clampImportance(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/** Keeps the highest-signal nodes if the model returns too many. */
function topNodes(map: MindMap): MindMap["nodes"] {
  const scored = [...map.nodes].sort(
    (a, b) =>
      b.examImportance + b.learningImportance - (a.examImportance + a.learningImportance)
  );
  return scored.slice(0, MAX_NODES).map((n) => ({
    ...n,
    examImportance: clampImportance(n.examImportance),
    learningImportance: clampImportance(n.learningImportance),
  }));
}

async function buildConceptMap(guideId: string, course: CourseForMap, model: string): Promise<void> {
  try {
    const raw = await freeLLMComplete(
      [
        { role: "system", content: buildSystemPrompt(course.name, course.educationLevel) },
        { role: "user", content: buildUserMessage(course) },
      ],
      { temperature: TEMPERATURE, jsonMode: true, model, maxTokens: MAX_TOKENS, timeoutMs: CONCEPT_MAP_TIMEOUT_MS }
    );

    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = MindMapSchema.parse(JSON.parse(cleaned));

    const nodes = topNodes(parsed);
    const keptIds = new Set(nodes.map((n) => n.id));
    const edges = parsed.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));
    const mindMap = { nodes, edges, clusters: parsed.clusters };

    // Section order: the model's outline (filtered to kept nodes), then any leftover nodes.
    const outline = parsed.outline.filter((id) => keptIds.has(id));
    const ordered = [...outline, ...nodes.map((n) => n.id).filter((id) => !outline.includes(id))];

    const byId = new Map(nodes.map((n) => [n.id, n]));
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
        data: { status: "MAP_READY", language: parsed.language, mindMap, outline: ordered },
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
