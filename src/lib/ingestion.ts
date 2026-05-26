/**
 * LLM ingestion pipeline.
 * Calls Claude with the §6.1 system prompt, validates the JSON output with Zod,
 * retries once with Opus on validation failure, then writes Topic rows to the DB.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const MODEL_PRIMARY = "claude-sonnet-4-5";
const MODEL_FALLBACK = "claude-opus-4-5";
const TEMPERATURE = 0.2;
const MAX_TOKENS = 8192;
const TIMEOUT_MS = 90_000;

// ── §6.1 exact system prompt ──────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Cogni, a personalized exam-prep assistant for university students.
You will receive concatenated course material from a single course (syllabus,
slides, grading rubric, past exams). Your job: produce a structured study plan
that maximizes the student's grade for the upcoming exam.

Rules:
1. Cite specific page numbers and quotes from the document for every claim.
   Never invent a page number.
2. If a grading rubric is present, weight topics by their grade impact.
   Knockout criteria (where failure means failing the course) → priority "high"
   AND priority_label must say "KNOCKOUT".
3. Time estimates are realistic for a typical undergraduate, not aspirational.
4. Practice questions match the exam format described in the document
   (viva, multiple choice, essay, short answer). If no format is stated,
   default to short-answer.
5. If the document is too short or generic to produce a meaningful plan,
   set "insufficient_material" to true and explain in "why_insufficient".
Return ONLY valid JSON matching the schema below. No prose before or after.`;

// ── Zod schema (§6.1) ────────────────────────────────────────────────────────
const TopicSchema = z.object({
  num: z.string(),
  title: z.string(),
  priority: z.enum(["high", "med", "low"]),
  priority_label: z.string(),
  why: z.string(),
  time_minutes: z.number(),
  pages: z.string().optional(),
  subtopics: z.array(z.object({ text: z.string(), time_minutes: z.number() })),
  practice_questions: z.array(
    z.object({
      q: z.string(),
      source: z.string(),
      expected_answer: z.string(),
    })
  ),
  sources: z.array(z.object({ name: z.string(), page: z.string() })),
});

const PlanSchema = z.object({
  course_name: z.string(),
  course_code: z.string().nullable(),
  total_prep_time_hours: z.number(),
  deadline: z.string().nullable(),
  insufficient_material: z.boolean(),
  why_insufficient: z.string().nullable(),
  topics: z.array(TopicSchema),
});

type Plan = z.infer<typeof PlanSchema>;

// ── Main ingestion entry-point ─────────────────────────────────────────────────
export async function ingestCourse(courseId: string): Promise<void> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { rawText: true, examDate: true },
  });

  if (!course?.rawText) {
    await markFailed(courseId, "No rawText available for ingestion.");
    return;
  }

  const userMessage = buildUserMessage(course.rawText, course.examDate);

  let plan: Plan;
  try {
    const raw = await callClaude(MODEL_PRIMARY, userMessage);
    plan = PlanSchema.parse(JSON.parse(raw));
  } catch (primaryErr) {
    // Retry once with Opus
    try {
      const raw = await callClaude(MODEL_FALLBACK, userMessage);
      plan = PlanSchema.parse(JSON.parse(raw));
    } catch (fallbackErr) {
      const msg =
        fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.error(`[ingest:${courseId}] Both models failed:`, msg);
      await markFailed(courseId, msg);
      return;
    }
  }

  await writePlan(courseId, plan);
}

// ── Write validated plan to DB ─────────────────────────────────────────────────
async function writePlan(courseId: string, plan: Plan): Promise<void> {
  const priorityMap = { high: "HIGH", med: "MED", low: "LOW" } as const;

  // Delete any stale topics from a previous (failed) attempt
  await prisma.topic.deleteMany({ where: { courseId } });

  await prisma.topic.createMany({
    data: plan.topics.map((t, idx) => ({
      courseId,
      num: t.num,
      title: t.title,
      priority: priorityMap[t.priority],
      priorityLabel: t.priority_label,
      why: t.why,
      timeMinutes: t.time_minutes,
      pages: t.pages ?? null,
      subtopics: t.subtopics,
      practiceQuestions: t.practice_questions,
      sources: t.sources,
      order: idx,
    })),
  });

  const totalMinutes = plan.topics.reduce((sum, t) => sum + t.time_minutes, 0);

  await prisma.course.update({
    where: { id: courseId },
    data: {
      status: "READY",
      plan: plan as object,
      totalPrepTimeMinutes: totalMinutes,
      // Update name/code from LLM if we have something better
      code: plan.course_code ?? undefined,
    },
  });
}

// ── Claude call with hard timeout ──────────────────────────────────────────────
async function callClaude(model: string, userMessage: string): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await client.messages.create(
      {
        model,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      },
      { signal: controller.signal }
    );

    const block = response.content[0];
    if (block.type !== "text") {
      throw new Error("Unexpected content block type from Claude");
    }
    return block.text;
  } finally {
    clearTimeout(timer);
  }
}

function buildUserMessage(rawText: string, examDate: Date | null): string {
  const dateInfo = examDate
    ? `\nExam date: ${examDate.toISOString().split("T")[0]}`
    : "";
  return `Here is the course material:${dateInfo}\n\n---\n\n${rawText}`;
}

async function markFailed(courseId: string, reason: string): Promise<void> {
  console.error(`[ingest:${courseId}] FAILED: ${reason}`);
  await prisma.course.update({
    where: { id: courseId },
    data: { status: "FAILED" },
  });
}
