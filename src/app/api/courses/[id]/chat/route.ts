import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-5";
const TEMPERATURE = 0.4;
// Keep context within a safe window — truncate rawText if needed
const MAX_RAW_CHARS = 100_000;

// §6.3 exact system prompt
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

  // Truncate rawText to stay within a safe context budget
  const rawText = (course.rawText ?? "").slice(0, MAX_RAW_CHARS);

  const contextBlock = `<course_material>\n${rawText}\n</course_material>\n\n<student_progress>\n${progressContext}\n</student_progress>`;

  // Build message history
  const history = (body.history ?? []).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: contextBlock },
    { role: "assistant", content: "I've read the course material and noted your progress. How can I help?" },
    ...history,
    { role: "user", content: body.message },
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Stream the response back as plain text/event-stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.stream({
          model: MODEL,
          max_tokens: 1024,
          temperature: TEMPERATURE,
          system: buildSystemPrompt(course.name),
          messages,
        });

        for await (const chunk of anthropicStream) {
          if (
            chunk.type === "content_block_delta" &&
            chunk.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text));
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
