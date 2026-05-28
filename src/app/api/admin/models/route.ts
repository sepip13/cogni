import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/admin";

async function requireAdmin(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!isAdmin(email)) return null;
  return email ?? null;
}

export async function GET() {
  const adminEmail = await requireAdmin();
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const models = await prisma.llmModel.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(models);
}

export async function POST(req: NextRequest) {
  const adminEmail = await requireAdmin();
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { modelId?: string; label?: string; desc?: string; bestFor?: string; category?: string; provider?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.modelId || !body.label || !body.provider) {
    return NextResponse.json({ error: "modelId, label, and provider are required" }, { status: 400 });
  }

  const maxOrder = await prisma.llmModel.aggregate({ _max: { sortOrder: true } });
  const nextOrder = (maxOrder._max.sortOrder ?? -1) + 1;

  const created = await prisma.llmModel.create({
    data: {
      modelId: body.modelId,
      label: body.label,
      desc: body.desc ?? "",
      bestFor: body.bestFor ?? "",
      category: body.category ?? "General",
      provider: body.provider,
      tier: body.tier === "PRO" ? "PRO" : "FREE",
      sortOrder: nextOrder,
    },
  });

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const adminEmail = await requireAdmin();
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; label?: string; desc?: string; bestFor?: string; category?: string; provider?: string; tier?: string; isActive?: boolean; sortOrder?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = body.label;
  if (body.desc !== undefined) data.desc = body.desc;
  if (body.bestFor !== undefined) data.bestFor = body.bestFor;
  if (body.category !== undefined) data.category = body.category;
  if (body.provider !== undefined) data.provider = body.provider;
  if (body.tier !== undefined) data.tier = body.tier === "PRO" ? "PRO" : "FREE";
  if (body.isActive !== undefined) data.isActive = body.isActive;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

  const updated = await prisma.llmModel.update({
    where: { id: body.id },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const adminEmail = await requireAdmin();
  if (!adminEmail) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id query param required" }, { status: 400 });

  await prisma.llmModel.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
