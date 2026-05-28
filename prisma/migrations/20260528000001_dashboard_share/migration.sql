ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dashboardShareToken" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dashboardShareEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dashboardSharePasswordHash" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Project_dashboardShareToken_key" ON "Project"("dashboardShareToken");
