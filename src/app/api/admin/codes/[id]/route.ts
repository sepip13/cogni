import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdmin(session?.user?.email);
}

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { isActive?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.isActive !== "boolean") {
    return NextResponse.json(
      { error: "isActive (boolean) required" },
      { status: 400 }
    );
  }

  const updated = await prisma.accessCode.update({
    where: { id },
    data: { isActive: body.isActive },
    select: { id: true, code: true, isActive: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.accessCode.delete({ where: { id } });
  return NextResponse.json({ deleted: true });
}
