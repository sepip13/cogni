import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/auth";
import { findValidShare } from "@/lib/share";
import { getUploadDir } from "@/lib/uploads";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

const FILE_LIMIT = { max: 120, windowMs: 5 * 60 * 1000 };

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  ppt: "application/vnd.ms-powerpoint",
  txt: "text/plain; charset=utf-8",
};

type Params = { params: Promise<{ token: string; filePath: string[] }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { token, filePath } = await params;

  const limit = rateLimit(`sharefile:${getClientIp(req)}`, FILE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
    );
  }

  const share = await findValidShare(token);
  if (!share || !share.includeSources) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Private shares still require a signed-in viewer.
  if (!share.publicNoAuth) {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Bind access to this exact course: only `courses/{courseId}/...` is allowed.
  if (filePath[0] !== "courses" || filePath[1] !== share.courseId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const joined = filePath.map(decodeURIComponent).join("/");
  const resolved = path.resolve(path.join(getUploadDir(), joined));
  const uploadRoot = path.resolve(getUploadDir());

  if (!resolved.startsWith(uploadRoot + path.sep)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await readFile(resolved);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ext = resolved.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME_MAP[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
