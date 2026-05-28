import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const models = await prisma.llmModel.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      modelId: true,
      label: true,
      desc: true,
      provider: true,
      tier: true,
    },
  });

  return NextResponse.json(models);
}
