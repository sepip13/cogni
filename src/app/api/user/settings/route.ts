import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_LANGUAGES = new Set([
  "English", "Persian", "Spanish", "French", "German", "Italian",
  "Portuguese", "Dutch", "Russian", "Chinese (Simplified)",
  "Chinese (Traditional)", "Japanese", "Korean", "Arabic", "Hindi",
  "Turkish", "Polish", "Swedish", "Norwegian", "Danish", "Finnish",
]);

const ALLOWED_QUALITY_TIERS = new Set(["quick", "balanced", "maximum"]);

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      plan: true,
      proAccessEndsAt: true,
      preferredLanguage: true,
      preferredQualityTier: true,
      password: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    email: user.email,
    name: user.name,
    plan: user.plan,
    proAccessEndsAt: user.proAccessEndsAt,
    preferredLanguage: user.preferredLanguage,
    preferredQualityTier: user.preferredQualityTier,
    hasPassword: !!user.password,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if ("preferredLanguage" in body) {
    const lang = body.preferredLanguage;
    if (typeof lang !== "string" || !ALLOWED_LANGUAGES.has(lang))
      return NextResponse.json({ error: "Invalid language" }, { status: 400 });
    updates.preferredLanguage = lang;
  }

  if ("preferredQualityTier" in body) {
    const tier = body.preferredQualityTier;
    if (typeof tier !== "string" || !ALLOWED_QUALITY_TIERS.has(tier))
      return NextResponse.json({ error: "Invalid quality tier" }, { status: 400 });
    updates.preferredQualityTier = tier;
  }

  if ("name" in body) {
    const name = body.name;
    if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 100)
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    updates.name = name.trim();
  }

  if ("newPassword" in body) {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword)
      return NextResponse.json({ error: "Both passwords required" }, { status: 400 });

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { password: true },
    });

    if (!user?.password)
      return NextResponse.json({ error: "No password set (OAuth account)" }, { status: 400 });

    const { default: bcrypt } = await import("bcryptjs");
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid)
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });

    if (typeof newPassword !== "string" || newPassword.length < 8)
      return NextResponse.json({ error: "Password must be 8+ characters" }, { status: 400 });

    updates.password = await bcrypt.hash(newPassword, 12);
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: updates,
  });

  return NextResponse.json({ ok: true });
}
