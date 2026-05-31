-- CreateEnum
CREATE TYPE "FlashcardKind" AS ENUM ('QA', 'CLOZE');

-- AlterTable (additive: on-demand per-section quiz cache + its status)
ALTER TABLE "StudyGuideSection" ADD COLUMN     "quiz" JSONB;
ALTER TABLE "StudyGuideSection" ADD COLUMN     "quizStatus" "SectionStatus" NOT NULL DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "Flashcard" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "guideId" TEXT,
    "conceptKey" TEXT,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "kind" "FlashcardKind" NOT NULL DEFAULT 'QA',
    "sourceRef" JSONB,
    "reps" INTEGER NOT NULL DEFAULT 0,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "ease" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Flashcard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flashcard_courseId_idx" ON "Flashcard"("courseId");

-- CreateIndex
CREATE INDEX "Flashcard_courseId_suspended_dueAt_idx" ON "Flashcard"("courseId", "suspended", "dueAt");

-- CreateIndex
CREATE INDEX "Flashcard_courseId_conceptKey_idx" ON "Flashcard"("courseId", "conceptKey");

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
