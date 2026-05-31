/**
 * Shared answer-grading loop. Originally inline in the mock-exam grade route;
 * extracted so the on-demand section quiz grades answers with the exact same
 * rubric, schema, and free-model call instead of a second copy. Interactive call
 * (kept on `freeLLMComplete`, not the heavy failover) so grading stays snappy.
 */

import { freeLLMComplete } from "@/lib/freellm";
import { z } from "zod";

const TEMPERATURE = 0.3;

export const GradeSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(["correct", "partially_correct", "incorrect"]),
  feedback: z.string(),
  missing_points: z.array(z.string()),
  strengths: z.array(z.string()),
});

export type Grade = z.infer<typeof GradeSchema>;

/** The fields of a question the grader needs — shared by mock + section quizzes. */
export interface GradeQuestion {
  q: string;
  expected_answer?: string;
  key_points?: string[];
}

function buildSystemPrompt(courseName: string): string {
  return `You are grading a student's answer to a practice exam question for ${courseName}.
You are given the question, the model expected answer, the key points a strong answer must contain, and the student's answer.
Grade 0–100 based on coverage of the key points (55%), correctness (35%), and use of correct terminology (10%).
Return JSON only:
{ "score": number, "verdict": "correct|partially_correct|incorrect", "feedback": "2-3 sentences", "missing_points": ["..."], "strengths": ["..."] }`;
}

function buildUserMessage(question: GradeQuestion, answer: string): string {
  return `Question: ${question.q}

Model expected answer: ${question.expected_answer ?? "(not provided)"}

Key points a strong answer must contain:
${(question.key_points ?? []).map((p) => `- ${p}`).join("\n") || "(none provided)"}

Student's answer: ${answer}`;
}

/**
 * Grades one answer and returns a validated {@link Grade}. Throws a user-facing
 * Error on either the LLM call failing or the response being malformed — callers
 * map the thrown message to a 502.
 */
export async function gradeAnswer(
  courseName: string,
  question: GradeQuestion,
  answer: string,
  model: string
): Promise<Grade> {
  let raw: string;
  try {
    raw = await freeLLMComplete(
      [
        { role: "system", content: buildSystemPrompt(courseName) },
        { role: "user", content: buildUserMessage(question, answer) },
      ],
      { temperature: TEMPERATURE, jsonMode: true, model }
    );
  } catch (err) {
    const msg =
      err instanceof Error && err.message
        ? err.message
        : "The grading service is temporarily unavailable. Please try again.";
    throw new Error(msg);
  }

  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return GradeSchema.parse(JSON.parse(cleaned));
  } catch {
    throw new Error("Grading response was malformed. Please try again.");
  }
}
