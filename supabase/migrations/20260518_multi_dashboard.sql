-- 다중 대시보드 + 공유 + 스케줄 리포트

CREATE TABLE IF NOT EXISTS "Dashboard" (
  "id"           TEXT NOT NULL,
  "projectId"    TEXT NOT NULL,
  "workspaceId"  TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "description"  TEXT,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "isDefault"    BOOLEAN NOT NULL DEFAULT FALSE,
  "shareToken"   TEXT,
  "shareEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Dashboard_shareToken_key" ON "Dashboard"("shareToken");
CREATE INDEX IF NOT EXISTS "Dashboard_projectId_sortOrder_idx" ON "Dashboard"("projectId", "sortOrder");

ALTER TABLE "Dashboard" DROP CONSTRAINT IF EXISTS "Dashboard_projectId_fkey";
ALTER TABLE "Dashboard"
  ADD CONSTRAINT "Dashboard_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;

ALTER TABLE "Dashboard" DROP CONSTRAINT IF EXISTS "Dashboard_workspaceId_fkey";
ALTER TABLE "Dashboard"
  ADD CONSTRAINT "Dashboard_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

-- DashboardWidget 에 dashboardId 컬럼 추가
ALTER TABLE "DashboardWidget"
  ADD COLUMN IF NOT EXISTS "dashboardId" TEXT;

ALTER TABLE "DashboardWidget" DROP CONSTRAINT IF EXISTS "DashboardWidget_dashboardId_fkey";
ALTER TABLE "DashboardWidget"
  ADD CONSTRAINT "DashboardWidget_dashboardId_fkey"
  FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "DashboardWidget_dashboardId_position_idx"
  ON "DashboardWidget"("dashboardId", "position");

-- 기존 위젯을 위한 기본 Dashboard 생성 (프로젝트당 1개)
INSERT INTO "Dashboard" ("id", "projectId", "workspaceId", "name", "isDefault", "sortOrder")
SELECT
  'dash_default_' || p.id AS id,
  p.id AS "projectId",
  p."workspaceId" AS "workspaceId",
  '기본 보드' AS name,
  TRUE AS "isDefault",
  0 AS "sortOrder"
FROM "Project" p
WHERE EXISTS (
  SELECT 1 FROM "DashboardWidget" w WHERE w."projectId" = p.id AND w."dashboardId" IS NULL
)
ON CONFLICT DO NOTHING;

-- 기존 위젯을 기본 Dashboard 에 연결
UPDATE "DashboardWidget" w
SET "dashboardId" = 'dash_default_' || w."projectId"
WHERE w."dashboardId" IS NULL
  AND EXISTS (SELECT 1 FROM "Dashboard" d WHERE d.id = 'dash_default_' || w."projectId");

-- ScheduledReport 테이블
CREATE TABLE IF NOT EXISTS "ScheduledReport" (
  "id"          TEXT NOT NULL,
  "dashboardId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "cron"        TEXT NOT NULL,
  "channel"     TEXT NOT NULL,
  "target"      TEXT NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT TRUE,
  "lastRunAt"   TIMESTAMP(3),
  "nextRunAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScheduledReport" DROP CONSTRAINT IF EXISTS "ScheduledReport_dashboardId_fkey";
ALTER TABLE "ScheduledReport"
  ADD CONSTRAINT "ScheduledReport_dashboardId_fkey"
  FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE;

ALTER TABLE "ScheduledReport" DROP CONSTRAINT IF EXISTS "ScheduledReport_workspaceId_fkey";
ALTER TABLE "ScheduledReport"
  ADD CONSTRAINT "ScheduledReport_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "ScheduledReport_nextRunAt_idx" ON "ScheduledReport"("nextRunAt");
CREATE INDEX IF NOT EXISTS "ScheduledReport_dashboardId_idx" ON "ScheduledReport"("dashboardId");
