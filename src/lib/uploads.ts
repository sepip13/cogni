/**
 * Shared local-file upload helpers.
 *
 * Mirrors the mechanics in `src/app/api/courses/route.ts` so submission
 * uploads (student work) validate and persist files the same way course
 * material does, while staying in a separate folder hierarchy.
 */

import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB per file

export const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-excel", // .xls (and the MIME some browsers report for .xlsx/.csv)
  "text/csv",
  "text/plain",
]);

const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx", "xlsx", "xls", "csv", "txt"];

export function getUploadDir(): string {
  return (
    process.env.UPLOAD_DIR ??
    path.join(/*turbopackIgnore: true*/ process.cwd(), "uploads")
  );
}

export function isAllowedUpload(fileName: string, fileType: string): boolean {
  if (ALLOWED_TYPES.has(fileType)) return true;
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Persists a file under `UPLOAD_DIR/courses/{courseId}/{subdir}/{safeName}` and
 * returns the URL the `/api/files/...` route serves it from. File name is
 * sanitized with `path.basename` to prevent traversal.
 */
export async function saveCourseFile(
  courseId: string,
  subdir: string,
  fileName: string,
  buffer: Buffer
): Promise<{ url: string; safeName: string }> {
  const safeName = path.basename(fileName);
  const safeSubdir = path.basename(subdir);
  const dir = path.join(getUploadDir(), "courses", courseId, safeSubdir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), buffer);

  return {
    url: `/api/files/courses/${courseId}/${safeSubdir}/${encodeURIComponent(safeName)}`,
    safeName,
  };
}

/** Student-submission upload (kept for the submissions route). */
export function saveSubmissionFile(
  courseId: string,
  fileName: string,
  buffer: Buffer
): Promise<{ url: string; safeName: string }> {
  return saveCourseFile(courseId, "submissions", fileName, buffer);
}
