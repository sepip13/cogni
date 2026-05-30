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
const SPLIT_TIMEOUT_MS = 120_000;
const MOCK_TIMEOUT_MS = 180_000;

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
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

export async function splitTrialQuestions(trialId: string, model: string): Promise<void> {
  const trial = await prisma.examTrial.findUnique({
    where: { id: trialId },
    select: { parsedText: true, course: { select: { name: true } } },
  });
  if (!trial) return;

  try {
    const text = (trial.parsedText ?? "").trim();
    if (!text) throw new Error("No readable content in this exam file.");

    const raw = await freeLLMComplete(
      [
        { role: "system", content: splitSystem(trial.course.name) },
        { role: "user", content: text.slice(0, MAX_TRIAL_CHARS) },
      ],
      { model, jsonMode: true, temperature: 0.1, maxTokens: 4000, timeoutMs: SPLIT_TIMEOUT_MS }
    );
    const parsed = SplitSchema.parse(JSON.parse(stripFences(raw)));
    const questions = parsed.questions.slice(0, MAX_QUESTIONS);
    if (questions.length === 0) throw new Error("Couldn't find any questions in this file.");

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

  try {
    const trialQs = Array.isArray(mock.trial.questions) ? mock.trial.questions : [];
    const userMessage = `Trial exam questions (style reference):
${JSON.stringify(trialQs).slice(0, MAX_TRIAL_CHARS)}

Course material:
<material>
${(mock.trial.course.rawText ?? "").slice(0, MAX_MATERIAL_CHARS)}
</material>`;

    const raw = await freeLLMComplete(
      [
        { role: "system", content: mockSystem(mock.trial.course.name, count) },
        { role: "user", content: userMessage },
      ],
      { model, jsonMode: true, temperature: 0.4, maxTokens: 6000, timeoutMs: MOCK_TIMEOUT_MS }
    );
    const parsed = MockSchema.parse(JSON.parse(stripFences(raw)));

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
