import { prisma } from "@/lib/prisma";
import { freeLLMComplete } from "@/lib/freellm";
import { stripFences } from "@/lib/llm-json";
import { z } from "zod";

/**
 * Submission grader. Two modes:
 *
 *  • Rubric-grounded (P2): when the submission is linked to a deliverable that
 *    carries a real, extracted rubric, grade against THOSE criteria + the real
 *    grading scheme, map to a band, and compute the gap to the next band. The
 *    rubric block is small structured JSON — far more accurate and far cheaper
 *    than stuffing 60k of course rawText into the prompt.
 *
 *  • Generic (fallback): the original behavior — grade against the course
 *    material and let the model infer reasonable criteria. Unlinked submissions
 *    (the existing "My Work" flow) keep working unchanged.
 *
 * The route stays a thin caller: it does auth / ownership / rate-limit / model
 * resolution, then calls `gradeSubmission`, which performs the LLM call, parses,
 * persists a `SubmissionReview`, and returns it.
 */

const TEMPERATURE = 0.3;
const MAX_TOKENS = 2600;
const MAX_RUBRIC_CHARS = 60_000;
const MAX_WORK_CHARS = 40_000;
const MAX_RUBRIC_JSON_CHARS = 12_000;

/** A grading failure carrying the HTTP status the route should return. */
export class GradeError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GradeError";
  }
}

export interface SubmissionForGrading {
  id: string;
  title: string;
  kind: string;
  parsedText: string | null;
}

export interface DeliverableForGrading {
  kind: string;
  rubric: unknown; // raw Json — [{ criterion, max, weight?, levels? }]
  gradingScheme: unknown; // raw Json — { kind, bands?, passMark?, totalPoints? }
}

export interface GradeOptions {
  courseName: string;
  rawText: string;
  model: string;
  deliverable?: DeliverableForGrading | null;
}

export interface SavedReview {
  id: string;
  scoreOutOf10: number;
  rubricBreakdown: unknown;
  strengths: unknown;
  gaps: unknown;
  actionItems: unknown;
  summary: string;
  percentage: number | null;
  band: string | null;
  nextBand: string | null;
  gapToNextBand: string | null;
  modelId: string;
  createdAt: Date;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const GenericReviewSchema = z.object({
  score_out_of_10: z.number().min(0).max(10),
  rubric_breakdown: z.array(
    z.object({ criterion: z.string(), scored: z.number(), max: z.number(), comment: z.string() })
  ),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  action_items: z.array(z.string()),
  summary: z.string(),
});

const RubricReviewSchema = z.object({
  criteria: z.array(
    z.object({
      criterion: z.string(),
      scored: z.number(),
      max: z.number(),
      band: z.string().optional().default(""),
      comment: z.string(),
    })
  ),
  total: z.object({ scored: z.number(), max: z.number(), percentage: z.number() }),
  band: z.string(),
  next_band: z.string().optional().default(""),
  gap_to_next_band: z.string().optional().default(""),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  action_items: z.array(z.string()),
  summary: z.string(),
});

// ── Prompts ─────────────────────────────────────────────────────────────────

function genericSystemPrompt(courseName: string): string {
  return `You are an examiner grading a student's submitted work against the course rubric for ${courseName}.
Score the work out of 10 (decimals allowed). Break the score down per rubric criterion you can identify in the course material. List concrete strengths, the specific gaps preventing a 10/10, and an ordered list of action items the student can follow to close those gaps and reach full marks.
Be specific and reference the rubric. If the course material contains no explicit rubric, infer reasonable criteria from the syllabus/learning objectives and say so in the summary.
Return JSON only:
{
  "score_out_of_10": number,
  "rubric_breakdown": [{ "criterion": string, "scored": number, "max": number, "comment": string }],
  "strengths": [string],
  "gaps": [string],
  "action_items": [string],
  "summary": string
}`;
}

function rubricSystemPrompt(kind: string, courseName: string, scheme: string): string {
  return `You are an examiner grading a student's ${kind} for ${courseName} against the OFFICIAL RUBRIC below.
Grade ONLY against the given criteria — do not invent criteria. For EACH criterion, award a mark out of its real max, name the band it falls in (from the band descriptors when given), and explain in one line why — quoting the rubric language. Then:
  • overall: total marks and a percentage,
  • band: map the percentage to the grading scheme (${scheme}); name the achieved band,
  • gap_to_next_band: the single criterion that, if improved, moves the work up a band, and the EXACT change needed (concrete, from the band descriptor),
  • strengths, gaps (what blocks full marks), action_items (ordered, concrete).
Ground every judgement in the student's actual work; cite where. Be specific, not generic.
Return JSON only:
{ "criteria": [{ "criterion": string, "scored": number, "max": number, "band": string, "comment": string }],
  "total": { "scored": number, "max": number, "percentage": number },
  "band": string, "next_band": string, "gap_to_next_band": string,
  "strengths": [string], "gaps": [string], "action_items": [string], "summary": string }`;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function gradeSubmission(
  submission: SubmissionForGrading,
  opts: GradeOptions
): Promise<SavedReview> {
  const workText = (submission.parsedText ?? "").trim();
  if (!workText) throw new GradeError("No readable content in this submission yet.", 400);

  const rubric = opts.deliverable?.rubric;
  const useRubric = Array.isArray(rubric) && rubric.length > 0;

  return useRubric
    ? gradeAgainstRubric(submission, workText, opts)
    : gradeGeneric(submission, workText, opts);
}

async function callLLM(
  system: string,
  user: string,
  model: string
): Promise<string> {
  try {
    return await freeLLMComplete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: TEMPERATURE, jsonMode: true, model, maxTokens: MAX_TOKENS }
    );
  } catch (err) {
    const msg =
      err instanceof Error && err.message
        ? err.message
        : "The review service is temporarily unavailable. Please try again.";
    throw new GradeError(msg, 502);
  }
}

async function gradeGeneric(
  submission: SubmissionForGrading,
  workText: string,
  opts: GradeOptions
): Promise<SavedReview> {
  const rubric = (opts.rawText ?? "").slice(0, MAX_RUBRIC_CHARS);
  const user = `Course rubric / material:
<rubric>
${rubric || "(no course material provided)"}
</rubric>

Student work — "${submission.title}" (${submission.kind}):
<work>
${workText.slice(0, MAX_WORK_CHARS)}
</work>`;

  const raw = await callLLM(genericSystemPrompt(opts.courseName), user, opts.model);

  let review: z.infer<typeof GenericReviewSchema>;
  try {
    review = GenericReviewSchema.parse(JSON.parse(stripFences(raw)));
  } catch {
    throw new GradeError("The review response was malformed. Please try again.", 502);
  }

  return persistReview(submission.id, opts.model, {
    scoreOutOf10: review.score_out_of_10,
    rubricBreakdown: review.rubric_breakdown,
    strengths: review.strengths,
    gaps: review.gaps,
    actionItems: review.action_items,
    summary: review.summary,
  });
}

async function gradeAgainstRubric(
  submission: SubmissionForGrading,
  workText: string,
  opts: GradeOptions
): Promise<SavedReview> {
  const deliverable = opts.deliverable!;
  const rubricJson = JSON.stringify(deliverable.rubric).slice(0, MAX_RUBRIC_JSON_CHARS);
  const schemeJson = deliverable.gradingScheme
    ? JSON.stringify(deliverable.gradingScheme).slice(0, 2000)
    : "(not stated — use marks/percentage)";

  const user = `Official rubric (grade against THESE criteria only):
<rubric>
${rubricJson}
</rubric>

Grading scheme:
<scheme>
${schemeJson}
</scheme>

Student work — "${submission.title}" (${deliverable.kind}):
<work>
${workText.slice(0, MAX_WORK_CHARS)}
</work>`;

  const system = rubricSystemPrompt(deliverable.kind.toLowerCase(), opts.courseName, schemeJson);
  const raw = await callLLM(system, user, opts.model);

  let review: z.infer<typeof RubricReviewSchema>;
  try {
    review = RubricReviewSchema.parse(JSON.parse(stripFences(raw)));
  } catch {
    throw new GradeError("The review response was malformed. Please try again.", 502);
  }

  const percentage = clampPct(review.total.percentage);
  const scoreOutOf10 = Math.round((percentage / 10) * 10) / 10;

  return persistReview(submission.id, opts.model, {
    scoreOutOf10,
    rubricBreakdown: review.criteria,
    strengths: review.strengths,
    gaps: review.gaps,
    actionItems: review.action_items,
    summary: review.summary,
    percentage,
    band: review.band || null,
    nextBand: review.next_band || null,
    gapToNextBand: review.gap_to_next_band || null,
  });
}

function clampPct(n: number): number {
  if (Number.isNaN(n)) return 0;
  return n < 0 ? 0 : n > 100 ? 100 : n;
}

interface ReviewFields {
  scoreOutOf10: number;
  rubricBreakdown: unknown;
  strengths: string[];
  gaps: string[];
  actionItems: string[];
  summary: string;
  percentage?: number | null;
  band?: string | null;
  nextBand?: string | null;
  gapToNextBand?: string | null;
}

async function persistReview(
  submissionId: string,
  modelId: string,
  fields: ReviewFields
): Promise<SavedReview> {
  const saved = await prisma.submissionReview.create({
    data: {
      submissionId,
      scoreOutOf10: fields.scoreOutOf10,
      rubricBreakdown: fields.rubricBreakdown as object,
      strengths: fields.strengths,
      gaps: fields.gaps,
      actionItems: fields.actionItems,
      summary: fields.summary,
      percentage: fields.percentage ?? null,
      band: fields.band ?? null,
      nextBand: fields.nextBand ?? null,
      gapToNextBand: fields.gapToNextBand ?? null,
      modelId,
    },
    select: {
      id: true,
      scoreOutOf10: true,
      rubricBreakdown: true,
      strengths: true,
      gaps: true,
      actionItems: true,
      summary: true,
      percentage: true,
      band: true,
      nextBand: true,
      gapToNextBand: true,
      modelId: true,
      createdAt: true,
    },
  });

  await prisma.submission.update({ where: { id: submissionId }, data: { status: "REVIEWED" } });
  return saved;
}
