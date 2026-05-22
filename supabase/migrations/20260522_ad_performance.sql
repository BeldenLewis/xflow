-- 광고 매체 성과 업로드/관리

CREATE TABLE IF NOT EXISTS "AdPerformanceImportBatch" (
  "id"           TEXT NOT NULL,
  "workspaceId"  TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "uploadedById" TEXT,
  "sourceType"   TEXT NOT NULL,
  "sourceName"   TEXT,
  "fileName"     TEXT NOT NULL,
  "rowCount"     INTEGER NOT NULL DEFAULT 0,
  "reportStart"  TIMESTAMP(3),
  "reportEnd"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdPerformanceImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdPerformanceRecord" (
  "id"                 TEXT NOT NULL,
  "batchId"            TEXT NOT NULL,
  "workspaceId"         TEXT NOT NULL,
  "projectId"           TEXT NOT NULL,
  "sourceType"          TEXT NOT NULL,
  "campaignName"        TEXT NOT NULL,
  "adGroupName"         TEXT,
  "reportDate"          TIMESTAMP(3),
  "reportStart"         TIMESTAMP(3),
  "reportEnd"           TIMESTAMP(3),
  "status"              TEXT,
  "currency"            TEXT,
  "cost"                DOUBLE PRECISION,
  "impressions"         INTEGER,
  "reach"               INTEGER,
  "clicks"              INTEGER,
  "cpm"                 DOUBLE PRECISION,
  "cpc"                 DOUBLE PRECISION,
  "ctr"                 DOUBLE PRECISION,
  "conversions"         DOUBLE PRECISION,
  "costPerConversion"   DOUBLE PRECISION,
  "conversionRate"      DOUBLE PRECISION,
  "resultType"          TEXT,
  "raw"                 JSONB NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdPerformanceRecord_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdPerformanceImportBatch" DROP CONSTRAINT IF EXISTS "AdPerformanceImportBatch_workspaceId_fkey";
ALTER TABLE "AdPerformanceImportBatch"
  ADD CONSTRAINT "AdPerformanceImportBatch_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

ALTER TABLE "AdPerformanceImportBatch" DROP CONSTRAINT IF EXISTS "AdPerformanceImportBatch_projectId_fkey";
ALTER TABLE "AdPerformanceImportBatch"
  ADD CONSTRAINT "AdPerformanceImportBatch_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;

ALTER TABLE "AdPerformanceImportBatch" DROP CONSTRAINT IF EXISTS "AdPerformanceImportBatch_uploadedById_fkey";
ALTER TABLE "AdPerformanceImportBatch"
  ADD CONSTRAINT "AdPerformanceImportBatch_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "AdPerformanceRecord" DROP CONSTRAINT IF EXISTS "AdPerformanceRecord_batchId_fkey";
ALTER TABLE "AdPerformanceRecord"
  ADD CONSTRAINT "AdPerformanceRecord_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AdPerformanceImportBatch"("id") ON DELETE CASCADE;

ALTER TABLE "AdPerformanceRecord" DROP CONSTRAINT IF EXISTS "AdPerformanceRecord_workspaceId_fkey";
ALTER TABLE "AdPerformanceRecord"
  ADD CONSTRAINT "AdPerformanceRecord_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

ALTER TABLE "AdPerformanceRecord" DROP CONSTRAINT IF EXISTS "AdPerformanceRecord_projectId_fkey";
ALTER TABLE "AdPerformanceRecord"
  ADD CONSTRAINT "AdPerformanceRecord_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "AdPerformanceImportBatch_workspaceId_createdAt_idx"
  ON "AdPerformanceImportBatch"("workspaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AdPerformanceImportBatch_projectId_createdAt_idx"
  ON "AdPerformanceImportBatch"("projectId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "AdPerformanceRecord_batchId_idx"
  ON "AdPerformanceRecord"("batchId");

CREATE INDEX IF NOT EXISTS "AdPerformanceRecord_projectId_reportDate_idx"
  ON "AdPerformanceRecord"("projectId", "reportDate");

CREATE INDEX IF NOT EXISTS "AdPerformanceRecord_projectId_campaignName_idx"
  ON "AdPerformanceRecord"("projectId", "campaignName");
