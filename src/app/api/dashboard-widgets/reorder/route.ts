import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { projectId, dashboardId, order } = body as { projectId?: string; dashboardId?: string; order?: string[] };

  if (!projectId || !Array.isArray(order)) {
    return NextResponse.json({ error: "projectId, order 필요" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return NextResponse.json({ error: "프로젝트 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: project.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // 보드 범위 내에서 검증
  const widgets = await prisma.dashboardWidget.findMany({
    where: { id: { in: order }, projectId, ...(dashboardId ? { dashboardId } : {}) },
    select: { id: true },
  });
  if (widgets.length !== order.length) {
    return NextResponse.json({ error: "잘못된 위젯 ID" }, { status: 400 });
  }

  await prisma.$transaction(
    order.map((id, index) =>
      prisma.dashboardWidget.update({ where: { id }, data: { position: index } }),
    ),
  );

  await logActivity({
    workspaceId: project.workspaceId,
    userId: user.id,
    action: "dashboard.widgets_reordered",
    meta: { projectId, dashboardId: dashboardId ?? null, widgetCount: order.length },
  });

  return NextResponse.json({ ok: true });
}
