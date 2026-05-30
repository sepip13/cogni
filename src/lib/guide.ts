/**
 * Study-guide section generation (P2).
 *
 * Each section is one concept, written as a small, grounded, plain-language
 * lesson. Grounding comes from keyword retrieval over the course material so
 * the model only sees the slices relevant to this concept — small, focused
 * prompts are how free models produce premium output.
 */

import { prisma } from "@/lib/prisma";
import { freeLLMComplete } from "@/lib/freellm";

const MAX_SLICE_CHARS = 9000;
const MAX_TOKENS = 2400;
const TEMPERATURE = 0.4;
const MAX_CONTENT_CHARS = 16_000;
const SECTION_TIMEOUT_MS = 180_000;

interface MapNode {
  id: string;
  label: string;
  summary?: string;
  cluster?: string;
  sourceRefs?: { page?: string | number }[];
}
interface MapEdge {
  from: string;
  to: string;
}

/**
 * Returns the slices of `rawText` most relevant to the given terms, in document
 * order, within a char budget. Falls back to the head of the document when no
 * paragraph matches. Pure — never mutates its inputs.
 */
export function retrieveSlices(rawText: string, terms: string[], budget = MAX_SLICE_CHARS): string {
  const text = (rawText ?? "").trim();
  if (!text) return "";
  if (text.length <= budget) return text;

  const paras = text.split(/\n\s*\n+/).filter((p) => p.trim().length > 0);
  const lowerTerms = Array.from(new Set(terms.map((t) => t.toLowerCase()).filter((t) => t.length > 3)));

  const scored = paras.map((p, i) => {
    const low = p.toLowerCase();
    let score = 0;
    for (const t of lowerTerms) {
      let idx = low.indexOf(t);
      while (idx !== -1) {
        score++;
        idx = low.indexOf(t, idx + t.length);
      }
    }
    return { p, i, score };
  });

  const ranked = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i);

  const chosen: { i: number; p: string }[] = [];
  let total = 0;
  for (const s of ranked) {
    if (total + s.p.length > budget) continue;
    chosen.push({ i: s.i, p: s.p });
    total += s.p.length;
    if (total >= budget) break;
  }

  if (chosen.length === 0) return text.slice(0, budget);
  return [...chosen].sort((a, b) => a.i - b.i).map((c) => c.p).join("\n\n");
}

function buildSystemPrompt(courseName: string, lang: string): string {
  return `You are a brilliant teacher writing ONE section of a study guide for ${courseName}, in simple, plain ${lang} that a struggling student can follow. Teach the given concept so it finally clicks.
Use ONLY the material provided; connect it to the related concepts listed. If something needed is missing from the material, say so in one line — never invent facts or page numbers.
Write in Markdown, in this order:
1. A plain-language explanation (short sentences; unpack any jargon you use).
2. One concrete worked example or analogy.
3. How it connects to the related concepts — put the pieces of the puzzle together.
4. A short "**Why it matters for the exam**" note (1-2 lines).
5. A "**You must be able to…**" list — 2-3 concrete checks.
Keep it practical and tight. Cite pages like (p.N) only when the material gives a page.`;
}

/**
 * Generates the markdown for one study-guide section in the background and
 * persists it. Sets GENERATING → READY (or FAILED). Safe to call from a route's
 * `after()` or from the concept-map builder (session 1).
 */
export async function generateSection(sectionId: string, model: string): Promise<void> {
  const section = await prisma.studyGuideSection.findUnique({
    where: { id: sectionId },
    select: {
      conceptKey: true,
      guide: {
        select: {
          language: true,
          mindMap: true,
          course: { select: { name: true, rawText: true } },
        },
      },
    },
  });
  if (!section) return;

  await prisma.studyGuideSection
    .update({ where: { id: sectionId }, data: { status: "GENERATING" } })
    .catch(() => {});

  try {
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
    const slices = retrieveSlices(section.guide.course.rawText ?? "", terms);
    const lang = section.guide.language ?? "the language of the material";

    const userMessage = `Concept to teach: ${node.label}
What it is: ${node.summary ?? ""}
Related concepts to connect to: ${neighbors.map((n) => n.label).join(", ") || "none"}

<material>
${slices}
</material>`;

    let md = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        md = await freeLLMComplete(
          [
            { role: "system", content: buildSystemPrompt(section.guide.course.name, lang) },
            { role: "user", content: userMessage },
          ],
          { model, temperature: TEMPERATURE, maxTokens: MAX_TOKENS, timeoutMs: SECTION_TIMEOUT_MS }
        );
        break;
      } catch (e) {
        if (attempt === 1) throw e; // one retry on a slow/garbled response
      }
    }

    await prisma.studyGuideSection.update({
      where: { id: sectionId },
      data: {
        status: "READY",
        contentMd: md.trim().slice(0, MAX_CONTENT_CHARS),
        modelId: model,
        generatedAt: new Date(),
        sources: node.sourceRefs ?? [],
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "section generation failed";
    console.error(`[guide-section:${sectionId}] ${msg}`);
    await prisma.studyGuideSection
      .update({ where: { id: sectionId }, data: { status: "FAILED" } })
      .catch(() => {});
  }
}
