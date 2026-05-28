import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";

export type AccessCodeRow = {
  id: string;
  code: string;
  durationDays: number;
  maxUses: number;
  usedCount: number;
  codeExpiresAt: Date | null;
  isActive: boolean;
  note: string | null;
  createdBy: string;
  createdAt: Date;
};

export function isUserPro(user: {
  plan: string;
  proAccessEndsAt: Date | null;
}): boolean {
  if (user.plan === "PRO") return true;
  if (user.proAccessEndsAt && user.proAccessEndsAt > new Date()) return true;
  return false;
}

export function generateCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

export async function findValidCode(code: string): Promise<AccessCodeRow | null> {
  const now = new Date();
  const row = await prisma.accessCode.findUnique({
    where: { code },
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
  if (!row) return null;
  if (!row.isActive) return null;
  if (row.codeExpiresAt && row.codeExpiresAt < now) return null;
  if (row.usedCount >= row.maxUses) return null;
  return row;
}

export class RedeemError extends Error {
  constructor(
    message: string,
    public readonly kind: "INVALID" | "ALREADY_REDEEMED" | "EXHAUSTED"
  ) {
    super(message);
    this.name = "RedeemError";
  }
}

export async function redeemCode(
  code: string,
  userId: string
): Promise<{ accessEndsAt: Date }> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();

    const row = await tx.accessCode.findUnique({
      where: { code },
      select: {
        id: true,
        durationDays: true,
        maxUses: true,
        usedCount: true,
        codeExpiresAt: true,
        isActive: true,
      },
    });

    if (!row || !row.isActive || (row.codeExpiresAt && row.codeExpiresAt < now)) {
      throw new RedeemError("Invalid or expired code", "INVALID");
    }
    if (row.usedCount >= row.maxUses) {
      throw new RedeemError("Code has reached its maximum uses", "EXHAUSTED");
    }

    const existing = await tx.accessCodeRedemption.findUnique({
      where: { codeId_userId: { codeId: row.id, userId } },
      select: { id: true },
    });
    if (existing) {
      throw new RedeemError("You have already redeemed this code", "ALREADY_REDEEMED");
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { proAccessEndsAt: true },
    });

    const base =
      user?.proAccessEndsAt && user.proAccessEndsAt > now
        ? user.proAccessEndsAt
        : now;
    const accessEndsAt = new Date(base);
    accessEndsAt.setDate(accessEndsAt.getDate() + row.durationDays);

    await tx.accessCodeRedemption.create({
      data: { codeId: row.id, userId, accessEndsAt },
    });

    const newUsedCount = row.usedCount + 1;
    await tx.accessCode.update({
      where: { id: row.id },
      data: {
        usedCount: newUsedCount,
        isActive: newUsedCount >= row.maxUses ? false : true,
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: { proAccessEndsAt: accessEndsAt },
    });

    return { accessEndsAt };
  });
}
