import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMStream, resolveLargeContextModel } from "@/lib/freellm";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const TEMPERATURE = 0.4;
const MAX_MATERIAL_CHARS = 40_000;
const MAX_HISTORY_TURNS = 14;
const MAX_MESSAGE_CHARS = 6_000;
const EXPLAIN_LIMIT = { max: 80, windowMs: 10 * 60 * 1000 };

interface TrialQuestion {
  num?: string;
  text: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Params = { params: Promise<{ id: string; trialId: string; qIndex: string }> };

async function loadOwned(courseId: string, trialId: string, userId: string) {
  const trial = await prisma.examTrial.findUnique({
    where: { id: trialId },
    select: {
      courseId: true,
      userId: true,
      questions: true,
      course: { select: { userId: true, name: true, rawText: true } },
    },
  });
  if (!trial || trial.courseId !== courseId || trial.userId !== userId || trial.course.userId !== userId) {
    return null;
  }
  return trial;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);
  const { id: courseId, trialId, qIndex } = await params;
  const trial = await loadOwned(courseId, trialId, session.user.id);
  if (!trial) return json({ error: "Not found" }, 404);

  const messages = await prisma.examExplainMessage.findMany({
    where: { trialId, qIndex: Number(qIndex) },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true },
  });
  return NextResponse.json({ messages });
}

function buildSystemPrompt(courseName: string, question: string): string {
  return `You are an examiner-tutor for ${courseName}. The student is looking at THIS exam question:
"${question}"
Using ONLY the course material and sound reasoning, walk them to the answer:
1. The model answer.
2. The step-by-step reasoning an examiner wants to see.
3. "What you need to know to nail this" — the key concepts.
Cite the material (p.N) when it gives a page. Be clear, practical, and in the language of the material. Keep it tight.
The student can keep asking afterwards — help them DEVELOP their understanding, never just restate. If the material doesn't cover something, say so.`;
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);
  const userId = session.user.id;
  const { id: courseId, trialId, qIndex } = await params;
  const index = Number(qIndex);

  const trial = await loadOwned(courseId, trialId, userId);
  if (!trial) return json({ error: "Not found" }, 404);

  const questions = (Array.isArray(trial.questions) ? trial.questions : []) as unknown as TrialQuestion[];
  const question = questions[index];
  if (!question) return json({ error: "Question not found." }, 404);

  const limit = rateLimit(`explain:${userId}`, EXPLAIN_LIMIT);
  if (!limit.ok) return json({ error: "Too many messages. Please slow down." }, 429);

  let body: { message?: unknown; history?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const userTurn =
    typeof body.message === "string" && body.message.trim()
      ? body.message.trim().slice(0, MAX_MESSAGE_CHARS)
      : "Explain this question and what I need to know to answer it.";

  const contextBlock = `<exam_question>
${question.text}
</exam_question>

<course_material>
${(trial.course.rawText ?? "").slice(0, MAX_MATERIAL_CHARS)}
</course_material>`;

  const history = Array.isArray(body.history)
    ? (body.history as Array<{ role?: unknown; content?: unknown }>)
        .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-MAX_HISTORY_TURNS)
        .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, MAX_MESSAGE_CHARS) }))
    : [];

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: buildSystemPrompt(trial.course.name, question.text) },
    { role: "user", content: contextBlock },
    { role: "assistant", content: "I've read the question and the course material. What would you like me to explain?" },
    ...history,
    { role: "user", content: userTurn },
  ];

  const model = resolveLargeContextModel(await isProUser(userId));

  try {
    await prisma.examExplainMessage.create({
      data: { trialId, qIndex: index, role: "user", content: userTurn },
    });

    const stream = await freeLLMStream(messages, { temperature: TEMPERATURE, model });
    const [browserStream, captureStream] = (stream as ReadableStream).tee();

    (async () => {
      try {
        const reader = captureStream.getReader();
        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
        }
        if (full.trim()) {
          await prisma.examExplainMessage.create({
            data: { trialId, qIndex: index, role: "assistant", content: full },
          });
        }
      } catch {
        /* best-effort persistence */
      }
    })();

    return new Response(browserStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const msg =
      err instanceof Error && err.message
        ? err.message
        : "The tutor is temporarily unavailable. Please try again.";
    return json({ error: msg }, 502);
  }
}
