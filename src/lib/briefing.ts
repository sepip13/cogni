/**
 * "Start here" game-plan briefing.
 *
 * One grounded LLM call that turns the student's rubric/exam material plus their
 * study-guide parts into a complete orientation: what the assessment is, how the
 * grade is decided, how many parts they must study, where to start and finish,
 * and how to work through it for a strong grade. When the uploaded material is
 * too thin to plan accurately, it names the exact type of material to add.
 *
 * The whole-document context is avoided on purpose — we feed the already-distilled
 * topic priorities plus a keyword-retrieved slice of the grading/assessment
 * passages (via `retrieveSlices`), which keeps the prompt small and the JSON
 * reliable.
 */

import { z } from "zod";
import { freeLLMCompleteFailover } from "@/lib/freellm";
import { retrieveSlices } from "@/lib/guide";

const MAX_TOKENS = 3600;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 150_000;
const GRADING_SLICE_CHARS = 7000;
const HIGH_IMPORTANCE_THRESHOLD = 4; // examImportance >= this → "essential" part

/** Terms that surface the grading / assessment passages in the raw material. */
const GRADING_TERMS = [
  "rubric", "grading", "grade", "marks", "marking", "mark scheme", "assessment",
  "exam", "examination", "weight", "weighting", "percent", "pass", "fail",
  "criteria", "knockout", "viva", "multiple choice", "essay", "short answer",
  "question", "points", "credit", "outcome", "objective", "deadline", "duration",
  "closed book", "open book", "resit", "retake",
];

export interface BriefingMissing {
  material: string;
  why: string;
}

export interface Briefing {
  bottom_line: string;
  assessment: { format: string; when: string; grading_basis: string };
  what_it_takes: string;
  parts: { total: number; must_study: number; explanation: string };
  path: { start: string; finish: string; why_this_order: string };
  how_to_study: string;
  sufficiency: { sufficient: boolean; missing: BriefingMissing[] };
}

const MissingSchema = z.object({
  material: z.string().min(1),
  why: z.string().catch(""),
});

const BriefingSchema = z.object({
  bottom_line: z.string().catch(""),
  assessment: z
    .object({
      format: z.string().catch(""),
      when: z.string().catch(""),
      grading_basis: z.string().catch(""),
    })
    .catch({ format: "", when: "", grading_basis: "" }),
  what_it_takes: z.string().catch(""),
  parts: z
    .object({
      total: z.coerce.number().catch(0),
      must_study: z.coerce.number().catch(0),
      explanation: z.string().catch(""),
    })
    .catch({ total: 0, must_study: 0, explanation: "" }),
  path: z
    .object({
      start: z.string().catch(""),
      finish: z.string().catch(""),
      why_this_order: z.string().catch(""),
    })
    .catch({ start: "", finish: "", why_this_order: "" }),
  how_to_study: z.string().catch(""),
  sufficiency: z
    .object({
      sufficient: z.boolean().catch(true),
      missing: z.array(MissingSchema).catch([]),
    })
    .catch({ sufficient: true, missing: [] }),
});

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface BriefingTopic {
  num: string;
  title: string;
  priority: "HIGH" | "MED" | "LOW";
  priorityLabel: string | null;
  why: string;
}

export interface BriefingPart {
  /** 1-based position in teaching order. */
  index: number;
  title: string;
  /** examImportance (1-5) from the concept map, when known. */
  examImportance: number | null;
}

export interface BriefingInputs {
  courseName: string;
  courseCode: string | null;
  educationLevel: string | null;
  language: string;
  examDate: Date | null;
  rawText: string;
  topics: BriefingTopic[];
  parts: BriefingPart[];
}

const EDUCATION_LEVEL_LABELS: Record<string, string> = {
  college: "undergraduate college",
  grad: "graduate school",
  highschool: "high school",
  medical: "medical school",
  cert: "professional certification",
  standardized: "standardized test prep",
};

function describeExam(examDate: Date | null): { examWhen: string; examDateSet: boolean } {
  if (!examDate) return { examWhen: "No exam date has been set by the student.", examDateSet: false };
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate());
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  const iso = target.toISOString().split("T")[0];
  if (days < 0) return { examWhen: `The set exam date (${iso}) is already in the past.`, examDateSet: true };
  if (days === 0) return { examWhen: `The exam is TODAY (${iso}).`, examDateSet: true };
  return { examWhen: `The exam is in ${days} day${days === 1 ? "" : "s"} (${iso}).`, examDateSet: true };
}

function topicHints(topics: BriefingTopic[]): string {
  if (topics.length === 0) return "(no topics were extracted — the material may be too thin)";
  return topics
    .map((t) => {
      const label = t.priorityLabel && t.priorityLabel !== t.priority ? `/${t.priorityLabel}` : "";
      const why = t.why ? ` — ${t.why.slice(0, 160)}` : "";
      return `- [${t.priority}${label}] ${t.num} ${t.title}${why}`;
    })
    .join("\n");
}

function partsList(parts: BriefingPart[]): string {
  return parts
    .map((p) => {
      const imp = p.examImportance != null ? ` [exam importance ${p.examImportance}/5]` : "";
      return `${p.index}. ${p.title}${imp}`;
    })
    .join("\n");
}

function countEssentialParts(parts: BriefingPart[]): number {
  const high = parts.filter((p) => (p.examImportance ?? 0) >= HIGH_IMPORTANCE_THRESHOLD).length;
  // If the map gave no importance signal, fall back to "all parts matter".
  return high > 0 ? high : parts.length;
}

const SYSTEM_PROMPT = `You are Cogni's head tutor. Write a single "Start here" briefing that orients a student BEFORE they study for THIS specific assessment. When they finish reading it, they must have ZERO unanswered questions about:
1. what the assessment is and exactly how the grade is decided,
2. how many parts their study guide has and which ones they must study,
3. where to start and where to finish,
4. how to work through it — concretely, day by day — to earn a strong grade.

You are given: the course and level, the exam date (or none), the distilled topic list with priorities (HIGH/MED/LOW and any KNOCKOUT must-pass criteria), the student's study-guide parts in teaching order, and the grading/assessment excerpts pulled from their uploaded material.

Hard rules:
- Ground every claim in the material. NEVER invent an exam format, a weighting, a pass mark, a date, or a page number. If the material does not state something, say so plainly ("Your material doesn't state the exam format") and add the missing item to sufficiency.missing.
- Be specific and decisive, not generic. Quote or paraphrase the real weights and criteria when given. Refer to parts by their real titles.
- "Parts" = the study-guide parts listed below. parts.total MUST equal the number of parts listed. parts.must_study = how many are essential for the grade (lean on exam importance and HIGH/KNOCKOUT topics).
- path.start must name the FIRST listed part; path.finish must name the LAST listed part. Explain why this order works (foundations first).
- Sufficiency: a plan is only as good as its inputs. If anything needed to study accurately for the grade is missing, list the SPECIFIC material type to add and name it exactly — e.g. "Grading rubric / marking scheme", "Past exam paper(s)", "The exam format / structure", "The exam date", "Lecture slides or notes for <topic>". Never be vague. If the material is genuinely complete, set sufficient=true and missing=[].
- what_it_takes and how_to_study are SHORT Markdown (a few bullet points each). Every other field is plain sentences, no Markdown.

Return ONLY valid JSON (no code fence, no commentary) matching exactly:
{
  "bottom_line": "1-2 sentences: the single most important thing to do to score well",
  "assessment": { "format": "...", "when": "...", "grading_basis": "..." },
  "what_it_takes": "short markdown: where the marks are; high-weight topics; knockout criteria you cannot fail",
  "parts": { "total": number, "must_study": number, "explanation": "..." },
  "path": { "start": "Start at Part 1: <title> — because ...", "finish": "Finish at Part N: <title>", "why_this_order": "..." },
  "how_to_study": "short markdown: the concrete working method, per-day load if a date is known, when to use practice questions and mock exams",
  "sufficiency": { "sufficient": boolean, "missing": [ { "material": "exact name of the material type", "why": "what it would unlock" } ] }
}`;

function buildUserMessage(inputs: BriefingInputs): string {
  const { examWhen, examDateSet } = describeExam(inputs.examDate);
  const levelLabel = inputs.educationLevel ? EDUCATION_LEVEL_LABELS[inputs.educationLevel] ?? inputs.educationLevel : "unspecified";
  const excerpts = retrieveSlices(inputs.rawText, GRADING_TERMS, GRADING_SLICE_CHARS).trim();

  return `Course: ${inputs.courseName}${inputs.courseCode ? ` (${inputs.courseCode})` : ""}
Level: ${levelLabel}
Write the briefing in: ${inputs.language}

EXAM TIMING (authoritative — do not contradict):
- exam_date_set: ${examDateSet}
- ${examWhen}

DISTILLED TOPIC PRIORITIES (already weighted by grade impact; KNOCKOUT = must-pass):
${topicHints(inputs.topics)}

THE STUDENT'S STUDY-GUIDE PARTS, IN TEACHING ORDER (this is what "parts" means; there are ${inputs.parts.length} of them):
${partsList(inputs.parts)}

GRADING & ASSESSMENT EXCERPTS FROM THE UPLOADED MATERIAL${excerpts ? "" : " (none found — the upload may lack a rubric / exam info)"}:
${excerpts || "(no grading or exam passages were found in the material)"}`;
}

// ── Generation ────────────────────────────────────────────────────────────────

/** Tolerant JSON parse: strips ``` fences, falls back to the outermost {…}. */
function parseLoose(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a !== -1 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("Could not parse the briefing JSON");
  }
}

function isAllBlank(b: Briefing): boolean {
  return (
    !b.bottom_line.trim() &&
    !b.assessment.grading_basis.trim() &&
    !b.what_it_takes.trim() &&
    !b.how_to_study.trim() &&
    !b.path.start.trim()
  );
}

/**
 * Generates the briefing for one course. Pure with respect to the database —
 * the caller persists the result. Throws on an empty/garbled model response so
 * the route can mark it FAILED and let the student retry.
 */
export async function generateBriefing(inputs: BriefingInputs, model: string): Promise<Briefing> {
  const { text: raw } = await freeLLMCompleteFailover(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(inputs) },
    ],
    {
      model,
      temperature: TEMPERATURE,
      maxTokens: MAX_TOKENS,
      jsonMode: true,
      timeoutMs: TIMEOUT_MS,
      label: "briefing",
      // A blank / unparseable briefing from one model falls over to the next.
      validate: (t) => {
        try {
          return !isAllBlank(BriefingSchema.parse(parseLoose(t)) as Briefing);
        } catch {
          return false;
        }
      },
    }
  );

  const briefing = BriefingSchema.parse(parseLoose(raw)) as Briefing;

  if (isAllBlank(briefing)) {
    throw new Error("The model returned an empty briefing");
  }

  // The part count is authoritative from our own data, never the model's count.
  const total = inputs.parts.length;
  const essential = countEssentialParts(inputs.parts);
  const must = Number.isFinite(briefing.parts.must_study) ? Math.round(briefing.parts.must_study) : essential;

  return {
    ...briefing,
    parts: {
      ...briefing.parts,
      total,
      must_study: Math.min(total, Math.max(0, must || essential)),
    },
  };
}
