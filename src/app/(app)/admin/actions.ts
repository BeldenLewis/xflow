"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { isSuperAdminEmail } from "@/lib/super-admin";

async function requireSuperAdminUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isSuperAdminEmail(user.email)) {
    throw new Error("슈퍼어드민 권한이 필요합니다.");
  }

  return { id: user.id, email: user.email };
}

function getString(formData: FormData, key: string, maxLength = 120) {
  const value = formData.get(key);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getRequiredString(formData: FormData, key: string, label: string, maxLength = 120) {
  const value = getString(formData, key, maxLength);
  if (!value) throw new Error(`${label}을 입력해주세요.`);
  return value;
}

function finishAdminAction(message: string) {
  revalidatePath("/admin");
  redirect(`/admin?message=${encodeURIComponent(message)}`);
}

async function createAdminLog(args: {
  workspaceId: string;
  sourceId?: string | null;
  userId?: string | null;
  action: string;
  meta?: Record<string, unknown>;
}) {
  await prisma.activityLog.create({
    data: {
      workspaceId: args.workspaceId,
      userId: args.userId ?? null,
      sourceId: args.sourceId ?? null,
      action: args.action,
      meta: (args.meta ?? null) as never,
    },
  });
}

export async function renameWorkspaceAction(formData: FormData) {
  const user = await requireSuperAdminUser();
  const workspaceId = getRequiredString(formData, "workspaceId", "워크스페이스 ID");
  const name = getRequiredString(formData, "name", "워크스페이스 이름", 80);
  const reason = getString(formData, "reason", 240);

  const previous = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, name: true },
  });
  if (!previous) throw new Error("워크스페이스를 찾을 수 없습니다.");

  await prisma.workspace.update({
    where: { id: workspaceId },
    data: { name },
  });
  await createAdminLog({
    workspaceId,
    userId: user.id,
    action: "admin.workspace_renamed",
    meta: { before: previous.name, after: name, reason },
  });

  finishAdminAction("워크스페이스 이름을 변경했습니다.");
}

export async function setWorkspaceArchivedAction(formData: FormData) {
  const user = await requireSuperAdminUser();
  const workspaceId = getRequiredString(formData, "workspaceId", "워크스페이스 ID");
  const mode = getRequiredString(formData, "mode", "처리 방식");
  const reason = getRequiredString(formData, "reason", "처리 사유", 240);
  const deletedAt = mode === "restore" ? null : new Date();

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { deletedAt },
    select: { id: true, name: true },
  });
  await createAdminLog({
    workspaceId,
    userId: user.id,
    action: mode === "restore" ? "admin.workspace_restored" : "admin.workspace_archived",
    meta: { workspaceName: workspace.name, reason },
  });

  finishAdminAction(mode === "restore" ? "워크스페이스를 복구했습니다." : "워크스페이스를 보관 처리했습니다.");
}

export async function renameProjectAction(formData: FormData) {
  const user = await requireSuperAdminUser();
  const projectId = getRequiredString(formData, "projectId", "프로젝트 ID");
  const name = getRequiredString(formData, "name", "프로젝트 이름", 80);
  const description = getString(formData, "description", 240);
  const reason = getString(formData, "reason", 240);

  const previous = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, description: true, workspaceId: true },
  });
  if (!previous) throw new Error("프로젝트를 찾을 수 없습니다.");

  await prisma.project.update({
    where: { id: projectId },
    data: { name, description: description || null },
  });
  await createAdminLog({
    workspaceId: previous.workspaceId,
    userId: user.id,
    action: "admin.project_updated",
    meta: {
      projectId,
      before: { name: previous.name, description: previous.description },
      after: { name, description: description || null },
      reason,
    },
  });

  finishAdminAction("프로젝트 정보를 변경했습니다.");
}

export async function setProjectArchivedAction(formData: FormData) {
  const user = await requireSuperAdminUser();
  const projectId = getRequiredString(formData, "projectId", "프로젝트 ID");
  const mode = getRequiredString(formData, "mode", "처리 방식");
  const reason = getRequiredString(formData, "reason", "처리 사유", 240);
  const deletedAt = mode === "restore" ? null : new Date();

  const project = await prisma.project.update({
    where: { id: projectId },
    data: { deletedAt },
    select: { id: true, name: true, workspaceId: true },
  });
  await createAdminLog({
    workspaceId: project.workspaceId,
    userId: user.id,
    action: mode === "restore" ? "admin.project_restored" : "admin.project_archived",
    meta: { projectId, projectName: project.name, reason },
  });

  finishAdminAction(mode === "restore" ? "프로젝트를 복구했습니다." : "프로젝트를 보관 처리했습니다.");
}

export async function setCollectSourceActiveAction(formData: FormData) {
  const user = await requireSuperAdminUser();
  const sourceId = getRequiredString(formData, "sourceId", "수집 소스 ID");
  const mode = getRequiredString(formData, "mode", "처리 방식");
  const reason = getRequiredString(formData, "reason", "처리 사유", 240);
  const isActive = mode === "activate";

  const source = await prisma.collectSource.update({
    where: { id: sourceId },
    data: { isActive },
    select: { id: true, name: true, workspaceId: true, projectId: true },
  });
  await createAdminLog({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: isActive ? "admin.source_activated" : "admin.source_paused",
    meta: { sourceId, sourceName: source.name, projectId: source.projectId, reason },
  });

  finishAdminAction(isActive ? "수집 소스를 활성화했습니다." : "수집 소스를 일시중지했습니다.");
}

export async function deleteUserAction(formData: FormData) {
  const admin = await requireSuperAdminUser();
  const targetUserId = getRequiredString(formData, "userId", "사용자 ID");
  const confirmEmail = getRequiredString(formData, "confirmEmail", "확인 이메일", 200).toLowerCase();
  const reason = getRequiredString(formData, "reason", "삭제 사유", 240);

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      name: true,
      memberships: {
        select: {
          role: true,
          workspaceId: true,
          workspace: { select: { name: true, deletedAt: true } },
        },
      },
      _count: {
        select: {
          apiTokens: true,
          projectMemberships: true,
          utmLinks: true,
          shortLinks: true,
          activityLogs: true,
        },
      },
    },
  });

  if (!targetUser) throw new Error("사용자를 찾을 수 없습니다.");
  if (isSuperAdminEmail(targetUser.email)) throw new Error("슈퍼어드민 계정은 삭제할 수 없습니다.");
  if (confirmEmail !== targetUser.email.toLowerCase()) throw new Error("확인 이메일이 일치하지 않습니다.");

  const ownedActiveWorkspaces = targetUser.memberships.filter((membership) => (
    membership.role === "OWNER" && !membership.workspace.deletedAt
  ));
  if (ownedActiveWorkspaces.length > 0) {
    throw new Error("소유 중인 활성 워크스페이스가 있어 삭제할 수 없습니다. 먼저 소유권을 이전하거나 워크스페이스를 보관하세요.");
  }

  const workspaceIds = Array.from(new Set(targetUser.memberships.map((membership) => membership.workspaceId)));
  const logWrites = workspaceIds.map((workspaceId) => prisma.activityLog.create({
    data: {
      workspaceId,
      userId: admin.id,
      sourceId: null,
      action: "admin.user_deleted",
      meta: {
        targetUserId,
        targetEmail: targetUser.email,
        targetName: targetUser.name,
        reason,
        impact: targetUser._count,
      } as never,
    },
  }));

  await prisma.$transaction([
    ...logWrites,
    prisma.user.delete({ where: { id: targetUserId } }),
  ]);

  finishAdminAction("사용자를 삭제했습니다. Supabase Auth 계정 삭제는 서비스 롤 연동 후 별도로 처리해야 합니다.");
}
