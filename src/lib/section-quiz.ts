/**
 * On-demand per-section quiz (P6) — the "test me on this part" generator.
 *
 * As the student reads ONE section, this writes 1–3 exam-style questions about
 * exactly that concept (demand curve → questions on the demand curve, etc.).
 * It's the per-section, on-demand sibling of `generateMockExam`:
 *   • grounded to THIS concept only via `retrieveSlices` (small, focused prompt),
 *   • mimics the course's trial exam style when one exists, else generic,
 *   • cheap on free models — the count is tiny, so a single call (no batching),
 *   • validated with the shared `MockQuestionSchema` + partial-array salvage.
 *
 * The route owns the PENDING→GENERATING transition; this owns READY/FAILED.
 */

import { prisma } from "@/lib/prisma";
import { freeLLMCompleteFailover } from "@/lib/freellm";
import { retrieveSlices } from "@/lib/guide";
import { MockQuestionSchema } from "@/lib/exam";
import { salvageArray, stripFences, normText } from "@/lib/llm-json";
import { z } from "zod";

const MAX_STYLE_CHARS = 8_000;
const MAX_TOKENS = 2_200;
const TEMPERATURE = 0.4;
const QUIZ_TIMEOUT_MS = 180_000;

// Per-process guard so a double-click can't run two generations for one section.
const quizInFlight = new Set<string>();

interface MapNode {
  id: string;
  label: string;
  summary?: string;
  sourceRefs?: { page?: string | number }[];
}
interface MapEdge {
  from: string;
  to: string;
}

const QuizSchema = z.object({
  questions: z.array(MockQuestionSchema).min(1),
});

type QuizQuestion = z.infer<typeof MockQuestionSchema>;

function buildSystemPrompt(courseName: string, lang: string, count: number, hasTrial: boolean): string {
  const mimic = hasTrial
    ? " Match the difficulty and mark weighting of the trial exam below, but ask DIFFERENT questions."
    : "";
  return `You are an exam setter for ${courseName}. Write exactly ${count} NEW MULTIPLE-CHOICE question(s) about ONLY this one topic: the concept given below. EVERY question must be multiple choice.${mimic}
Ground every question strictly in the material provided; if the material can't support a fair question, say so in the question stem instead of inventing facts. Write in ${lang}.
For EACH question provide:
- "q": the question stem
- "options": exactly 4 distinct plain-text choices (NO "A)"/"B)" prefixes), with exactly ONE correct
- "answer": the full text of the correct option, copied EXACTLY from "options"
- "expected_answer": a one-sentence explanation of why it's correct
- "key_points": the facts needed to answer it
- "type": "mcq", plus "marks" if applicable
Make the wrong options plausible (common misconceptions), never absurd.
Return JSON only:
{ "questions": [{ "q": "...", "type": "mcq", "marks": 1, "options": ["...", "...", "...", "..."], "answer": "...", "source": "...", "expected_answer": "...", "key_points": ["..."] }] }`;
}

/**
 * Generates and persists 1–3 questions for one section. Sets quizStatus to READY
 * with the questions, or FAILED on any error. Never throws (background-safe).
 */
export async function generateSectionQuiz(sectionId: string, model: string, count: number): Promise<void> {
  if (quizInFlight.has(sectionId)) return;
  quizInFlight.add(sectionId);
  try {
    try {
      const section = await prisma.studyGuideSection.findUnique({
        where: { id: sectionId },
        select: {
          conceptKey: true,
          guide: {
            select: {
              language: true,
              mindMap: true,
              course: {
                select: {
                  name: true,
                  rawText: true,
                  examTrials: {
                    where: { status: "READY" },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { questions: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!section) return; // row gone — nothing to mark

      const mindMap = (section.guide.mindMap ?? { nodes: [], edges: [] }) as unknown as {
        nodes: MapNode[];
        edges: MapEdge[];
      };
      const node = mindMap.nodes.find((n) => n.id === section.conceptKey);
      if (!node) throw new Error("Concept not found in the map.");

      const neighborIds = new Set(
        mindMap.edges
          .filter((e) => e.from === node.id || e.to === node.id)
          .map((e) => (e.from === node.id ? e.to : e.from))
      );
      const neighbors = mindMap.nodes.filter((n) => neighborIds.has(n.id));
      const terms = [node.label, ...node.label.split(/\s+/), ...neighbors.map((n) => n.label)];
      const material = retrieveSlices(section.guide.course.rawText ?? "", terms);
      const lang = section.guide.language ?? "the language of the material";

      // Mimic mode when a parsed trial exam exists for the course.
      const trialQs = section.guide.course.examTrials[0]?.questions;
      const hasTrial = Array.isArray(trialQs) && trialQs.length > 0;
      const styleRef = hasTrial ? JSON.stringify(trialQs).slice(0, MAX_STYLE_CHARS) : "";

      const userMessage = `Concept to test: ${node.label}
What it is: ${node.summary ?? ""}
${hasTrial ? `Trial exam questions (style reference only — do not copy):\n${styleRef}\n` : ""}
<material>
${material}
</material>`;

      const { text: raw } = await freeLLMCompleteFailover(
        [
          { role: "system", content: buildSystemPrompt(section.guide.course.name, lang, count, hasTrial) },
          { role: "user", content: userMessage },
        ],
        {
          model,
          heavy: true,
          jsonMode: true,
          temperature: TEMPERATURE,
          maxTokens: MAX_TOKENS,
          timeoutMs: QUIZ_TIMEOUT_MS,
          label: `section-quiz:${sectionId}`,
        }
      );

      const cleaned = stripFences(raw);
      let questions: QuizQuestion[];
      try {
        questions = QuizSchema.parse(JSON.parse(cleaned)).questions;
      } catch {
        questions = z.array(MockQuestionSchema).catch([]).parse(salvageArray(cleaned, "questions"));
      }

      // Drop exact duplicates, then cap at the requested count.
      const seen = new Set<string>();
      const deduped: QuizQuestion[] = [];
      for (const q of questions) {
        const key = normText(q.q);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(q);
        if (deduped.length >= count) break;
      }
      if (deduped.length === 0) throw new Error("Couldn't write a question for this part.");

      await prisma.studyGuideSection.update({
        where: { id: sectionId },
        data: { quiz: deduped, quizStatus: "READY" },
      });
    } catch (err) {
      const msg = err instanceof Error && err.message ? err.message : "section quiz generation failed";
      console.error(`[section-quiz:${sectionId}] ${msg}`);
      await prisma.studyGuideSection
        .update({ where: { id: sectionId }, data: { quizStatus: "FAILED" } })
        .catch(() => {});
    }
  } finally {
    quizInFlight.delete(sectionId);
  }
}
