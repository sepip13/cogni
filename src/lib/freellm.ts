import { runHeavyLLM } from "@/lib/concurrency";

const FREELLMAPI_URL = (process.env.FREELLMAPI_URL ?? "").replace(/\/$/, "");
const FREELLMAPI_KEY = process.env.FREELLMAPI_KEY ?? "";
const DEFAULT_MODEL = process.env.FREELLMAPI_MODEL ?? "auto";

// Strongest large-context model served to PRO users. Overridable via env so the
// exact model can change without a code edit as the available pool rotates.
const PRO_MODEL = process.env.FREELLMAPI_PRO_MODEL ?? "gemini-3.5-flash";

/**
 * Picks the model for an LLM call based on the caller's plan.
 * - FREE users always run on the free router (`DEFAULT_MODEL`, normally "auto").
 * - PRO users get `PRO_MODEL`, unless they explicitly request another model.
 */
export function resolveModelForPlan(isPro: boolean, requested?: string | null): string {
  if (!isPro) return DEFAULT_MODEL;
  const r = requested?.trim();
  return r && r !== "auto" ? r : PRO_MODEL;
}

// Large-context model for the FREE tier (study guide analysis needs to fit big
// inputs). gemini-2.5-flash is a free, 1M-context model — far better than the
// router's "auto" which may pick a small-context model.
const FREE_LARGE_MODEL = process.env.FREELLMAPI_FREE_LARGE_MODEL ?? "gemini-2.5-flash";

/**
 * Picks the largest-context model available in the caller's tier — used by the
 * study-guide/exam features where the whole course material must fit in context.
 * FREE → `FREE_LARGE_MODEL`; PRO → `PRO_MODEL` (or the user's explicit choice).
 */
export function resolveLargeContextModel(isPro: boolean, requested?: string | null): string {
  if (!isPro) return FREE_LARGE_MODEL;
  const r = requested?.trim();
  return r && r !== "auto" ? r : PRO_MODEL;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function freeLLMComplete(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number; jsonMode?: boolean; timeoutMs?: number } = {}
): Promise<string> {
  if (!FREELLMAPI_URL || !FREELLMAPI_KEY) {
    throw new Error("FreeLLMAPI not configured (FREELLMAPI_URL / FREELLMAPI_KEY missing)");
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const url = new URL(`${FREELLMAPI_URL}/v1/chat/completions`);
  const transport = url.protocol === "https:" ? await import("node:https") : await import("node:http");

  const body = JSON.stringify({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.4,
    ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    messages,
  });

  const text = await new Promise<string>((resolve, reject) => {
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${FREELLMAPI_KEY}`,
        },
        timeout: opts.timeoutMs ?? 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          if (res.statusCode !== 200) {
            reject(new Error(`FreeLLMAPI ${res.statusCode}: ${raw}`));
            return;
          }
          resolve(raw);
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("FreeLLMAPI timeout")); });
    req.write(body);
    req.end();
  });

  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("FreeLLMAPI returned no content");
  return content;
}

/**
 * Heavy variant of {@link freeLLMComplete}: routed through the global heavy-LLM
 * semaphore so background generation can't overwhelm the proxy or OOM the box.
 * Use for chunked / batched background jobs; keep interactive calls (chat,
 * grade, explain) on `freeLLMComplete` so they stay responsive.
 */
export function freeLLMCompleteHeavy(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number; jsonMode?: boolean; timeoutMs?: number } = {}
): Promise<string> {
  return runHeavyLLM(() => freeLLMComplete(messages, opts));
}

// ── Model failover ────────────────────────────────────────────────────────────

/**
 * Universal fallback models, tried in order AFTER the caller's requested model.
 * `auto` is the gateway's own provider-failover router (it routes to ANY healthy
 * provider), so it's the catch-all last resort; the others are fast, reliable,
 * large-context free models. Override the whole list via env, no code change.
 */
const FALLBACK_MODELS = (process.env.FREELLMAPI_FALLBACK_MODELS ?? "gemini-2.5-flash-lite,gemini-2.5-flash,auto")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * Per-attempt timeout ceiling. Deliberately short: when one provider hangs we
 * fail fast and fall over to the next model instead of waiting out a multi-minute
 * socket timeout on a single dead provider. Override via env.
 */
const ATTEMPT_TIMEOUT_MS = Math.max(15_000, Number(process.env.FREELLMAPI_ATTEMPT_TIMEOUT_MS) || 120_000);

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const v = m.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Ordered, de-duplicated model chain: the requested model first, then the configured fallbacks. */
export function buildModelChain(primary?: string | null): string[] {
  const chain = dedupeModels([...(primary ? [primary] : []), ...FALLBACK_MODELS]);
  return chain.length > 0 ? chain : ["auto"];
}

export interface FailoverOptions {
  /** Primary model; the chain starts here, then appends the configured fallbacks. */
  model?: string | null;
  /** Explicit chain — overrides `model` + fallbacks when provided. */
  models?: string[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  /** Per-attempt timeout, capped at ATTEMPT_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Route each attempt through the global heavy-LLM semaphore. */
  heavy?: boolean;
  /** Acceptance test: a parseable-but-bad response (e.g. truncated JSON) counts as a failure and falls over. */
  validate?: (text: string) => boolean;
  /** Short context tag for logs, e.g. "ingest:<courseId>". */
  label?: string;
}

export interface LLMResult {
  text: string;
  /** The model that actually produced the accepted response. */
  model: string;
}

/**
 * Completes a chat across a CHAIN of models, returning the first response that is
 * non-empty and (if `validate` is given) valid. A timeout, non-200, empty, or
 * invalid response advances to the next model — `auto` (the gateway's own
 * provider router) being the universal last resort. Throws only when EVERY model
 * in the chain fails.
 */
export async function freeLLMCompleteFailover(
  messages: ChatMessage[],
  opts: FailoverOptions = {}
): Promise<LLMResult> {
  const chain = opts.models?.length ? dedupeModels(opts.models) : buildModelChain(opts.model);
  const perAttempt = Math.min(opts.timeoutMs ?? ATTEMPT_TIMEOUT_MS, ATTEMPT_TIMEOUT_MS);
  const tag = `[llm${opts.label ? `:${opts.label}` : ""}]`;
  const base = {
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    jsonMode: opts.jsonMode,
    timeoutMs: perAttempt,
  };

  let lastError = "no models attempted";
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      const run = () => freeLLMComplete(messages, { ...base, model });
      const text = opts.heavy ? await runHeavyLLM(run) : await run();
      if (!text.trim()) throw new Error("empty response");
      if (opts.validate && !opts.validate(text)) throw new Error("response failed validation");
      if (i > 0) console.log(`${tag} ✓ recovered on fallback model "${model}" (${i + 1}/${chain.length})`);
      return { text, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      const next = i + 1 < chain.length ? `→ falling over to "${chain[i + 1]}"` : "(no models left)";
      console.warn(`${tag} ✗ "${model}" failed: ${lastError} ${next}`);
    }
  }
  throw new Error(`All ${chain.length} models failed. Last error: ${lastError}`);
}

export async function freeLLMStream(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number } = {}
): Promise<ReadableStream<Uint8Array>> {
  if (!FREELLMAPI_URL || !FREELLMAPI_KEY) {
    throw new Error("FreeLLMAPI not configured");
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const res = await fetch(`${FREELLMAPI_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${FREELLMAPI_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: opts.temperature ?? 0.4,
      stream: true,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FreeLLMAPI ${res.status}: ${text}`);
  }

  if (!res.body) throw new Error("FreeLLMAPI returned no stream body");

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const chunk = JSON.parse(payload);
              const text = chunk.choices?.[0]?.delta?.content;
              if (text) controller.enqueue(encoder.encode(text));
            } catch {}
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });
}
