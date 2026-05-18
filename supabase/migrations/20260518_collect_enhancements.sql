-- 수집 기능 확장: 보안/알림/활동 로그/성능 인덱스

-- 1. CollectSource: 웹훅, 알림, 허용 Origin
ALTER TABLE "CollectSource"
  ADD COLUMN IF NOT EXISTS "webhookUrl"     TEXT,
  ADD COLUMN IF NOT EXISTS "notifyOnSubmit" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "allowedOrigins" TEXT[] NOT NULL DEFAULT '{}';

-- 2. CollectRecord: 정렬·페이지네이션용 인덱스
CREATE INDEX IF NOT EXISTS "CollectRecord_sourceId_createdAt_idx"
  ON "CollectRecord" ("sourceId", "createdAt" DESC);

-- 3. ActivityLog 테이블
CREATE TABLE IF NOT EXISTS "ActivityLog" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceId"    TEXT,
  "userId"      TEXT,
  "action"      TEXT NOT NULL,
  "meta"        JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ActivityLog" DROP CONSTRAINT IF EXISTS "ActivityLog_workspaceId_fkey";
ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

ALTER TABLE "ActivityLog" DROP CONSTRAINT IF EXISTS "ActivityLog_sourceId_fkey";
ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "CollectSource"("id") ON DELETE SET NULL;

ALTER TABLE "ActivityLog" DROP CONSTRAINT IF EXISTS "ActivityLog_userId_fkey";
ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "ActivityLog_workspaceId_createdAt_idx"
  ON "ActivityLog" ("workspaceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ActivityLog_sourceId_createdAt_idx"
  ON "ActivityLog" ("sourceId", "createdAt" DESC);
