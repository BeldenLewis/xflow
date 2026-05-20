CREATE TABLE IF NOT EXISTS "ShortLink" (
  "id"          TEXT NOT NULL,
  "code"        TEXT NOT NULL,
  "longUrl"     TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShortLink_code_key"
  ON "ShortLink"("code");

CREATE INDEX IF NOT EXISTS "ShortLink_workspaceId_createdAt_idx"
  ON "ShortLink"("workspaceId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ShortLink_createdById_createdAt_idx"
  ON "ShortLink"("createdById", "createdAt" DESC);

ALTER TABLE "ShortLink"
  DROP CONSTRAINT IF EXISTS "ShortLink_workspaceId_fkey";

ALTER TABLE "ShortLink"
  ADD CONSTRAINT "ShortLink_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShortLink"
  DROP CONSTRAINT IF EXISTS "ShortLink_createdById_fkey";

ALTER TABLE "ShortLink"
  ADD CONSTRAINT "ShortLink_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
