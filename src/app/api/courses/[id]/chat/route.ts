import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { freeLLMStream } from "@/lib/freellm";

const TEMPERATURE = 0.4;
const MAX_RAW_CHARS = 100_000;
const MAX_HISTORY_TURNS = 20;
const MAX_MESSAGE_CHARS = 10_000;

function buildSystemPrompt(courseName: string): string {
  return `You are Cogni's study advisor for ONE specific course: ${courseName}.
You have access to the student's uploaded course materials and their current
progress (which topics studied, days until exam, total prep time remaining).
Rules:
1. Only answer using the uploaded course material. If asked something outside
   the material, say so and offer to redirect.
2. When recommending what to study next, factor in: exam date, topic priority,
   what's already studied, realistic time available.
3. Always cite page numbers for factual claims.
4. Keep responses tight. No filler.`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      userId: true,
      name: true,
      rawText: true,
      examDate: true,
      topics: {
        select: {
          num: true,
          title: true,
          priority: true,
          timeMinutes: true,
          studied: true,
          order: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!course || course.userId !== session.user.id) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { message: string; history?: Array<{ role: "user" | "assistant"; content: string }> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!body.message || typeof body.message !== "string") {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const studiedCount = course.topics.filter((t) => t.studied).length;
  const daysLeft = course.examDate
    ? Math.max(0, Math.ceil((new Date(course.examDate).getTime() - Date.now()) / 86_400_000))
    : null;

  const progressContext = [
    `Course: ${course.name}`,
    daysLeft !== null ? `Days until exam: ${daysLeft}` : "Exam date: not set",
    `Progress: ${studiedCount}/${course.topics.length} topics studied`,
    "",
    "Topics (ordered by priority):",
    ...course.topics.map(
      (t) => `  [${t.studied ? "✓" : " "}] ${t.num} ${t.title} (${t.priority}, ${t.timeMinutes}min)`
    ),
  ].join("\n");

  const rawText = (course.rawText ?? "").slice(0, MAX_RAW_CHARS);
  const contextBlock = `<course_material>\n${rawText}\n</course_material>\n\n<student_progress>\n${progressContext}\n</student_progress>`;

  const history = (body.history ?? [])
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content).slice(0, MAX_MESSAGE_CHARS),
    }));

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: buildSystemPrompt(course.name) },
    { role: "user", content: contextBlock },
    { role: "assistant", content: "I've read the course material and noted your progress. How can I help?" },
    ...history,
    { role: "user", content: body.message },
  ];

  try {
    const stream = await freeLLMStream(messages, { temperature: TEMPERATURE });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
