import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMStream, resolveModelForPlan } from "@/lib/freellm";
import { isProUser } from "@/lib/plan";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const TEMPERATURE = 0.4;
const MAX_RUBRIC_CHARS = 50_000;
const MAX_WORK_CHARS = 30_000;
const MAX_HISTORY_TURNS = 16;
const MAX_MESSAGE_CHARS = 8_000;
const COACH_LIMIT = { max: 60, windowMs: 10 * 60 * 1000 };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildSystemPrompt(courseName: string): string {
  return `You are an examiner-turned-coach for ${courseName}. Your single goal: help the
student raise THIS specific piece of work to a perfect 10/10 against the course rubric.
Rules:
1. Ground every suggestion in the rubric and the student's current draft. Reference the
   exact criterion you are addressing.
2. Be concrete and actionable — tell them what to add, cut, or rewrite, not vague advice.
3. If the latest review listed gaps or action items, prioritise those.
4. Keep responses tight. No filler, no flattery.`;
}

type Params = { params: Promise<{ id: string; submissionId: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);
  const userId = session.user.id;

  const { id: courseId, submissionId } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      userId: true,
      courseId: true,
      title: true,
      kind: true,
      parsedText: true,
      course: { select: { userId: true, name: true, rawText: true } },
      reviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { gaps: true, actionItems: true, scoreOutOf10: true },
      },
    },
  });

  if (
    !submission ||
    submission.courseId !== courseId ||
    submission.userId !== userId ||
    submission.course.userId !== userId
  ) {
    return json({ error: "Not found" }, 404);
  }

  const limit = rateLimit(`coach:${userId}`, COACH_LIMIT);
  if (!limit.ok) {
    return json({ error: "Too many messages. Please slow down." }, 429);
  }

  let body: { message?: unknown; history?: unknown };
  try {
    body = (await req.json()) as { message?: unknown; history?: unknown };
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof body.message !== "string" || !body.message.trim()) {
    return json({ error: "message is required" }, 400);
  }

  const latest = submission.reviews[0];
  const reviewContext = latest
    ? `Latest review score: ${latest.scoreOutOf10}/10
Gaps: ${(latest.gaps as string[]).join("; ") || "none recorded"}
Action items: ${(latest.actionItems as string[]).join("; ") || "none recorded"}`
    : "No rubric review has been run yet.";

  const contextBlock = `<rubric>
${(submission.course.rawText ?? "(no course material provided)").slice(0, MAX_RUBRIC_CHARS)}
</rubric>

<student_work title="${submission.title}" kind="${submission.kind}">
${(submission.parsedText ?? "").slice(0, MAX_WORK_CHARS)}
</student_work>

<latest_review>
${reviewContext}
</latest_review>`;

  const history = Array.isArray(body.history)
    ? (body.history as Array<{ role?: unknown; content?: unknown }>)
        .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-MAX_HISTORY_TURNS)
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: String(m.content).slice(0, MAX_MESSAGE_CHARS),
        }))
    : [];

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: buildSystemPrompt(submission.course.name) },
    { role: "user", content: contextBlock },
    { role: "assistant", content: "I've read the rubric, your current draft, and the latest review. What would you like help with?" },
    ...history,
    { role: "user", content: body.message.slice(0, MAX_MESSAGE_CHARS) },
  ];

  const model = resolveModelForPlan(await isProUser(userId));

  try {
    const stream = await freeLLMStream(messages, { temperature: TEMPERATURE, model });
    return new Response(stream, {
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
        : "The coach is temporarily unavailable. Please try again.";
    return json({ error: msg }, 502);
  }
}
