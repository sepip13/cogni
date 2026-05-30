/**
 * `register()` runs once when a server instance boots, before it serves any
 * request (see node_modules/next/dist/docs/.../instrumentation.md).
 *
 * Every heavy feature runs its work in an in-process Next `after()` callback
 * (trial split, mock generation, course ingestion, concept-map build, section
 * generation). Those callbacks do NOT survive a process exit, so a deploy or
 * crash mid-job strands the row in its "in progress" state with no error — the
 * UI just spins forever. At boot, any such row is by definition orphaned (the
 * only process that could finish it is gone), so we flip it to FAILED and let
 * the existing retry affordances recover it.
 *
 * Only states where NO usable output exists yet are reset:
 *   - ExamTrial.PARSING, MockExam.GENERATING
 *   - Course.PROCESSING
 *   - StudyGuide.ANALYZING            (MAP_READY+ already has a saved map)
 *   - StudyGuideSection.GENERATING
 *
 * Safe because cogni runs as a single PM2 fork (one instance) — this can never
 * clobber a job another live worker is still processing.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { prisma } = await import("@/lib/prisma");
    const error = "Processing was interrupted by a server restart. Please try again.";
    const failedAt = new Date().toISOString();

    const [trials, mocks, courses, guides, sections] = await Promise.all([
      prisma.examTrial.updateMany({ where: { status: "PARSING" }, data: { status: "FAILED", error } }),
      prisma.mockExam.updateMany({ where: { status: "GENERATING" }, data: { status: "FAILED", error } }),
      // Course has no `error` column — ingestion records failures in `plan`.
      prisma.course.updateMany({
        where: { status: "PROCESSING" },
        data: { status: "FAILED", plan: { _error: error, _failedAt: failedAt } },
      }),
      prisma.studyGuide.updateMany({ where: { status: "ANALYZING" }, data: { status: "FAILED", error } }),
      // StudyGuideSection has no `error` column — status only.
      prisma.studyGuideSection.updateMany({ where: { status: "GENERATING" }, data: { status: "FAILED" } }),
    ]);

    const total = trials.count + mocks.count + courses.count + guides.count + sections.count;
    if (total > 0) {
      console.log(
        `[instrumentation] reset orphaned jobs to FAILED — trials=${trials.count} mocks=${mocks.count} ` +
          `courses=${courses.count} guides=${guides.count} sections=${sections.count}`
      );
    }
  } catch (err) {
    console.error("[instrumentation] orphan reconcile failed:", err instanceof Error ? err.message : err);
  }
}
