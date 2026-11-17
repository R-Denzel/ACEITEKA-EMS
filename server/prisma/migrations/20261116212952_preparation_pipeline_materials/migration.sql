-- CreateEnum
CREATE TYPE "PrepMilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ExamMaterialStatus" AS ENUM ('SUBMITTED', 'CHANGES_REQUIRED', 'APPROVED');

-- CreateTable
CREATE TABLE "PrepMilestone" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "PrepMilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "assignedToId" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrepMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionSchoolReminder" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "sentById" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SessionSchoolReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamMaterialSubmission" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "subjectCode" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "scriptKey" TEXT NOT NULL,
    "scriptName" TEXT NOT NULL,
    "scriptMimeType" TEXT NOT NULL,
    "scriptSizeBytes" INTEGER NOT NULL,
    "guideKey" TEXT NOT NULL,
    "guideName" TEXT NOT NULL,
    "guideMimeType" TEXT NOT NULL,
    "guideSizeBytes" INTEGER NOT NULL,
    "status" "ExamMaterialStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamMaterialSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrepMilestone_sessionId_dueAt_idx" ON "PrepMilestone"("sessionId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionSchoolReminder_sessionId_schoolId_key" ON "SessionSchoolReminder"("sessionId", "schoolId");

-- CreateIndex
CREATE INDEX "ExamMaterialSubmission_sessionId_subjectCode_status_idx" ON "ExamMaterialSubmission"("sessionId", "subjectCode", "status");

-- CreateIndex
CREATE INDEX "ExamMaterialSubmission_submittedById_createdAt_idx" ON "ExamMaterialSubmission"("submittedById", "createdAt");

-- AddForeignKey
ALTER TABLE "PrepMilestone" ADD CONSTRAINT "PrepMilestone_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExaminationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrepMilestone" ADD CONSTRAINT "PrepMilestone_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSchoolReminder" ADD CONSTRAINT "SessionSchoolReminder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExaminationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionSchoolReminder" ADD CONSTRAINT "SessionSchoolReminder_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMaterialSubmission" ADD CONSTRAINT "ExamMaterialSubmission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExaminationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMaterialSubmission" ADD CONSTRAINT "ExamMaterialSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamMaterialSubmission" ADD CONSTRAINT "ExamMaterialSubmission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
