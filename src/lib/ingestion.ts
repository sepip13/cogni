import { prisma } from "@/lib/prisma";

const MODEL_MAP: Record<string, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-5",
};
const FALLBACK_MODEL = "claude-sonnet-4-5";
const TEMPERATURE = 0.2;
const MAX_TOKENS = 16384;
const TIMEOUT_MS = 300_000;

const SYSTEM_PROMPT = `You are Cogni, a personalized exam-prep assistant for university students.
You will receive course material from a single course. This could be a syllabus,
slides, grading rubric, past exams, or any combination. Your job: produce a
structured study plan that maximizes the student's grade.

Rules:
1. Cite specific page numbers and quotes from the document when available.
   Never invent a page number.
2. If a grading rubric is present, weight topics by their grade impact.
   Knockout criteria (where failure means failing the course) → priority "high"
   AND priority_label must say "KNOCKOUT".
3. Time estimates are realistic for a typical undergraduate, not aspirational.
4. Practice questions match the exam format described in the document
   (viva, multiple choice, essay, short answer). If no format is stated,
   default to short-answer.
5. ALWAYS produce a study plan, even from partial material like a rubric alone.
   Extract every topic, criterion, and learning objective you can find.
   Use your knowledge to fill in reasonable subtopics and practice questions.
6. Set "insufficient_material" to true ONLY if the document is completely
   empty or contains no educational content whatsoever (e.g. a blank page).

Use the study_plan tool to return your result.`;

const STUDY_PLAN_TOOL = {
  name: "study_plan",
  description: "Submit the structured study plan for this course.",
  input_schema: {
    type: "object" as const,
    properties: {
      course_name: { type: "string" as const },
      course_code: { type: ["string", "null"] as const },
      total_prep_time_hours: { type: "number" as const },
      insufficient_material: { type: "boolean" as const },
      why_insufficient: { type: ["string", "null"] as const },
      topics: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            num: { type: "string" as const },
            title: { type: "string" as const },
            priority: { type: "string" as const, enum: ["high", "med", "low"] },
            priority_label: { type: "string" as const },
            why: { type: "string" as const },
            time_minutes: { type: "number" as const },
            pages: { type: "string" as const },
            subtopics: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  text: { type: "string" as const },
                  time_minutes: { type: "number" as const },
                },
                required: ["text", "time_minutes"],
              },
            },
            practice_questions: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  q: { type: "string" as const },
                  source: { type: "string" as const },
                  expected_answer: { type: "string" as const },
                },
                required: ["q", "source", "expected_answer"],
              },
            },
            sources: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  name: { type: "string" as const },
                  page: { type: "string" as const },
                },
                required: ["name", "page"],
              },
            },
          },
          required: ["num", "title", "priority", "priority_label", "why", "time_minutes", "subtopics", "practice_questions", "sources"],
        },
      },
    },
    required: ["course_name", "topics"],
  },
};

interface Plan {
  course_name: string;
  course_code?: string | null;
  total_prep_time_hours?: number;
  insufficient_material?: boolean;
  why_insufficient?: string | null;
  topics: {
    num: string;
    title: string;
    priority: "high" | "med" | "low";
    priority_label: string;
    why: string;
    time_minutes: number;
    pages?: string;
    subtopics: { text: string; time_minutes: number }[];
    practice_questions: { q: string; source: string; expected_answer: string }[];
    sources: { name: string; page: string }[];
  }[];
}

export async function ingestCourse(courseId: string, modelChoice = "haiku"): Promise<void> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { rawText: true, examDate: true },
  });

  if (!course?.rawText) {
    await markFailed(courseId, "No rawText available for ingestion.");
    return;
  }

  const primaryModel = MODEL_MAP[modelChoice] ?? MODEL_MAP.haiku;
  const userMessage = buildUserMessage(course.rawText, course.examDate);

  let plan: Plan;
  try {
    plan = await callClaude(primaryModel, userMessage);
  } catch (primaryErr) {
    console.error(`[ingest:${courseId}] Primary model (${modelChoice}) failed:`, primaryErr instanceof Error ? primaryErr.message : String(primaryErr));
    try {
      plan = await callClaude(FALLBACK_MODEL, userMessage);
    } catch (fallbackErr) {
      const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      console.error(`[ingest:${courseId}] Both models failed:`, msg);
      await markFailed(courseId, msg);
      return;
    }
  }

  await writePlan(courseId, plan);
}

async function writePlan(courseId: string, plan: Plan): Promise<void> {
  const priorityMap = { high: "HIGH", med: "MED", low: "LOW" } as const;

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
      name: plan.course_name !== "Untitled Course" ? plan.course_name : undefined,
      code: plan.course_code ?? undefined,
    },
  });
}

async function callClaude(model: string, userMessage: string): Promise<Plan> {
  const https = await import("node:https");

  const body = JSON.stringify({
    model,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [STUDY_PLAN_TOOL],
    tool_choice: { type: "tool", name: "study_plan" },
  });

  const text = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode !== 200) {
            reject(new Error(`Anthropic API ${res.statusCode}: ${raw}`));
            return;
          }
          resolve(raw);
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Anthropic API timeout")); });
    req.write(body);
    req.end();
  });

  const data = JSON.parse(text);
  const toolBlock = data.content?.find((b: { type: string }) => b.type === "tool_use");
  if (!toolBlock?.input) {
    throw new Error("Claude did not return a tool_use block");
  }
  return toolBlock.input as Plan;
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
