/**
 * Shared helpers for coaxing clean JSON out of the free LLM proxy and for
 * chunking long inputs. The free proxy is slow, truncates long JSON below the
 * requested token cap, and sometimes wraps output in prose or ```` ```json ````
 * fences — so every JSON call needs fence-stripping + partial-array salvage, and
 * heavy jobs batch their input. These were proven in the exam trainer; they live
 * here so the study-guide flashcards + section-quiz generators reuse the exact
 * same battle-tested code instead of copy-pasting it.
 *
 * Every function here is pure (no I/O, no mutation of inputs).
 */

/**
 * Strips ```` ```json ```` fences and any prose around a JSON payload, returning
 * the bare object/array text. Falls back to the first `{…}` block when the model
 * adds commentary around it.
 */
export function stripFences(raw: string): string {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (s.startsWith("{") || s.startsWith("[")) return s;
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  return a !== -1 && b > a ? s.slice(a, b + 1) : s;
}

/**
 * Recovers complete `{…}` objects from a (possibly truncated) JSON array under
 * the given key. The free proxy sometimes cuts the response mid-array, so this
 * salvages every whole element that did come through instead of losing them all.
 */
export function salvageArray(content: string, key: string): unknown[] {
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

/** Lower-cases, trims, and collapses whitespace — a stable key for de-duplication. */
export function normText(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Splits text into question-sized units — paragraph blocks, or single lines if
 * the parse produced no blank lines — so a chunk boundary rarely cuts a question
 * in half.
 */
export function splitUnits(text: string): string[] {
  const byBlank = text.split(/\n\s*\n/).map((u) => u.trim()).filter(Boolean);
  return byBlank.length > 1 ? byBlank : text.split(/\n/);
}

/**
 * Greedily packs units into chunks of at most `maxChars`, never cutting a unit
 * unless a single unit is itself larger than the limit.
 */
export function chunkOnBoundaries(text: string, maxChars: number): string[] {
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
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
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
