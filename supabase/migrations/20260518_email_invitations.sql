-- 이메일 기반 초대 지원: 미가입자도 초대 가능

ALTER TABLE "WorkspaceInvitation"
  ALTER COLUMN "invitedUserId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "invitedEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "token"        TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceInvitation_token_key"
  ON "WorkspaceInvitation"("token");
CREATE INDEX IF NOT EXISTS "WorkspaceInvitation_invitedEmail_status_idx"
  ON "WorkspaceInvitation"("invitedEmail", "status");
