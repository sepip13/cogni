import { prisma } from "@/lib/prisma";

// Capture API keys at module load time so they are always available,
// even inside next/server `after()` callbacks where process.env
// may not be populated the same way as during request handling.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

// FreeLLMAPI — local OpenAI-compatible proxy that aggregates 12 free providers.
// Set FREELLMAPI_URL to point at the running freellmapi server (e.g. http://localhost:3001).
// Set FREELLMAPI_KEY to the unified API key shown on first startup.
const FREELLMAPI_URL = (process.env.FREELLMAPI_URL ?? "").replace(/\/$/, "");
const FREELLMAPI_KEY = process.env.FREELLMAPI_KEY ?? "";
const FREELLMAPI_MODEL = process.env.FREELLMAPI_MODEL ?? "auto"; // "auto" lets the router pick

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

export async function ingestCourse(
  courseId: string,
  modelChoice = "haiku",
  userPlan: "FREE" | "PRO" = "FREE"
): Promise<void> {
  console.log(`[ingest:${courseId}] ▶ START — plan=${userPlan} model=${modelChoice} ts=${new Date().toISOString()}`);

  // ── DB lookup ────────────────────────────────────────────────────────────
  let course: { rawText: string | null; examDate: Date | null } | null;
  try {
    course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { rawText: true, examDate: true },
    });
  } catch (dbErr) {
    const reason = `DB lookup failed: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`;
    console.error(`[ingest:${courseId}] ✗ ${reason}`);
    await markFailed(courseId, reason);
    return;
  }

  if (!course?.rawText) {
    const reason = `No rawText available (course=${course ? "found" : "missing"}).`;
    console.error(`[ingest:${courseId}] ✗ ${reason}`);
    await markFailed(courseId, reason);
    return;
  }
  console.log(`[ingest:${courseId}] ✓ rawText length=${course.rawText.length} chars`);

  const userMessage = buildUserMessage(course.rawText, course.examDate);
  let plan: Plan | null = null;
  let lastError = "";

  // ── PRO: Claude first ────────────────────────────────────────────────────
  if (userPlan === "PRO") {
    if (!ANTHROPIC_API_KEY) {
      console.warn(`[ingest:${courseId}] ⚠ PRO user but ANTHROPIC_API_KEY not set — falling through to free LLMs`);
      lastError = "ANTHROPIC_API_KEY not configured on server";
    } else {
      const primaryModel = MODEL_MAP[modelChoice] ?? MODEL_MAP.haiku;
      console.log(`[ingest:${courseId}] ▶ [PRO] Calling Claude — model=${primaryModel}`);
      try {
        plan = await callClaude(primaryModel, userMessage);
        console.log(`[ingest:${courseId}] ✓ Claude responded — topics=${plan.topics.length}`);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`[ingest:${courseId}] ✗ Claude (${primaryModel}) failed: ${lastError}`);

        // Try sonnet fallback only for non-billing errors
        if (!lastError.includes("credit balance is too low")) {
          console.log(`[ingest:${courseId}] ▶ [PRO] Fallback → ${FALLBACK_MODEL}`);
          try {
            plan = await callClaude(FALLBACK_MODEL, userMessage);
            console.log(`[ingest:${courseId}] ✓ Claude fallback responded — topics=${plan.topics.length}`);
          } catch (fallbackErr) {
            lastError = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
            console.error(`[ingest:${courseId}] ✗ Claude fallback also failed: ${lastError}`);
          }
        } else {
          console.warn(`[ingest:${courseId}] ⚠ Anthropic credit exhausted — falling through to free LLMs`);
        }
      }
    }
  } else {
    console.log(`[ingest:${courseId}] ▶ [FREE] Skipping Claude — using free LLMs only`);
  }

  // ── FREE (always) / PRO fallback: FreeLLMAPI ─────────────────────────────
  if (!plan) {
    if (!FREELLMAPI_URL || !FREELLMAPI_KEY) {
      console.warn(`[ingest:${courseId}] ⚠ FreeLLMAPI not configured`);
      lastError = lastError || "FreeLLMAPI not configured (FREELLMAPI_URL / FREELLMAPI_KEY missing)";
    } else {
      console.log(`[ingest:${courseId}] ▶ Calling FreeLLMAPI — model=${FREELLMAPI_MODEL}`);
      try {
        plan = await callFreeLLMAPI(userMessage);
        console.log(`[ingest:${courseId}] ✓ FreeLLMAPI responded — topics=${plan.topics.length}`);
      } catch (freeErr) {
        lastError = freeErr instanceof Error ? freeErr.message : String(freeErr);
        console.error(`[ingest:${courseId}] ✗ FreeLLMAPI failed: ${lastError}`);
      }
    }
  }

  // ── Result ───────────────────────────────────────────────────────────────
  if (!plan) {
    await markFailed(courseId, lastError || "All LLM providers failed.");
    return;
  }

  try {
    await writePlan(courseId, plan);
    console.log(`[ingest:${courseId}] ✓ DONE — course marked READY`);
  } catch (writeErr) {
    const reason = `writePlan failed: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`;
    console.error(`[ingest:${courseId}] ✗ ${reason}`);
    await markFailed(courseId, reason);
  }
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
          "x-api-key": ANTHROPIC_API_KEY,
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

/**
 * Calls the FreeLLMAPI OpenAI-compatible endpoint with JSON-mode output.
 * FreeLLMAPI doesn't support tool_use, so we ask the model to return raw JSON
 * matching the Plan schema and parse it ourselves.
 */
async function callFreeLLMAPI(userMessage: string): Promise<Plan> {
  const url = new URL(`${FREELLMAPI_URL}/v1/chat/completions`);
  const transport = url.protocol === "https:" ? await import("node:https") : await import("node:http");

  const jsonSchema = `{
  "course_name": "string",
  "course_code": "string|null",
  "total_prep_time_hours": "number",
  "topics": [{
    "num": "string",
    "title": "string",
    "priority": "high|med|low",
    "priority_label": "string",
    "why": "string",
    "time_minutes": "number",
    "pages": "string",
    "subtopics": [{"text": "string", "time_minutes": "number"}],
    "practice_questions": [{"q": "string", "source": "string", "expected_answer": "string"}],
    "sources": [{"name": "string", "page": "string"}]
  }]
}`;

  const body = JSON.stringify({
    model: FREELLMAPI_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `${SYSTEM_PROMPT}\n\nIMPORTANT: Instead of calling a tool, return ONLY valid JSON matching this exact schema (no markdown, no explanation):\n${jsonSchema}`,
      },
      { role: "user", content: userMessage },
    ],
  });

  const text = await new Promise<string>((resolve, reject) => {
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${FREELLMAPI_KEY}`,
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode !== 200) {
            reject(new Error(`FreeLLMAPI ${res.statusCode}: ${raw}`));
            return;
          }
          resolve(raw);
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("FreeLLMAPI timeout")); });
    req.write(body);
    req.end();
  });

  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("FreeLLMAPI returned no content");

  let plan: Plan;
  try {
    plan = JSON.parse(content) as Plan;
  } catch {
    // Some models wrap JSON in ```json ... ``` — strip it
    const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    plan = JSON.parse(stripped) as Plan;
  }

  if (!plan.course_name || !Array.isArray(plan.topics)) {
    throw new Error("FreeLLMAPI response missing required fields (course_name, topics)");
  }

  // Normalise priority values in case the model drifts slightly
  plan.topics = plan.topics.map((t) => ({
    ...t,
    priority: (["high", "med", "low"].includes(t.priority) ? t.priority : "med") as Plan["topics"][number]["priority"],
    priority_label: t.priority_label ?? t.priority.toUpperCase(),
    subtopics: t.subtopics ?? [],
    practice_questions: t.practice_questions ?? [],
    sources: t.sources ?? [],
  }));

  return plan;
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
    data: {
      status: "FAILED",
      // Store the reason in the plan field so it's retrievable for debugging
      plan: { _error: reason, _failedAt: new Date().toISOString() },
    },
  });
}
