-- Add targeted announcement audiences and subject paper codes.
ALTER TABLE "Announcement"
ADD COLUMN "audience" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN "departmentKey" TEXT;

CREATE INDEX "Announcement_audience_departmentKey_createdAt_idx"
ON "Announcement"("audience", "departmentKey", "createdAt");

CREATE TABLE "SubjectPaper" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "SubjectPaper_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubjectPaper_code_key" ON "SubjectPaper"("code");
CREATE UNIQUE INDEX "SubjectPaper_subjectId_number_key" ON "SubjectPaper"("subjectId", "number");

ALTER TABLE "SubjectPaper"
ADD CONSTRAINT "SubjectPaper_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
