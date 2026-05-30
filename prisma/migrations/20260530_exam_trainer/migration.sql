-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('PARSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MockStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "ExamTrial" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "TrialStatus" NOT NULL DEFAULT 'PARSING',
    "fileName" TEXT,
    "fileType" TEXT,
    "blobUrl" TEXT,
    "parsedText" TEXT,
    "questions" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamTrial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MockExam" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "trialId" TEXT,
    "title" TEXT NOT NULL,
    "status" "MockStatus" NOT NULL DEFAULT 'GENERATING',
    "questions" JSONB NOT NULL,
    "modelId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MockExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamExplainMessage" (
    "id" TEXT NOT NULL,
    "trialId" TEXT NOT NULL,
    "qIndex" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamExplainMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamTrial_courseId_idx" ON "ExamTrial"("courseId");

-- CreateIndex
CREATE INDEX "MockExam_courseId_idx" ON "MockExam"("courseId");

-- CreateIndex
CREATE INDEX "MockExam_trialId_idx" ON "MockExam"("trialId");

-- CreateIndex
CREATE INDEX "ExamExplainMessage_trialId_qIndex_idx" ON "ExamExplainMessage"("trialId", "qIndex");

-- AddForeignKey
ALTER TABLE "ExamTrial" ADD CONSTRAINT "ExamTrial_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MockExam" ADD CONSTRAINT "MockExam_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "ExamTrial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamExplainMessage" ADD CONSTRAINT "ExamExplainMessage_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "ExamTrial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
