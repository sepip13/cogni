import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMStream } from "@/lib/freellm";

// Thin streaming proxy. NO database writes — all chat history lives in the
// browser's localStorage. The only server responsibility here is keeping the
// FreeLLMAPI key server-side and streaming tokens back to the client.

const MAX_MESSAGES = 100;
const MAX_MESSAGE_CHARS = 12_000;

type Role = "system" | "user" | "assistant";

interface OutgoingMessage {
  role: Role;
  content: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRole(value: unknown): value is Role {
  return value === "system" || value === "user" || value === "assistant";
}

export async function POST(req: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { messages?: unknown; modelId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { messages, modelId } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages must be a non-empty array" }, 400);
  }
  if (typeof modelId !== "string" || modelId.trim() === "") {
    return json({ error: "modelId is required" }, 400);
  }

  const cleaned: OutgoingMessage[] = [];
  for (const raw of messages.slice(-MAX_MESSAGES)) {
    if (!raw || typeof raw !== "object") {
      return json({ error: "Each message must be an object" }, 400);
    }
    const role = (raw as { role?: unknown }).role;
    const content = (raw as { content?: unknown }).content;
    if (!isRole(role) || typeof content !== "string") {
      return json({ error: "Each message needs a valid role and string content" }, 400);
    }
    cleaned.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }

  const model = await prisma.llmModel.findFirst({
    where: { modelId, isActive: true },
    select: { modelId: true },
  });
  if (!model) {
    return json({ error: "Model not found or inactive" }, 404);
  }

  try {
    const stream = await freeLLMStream(cleaned, { model: model.modelId });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM error";
    return json({ error: msg }, 502);
  }
}
