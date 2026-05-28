import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";
import { logActivity } from "@/lib/activity";
import { hashSharePassword } from "@/lib/share-password";

async function authorize(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard) return { error: NextResponse.json({ error: "보드 없음" }, { status: 404 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: dashboard.workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  return { dashboard, userId: user.id };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  const { dashboard } = auth;
  return NextResponse.json({
    dashboard: {
      ...dashboard,
      hasSharePassword: !!dashboard.sharePasswordHash,
      // never expose hash
      sharePasswordHash: undefined,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { name, description, shareEnabled, sharePassword, clearSharePassword } = body;

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description || null;
  if (shareEnabled !== undefined) {
    data.shareEnabled = !!shareEnabled;
    if (shareEnabled && !auth.dashboard.shareToken) {
      data.shareToken = randomBytes(24).toString("base64url");
    }
  }

  let passwordAction: "set" | "removed" | null = null;
  if (typeof sharePassword === "string" && sharePassword.length > 0) {
    if (sharePassword.length > 200) {
      return NextResponse.json({ error: "비밀번호가 너무 길어요" }, { status: 400 });
    }
    data.sharePasswordHash = hashSharePassword(sharePassword);
    passwordAction = "set";
  } else if (clearSharePassword === true) {
    data.sharePasswordHash = null;
    passwordAction = "removed";
  }

  const updated = await prisma.dashboard.update({ where: { id }, data });

  await logActivity({
    workspaceId: auth.dashboard.workspaceId,
    userId: auth.userId,
    action: "dashboard.updated",
    meta: { dashboardId: id, changes: Object.keys(data) },
  });

  if (passwordAction === "set") {
    await logActivity({
      workspaceId: auth.dashboard.workspaceId,
      userId: auth.userId,
      action: "dashboard.share_password_set",
      meta: { dashboardId: id, dashboardName: auth.dashboard.name },
    });
  } else if (passwordAction === "removed") {
    await logActivity({
      workspaceId: auth.dashboard.workspaceId,
      userId: auth.userId,
      action: "dashboard.share_password_removed",
      meta: { dashboardId: id, dashboardName: auth.dashboard.name },
    });
  }

  return NextResponse.json({
    dashboard: {
      ...updated,
      hasSharePassword: !!updated.sharePasswordHash,
      sharePasswordHash: undefined,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  // 기본 보드는 삭제 못 함
  if (auth.dashboard.isDefault) {
    return NextResponse.json({ error: "기본 보드는 삭제할 수 없어요" }, { status: 400 });
  }

  await prisma.dashboard.delete({ where: { id } });

  await logActivity({
    workspaceId: auth.dashboard.workspaceId,
    userId: auth.userId,
    action: "dashboard.deleted",
    meta: { dashboardId: id, name: auth.dashboard.name },
  });

  return NextResponse.json({ ok: true });
}
