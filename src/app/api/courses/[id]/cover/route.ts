import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateImage, isImageConfigured } from "@/lib/nvidia-image";
import { saveCourseFile } from "@/lib/uploads";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const COVER_LIMIT = { max: 15, windowMs: 60 * 60 * 1000 }; // 15 / hour / user
const MAX_PROMPT_CHARS = 600;

type Params = { params: Promise<{ id: string }> };

interface TopicLite {
  title: string;
  priority: "HIGH" | "MED" | "LOW";
}

/**
 * A tasteful, on-brand cover prompt derived from the course. We steer FLUX
 * toward abstract editorial art and explicitly away from text/faces, which the
 * model otherwise renders garbled.
 */
function buildCoverPrompt(name: string, topics: TopicLite[]): string {
  const rank: Record<TopicLite["priority"], number> = { HIGH: 0, MED: 1, LOW: 2 };
  const themes = topics
    .slice()
    .sort((a, b) => rank[a.priority] - rank[b.priority])
    .slice(0, 3)
    .map((t) => t.title)
    .join(", ");
  return [
    `Minimal abstract editorial cover illustration representing the theme of "${name}".`,
    themes ? `Evoke these themes subtly: ${themes}.` : "",
    "Soft gradient color field, clean geometric shapes, sophisticated muted palette, modern, calm, high quality.",
    "No text, no words, no letters, no logos, no human faces.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, MAX_PROMPT_CHARS);
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id: courseId } = await params;

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      userId: true,
      name: true,
      topics: { select: { title: true, priority: true }, orderBy: { order: "asc" }, take: 12 },
    },
  });
  if (!course || course.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isImageConfigured()) {
    return NextResponse.json({ error: "Image generation isn't configured." }, { status: 503 });
  }

  const limit = rateLimit(`cover:${userId}`, COVER_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're generating covers quickly — please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown };
  const custom = typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : "";
  const prompt = custom || buildCoverPrompt(course.name, course.topics as TopicLite[]);

  try {
    // Wide banner (1344×768 ≈ 16:9 — both are valid FLUX dimensions).
    const img = await generateImage(prompt, { width: 1344, height: 768 });
    const buffer = Buffer.from(img.base64, "base64");
    const { url } = await saveCourseFile(courseId, "covers", `cover-${img.seed}-${Date.now()}.jpg`, buffer);

    await prisma.course.update({
      where: { id: courseId },
      data: { coverImageUrl: url, coverImagePrompt: prompt },
    });

    return NextResponse.json({ url, prompt });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Couldn't generate a cover. Please try again.";
    console.error(`[cover:${courseId}] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
