-- Allow results to be entered and reviewed independently for each school and paper.
ALTER TABLE "ResultBatch"
ADD COLUMN "paperCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN "schoolId" TEXT;

DROP INDEX "ResultBatch_sessionId_subjectCode_key";

CREATE UNIQUE INDEX "ResultBatch_sessionId_subjectCode_paperCode_schoolId_key"
ON "ResultBatch"("sessionId", "subjectCode", "paperCode", "schoolId");

ALTER TABLE "ResultBatch"
ADD CONSTRAINT "ResultBatch_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
