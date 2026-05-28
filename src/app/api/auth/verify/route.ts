import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  let body: { email?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const code = body.code?.trim() ?? "";

  if (!email || !code) {
    return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
  }

  const token = await prisma.verificationToken.findFirst({
    where: { identifier: email, token: code },
  });

  if (!token) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  if (token.expires < new Date()) {
    await prisma.verificationToken.deleteMany({ where: { identifier: email } });
    return NextResponse.json({ error: "Code expired. Please sign up again." }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    }),
    prisma.verificationToken.deleteMany({ where: { identifier: email } }),
  ]);

  return NextResponse.json({ ok: true });
}
