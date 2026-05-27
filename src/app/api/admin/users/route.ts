/**
 * Admin-only user management endpoints.
 *
 * GET  /api/admin/users          — list all users with plan + usage stats
 * POST /api/admin/users          — set plan for a user
 *
 * Protected by ADMIN_SECRET env var (passed as Bearer token).
 * Example:
 *   curl -X POST /api/admin/users \
 *     -H "Authorization: Bearer <ADMIN_SECRET>" \
 *     -d '{"userId":"...", "plan":"PRO"}'
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

function isAuthorized(req: NextRequest): boolean {
  if (!ADMIN_SECRET) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${ADMIN_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      createdAt: true,
      _count: { select: { courses: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { userId?: string; plan?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, plan } = body;

  if (!userId || !["FREE", "PRO"].includes(plan ?? "")) {
    return NextResponse.json(
      { error: "userId and plan (FREE | PRO) are required" },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { plan: plan as "FREE" | "PRO" },
    select: { id: true, email: true, plan: true },
  });

  return NextResponse.json(updated);
}
