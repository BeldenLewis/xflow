-- CollectRecord performance indexes for dashboard / records aggregations
CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_createdAt_idx" ON "CollectRecord"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_utmSource_idx" ON "CollectRecord"("projectId", "utmSource");
CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_utmMedium_idx" ON "CollectRecord"("projectId", "utmMedium");
CREATE INDEX IF NOT EXISTS "CollectRecord_projectId_sourceId_createdAt_idx" ON "CollectRecord"("projectId", "sourceId", "createdAt");
