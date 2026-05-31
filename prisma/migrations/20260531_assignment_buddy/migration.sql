-- Assignment Buddy: deliverable tracker + rubric-grounded grading (additive)

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "DeliverableSource" AS ENUM ('EXTRACTED', 'MANUAL');

-- AlterEnum (run separately; cannot use a new value in the same txn it is added)
ALTER TYPE "SubmissionKind" ADD VALUE 'CASE_STUDY';
ALTER TYPE "SubmissionKind" ADD VALUE 'PRESENTATION';
ALTER TYPE "SubmissionKind" ADD VALUE 'REFLECTION';

-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "deliverablesError" TEXT,
ADD COLUMN     "deliverablesStatus" "SectionStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "deliverableId" TEXT;

-- AlterTable
ALTER TABLE "SubmissionReview" ADD COLUMN     "band" TEXT,
ADD COLUMN     "gapToNextBand" TEXT,
ADD COLUMN     "nextBand" TEXT,
ADD COLUMN     "percentage" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CourseDeliverable" (
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
);

-- CreateIndex
CREATE INDEX "CourseDeliverable_courseId_idx" ON "CourseDeliverable"("courseId");

-- CreateIndex
CREATE INDEX "CourseDeliverable_courseId_dueDate_idx" ON "CourseDeliverable"("courseId", "dueDate");

-- CreateIndex
CREATE INDEX "Submission_deliverableId_idx" ON "Submission"("deliverableId");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "CourseDeliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseDeliverable" ADD CONSTRAINT "CourseDeliverable_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
