import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";
import { generateCode } from "@/lib/access-codes";

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!isAdmin(email)) return null;
  return email ?? null;
}

export async function GET() {
  const adminEmail = await requireAdmin();
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const codes = await prisma.accessCode.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      durationDays: true,
      maxUses: true,
      usedCount: true,
      codeExpiresAt: true,
      isActive: true,
      note: true,
      createdBy: true,
      createdAt: true,
      redemptions: {
        orderBy: { redeemedAt: "desc" },
        take: 5,
        select: {
          redeemedAt: true,
          accessEndsAt: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  return NextResponse.json(codes);
}

export async function POST(req: NextRequest) {
  const adminEmail = await requireAdmin();
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: {
    durationDays?: unknown;
    maxUses?: unknown;
    codeExpiresAt?: unknown;
    note?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { durationDays, maxUses, codeExpiresAt, note } = body;

  if (
    typeof durationDays !== "number" ||
    ![3, 5, 10, 30].includes(durationDays)
  ) {
    return NextResponse.json(
      { error: "durationDays must be 3, 5, 10, or 30" },
      { status: 400 }
    );
  }

  const created = await prisma.accessCode.create({
    data: {
      code: generateCode(),
      durationDays,
      maxUses:
        typeof maxUses === "number" && maxUses >= 1 ? Math.floor(maxUses) : 1,
      codeExpiresAt:
        typeof codeExpiresAt === "string" && codeExpiresAt
          ? new Date(codeExpiresAt)
          : null,
      note: typeof note === "string" && note.trim() ? note.trim() : null,
      createdBy: adminEmail,
    },
    select: {
      id: true,
      code: true,
      durationDays: true,
      maxUses: true,
      usedCount: true,
      codeExpiresAt: true,
      isActive: true,
      note: true,
      createdBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
