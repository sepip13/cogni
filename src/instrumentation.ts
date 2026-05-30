/**
 * `register()` runs once when a server instance boots, before it serves any
 * request (see node_modules/next/dist/docs/.../instrumentation.md).
 *
 * Exam-trial splits and mock-exam generation run in an in-process `after()`
 * callback that does NOT survive a process exit. So if a deploy or crash
 * restarts the server mid-job, the row is stranded in PARSING / GENERATING with
 * no error — the UI just spins forever. At boot, any such row is by definition
 * orphaned (the only process that could finish it is gone), so we flip it to
 * FAILED. The existing "Try again" button then lets the user re-run it.
 *
 * Safe because the app runs as a single PM2 fork (one instance) — this can never
 * clobber a job that another live worker is still processing.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { prisma } = await import("@/lib/prisma");
    const error = "Processing was interrupted by a server restart. Please try again.";
    const [trials, mocks] = await Promise.all([
      prisma.examTrial.updateMany({ where: { status: "PARSING" }, data: { status: "FAILED", error } }),
      prisma.mockExam.updateMany({ where: { status: "GENERATING" }, data: { status: "FAILED", error } }),
    ]);
    if (trials.count || mocks.count) {
      console.log(
        `[instrumentation] reset ${trials.count} orphaned trial(s) and ${mocks.count} orphaned mock(s) to FAILED`
      );
    }
  } catch (err) {
    console.error("[instrumentation] orphan reconcile failed:", err instanceof Error ? err.message : err);
  }
}
