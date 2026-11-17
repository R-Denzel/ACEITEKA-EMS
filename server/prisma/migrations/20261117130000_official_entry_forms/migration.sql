CREATE TYPE "OfficialEntryStatus" AS ENUM ('SUBMITTED', 'CHANGES_REQUIRED', 'APPROVED');
CREATE TYPE "OfficialEntrySource" AS ENUM ('PHOTO', 'UACE_WORKBOOK');
CREATE TYPE "OfficialEntryType" AS ENUM ('UCE_SUMMARY', 'UACE_GENERAL');

CREATE TABLE "OfficialEntryImport" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "source" "OfficialEntrySource" NOT NULL,
    "formType" "OfficialEntryType" NOT NULL,
    "formYear" INTEGER NOT NULL,
    "status" "OfficialEntryStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "OfficialEntryImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficialEntryRecord" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "schoolId" TEXT,
    "schoolName" TEXT NOT NULL,
    "extractedData" JSONB NOT NULL,
    "reviewedData" JSONB,
    "warnings" JSONB,
    CONSTRAINT "OfficialEntryRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfficialEntryImport_storageKey_key" ON "OfficialEntryImport"("storageKey");
CREATE INDEX "OfficialEntryImport_sessionId_status_createdAt_idx" ON "OfficialEntryImport"("sessionId", "status", "createdAt");
CREATE UNIQUE INDEX "OfficialEntryRecord_importId_schoolName_key" ON "OfficialEntryRecord"("importId", "schoolName");
CREATE INDEX "OfficialEntryRecord_schoolId_idx" ON "OfficialEntryRecord"("schoolId");

ALTER TABLE "OfficialEntryImport"
ADD CONSTRAINT "OfficialEntryImport_sessionId_fkey"
FOREIGN KEY ("sessionId") REFERENCES "ExaminationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfficialEntryImport"
ADD CONSTRAINT "OfficialEntryImport_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OfficialEntryImport"
ADD CONSTRAINT "OfficialEntryImport_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OfficialEntryRecord"
ADD CONSTRAINT "OfficialEntryRecord_importId_fkey"
FOREIGN KEY ("importId") REFERENCES "OfficialEntryImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfficialEntryRecord"
ADD CONSTRAINT "OfficialEntryRecord_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
