import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const ALLOWED_LANGUAGES = new Set([
  "English", "Persian", "Spanish", "French", "German", "Italian",
  "Portuguese", "Dutch", "Russian", "Chinese (Simplified)",
  "Chinese (Traditional)", "Japanese", "Korean", "Arabic", "Hindi",
  "Turkish", "Polish", "Swedish", "Norwegian", "Danish", "Finnish",
]);

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const lang = body.preferredLanguage;

  if (typeof lang !== "string" || !ALLOWED_LANGUAGES.has(lang))
    return NextResponse.json({ error: "Invalid language" }, { status: 400 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { preferredLanguage: lang },
  });

  return NextResponse.json({ ok: true });
}
