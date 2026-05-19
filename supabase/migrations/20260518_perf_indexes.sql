-- 성능 인덱스: 대시보드 글로벌 필터 / utm 분석에서 자주 쓰이는 컬럼

-- 부분 인덱스 (NULL 제외 — 트래픽 대부분이 direct 인 경우 효율적)
CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_utmSource_idx"
  ON "CollectRecord" ("projectId", "utmSource", "createdAt" DESC)
  WHERE "utmSource" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_utmMedium_idx"
  ON "CollectRecord" ("projectId", "utmMedium", "createdAt" DESC)
  WHERE "utmMedium" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_utmCampaign_idx"
  ON "CollectRecord" ("projectId", "utmCampaign", "createdAt" DESC)
  WHERE "utmCampaign" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_firstUtmSource_idx"
  ON "CollectRecord" ("projectId", "firstUtmSource", "createdAt" DESC)
  WHERE "firstUtmSource" IS NOT NULL;

-- projectId + createdAt: 다중소스 합산 시 자주 사용
CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_createdAt_idx"
  ON "CollectRecord" ("projectId", "createdAt" DESC);

-- ActivityLog 필터 (액션·기간)
CREATE INDEX IF NOT EXISTS "ActivityLog_workspaceId_action_createdAt_idx"
  ON "ActivityLog" ("workspaceId", "action", "createdAt" DESC);
