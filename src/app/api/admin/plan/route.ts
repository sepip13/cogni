/**
 * POST /api/admin/plan
 * Session-protected endpoint for the admin UI to toggle user plans.
 * Only emails listed in ADMIN_EMAILS env var (or the hardcoded fallback) may call this.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAILS = (
  process.env.ADMIN_EMAILS ?? "sepipsy@gmail.com,sepspipsy@gmail.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase());

export async function POST(req: NextRequest) {
  const session = await auth();
  const callerEmail = session?.user?.email?.toLowerCase();

  if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
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
    return NextResponse.json({ error: "userId and plan (FREE | PRO) required" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { plan: plan as "FREE" | "PRO" },
    select: { id: true, email: true, plan: true },
  });

  return NextResponse.json(updated);
}
