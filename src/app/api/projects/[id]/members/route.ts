import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

// 프로젝트 단위 권한 — 워크스페이스 권한 위에 좁은 권한 덮어쓰기.
// VIEWER / EDITOR / ADMIN

async function authorize(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return { error: NextResponse.json({ error: "프로젝트 없음" }, { status: 404 }) };

  const ws = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: project.workspaceId } },
  });
  if (!ws) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  return { project, ws, user };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ members });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  if (auth.ws.role === "MEMBER") return NextResponse.json({ error: "ADMIN 이상 필요" }, { status: 403 });

  const body = await request.json();
  const { userId, role } = body as { userId?: string; role?: string };
  if (!userId || !["VIEWER", "EDITOR", "ADMIN"].includes(role ?? "")) {
    return NextResponse.json({ error: "userId, role(VIEWER|EDITOR|ADMIN) 필요" }, { status: 400 });
  }
  // 대상이 워크스페이스 멤버여야 함
  const targetWs = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: auth.project.workspaceId } },
  });
  if (!targetWs) return NextResponse.json({ error: "대상이 워크스페이스 멤버가 아니에요" }, { status: 400 });

  const existing = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId: id } },
  });
  const member = await prisma.projectMember.upsert({
    where: { userId_projectId: { userId, projectId: id } },
    create: { userId, projectId: id, role: role! },
    update: { role: role! },
  });

  await logActivity({
    workspaceId: auth.project.workspaceId,
    userId: auth.user.id,
    action: existing ? "project.member_role_changed" : "project.member_added",
    meta: {
      projectId: id,
      targetUserId: userId,
      role,
      ...(existing ? { previousRole: existing.role } : {}),
    },
  });
  return NextResponse.json({ member });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  if (auth.ws.role === "MEMBER") return NextResponse.json({ error: "ADMIN 이상 필요" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId 필요" }, { status: 400 });

  await prisma.projectMember.delete({ where: { userId_projectId: { userId, projectId: id } } }).catch(() => {});

  await logActivity({
    workspaceId: auth.project.workspaceId,
    userId: auth.user.id,
    action: "project.member_removed",
    meta: { projectId: id, targetUserId: userId },
  });
  return NextResponse.json({ ok: true });
}
