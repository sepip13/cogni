-- CreateEnum
CREATE TYPE "GuideStatus" AS ENUM ('ANALYZING', 'MAP_READY', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "SectionStatus" AS ENUM ('PENDING', 'GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "StudyGuide" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "GuideStatus" NOT NULL DEFAULT 'ANALYZING',
    "language" TEXT,
    "mindMap" JSONB,
    "outline" JSONB,
    "modelId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyGuideSection" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "conceptKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SectionStatus" NOT NULL DEFAULT 'PENDING',
    "contentMd" TEXT,
    "sources" JSONB,
    "modelId" TEXT,
    "generatedAt" TIMESTAMP(3),

    CONSTRAINT "StudyGuideSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudyGuide_courseId_key" ON "StudyGuide"("courseId");

-- CreateIndex
CREATE INDEX "StudyGuideSection_guideId_idx" ON "StudyGuideSection"("guideId");

-- AddForeignKey
ALTER TABLE "StudyGuide" ADD CONSTRAINT "StudyGuide_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGuideSection" ADD CONSTRAINT "StudyGuideSection_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "StudyGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
