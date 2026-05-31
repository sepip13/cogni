/**
 * Flashcard generation (P5) — turns concept-map nodes + their grounded material
 * into atomic active-recall cards. Each mind-map node already carries a label,
 * summary, and source refs, so it's a ready-made card seed; we ground each
 * concept's cards in its own retrieved slices (same trick as the study-guide
 * sections) and validate with Zod + partial-array salvage for the free proxy.
 *
 * Background-safe: never throws (the route's `after()` callback must not reject),
 * idempotent for guide-scope (skips concepts that already have cards), and
 * de-duplicates against existing card fronts so re-runs don't pile up duplicates.
 */

import { prisma } from "@/lib/prisma";
import { freeLLMCompleteFailover } from "@/lib/freellm";
import { retrieveSlices } from "@/lib/guide";
import { mapLimit, normText, salvageArray, stripFences } from "@/lib/llm-json";
import { z } from "zod";

const FLASHCARD_CONCURRENCY = 2; // the proxy slows under load; keep it modest
const MAX_CARDS_PER_CONCEPT = 8;
const MAX_TOKENS = 1_800;
const TEMPERATURE = 0.5;
const CARD_TIMEOUT_MS = 180_000;

export type FlashcardScope = "concept" | "guide";

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
interface MindMap {
  nodes: MapNode[];
  edges: MapEdge[];
}

const CardSchema = z.object({
  kind: z.string().catch("qa"),
  front: z.string().min(1),
  back: z.string().min(1),
  page: z.union([z.coerce.number(), z.string()]).nullable().optional().catch(null),
});
const CardsSchema = z.object({ cards: z.array(CardSchema).min(1) });
type RawCard = z.infer<typeof CardSchema>;

function buildSystemPrompt(courseName: string, lang: string, label: string): string {
  return `You are making atomic active-recall flashcards for ${courseName} in ${lang}, from the concept "${label}". Use ONLY the material provided — never invent facts or page numbers.
Make 4–6 cards, each testing ONE idea (atomic). Mix:
 • Q/A cards (a precise question → a short, exact answer), and
 • at least one CLOZE card (a key sentence with the single most important term blanked as "____").
Prefer the things an exam actually tests (definitions, distinctions, when-to-use, cause→effect). Keep answers short enough to self-grade. Give a page number only when the material gives one.
Return JSON only:
{ "cards": [{ "kind": "qa|cloze", "front": "...", "back": "...", "page": <number or null> }] }`;
}

function toKind(raw: string): "QA" | "CLOZE" {
  return raw.toLowerCase().includes("cloze") ? "CLOZE" : "QA";
}

/** Generates and persists cards for ONE concept. Skips fronts that already exist. */
async function generateForConcept(
  ctx: { courseId: string; guideId: string; courseName: string; rawText: string; lang: string; model: string },
  mindMap: MindMap,
  conceptKey: string
): Promise<number> {
  const node = mindMap.nodes.find((n) => n.id === conceptKey);
  if (!node) return 0;

  const neighborIds = new Set(
    mindMap.edges
      .filter((e) => e.from === node.id || e.to === node.id)
      .map((e) => (e.from === node.id ? e.to : e.from))
  );
  const neighbors = mindMap.nodes.filter((n) => neighborIds.has(n.id));
  const terms = [node.label, ...node.label.split(/\s+/), ...neighbors.map((n) => n.label)];
  const slices = retrieveSlices(ctx.rawText, terms);

  const userMessage = `Concept: ${node.label}
What it is: ${node.summary ?? ""}
Related concepts: ${neighbors.map((n) => n.label).join(", ") || "none"}

<material>
${slices}
</material>`;

  let cards: RawCard[];
  try {
    const { text: raw } = await freeLLMCompleteFailover(
      [
        { role: "system", content: buildSystemPrompt(ctx.courseName, ctx.lang, node.label) },
        { role: "user", content: userMessage },
      ],
      {
        model: ctx.model,
        heavy: true,
        jsonMode: true,
        temperature: TEMPERATURE,
        maxTokens: MAX_TOKENS,
        timeoutMs: CARD_TIMEOUT_MS,
        label: `flashcards:${conceptKey}`,
      }
    );
    const cleaned = stripFences(raw);
    try {
      cards = CardsSchema.parse(JSON.parse(cleaned)).cards;
    } catch {
      cards = z.array(CardSchema).catch([]).parse(salvageArray(cleaned, "cards"));
    }
  } catch {
    return 0; // every model failed for this concept — skip it, never fatal
  }

  // De-duplicate against existing fronts for this concept, and within the batch.
  const existing = await prisma.flashcard.findMany({
    where: { courseId: ctx.courseId, conceptKey },
    select: { front: true },
  });
  const seen = new Set(existing.map((c) => normText(c.front)));
  const rows: {
    courseId: string;
    guideId: string;
    conceptKey: string;
    front: string;
    back: string;
    kind: "QA" | "CLOZE";
    sourceRef?: { page: string | number }[];
  }[] = [];
  for (const c of cards) {
    const key = normText(c.front);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      courseId: ctx.courseId,
      guideId: ctx.guideId,
      conceptKey,
      front: c.front,
      back: c.back,
      kind: toKind(c.kind),
      ...(c.page != null ? { sourceRef: [{ page: c.page }] } : {}),
    });
    if (rows.length >= MAX_CARDS_PER_CONCEPT) break;
  }
  if (rows.length === 0) return 0;

  await prisma.flashcard.createMany({ data: rows });
  return rows.length;
}

/**
 * Orchestrates card generation for one concept or for the whole guide. For
 * guide scope it targets every READY section's concept and skips concepts that
 * already have cards (idempotent). Logs but never throws.
 */
export async function generateFlashcards(
  courseId: string,
  opts: { scope: FlashcardScope; conceptKey?: string | null; model: string }
): Promise<void> {
  try {
    const guide = await prisma.studyGuide.findUnique({
      where: { courseId },
      select: {
        id: true,
        language: true,
        mindMap: true,
        sections: { select: { conceptKey: true, status: true } },
        course: { select: { name: true, rawText: true } },
      },
    });
    if (!guide || !guide.mindMap) return;

    const mindMap = guide.mindMap as unknown as MindMap;
    const validIds = new Set(mindMap.nodes.map((n) => n.id));

    let targets: string[];
    if (opts.scope === "concept") {
      if (!opts.conceptKey || !validIds.has(opts.conceptKey)) return;
      targets = [opts.conceptKey];
    } else {
      const ready = new Set(
        guide.sections.filter((s) => s.status === "READY").map((s) => s.conceptKey)
      );
      const candidates = mindMap.nodes.map((n) => n.id).filter((id) => ready.has(id));
      const existing = await prisma.flashcard.findMany({
        where: { courseId, conceptKey: { in: candidates } },
        select: { conceptKey: true },
        distinct: ["conceptKey"],
      });
      const have = new Set(existing.map((e) => e.conceptKey));
      targets = candidates.filter((id) => !have.has(id));
    }
    if (targets.length === 0) return;

    const ctx = {
      courseId,
      guideId: guide.id,
      courseName: guide.course.name,
      rawText: guide.course.rawText ?? "",
      lang: guide.language ?? "the language of the material",
      model: opts.model,
    };
    await mapLimit(targets, FLASHCARD_CONCURRENCY, (conceptKey) =>
      generateForConcept(ctx, mindMap, conceptKey)
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "flashcard generation failed";
    console.error(`[flashcards:${courseId}] ${msg}`);
  }
}
