-- 대시보드 위젯: 프로젝트별 마케팅 분석 보드

CREATE TABLE IF NOT EXISTS "DashboardWidget" (
  "id"          TEXT NOT NULL,
  "projectId"   TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "config"      JSONB NOT NULL,
  "position"    INTEGER NOT NULL DEFAULT 0,
  "width"       TEXT NOT NULL DEFAULT 'half',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DashboardWidget" DROP CONSTRAINT IF EXISTS "DashboardWidget_projectId_fkey";
ALTER TABLE "DashboardWidget"
  ADD CONSTRAINT "DashboardWidget_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;

ALTER TABLE "DashboardWidget" DROP CONSTRAINT IF EXISTS "DashboardWidget_workspaceId_fkey";
ALTER TABLE "DashboardWidget"
  ADD CONSTRAINT "DashboardWidget_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "DashboardWidget_projectId_position_idx"
  ON "DashboardWidget" ("projectId", "position");
