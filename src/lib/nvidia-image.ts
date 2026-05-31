/**
 * NVIDIA FLUX.1-schnell text→image generation.
 *
 * Verified live (2026-05-31): POST to the NVIDIA `genai` endpoint with an
 * `nvapi-…` key returns a base64 JPEG in ~2s. This is NOT the chat proxy — image
 * models have their own endpoint and request shape, so cogni calls NVIDIA
 * directly with `NVIDIA_API_KEY` (the same family of key that's in the freellmapi
 * key store; kept here as a single env var for the direct image path).
 *
 *   endpoint: https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell
 *   body:     { prompt, width, height (768–1344), steps, cfg_scale, seed }
 *   response: { artifacts: [{ base64, finishReason: "SUCCESS", seed }] }  (JPEG)
 */

const NVIDIA_IMAGE_URL =
  process.env.NVIDIA_IMAGE_URL ??
  "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell";
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY ?? "";

// FLUX on NVIDIA only accepts these exact dimensions (from the live 422 schema).
const ALLOWED_DIMS = [768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344] as const;
const MAX_PROMPT_CHARS = 1500;
const DEFAULT_TIMEOUT_MS = 60_000;

function snapDim(n: number): number {
  return ALLOWED_DIMS.reduce((best, d) => (Math.abs(d - n) < Math.abs(best - n) ? d : best), ALLOWED_DIMS[3]);
}

export interface ImageOptions {
  width?: number;
  height?: number;
  steps?: number; // schnell is a 4-step turbo model; keep it low
  seed?: number;
  timeoutMs?: number;
}

export interface GeneratedImage {
  base64: string;
  mime: "image/jpeg";
  seed: number;
  width: number;
  height: number;
}

export function isImageConfigured(): boolean {
  return NVIDIA_API_KEY.length > 0;
}

/**
 * Generates one image from a text prompt. Throws a clean Error on misconfig,
 * non-200, timeout, or a missing artifact — callers map it to a user-facing
 * message and never crash the route.
 */
export async function generateImage(prompt: string, opts: ImageOptions = {}): Promise<GeneratedImage> {
  if (!NVIDIA_API_KEY) throw new Error("Image generation is not configured (NVIDIA_API_KEY missing).");
  const clean = prompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!clean) throw new Error("An image prompt is required.");

  const width = snapDim(opts.width ?? 1024);
  const height = snapDim(opts.height ?? 1024);

  let res: Response;
  try {
    res = await fetch(NVIDIA_IMAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NVIDIA_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        prompt: clean,
        width,
        height,
        steps: opts.steps ?? 4,
        cfg_scale: 0,
        seed: opts.seed ?? 0,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const msg = err instanceof Error && err.name === "TimeoutError" ? "Image generation timed out." : "Image service unreachable.";
    throw new Error(msg);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Image generation failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json().catch(() => null)) as
    | { artifacts?: { base64?: string; finishReason?: string; seed?: number }[] }
    | null;
  const art = data?.artifacts?.[0];
  if (!art?.base64) throw new Error("Image generation returned no image.");
  if (art.finishReason && art.finishReason !== "SUCCESS") {
    throw new Error(`Image generation was rejected (${art.finishReason}). Try a different prompt.`);
  }

  return { base64: art.base64, mime: "image/jpeg", seed: art.seed ?? opts.seed ?? 0, width, height };
}
