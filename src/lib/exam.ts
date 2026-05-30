/**
 * Exam-trainer generation: split an uploaded trial into questions (P3-split),
 * and generate a similar, gradable practice exam (P3). Both ground strictly in
 * the trial + course material and validate with Zod for robustness on free models.
 */

import { prisma } from "@/lib/prisma";
import { freeLLMComplete } from "@/lib/freellm";
import { z } from "zod";

const MAX_TRIAL_CHARS = 30_000;
const MAX_MATERIAL_CHARS = 60_000;
const MAX_QUESTIONS = 40;
// The free proxy is slow and variable, so give heavy calls a generous timeout
// and one retry (these run in the background, so a long wait is fine).
const MOCK_TIMEOUT_MS = 240_000;
const ATTEMPTS = 2;

// ── Trial-split chunking ──────────────────────────────────────────────────────
// The proxy truncates long JSON well below the requested token cap, so a single
// call on a whole paper silently loses questions. Instead we split the paper
// into small chunks whose individual outputs comfortably fit, extract each in
// parallel, and merge in code — the same approach that made the concept map
// reliable. A chunk that fails is skipped, not fatal.
const SPLIT_CHUNK_CHARS = 6_000; // small enough that one chunk's JSON won't truncate
const SPLIT_MAX_CHUNKS = 6; // safety ceiling (≤ MAX_TRIAL_CHARS / SPLIT_CHUNK_CHARS)
const SPLIT_CONCURRENCY = 3; // the proxy slows under load; keep it modest
const SPLIT_CHUNK_TIMEOUT_MS = 200_000;
const SPLIT_CHUNK_MAX_TOKENS = 6_000;

/** Runs `fn`, retrying once on any failure (slow proxy / garbled JSON). */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed after retries");
}

function stripFences(raw: string): string {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (s.startsWith("{") || s.startsWith("[")) return s;
  // Fall back to the first {…} block if the model added prose around it.
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  return a !== -1 && b > a ? s.slice(a, b + 1) : s;
}

/**
 * Recovers complete `{…}` objects from a (possibly truncated) JSON array under
 * the given key. The free proxy sometimes cuts the response mid-array, so this
 * salvages every whole element that did come through instead of losing them all.
 */
function salvageArray(content: string, key: string): unknown[] {
  const keyIdx = content.indexOf(`"${key}"`);
  const start = content.indexOf("[", keyIdx === -1 ? 0 : keyIdx);
  if (start === -1) return [];
  const out: unknown[] = [];
  let i = start + 1;
  while (i < content.length) {
    while (i < content.length && /[\s,]/.test(content[i])) i++;
    if (i >= content.length || content[i] === "]") break;
    if (content[i] !== "{") break;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let j = i;
    for (; j < content.length; j++) {
      const ch = content[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    if (depth !== 0) break; // truncated object — stop salvaging
    try {
      out.push(JSON.parse(content.slice(i, j)));
    } catch {
      break;
    }
    i = j;
  }
  return out;
}

// ── Chunking helpers ──────────────────────────────────────────────────────────

function normText(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Splits text into question-sized units — paragraph blocks, or single lines if
 * the parse produced no blank lines — so a chunk boundary rarely cuts a question
 * in half.
 */
function splitUnits(text: string): string[] {
  const byBlank = text.split(/\n\s*\n/).map((u) => u.trim()).filter(Boolean);
  return byBlank.length > 1 ? byBlank : text.split(/\n/);
}

/**
 * Greedily packs units into chunks of at most `maxChars`, never cutting a unit
 * unless a single unit is itself larger than the limit.
 */
function chunkOnBoundaries(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let cur = "";
  for (const unit of splitUnits(text)) {
    if (unit.length > maxChars) {
      if (cur) {
        chunks.push(cur);
        cur = "";
      }
      for (let i = 0; i < unit.length; i += maxChars) chunks.push(unit.slice(i, i + maxChars));
      continue;
    }
    if (cur && cur.length + unit.length + 2 > maxChars) {
      chunks.push(cur);
      cur = unit;
    } else {
      cur = cur ? `${cur}\n\n${unit}` : unit;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Runs `fn` over `items` with at most `limit` in flight at once, preserving order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── Split a trial paper into its questions ────────────────────────────────────

const TrialQuestionSchema = z.object({
  num: z.coerce.string().catch("?"),
  text: z.string().min(1),
  type: z.string().catch("other"),
  marks: z.coerce.number().nullable().optional().catch(null),
});

const SplitSchema = z.object({
  questions: z.array(TrialQuestionSchema).default([]),
});

function splitSystem(courseName: string): string {
  return `You are parsing an exam paper for ${courseName} into its individual questions.
Extract EACH question with: its number, the full question text, its type (mcq|short|essay|numeric|other), and its marks if shown. Do NOT answer them, and do not invent questions that aren't there.
Return JSON only: { "questions": [{ "num": "1", "text": "...", "type": "short", "marks": 5 }] }`;
}

type TrialQuestion = z.infer<typeof TrialQuestionSchema>;

/**
 * Extracts the questions from ONE chunk. Tries a strict parse first, then
 * salvages whole question objects from a truncated/garbled response. Returns []
 * on failure (a bad chunk is skipped, never fatal to the whole split).
 */
async function splitOneChunk(chunk: string, courseName: string, model: string): Promise<TrialQuestion[]> {
  const messages = [
    { role: "system" as const, content: splitSystem(courseName) },
    { role: "user" as const, content: chunk },
  ];
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      const raw = await freeLLMComplete(messages, {
        model,
        jsonMode: true,
        temperature: 0.1,
        maxTokens: SPLIT_CHUNK_MAX_TOKENS,
        timeoutMs: SPLIT_CHUNK_TIMEOUT_MS,
      });
      const cleaned = stripFences(raw);
      let qs: TrialQuestion[];
      try {
        qs = SplitSchema.parse(JSON.parse(cleaned)).questions;
      } catch {
        qs = z.array(TrialQuestionSchema).catch([]).parse(salvageArray(cleaned, "questions"));
      }
      if (qs.length > 0) return qs;
    } catch {
      // timeout / network / garbled — retry once, then give up on this chunk
    }
  }
  return [];
}

export async function splitTrialQuestions(trialId: string, model: string): Promise<void> {
  const trial = await prisma.examTrial.findUnique({
    where: { id: trialId },
    select: { parsedText: true, course: { select: { name: true } } },
  });
  if (!trial) return;

  try {
    const text = (trial.parsedText ?? "").trim();
    if (!text) throw new Error("No readable content in this exam file.");

    const chunks = chunkOnBoundaries(text.slice(0, MAX_TRIAL_CHARS), SPLIT_CHUNK_CHARS).slice(0, SPLIT_MAX_CHUNKS);
    const perChunk = await mapLimit(chunks, SPLIT_CONCURRENCY, (chunk) =>
      splitOneChunk(chunk, trial.course.name, model)
    );

    // Merge across chunks: drop exact-duplicate questions, then renumber + cap.
    const seen = new Set<string>();
    const merged: TrialQuestion[] = [];
    for (const q of perChunk.flat()) {
      const key = normText(q.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(q);
      if (merged.length >= MAX_QUESTIONS) break;
    }
    if (merged.length === 0) throw new Error("Couldn't find any questions in this file.");
    const questions = merged.map((q, i) => ({ ...q, num: String(i + 1) }));

    await prisma.examTrial.update({
      where: { id: trialId },
      data: { status: "READY", questions },
    });
  } catch (err) {
    const msg = err instanceof Error && err.message ? err.message : "Could not read this exam.";
    console.error(`[exam-trial:${trialId}] split error: ${msg}`);
    await prisma.examTrial
      .update({ where: { id: trialId }, data: { status: "FAILED", error: msg.slice(0, 500) } })
      .catch(() => {});
  }
}

// ── Generate a similar, gradable practice exam ────────────────────────────────

const MockQuestionSchema = z.object({
  q: z.string().min(1),
  type: z.string().catch("short"),
  marks: z.coerce.number().nullable().optional().catch(null),
  source: z.string().catch(""),
  expected_answer: z.string().catch(""),
  key_points: z.array(z.string()).catch([]),
});

const MockSchema = z.object({
  title: z.string().catch("Practice exam"),
  questions: z.array(MockQuestionSchema).min(1),
});

function mockSystem(courseName: string, count: number): string {
  return `You are an exam setter for ${courseName}. Study the TRIAL EXAM's structure: question types, difficulty, mark distribution, and phrasing style.
Produce a NEW practice exam on the SAME course material that mirrors that style but with DIFFERENT questions (never copy the trial verbatim). Produce exactly ${count} questions. Ground every question in the course material.
For each question include a model expected answer and the key points a strong answer must contain.
Return JSON only:
{ "title": "...", "questions": [{ "q": "...", "type": "mcq|short|essay|numeric", "marks": 5, "source": "where in the material", "expected_answer": "...", "key_points": ["..."] }] }`;
}

export async function generateMockExam(mockId: string, model: string, count: number): Promise<void> {
  const mock = await prisma.mockExam.findUnique({
    where: { id: mockId },
    select: {
      trial: { select: { questions: true, course: { select: { name: true, rawText: true } } } },
    },
  });
  if (!mock?.trial) {
    await prisma.mockExam
      .update({ where: { id: mockId }, data: { status: "FAILED", error: "Trial exam not found." } })
      .catch(() => {});
    return;
  }

  const trial = mock.trial;

  try {
    const trialQs = Array.isArray(trial.questions) ? trial.questions : [];
    const userMessage = `Trial exam questions (style reference):
${JSON.stringify(trialQs).slice(0, MAX_TRIAL_CHARS)}

Course material:
<material>
${(trial.course.rawText ?? "").slice(0, MAX_MATERIAL_CHARS)}
</material>`;

    const parsed = await withRetry(async () => {
      const raw = await freeLLMComplete(
        [
          { role: "system", content: mockSystem(trial.course.name, count) },
          { role: "user", content: userMessage },
        ],
        { model, jsonMode: true, temperature: 0.4, maxTokens: 8000, timeoutMs: MOCK_TIMEOUT_MS }
      );
      const cleaned = stripFences(raw);
      try {
        return MockSchema.parse(JSON.parse(cleaned));
      } catch {
        // truncated/garbled — recover the questions that came through
        const qs = z.array(MockQuestionSchema).catch([]).parse(salvageArray(cleaned, "questions"));
        if (qs.length === 0) throw new Error("Could not generate the exam.");
        return { title: "Practice exam", questions: qs };
      }
    });

    await prisma.mockExam.update({
      where: { id: mockId },
      data: {
        status: "READY",
        title: parsed.title,
        questions: parsed.questions.slice(0, MAX_QUESTIONS),
        modelId: model,
      },
    });
  } catch (err) {
    const msg = err instanceof Error && err.message ? err.message : "Could not generate the exam.";
    console.error(`[mock-exam:${mockId}] generate error: ${msg}`);
    await prisma.mockExam
      .update({ where: { id: mockId }, data: { status: "FAILED", error: msg.slice(0, 500) } })
      .catch(() => {});
  }
}
