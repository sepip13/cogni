import { prisma } from "@/lib/prisma";
import { freeLLMCompleteFailover } from "@/lib/freellm";

const FREELLMAPI_URL = (process.env.FREELLMAPI_URL ?? "").replace(/\/$/, "");
const FREELLMAPI_KEY = process.env.FREELLMAPI_KEY ?? "";

const TEMPERATURE = 0.2;
const MAX_TOKENS = 16384;

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
   empty or contains no educational content whatsoever (e.g. a blank page).`;

/** Appended to the system prompt so free models (no tool-calling) return raw JSON. */
const SCHEMA_INSTRUCTION = `

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "course_name": "string",
  "course_code": "string|null",
  "total_prep_time_hours": "number",
  "insufficient_material": "boolean",
  "why_insufficient": "string|null",
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

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  college:      "undergraduate college",
  grad:         "graduate school",
  highschool:   "high school",
  medical:      "medical school (e.g. USMLE Step prep)",
  cert:         "professional certification",
  standardized: "standardized test prep (e.g. SAT/GRE/GMAT)",
};

function buildSystemPrompt(educationLevel: string | null, language: string): string {
  const parts = [SYSTEM_PROMPT];
  if (educationLevel && EDUCATION_LEVEL_LABELS[educationLevel]) {
    parts.push(
      `\n\nStudent context: This student is at the ${EDUCATION_LEVEL_LABELS[educationLevel]} level. ` +
      `Calibrate terminology, depth, prerequisite assumptions, and time estimates accordingly.`
    );
  }
  if (language && language !== "English") {
    parts.push(`\n\nRespond in ${language}. All topic titles, explanations, and practice questions must be in ${language}.`);
  }
  parts.push(SCHEMA_INSTRUCTION);
  return parts.join("");
}

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

/** Parses (and normalises) the study-plan JSON. Tolerant of ```json fences. Throws on malformed input. */
function parsePlan(content: string): Plan {
  let plan: Plan;
  try {
    plan = JSON.parse(content) as Plan;
  } catch {
    const stripped = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    plan = JSON.parse(stripped) as Plan;
  }

  if (!plan.course_name || !Array.isArray(plan.topics)) {
    throw new Error("Response missing required fields (course_name, topics)");
  }

  // Normalise priority values in case the model drifts slightly.
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

export async function ingestCourse(
  courseId: string,
  modelChoice = "auto",
  _userPlan: "FREE" | "PRO" = "FREE",
  language = "English"
): Promise<void> {
  console.log(`[ingest:${courseId}] ▶ START — model=${modelChoice} ts=${new Date().toISOString()}`);

  let course: { rawText: string | null; examDate: Date | null; educationLevel: string | null } | null;
  try {
    course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { rawText: true, examDate: true, educationLevel: true },
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

  const systemPrompt = buildSystemPrompt(course.educationLevel ?? null, language);
  const userMessage = buildUserMessage(course.rawText, course.examDate);
  let plan: Plan | null = null;
  let lastError = "";

  if (!FREELLMAPI_URL || !FREELLMAPI_KEY) {
    lastError = "FreeLLMAPI not configured (FREELLMAPI_URL / FREELLMAPI_KEY missing)";
    console.warn(`[ingest:${courseId}] ⚠ ${lastError}`);
  } else {
    console.log(`[ingest:${courseId}] ▶ Calling FreeLLMAPI (failover) — primary=${modelChoice || "auto"}`);
    try {
      const { text, model } = await freeLLMCompleteFailover(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        {
          model: modelChoice || "auto",
          heavy: true,
          jsonMode: true,
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS,
          label: `ingest:${courseId}`,
          // A truncated / malformed plan from one model falls over to the next.
          validate: (t) => {
            try {
              return parsePlan(t).topics.length > 0;
            } catch {
              return false;
            }
          },
        }
      );
      plan = parsePlan(text);
      console.log(`[ingest:${courseId}] ✓ responded via "${model}" — topics=${plan.topics.length}`);
    } catch (freeErr) {
      lastError = freeErr instanceof Error ? freeErr.message : String(freeErr);
      console.error(`[ingest:${courseId}] ✗ all models failed: ${lastError}`);
    }
  }

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
