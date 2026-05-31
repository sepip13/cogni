/**
 * Idempotent prod migration for the Assignment Buddy feature.
 *
 * deploy-cogni runs NO database migration, so additive schema must be applied to
 * the prod DB BEFORE the new code is swapped in (the deliverables routes and the
 * modified submissions/review routes SELECT the new columns and would 500
 * otherwise). Every statement is guarded (IF NOT EXISTS / DO-block) so re-runs
 * are safe. Enum ADD VALUE statements run autocommitted, one per query() call.
 *
 * Run on the server (DATABASE_URL comes from .env):
 *   cd /var/www/cogni && node -r dotenv/config scripts/apply-assignment-buddy-migration.mjs
 */

import { Client } from "pg";

const STATEMENTS = [
  // ── Enums ──
  `DO $$ BEGIN
     CREATE TYPE "DeliverableStatus" AS ENUM ('NOT_STARTED','IN_PROGRESS','SUBMITTED','GRADED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
     CREATE TYPE "DeliverableSource" AS ENUM ('EXTRACTED','MANUAL');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  // ADD VALUE must not be used in the same txn it is created — each runs alone (autocommit).
  `ALTER TYPE "SubmissionKind" ADD VALUE IF NOT EXISTS 'CASE_STUDY';`,
  `ALTER TYPE "SubmissionKind" ADD VALUE IF NOT EXISTS 'PRESENTATION';`,
  `ALTER TYPE "SubmissionKind" ADD VALUE IF NOT EXISTS 'REFLECTION';`,

  // ── Columns ──
  `ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "deliverablesStatus" "SectionStatus" NOT NULL DEFAULT 'PENDING';`,
  `ALTER TABLE "Course" ADD COLUMN IF NOT EXISTS "deliverablesError" TEXT;`,
  `ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "deliverableId" TEXT;`,
  `ALTER TABLE "SubmissionReview" ADD COLUMN IF NOT EXISTS "percentage" DOUBLE PRECISION;`,
  `ALTER TABLE "SubmissionReview" ADD COLUMN IF NOT EXISTS "band" TEXT;`,
  `ALTER TABLE "SubmissionReview" ADD COLUMN IF NOT EXISTS "nextBand" TEXT;`,
  `ALTER TABLE "SubmissionReview" ADD COLUMN IF NOT EXISTS "gapToNextBand" TEXT;`,

  // ── Table ──
  `CREATE TABLE IF NOT EXISTS "CourseDeliverable" (
     "id" TEXT NOT NULL,
     "courseId" TEXT NOT NULL,
     "title" TEXT NOT NULL,
     "kind" "SubmissionKind" NOT NULL DEFAULT 'ASSIGNMENT',
     "status" "DeliverableStatus" NOT NULL DEFAULT 'NOT_STARTED',
     "source" "DeliverableSource" NOT NULL DEFAULT 'EXTRACTED',
     "weight" DOUBLE PRECISION,
     "dueDate" TIMESTAMP(3),
     "format" TEXT,
     "unit" TEXT,
     "unitLimit" INTEGER,
     "description" TEXT,
     "requirements" JSONB,
     "rubric" JSONB,
     "gradingScheme" JSONB,
     "sourceRef" JSONB,
     "confidence" DOUBLE PRECISION,
     "order" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL,
     CONSTRAINT "CourseDeliverable_pkey" PRIMARY KEY ("id")
   );`,

  // ── Indexes ──
  `CREATE INDEX IF NOT EXISTS "CourseDeliverable_courseId_idx" ON "CourseDeliverable"("courseId");`,
  `CREATE INDEX IF NOT EXISTS "CourseDeliverable_courseId_dueDate_idx" ON "CourseDeliverable"("courseId","dueDate");`,
  `CREATE INDEX IF NOT EXISTS "Submission_deliverableId_idx" ON "Submission"("deliverableId");`,

  // ── Foreign keys (guarded — ADD CONSTRAINT has no IF NOT EXISTS) ──
  `DO $$ BEGIN
     ALTER TABLE "Submission" ADD CONSTRAINT "Submission_deliverableId_fkey"
       FOREIGN KEY ("deliverableId") REFERENCES "CourseDeliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
  `DO $$ BEGIN
     ALTER TABLE "CourseDeliverable" ADD CONSTRAINT "CourseDeliverable_courseId_fkey"
       FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    for (let i = 0; i < STATEMENTS.length; i++) {
      const sql = STATEMENTS[i];
      const label = sql.replace(/\s+/g, " ").slice(0, 72);
      await client.query(sql);
      console.log(`✓ [${i + 1}/${STATEMENTS.length}] ${label}`);
    }
    console.log("✅ Assignment Buddy migration applied (idempotent).");
  } catch (err) {
    console.error("✗ Migration failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
