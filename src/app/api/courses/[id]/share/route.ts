import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/share";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const SHARE_CREATE_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 };

const ShareCreateSchema = z.object({
  permission: z.enum(["VIEW", "COMMENT"]).default("VIEW"),
  publicNoAuth: z.boolean().default(true),
  includeSources: z.boolean().default(false),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

type Params = { params: Promise<{ id: string }> };

async function requireOwnedCourse(courseId: string, userId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { userId: true },
  });
  return !!course && course.userId === userId;
}

function shareUrl(req: NextRequest, token: string): string {
  return `${getAppBaseUrl(req)}/share/${token}`;
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  if (!(await requireOwnedCourse(courseId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const shares = await prisma.courseShare.findMany({
    where: { courseId, revoked: false },
    orderBy: { createdAt: "desc" },
    select: {
      token: true,
      permission: true,
      publicNoAuth: true,
      includeSources: true,
      expiresAt: true,
      viewCount: true,
      createdAt: true,
    },
  });

  const list = shares.map((s) => ({ ...s, url: shareUrl(req, s.token) }));
  return NextResponse.json({ shares: list });
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { id: courseId } = await params;
  if (!(await requireOwnedCourse(courseId, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const limit = rateLimit(`sharecreate:${userId}`, SHARE_CREATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many share links created. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  let input: z.infer<typeof ShareCreateSchema>;
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;
    input = ShareCreateSchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid share options" }, { status: 400 });
  }

  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86_400_000)
    : null;

  // Reuse an existing active link with identical settings rather than minting duplicates.
  const existing = await prisma.courseShare.findFirst({
    where: {
      courseId,
      revoked: false,
      permission: input.permission,
      publicNoAuth: input.publicNoAuth,
      includeSources: input.includeSources,
      expiresAt: expiresAt ? { gt: new Date() } : null,
    },
    select: { token: true, permission: true, publicNoAuth: true, includeSources: true, expiresAt: true },
  });

  if (existing && !input.expiresInDays) {
    return NextResponse.json({ ...existing, url: shareUrl(req, existing.token) });
  }

  // crypto-random, URL-safe, 24 chars (18 bytes base64url).
  const token = randomBytes(18).toString("base64url");

  const share = await prisma.courseShare.create({
    data: {
      courseId,
      token,
      permission: input.permission,
      publicNoAuth: input.publicNoAuth,
      includeSources: input.includeSources,
      expiresAt,
      createdBy: userId,
    },
    select: { token: true, permission: true, publicNoAuth: true, includeSources: true, expiresAt: true },
  });

  return NextResponse.json({ ...share, url: shareUrl(req, share.token) }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  if (!(await requireOwnedCourse(courseId, session.user.id))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  // Only revoke a share that belongs to this owner's course.
  const result = await prisma.courseShare.updateMany({
    where: { token, courseId },
    data: { revoked: true },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ revoked: true });
}
