-- API 토큰 + 알림 환경설정 + 프로젝트 단위 권한 + 보관 정책

-- 1. CollectRetentionPolicy
CREATE TABLE IF NOT EXISTS "CollectRetentionPolicy" (
  "sourceId"   TEXT NOT NULL,
  "retainDays" INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CollectRetentionPolicy_pkey" PRIMARY KEY ("sourceId")
);
ALTER TABLE "CollectRetentionPolicy" DROP CONSTRAINT IF EXISTS "CollectRetentionPolicy_sourceId_fkey";
ALTER TABLE "CollectRetentionPolicy"
  ADD CONSTRAINT "CollectRetentionPolicy_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "CollectSource"("id") ON DELETE CASCADE;

-- 2. ApiToken
CREATE TABLE IF NOT EXISTS "ApiToken" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "prefix"      TEXT NOT NULL,
  "scopes"      TEXT[] NOT NULL DEFAULT '{}',
  "lastUsedAt"  TIMESTAMP(3),
  "expiresAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "ApiToken_workspaceId_idx" ON "ApiToken"("workspaceId");
ALTER TABLE "ApiToken" DROP CONSTRAINT IF EXISTS "ApiToken_workspaceId_fkey";
ALTER TABLE "ApiToken"
  ADD CONSTRAINT "ApiToken_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
ALTER TABLE "ApiToken" DROP CONSTRAINT IF EXISTS "ApiToken_userId_fkey";
ALTER TABLE "ApiToken"
  ADD CONSTRAINT "ApiToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- 3. NotificationPref
CREATE TABLE IF NOT EXISTS "NotificationPref" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "enabled"   BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPref_userId_eventType_key"
  ON "NotificationPref"("userId", "eventType");
ALTER TABLE "NotificationPref" DROP CONSTRAINT IF EXISTS "NotificationPref_userId_fkey";
ALTER TABLE "NotificationPref"
  ADD CONSTRAINT "NotificationPref_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;

-- 4. ProjectMember (워크스페이스 권한 위에 프로젝트 단위 덮어쓰기)
CREATE TABLE IF NOT EXISTS "ProjectMember" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_userId_projectId_key"
  ON "ProjectMember"("userId", "projectId");
ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_userId_fkey";
ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "ProjectMember" DROP CONSTRAINT IF EXISTS "ProjectMember_projectId_fkey";
ALTER TABLE "ProjectMember"
  ADD CONSTRAINT "ProjectMember_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE;
