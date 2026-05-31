/**
 * Chunked concept-map builder (P1, robust + fast).
 *
 * The FreeLLMAPI's bottleneck is per-call latency, not input size, so we make
 * ONE pass of parallel per-chunk extraction and assemble the map in code — no
 * second LLM round-trip:
 *   1. split the material into chunks,
 *   2. extract concepts + clusters + prerequisites from each chunk in parallel
 *      (bounded concurrency; a failed chunk is skipped, not fatal),
 *   3. merge + dedupe across chunks, then derive clusters, edges, and a
 *      prerequisites-first teaching order purely in code.
 * Arbitrarily large courses are handled and the context window is never a wall.
 */

import { freeLLMCompleteFailover } from "@/lib/freellm";
import { z } from "zod";

// The free proxy is slow and gets slower under concurrency, but a single call
// on a normal-sized course is reliable. So fit most courses in ONE call and
// only chunk genuinely huge ones, with low concurrency + a retry.
const CHUNK_CHARS = 150_000; // ~38k tokens — most courses = 1 reliable call
const MAX_CHUNKS = 6; // up to ~900k chars analyzed
const MAX_NODES = 28;
const MAX_CLUSTERS = 8;
const CONCURRENCY = 2;
const EXTRACT_TIMEOUT_MS = 240_000;
const EXTRACT_MAX_TOKENS = 7000; // room for the full bounded concept list

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
export type MapCluster = { id: string; title: string; theme: string };
export interface BuiltMap {
  language: string;
  nodes: MapNode[];
  edges: MapEdge[];
  clusters: MapCluster[];
  outline: string[];
}

const ConceptSchema = z.object({
  label: z.string().min(1),
  summary: z.string().catch(""),
  examImportance: z.coerce.number().catch(3),
  learningImportance: z.coerce.number().catch(3),
  cluster: z.string().catch(""),
  prerequisites: z.array(z.string()).catch([]),
});
const ExtractSchema = z.object({
  language: z.string().catch("English"),
  concepts: z.array(ConceptSchema).catch([]),
});
type Extract = z.infer<typeof ExtractSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Tolerant JSON parse: strips ``` fences and falls back to the {…} substring. */
function parseLoose(raw: string): unknown {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a !== -1 && b > a) return JSON.parse(s.slice(a, b + 1));
    throw new Error("Could not parse JSON");
  }
}

function clampImportance(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

function norm(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
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

// ── Stage 1: extract one chunk ────────────────────────────────────────────────

function extractSystem(courseName: string, level: string | null): string {
  const lvl = level ? ` The student level is: ${level}.` : "";
  return `You are a curriculum analyst for "${courseName}".${lvl} From THIS PORTION of the course material, extract the 15-25 MOST important concepts a student must master (quality over quantity — do not list everything). For each concept give: a short label, a 1-2 sentence summary, examImportance (1-5), learningImportance (1-5), a cluster (a short theme/topic name it belongs to), and prerequisites (labels of concepts it builds on). Ground ONLY in the provided text — never invent. Detect the language of the material.
Return JSON only: { "language": "...", "concepts": [{ "label": "...", "summary": "...", "examImportance": 1-5, "learningImportance": 1-5, "cluster": "theme name", "prerequisites": ["concept label"] }] }`;
}

async function extractChunk(
  chunk: string,
  courseName: string,
  level: string | null,
  topicHints: string,
  model: string
): Promise<Extract | null> {
  const messages = [
    { role: "system" as const, content: extractSystem(courseName, level) },
    { role: "user" as const, content: `<material_portion>\n${chunk}\n</material_portion>\n\n<course_emphasis>\n${topicHints}\n</course_emphasis>` },
  ];
  try {
    const { text } = await freeLLMCompleteFailover(messages, {
      model,
      heavy: true,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: EXTRACT_MAX_TOKENS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
      label: "concept-map",
      // Fall over to the next model if a chunk's JSON is unparseable.
      validate: (t) => {
        try {
          ExtractSchema.parse(parseLoose(t));
          return true;
        } catch {
          return false;
        }
      },
    });
    return ExtractSchema.parse(parseLoose(text));
  } catch {
    return null;
  }
}

// ── Stage 2: merge + assemble (pure code, no LLM) ─────────────────────────────

interface Merged {
  label: string;
  summary: string;
  exam: number;
  learn: number;
  cluster: string;
  prereqs: Set<string>;
}

function mergeConcepts(all: Extract["concepts"]): { nodes: MapNode[]; keyToId: Map<string, string>; mergedByKey: Map<string, Merged> } {
  const byKey = new Map<string, Merged>();
  for (const c of all) {
    const key = norm(c.label);
    if (!key) continue;
    const ex = byKey.get(key);
    if (!ex) {
      byKey.set(key, {
        label: c.label.trim(),
        summary: c.summary,
        exam: clampImportance(c.examImportance),
        learn: clampImportance(c.learningImportance),
        cluster: c.cluster.trim(),
        prereqs: new Set(c.prerequisites.map(norm).filter(Boolean)),
      });
    } else {
      ex.summary = c.summary.length > ex.summary.length ? c.summary : ex.summary;
      ex.exam = Math.max(ex.exam, clampImportance(c.examImportance));
      ex.learn = Math.max(ex.learn, clampImportance(c.learningImportance));
      if (!ex.cluster && c.cluster.trim()) ex.cluster = c.cluster.trim();
      for (const p of c.prerequisites.map(norm)) if (p) ex.prereqs.add(p);
    }
  }

  const top = [...byKey.entries()]
    .sort((a, b) => b[1].exam + b[1].learn - (a[1].exam + a[1].learn))
    .slice(0, MAX_NODES);

  const keyToId = new Map<string, string>();
  top.forEach(([key], i) => keyToId.set(key, `n${i}`));
  const mergedByKey = new Map(top);

  const nodes: MapNode[] = top.map(([, m], i) => ({
    id: `n${i}`,
    label: m.label,
    summary: m.summary,
    examImportance: m.exam,
    learningImportance: m.learn,
    cluster: m.cluster,
    sourceRefs: [],
  }));

  return { nodes, keyToId, mergedByKey };
}

function buildClusters(nodes: MapNode[]): MapCluster[] {
  // Distinct cluster names → cluster objects, capped; node.cluster rewritten to id.
  const idByName = new Map<string, string>();
  const titleById = new Map<string, string>();
  const countById = new Map<string, number>();
  let ci = 0;
  for (const n of nodes) {
    const name = n.cluster.trim();
    const key = norm(name);
    if (!key) continue;
    if (!idByName.has(key)) {
      const id = `c${ci++}`;
      idByName.set(key, id);
      titleById.set(id, name);
      countById.set(id, 0);
    }
    const id = idByName.get(key)!;
    countById.set(id, (countById.get(id) ?? 0) + 1);
  }

  let clusters: MapCluster[] = [...titleById.entries()].map(([id, title]) => ({ id, title, theme: "" }));

  // Cap clusters: keep the largest, fold the rest into the biggest one.
  if (clusters.length > MAX_CLUSTERS) {
    clusters.sort((a, b) => (countById.get(b.id) ?? 0) - (countById.get(a.id) ?? 0));
    const kept = new Set(clusters.slice(0, MAX_CLUSTERS).map((c) => c.id));
    const fallback = clusters[0].id;
    for (const n of nodes) {
      const key = norm(n.cluster);
      const id = idByName.get(key);
      if (id && !kept.has(id)) idByName.set(key, fallback);
    }
    clusters = clusters.filter((c) => kept.has(c.id));
  }

  const fallbackCluster = clusters[0]?.id ?? "c0";
  if (clusters.length === 0) clusters.push({ id: "c0", title: "Core concepts", theme: "" });
  for (const n of nodes) {
    const id = idByName.get(norm(n.cluster));
    n.cluster = id ?? fallbackCluster;
  }
  return clusters;
}

function buildEdges(nodes: MapNode[], keyToId: Map<string, string>, mergedByKey: Map<string, Merged>): MapEdge[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: MapEdge[] = [];
  const seen = new Set<string>();
  for (const [key, m] of mergedByKey) {
    const toId = keyToId.get(key);
    if (!toId || !nodeIds.has(toId)) continue;
    for (const pkey of m.prereqs) {
      const fromId = keyToId.get(pkey);
      if (!fromId || !nodeIds.has(fromId) || fromId === toId) continue;
      const ek = `${fromId}->${toId}`;
      if (seen.has(ek)) continue;
      seen.add(ek);
      edges.push({ from: fromId, to: toId, type: "prerequisite", label: "" });
    }
  }
  return edges;
}

/** Prerequisites-first order (Kahn), ties broken by importance; cycles appended. */
function buildOutline(nodes: MapNode[], edges: MapEdge[]): string[] {
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (indeg.has(e.to) && adj.has(e.from)) {
      indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
      adj.get(e.from)!.push(e.to);
    }
  }
  const importance = new Map(nodes.map((n) => [n.id, n.examImportance + n.learningImportance]));
  const out: string[] = [];
  const done = new Set<string>();
  const avail = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  while (avail.length > 0) {
    avail.sort((a, b) => (importance.get(b) ?? 0) - (importance.get(a) ?? 0));
    const id = avail.shift()!;
    if (done.has(id)) continue;
    out.push(id);
    done.add(id);
    for (const nxt of adj.get(id) ?? []) {
      indeg.set(nxt, (indeg.get(nxt) ?? 0) - 1);
      if ((indeg.get(nxt) ?? 0) === 0) avail.push(nxt);
    }
  }
  for (const n of nodes) if (!done.has(n.id)) out.push(n.id); // cycles / leftovers
  return out;
}

// ── Public ────────────────────────────────────────────────────────────────────

export async function buildMindMap(
  input: { courseName: string; educationLevel: string | null; rawText: string; topicHints: string },
  model: string
): Promise<BuiltMap> {
  const chunks = chunkText(input.rawText.trim());
  if (chunks.length === 0) throw new Error("No course material to analyze.");

  const extracted = await mapLimit(chunks, CONCURRENCY, (chunk) =>
    extractChunk(chunk, input.courseName, input.educationLevel, input.topicHints, model)
  );
  const good = extracted.filter((r): r is Extract => r !== null);
  if (good.length === 0) throw new Error("Concept extraction failed for the material.");

  const language = good.find((r) => r.language)?.language ?? "English";
  const { nodes, keyToId, mergedByKey } = mergeConcepts(good.flatMap((r) => r.concepts));
  if (nodes.length === 0) throw new Error("No concepts could be extracted from the material.");

  const clusters = buildClusters(nodes);
  const edges = buildEdges(nodes, keyToId, mergedByKey);
  const outline = buildOutline(nodes, edges);

  return { language, nodes, edges, clusters, outline };
}
