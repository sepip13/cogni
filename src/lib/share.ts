/**
 * Share-link resolution helpers.
 *
 * A share is usable only when it exists, is not revoked, and has not expired.
 * Resolution is read-only; no share-token path may ever mutate course data or
 * expose another user's data or owner PII.
 */

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export interface ValidShare {
  id: string;
  courseId: string;
  permission: "VIEW" | "COMMENT";
  publicNoAuth: boolean;
  includeSources: boolean;
}

export interface ShareCourseTopic {
  num: string;
  title: string;
  priority: "HIGH" | "MED" | "LOW";
  priorityLabel: string | null;
  why: string;
  timeMinutes: number;
  pages: string | null;
  subtopics: unknown;
  order: number;
}

export interface ShareCourseFile {
  id: string;
  fileName: string;
  fileType: string;
  pageCount: number | null;
  blobUrl: string;
}

export interface ShareCourse {
  id: string;
  name: string;
  code: string | null;
  examDate: Date | null;
  status: "PROCESSING" | "READY" | "FAILED";
  totalPrepTimeMinutes: number | null;
  topics: ShareCourseTopic[];
  files: ShareCourseFile[];
}

export interface ResolvedShare {
  share: ValidShare;
  course: ShareCourse;
}

/**
 * Returns the share row if the token is valid (exists, not revoked, not
 * expired). No course data is loaded — use for lightweight gating (e.g. the
 * token-bound file route).
 */
export async function findValidShare(token: string): Promise<ValidShare | null> {
  if (!token || typeof token !== "string") return null;

  const share = await prisma.courseShare.findUnique({
    where: { token },
    select: {
      id: true,
      courseId: true,
      permission: true,
      publicNoAuth: true,
      includeSources: true,
      revoked: true,
      expiresAt: true,
    },
  });

  if (!share || share.revoked) return null;
  if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) return null;

  return {
    id: share.id,
    courseId: share.courseId,
    permission: share.permission,
    publicNoAuth: share.publicNoAuth,
    includeSources: share.includeSources,
  };
}

/**
 * Resolves a token to its share + read-only course (study plan + topics, and
 * source files only when the owner opted in). Returns null for invalid,
 * revoked, or expired links.
 */
export async function resolveShare(token: string): Promise<ResolvedShare | null> {
  const share = await findValidShare(token);
  if (!share) return null;

  const course = await prisma.course.findUnique({
    where: { id: share.courseId },
    select: {
      id: true,
      name: true,
      code: true,
      examDate: true,
      status: true,
      totalPrepTimeMinutes: true,
      topics: {
        orderBy: { order: "asc" },
        select: {
          num: true,
          title: true,
          priority: true,
          priorityLabel: true,
          why: true,
          timeMinutes: true,
          pages: true,
          subtopics: true,
          order: true,
        },
      },
      files: share.includeSources
        ? { select: { id: true, fileName: true, fileType: true, pageCount: true, blobUrl: true } }
        : false,
    },
  });

  if (!course) return null;

  return {
    share,
    course: {
      ...course,
      files: "files" in course && Array.isArray(course.files) ? course.files : [],
    },
  };
}

/** Best-effort view counter — never blocks or throws into the render path. */
export function incrementShareView(shareId: string): void {
  prisma.courseShare
    .update({ where: { id: shareId }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});
}

/** Absolute base URL for building share links, preferring explicit config. */
export function getAppBaseUrl(req: NextRequest): string {
  const fromEnv = process.env.APP_URL ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return new URL(req.url).origin;
}
