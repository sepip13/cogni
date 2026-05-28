import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (!isAdmin(email)) {
    return NextResponse.json({ error: "Not an admin email" }, { status: 403 });
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, password: true },
  });

  if (existing) {
    if (!existing.password) {
      const hashed = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { id: existing.id },
        data: { password: hashed },
      });
      return NextResponse.json({ ok: true, mode: "password_set" });
    }
    const valid = await bcrypt.compare(password, existing.password);
    if (!valid) {
      return NextResponse.json({ error: "Wrong password" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, mode: "login" });
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: { email, name: "Admin", password: hashed, plan: "PRO" },
  });

  return NextResponse.json({ ok: true, mode: "created" });
}
