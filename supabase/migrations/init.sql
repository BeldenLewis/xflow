-- xflow 초기 스키마

CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

CREATE TABLE "User" (
  "id"        TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "name"      TEXT,
  "avatarUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Workspace" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "slug"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

CREATE TABLE "WorkspaceMember" (
  "id"          TEXT NOT NULL,
  "role"        "Role" NOT NULL DEFAULT 'MEMBER',
  "userId"      TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "joinedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceMember_userId_workspaceId_key"
  ON "WorkspaceMember"("userId", "workspaceId");

ALTER TABLE "WorkspaceMember"
  ADD CONSTRAINT "WorkspaceMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMember"
  ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Project" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "workspaceId" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
