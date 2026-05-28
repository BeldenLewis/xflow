ALTER TABLE "Dashboard" ADD COLUMN IF NOT EXISTS "sharePasswordHash" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "analyticsShareToken" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "analyticsShareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "analyticsSharePasswordHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Project_analyticsShareToken_key" ON "Project"("analyticsShareToken");
