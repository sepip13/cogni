-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'COMMENT');

-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('ASSIGNMENT', 'PROJECT', 'PORTFOLIO', 'ESSAY', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('IN_PROGRESS', 'READY_FOR_REVIEW', 'REVIEWED');

-- CreateTable
CREATE TABLE "CourseShare" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEW',
    "publicNoAuth" BOOLEAN NOT NULL DEFAULT true,
    "includeSources" BOOLEAN NOT NULL DEFAULT false,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CourseShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "SubmissionKind" NOT NULL DEFAULT 'ASSIGNMENT',
    "status" "SubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "fileName" TEXT,
    "fileType" TEXT,
    "blobUrl" TEXT,
    "parsedText" TEXT,
    "pageCount" INTEGER,
    "questions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubmissionReview" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "scoreOutOf10" DOUBLE PRECISION NOT NULL,
    "rubricBreakdown" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "gaps" JSONB NOT NULL,
    "actionItems" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CourseShare_token_key" ON "CourseShare"("token");

-- CreateIndex
CREATE INDEX "CourseShare_courseId_idx" ON "CourseShare"("courseId");

-- CreateIndex
CREATE INDEX "Submission_courseId_idx" ON "Submission"("courseId");

-- CreateIndex
CREATE INDEX "Submission_userId_idx" ON "Submission"("userId");

-- CreateIndex
CREATE INDEX "SubmissionReview_submissionId_idx" ON "SubmissionReview"("submissionId");

-- AddForeignKey
ALTER TABLE "CourseShare" ADD CONSTRAINT "CourseShare_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubmissionReview" ADD CONSTRAINT "SubmissionReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
