-- UTM first-touch attribution: 최초 유입 시점의 UTM 별도 저장

ALTER TABLE "CollectRecord"
  ADD COLUMN IF NOT EXISTS "firstUtmSource"   TEXT,
  ADD COLUMN IF NOT EXISTS "firstUtmMedium"   TEXT,
  ADD COLUMN IF NOT EXISTS "firstUtmCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "firstUtmTerm"     TEXT,
  ADD COLUMN IF NOT EXISTS "firstUtmContent"  TEXT,
  ADD COLUMN IF NOT EXISTS "firstReferrer"    TEXT,
  ADD COLUMN IF NOT EXISTS "firstSeenAt"      TIMESTAMP(3);

-- first-touch UTM 으로 분석할 때 자주 쓸 인덱스 (선택)
CREATE INDEX IF NOT EXISTS "CollectRecord_firstUtmSource_idx" ON "CollectRecord" ("firstUtmSource");
