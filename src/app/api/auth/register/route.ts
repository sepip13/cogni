import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendVerificationCode } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email    = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const name     = body.name?.trim() || null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });

  if (existing?.emailVerified) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const hashed = await bcrypt.hash(password, 12);

  if (existing && !existing.emailVerified) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { password: hashed, name },
    });
  } else {
    await prisma.user.create({ data: { email, name, password: hashed } });
  }

  const code = crypto.randomInt(100000, 999999).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token: code, expires },
  });

  const sent = await sendVerificationCode(email, code);
  if (!sent) {
    return NextResponse.json({ error: "Failed to send verification email. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, needsVerification: true }, { status: 201 });
}
