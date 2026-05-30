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

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function freeLLMComplete(
  messages: ChatMessage[],
  opts: { model?: string; maxTokens?: number; temperature?: number; jsonMode?: boolean } = {}
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
        timeout: 60_000,
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
