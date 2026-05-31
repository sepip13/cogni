import { prisma } from "@/lib/prisma";
import { freeLLMCompleteFailover } from "@/lib/freellm";
import { stripFences, salvageArray } from "@/lib/llm-json";
import { z } from "zod";

/**
 * Assignment Buddy — deliverable + rubric extraction (Prompt P1).
 *
 * Reads `Course.rawText` (module guide / assignment brief / portfolio handbook /
 * marking rubric) and extracts EVERY assessed deliverable the student must
 * prepare and submit, each with its weight, due date, format, requirements,
 * rubric, and the course's grading scheme. Mirrors `ingestCourse`: one grounded
 * `freeLLMCompleteFailover` (heavy + jsonMode + validate), tolerant JSON parse,
 * idempotent replace of EXTRACTED rows, status driven for the client poll.
 *
 * Grounding is hard: never invent a deliverable, a weight, or a date. Missing
 * detail → null. This keeps the prompt small and the grade accurate.
 */

const TEMPERATURE = 0.2;
const MAX_TOKENS = 8000;
const MAX_RAWTEXT_CHARS = 200_000; // large-context models fit a whole module guide

// P1 kind strings → the widened SubmissionKind enum.
const KIND_MAP: Record<string, string> = {
  assignment: "ASSIGNMENT",
  project: "PROJECT",
  portfolio: "PORTFOLIO",
  essay: "ESSAY",
  report: "REPORT",
  case_study: "CASE_STUDY",
  presentation: "PRESENTATION",
  reflection: "REFLECTION",
  exam: "OTHER",
  other: "OTHER",
};

// ── Schema ──────────────────────────────────────────────────────────────────

const LevelSchema = z.object({
  band: z.string(),
  descriptor: z.string().optional().default(""),
  points: z.number().nullable().optional(),
});

const RubricCriterionSchema = z.object({
  criterion: z.string(),
  max: z.number().nullable().optional(),
  weight: z.number().nullable().optional(),
  levels: z.array(LevelSchema).optional().default([]),
});

const DeliverableSchema = z.object({
  title: z.string().min(1),
  kind: z.string().optional().default("other"),
  weight: z.number().nullable().optional(),
  due_date: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  unit_limit: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  requirements: z.array(z.string()).optional().default([]),
  rubric: z.array(RubricCriterionSchema).optional().default([]),
  page: z.union([z.number(), z.string()]).nullable().optional(),
});

const GradingOverviewSchema = z
  .object({
    kind: z.string().optional().default("percentage"),
    bands: z.array(z.object({ name: z.string(), min: z.number() })).optional().default([]),
    pass_mark: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .nullable();

const DeliverablesSchema = z.object({
  deliverables: z.array(DeliverableSchema),
  grading_overview: GradingOverviewSchema.optional().default(null),
});

type DeliverableInput = z.infer<typeof DeliverableSchema>;
type GradingOverview = z.infer<typeof GradingOverviewSchema>;

// ── Prompt P1 ─────────────────────────────────────────────────────────────────

function systemPrompt(course: string, educationLevel: string): string {
  return `You are an assessment analyst for ${course} (${educationLevel}). From the COURSE MATERIAL (module guide, assignment brief, portfolio handbook, marking rubric), extract EVERY assessed deliverable the student must prepare and submit — assignments, case studies, presentations, reflections, reports, portfolio components, exams. Ground EVERYTHING only in the material; never invent a deliverable, a weight, or a date. If a detail is not stated, use null — do NOT guess.
For EACH deliverable give:
  • title
  • kind: assignment|case_study|presentation|essay|report|portfolio|reflection|exam|other
  • weight: % of the final grade (number, or null)
  • due_date: ISO date (or null)
  • format: e.g. "2500-word report", "15-min group presentation + slides" (or null)
  • unit / unit_limit: "words"|"minutes"|"pages" + the number (or null)
  • description: one short plain-language paragraph of what it requires
  • requirements: the concrete must-dos a student must satisfy (string[])
  • rubric: the marking criteria that apply — for each: { criterion, max, weight (or null), levels: [{ band, descriptor }] when band descriptors are given (e.g. Pass/Merit/Distinction) }
  • page: the page where this is described (number or null)
Also return a course-level "grading_overview":
  { kind: "percentage"|"points"|"bands"|"letter", bands: [{ name, min }] (e.g. Distinction ≥70), pass_mark, notes } — only what the material states; null fields otherwise.
If the material clearly contains NO assessment information, return { "deliverables": [], "grading_overview": null }.
Return JSON only:
{ "deliverables": [ { ... } ], "grading_overview": { ... } }`;
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/** Strict parse, then salvage partial arrays if the proxy truncated the JSON. */
function parseResponse(text: string): { deliverables: DeliverableInput[]; grading: GradingOverview } {
  const cleaned = stripFences(text);
  const strict = DeliverablesSchema.safeParse(JSON.parse(cleaned));
  if (strict.success) {
    return { deliverables: strict.data.deliverables, grading: strict.data.grading_overview };
  }
  // Salvage every whole deliverable object that came through.
  const salvaged = salvageArray(cleaned, "deliverables");
  const deliverables = salvaged
    .map((d) => DeliverableSchema.safeParse(d))
    .filter((r): r is z.ZodSafeParseSuccess<DeliverableInput> => r.success)
    .map((r) => r.data);
  return { deliverables, grading: null };
}

function parseDueDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 0–1 confidence from how complete the extracted record is. */
function confidenceOf(d: DeliverableInput): number {
  const hasWeight = d.weight != null;
  const hasRubric = (d.rubric?.length ?? 0) > 0;
  if (hasWeight && hasRubric) return 0.9;
  if (hasWeight || hasRubric) return 0.6;
  if (d.description) return 0.4;
  return 0.25;
}

function toGradingScheme(overview: GradingOverview): object | null {
  if (!overview) return null;
  return {
    kind: overview.kind,
    bands: overview.bands ?? [],
    passMark: overview.pass_mark ?? null,
    totalPoints: null,
  };
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function extractDeliverables(courseId: string, model: string): Promise<void> {
  let course: { rawText: string | null; name: string; educationLevel: string | null } | null;
  try {
    course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { rawText: true, name: true, educationLevel: true },
    });
  } catch (err) {
    await markFailed(courseId, `DB lookup failed: ${msg(err)}`);
    return;
  }

  if (!course?.rawText?.trim()) {
    await markFailed(courseId, "Add course materials first — there's nothing to read yet.");
    return;
  }

  const rawText = course.rawText.slice(0, MAX_RAWTEXT_CHARS);
  const system = systemPrompt(course.name, course.educationLevel ?? "a university course");

  let parsed: { deliverables: DeliverableInput[]; grading: GradingOverview };
  try {
    const { text } = await freeLLMCompleteFailover(
      [
        { role: "system", content: system },
        { role: "user", content: `Course: ${course.name}\n\n---\n\n${rawText}` },
      ],
      {
        model,
        heavy: true,
        jsonMode: true,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
        timeoutMs: 240_000,
        label: `deliverables:${courseId}`,
        validate: (t) => {
          try {
            return DeliverablesSchema.safeParse(JSON.parse(stripFences(t))).success;
          } catch {
            return false;
          }
        },
      }
    );
    parsed = parseResponse(text);
  } catch (err) {
    await markFailed(courseId, `Extraction failed: ${msg(err)}`);
    return;
  }

  try {
    await writeDeliverables(courseId, parsed.deliverables, parsed.grading);
  } catch (err) {
    await markFailed(courseId, `Saving deliverables failed: ${msg(err)}`);
  }
}

async function writeDeliverables(
  courseId: string,
  deliverables: DeliverableInput[],
  grading: GradingOverview
): Promise<void> {
  const scheme = toGradingScheme(grading);

  const rows = deliverables.map((d, idx) => ({
    courseId,
    title: d.title,
    kind: (KIND_MAP[(d.kind ?? "other").toLowerCase()] ?? "OTHER") as
      | "ASSIGNMENT" | "PROJECT" | "PORTFOLIO" | "ESSAY" | "REPORT"
      | "CASE_STUDY" | "PRESENTATION" | "REFLECTION" | "OTHER",
    source: "EXTRACTED" as const,
    weight: d.weight ?? null,
    dueDate: parseDueDate(d.due_date),
    format: d.format ?? null,
    unit: d.unit ?? null,
    unitLimit: d.unit_limit ?? null,
    description: d.description ?? null,
    requirements: (d.requirements ?? []) as object,
    rubric: (d.rubric ?? []) as object,
    gradingScheme: scheme ?? undefined,
    sourceRef: d.page != null ? ([{ page: d.page }] as object) : undefined,
    confidence: confidenceOf(d),
    order: idx,
  }));

  await prisma.$transaction([
    // Idempotent: replace machine-extracted rows, keep anything the user added.
    prisma.courseDeliverable.deleteMany({ where: { courseId, source: "EXTRACTED" } }),
    ...(rows.length > 0 ? [prisma.courseDeliverable.createMany({ data: rows })] : []),
    prisma.course.update({
      where: { id: courseId },
      data: { deliverablesStatus: "READY", deliverablesError: null },
    }),
  ]);
}

async function markFailed(courseId: string, reason: string): Promise<void> {
  await prisma.course
    .update({
      where: { id: courseId },
      data: { deliverablesStatus: "FAILED", deliverablesError: reason },
    })
    .catch(() => {});
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
