-- Soft delete 컬럼 추가: 위험한 삭제는 deletedAt 으로 mark, 30일 후 cron 으로 영구 제거.

ALTER TABLE "Workspace"     ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Project"       ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Workspace_deletedAt_idx"     ON "Workspace"("deletedAt");
CREATE INDEX IF NOT EXISTS "Project_deletedAt_idx"       ON "Project"("deletedAt");
CREATE INDEX IF NOT EXISTS "CollectSource_deletedAt_idx" ON "CollectSource"("deletedAt");
