/**
 * Chunked concept-map builder (P1, robust).
 *
 * Instead of one huge LLM call over the whole course (slow, and capped by the
 * model's context window), we:
 *   1. split the material into chunks,
 *   2. extract concepts from each chunk in parallel (bounded concurrency),
 *   3. merge + dedupe concepts across chunks,
 *   4. run one small synthesis call to cluster them, find relationships, and
 *      order them for teaching.
 * Each call stays small and fast, and arbitrarily large courses are handled.
 */

import { freeLLMComplete } from "@/lib/freellm";
import { z } from "zod";

const CHUNK_CHARS = 45_000;
const MAX_CHUNKS = 8; // up to ~360k chars of material analyzed
const MAX_NODES = 28;
const CONCURRENCY = 3;
const EXTRACT_TIMEOUT_MS = 150_000;
const SYNTH_TIMEOUT_MS = 120_000;
const EXTRACT_MAX_TOKENS = 4000;
const SYNTH_MAX_TOKENS = 4000;

export type MapNode = {
  id: string;
  label: string;
  summary: string;
  examImportance: number;
  learningImportance: number;
  cluster: string;
  sourceRefs: { page?: string | number }[];
};
export type MapEdge = {
  from: string;
  to: string;
  type: "prerequisite" | "related" | "contrast" | "example_of";
  label: string;
};
export type MapCluster = {
  id: string;
  title: string;
  theme: string;
};
export interface BuiltMap {
  language: string;
  nodes: MapNode[];
  edges: MapEdge[];
  clusters: MapCluster[];
  outline: string[];
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const ExtractSchema = z.object({
  language: z.string().catch("English"),
  concepts: z
    .array(
      z.object({
        label: z.string().min(1),
        summary: z.string().catch(""),
        examImportance: z.coerce.number().catch(3),
        learningImportance: z.coerce.number().catch(3),
        sourceRefs: z.array(z.object({ page: z.union([z.string(), z.number()]).optional() })).catch([]),
      })
    )
    .catch([]),
});

const SynthSchema = z.object({
  clusters: z.array(z.object({ id: z.string(), title: z.string().catch(""), theme: z.string().catch("") })).catch([]),
  assignments: z.array(z.object({ node: z.string(), cluster: z.string() })).catch([]),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(["prerequisite", "related", "contrast", "example_of"]).catch("related"),
        label: z.string().catch(""),
      })
    )
    .catch([]),
  outline: z.array(z.string()).catch([]),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function clampImportance(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < MAX_CHUNKS; i += CHUNK_CHARS) {
    chunks.push(text.slice(i, i + CHUNK_CHARS));
  }
  return chunks;
}

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

// ── Stage 1: extract concepts from one chunk ──────────────────────────────────

function extractSystem(courseName: string, level: string | null): string {
  const lvl = level ? ` The student level is: ${level}.` : "";
  return `You are a curriculum analyst for "${courseName}".${lvl} From THIS PORTION of the course material, extract the key concepts a top student must master. For each: a short label, a 1-2 sentence summary, examImportance (1-5), learningImportance (1-5), and source pages if shown. Ground ONLY in the provided text — never invent. Detect the language of the material.
Return JSON only: { "language": "...", "concepts": [{ "label": "...", "summary": "...", "examImportance": 1-5, "learningImportance": 1-5, "sourceRefs": [{ "page": "N" }] }] }`;
}

async function extractChunk(
  chunk: string,
  courseName: string,
  level: string | null,
  topicHints: string,
  model: string
): Promise<z.infer<typeof ExtractSchema>> {
  const raw = await freeLLMComplete(
    [
      { role: "system", content: extractSystem(courseName, level) },
      { role: "user", content: `<material_portion>\n${chunk}\n</material_portion>\n\n<course_emphasis>\n${topicHints}\n</course_emphasis>` },
    ],
    { model, jsonMode: true, temperature: 0.2, maxTokens: EXTRACT_MAX_TOKENS, timeoutMs: EXTRACT_TIMEOUT_MS }
  );
  return ExtractSchema.parse(JSON.parse(stripFences(raw)));
}

// ── Stage 2: merge + dedupe concepts ──────────────────────────────────────────

interface Merged {
  label: string;
  summary: string;
  examImportance: number;
  learningImportance: number;
  sourceRefs: { page?: string | number }[];
}

function mergeConcepts(all: z.infer<typeof ExtractSchema>["concepts"]): MapNode[] {
  const byKey = new Map<string, Merged>();
  for (const c of all) {
    const key = c.label.toLowerCase().trim().replace(/\s+/g, " ");
    if (!key) continue;
    const ex = byKey.get(key);
    if (!ex) {
      byKey.set(key, {
        label: c.label.trim(),
        summary: c.summary,
        examImportance: clampImportance(c.examImportance),
        learningImportance: clampImportance(c.learningImportance),
        sourceRefs: c.sourceRefs,
      });
    } else {
      byKey.set(key, {
        label: ex.label,
        summary: c.summary.length > ex.summary.length ? c.summary : ex.summary,
        examImportance: Math.max(ex.examImportance, clampImportance(c.examImportance)),
        learningImportance: Math.max(ex.learningImportance, clampImportance(c.learningImportance)),
        sourceRefs: [...ex.sourceRefs, ...c.sourceRefs],
      });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.examImportance + b.learningImportance - (a.examImportance + a.learningImportance))
    .slice(0, MAX_NODES)
    .map((m, i) => ({
      id: `n${i}`,
      label: m.label,
      summary: m.summary,
      examImportance: m.examImportance,
      learningImportance: m.learningImportance,
      cluster: "general",
      sourceRefs: m.sourceRefs.slice(0, 6),
    }));
}

// ── Stage 3: synthesize clusters, edges, outline (small, fast) ────────────────

function synthSystem(courseName: string): string {
  return `You are organizing a concept map for "${courseName}". Given the concepts (with ids), group them into 2-6 teachable clusters, identify how they relate, and give a teaching order (prerequisites before dependents). Use the EXACT ids provided — never invent ids.
Return JSON only: { "clusters": [{ "id": "c1", "title": "Cluster name", "theme": "one line" }], "assignments": [{ "node": "n0", "cluster": "c1" }], "edges": [{ "from": "n0", "to": "n1", "type": "prerequisite|related|contrast|example_of", "label": "" }], "outline": ["n0 in teaching order"] }`;
}

function fallbackSynth(nodes: MapNode[]): { clusters: MapCluster[]; nodes: MapNode[]; edges: MapEdge[]; outline: string[] } {
  return {
    clusters: [{ id: "all", title: "All concepts", theme: "" }],
    nodes: nodes.map((n) => ({ ...n, cluster: "all" })),
    edges: [],
    outline: nodes.map((n) => n.id),
  };
}

async function synthesize(
  nodes: MapNode[],
  courseName: string,
  model: string
): Promise<{ clusters: MapCluster[]; nodes: MapNode[]; edges: MapEdge[]; outline: string[] }> {
  const list = nodes.map((n) => `${n.id}: ${n.label} — ${n.summary}`).join("\n");
  let parsed: z.infer<typeof SynthSchema>;
  try {
    const raw = await freeLLMComplete(
      [
        { role: "system", content: synthSystem(courseName) },
        { role: "user", content: `Concepts:\n${list}` },
      ],
      { model, jsonMode: true, temperature: 0.2, maxTokens: SYNTH_MAX_TOKENS, timeoutMs: SYNTH_TIMEOUT_MS }
    );
    parsed = SynthSchema.parse(JSON.parse(stripFences(raw)));
  } catch {
    return fallbackSynth(nodes);
  }

  const clusters = parsed.clusters.filter((c) => c.id && c.title);
  if (clusters.length === 0) return fallbackSynth(nodes);
  const clusterIds = new Set(clusters.map((c) => c.id));
  const fallbackCluster = clusters[0].id;

  const assignment = new Map<string, string>();
  for (const a of parsed.assignments) {
    if (clusterIds.has(a.cluster)) assignment.set(a.node, a.cluster);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const assignedNodes = nodes.map((n) => ({ ...n, cluster: assignment.get(n.id) ?? fallbackCluster }));

  const seenEdge = new Set<string>();
  const edges = parsed.edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to)
    .filter((e) => {
      const k = `${e.from}->${e.to}`;
      if (seenEdge.has(k)) return false;
      seenEdge.add(k);
      return true;
    });

  const outline = parsed.outline.filter((id) => nodeIds.has(id));
  const ordered = [...outline, ...nodes.map((n) => n.id).filter((id) => !outline.includes(id))];

  return { clusters, nodes: assignedNodes, edges, outline: ordered };
}

// ── Public: build the whole map ───────────────────────────────────────────────

export async function buildMindMap(
  input: { courseName: string; educationLevel: string | null; rawText: string; topicHints: string },
  model: string
): Promise<BuiltMap> {
  const chunks = chunkText(input.rawText.trim());
  if (chunks.length === 0) throw new Error("No course material to analyze.");

  const extracted = await mapLimit(chunks, CONCURRENCY, (chunk) =>
    extractChunk(chunk, input.courseName, input.educationLevel, input.topicHints, model).catch(() => null)
  );
  const good = extracted.filter((r): r is z.infer<typeof ExtractSchema> => r !== null);
  if (good.length === 0) throw new Error("Concept extraction failed for every part of the material.");

  const language = good.find((r) => r.language)?.language ?? "English";
  const nodes = mergeConcepts(good.flatMap((r) => r.concepts));
  if (nodes.length === 0) throw new Error("No concepts could be extracted from the material.");

  const synth = await synthesize(nodes, input.courseName, model);
  return { language, nodes: synth.nodes, edges: synth.edges, clusters: synth.clusters, outline: synth.outline };
}
