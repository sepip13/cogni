import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { redeemCode, RedeemError } from "@/lib/access-codes";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  try {
    const { accessEndsAt } = await redeemCode(code, session.user.id);
    return NextResponse.json({ accessEndsAt: accessEndsAt.toISOString() });
  } catch (err) {
    if (err instanceof RedeemError) {
      const status = err.kind === "EXHAUSTED" ? 409 : 400;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
