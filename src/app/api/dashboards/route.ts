import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");
  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId, projectId 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const dashboards = await prisma.dashboard.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { widgets: true } } },
  });

  // 보드가 하나도 없으면 기본 보드 자동 생성
  if (dashboards.length === 0) {
    const created = await prisma.dashboard.create({
      data: {
        projectId, workspaceId,
        name: "기본 보드",
        isDefault: true,
        sortOrder: 0,
      },
      include: { _count: { select: { widgets: true } } },
    });
    return NextResponse.json({ dashboards: [created] });
  }

  return NextResponse.json({ dashboards });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { workspaceId, projectId, name, description, cloneFromId } = body;
  if (!workspaceId || !projectId || !name) {
    return NextResponse.json({ error: "workspaceId, projectId, name 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // 다음 sortOrder
  const last = await prisma.dashboard.findFirst({
    where: { projectId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const dashboard = await prisma.dashboard.create({
    data: { workspaceId, projectId, name, description: description || null, sortOrder },
  });

  // 복제 옵션
  if (typeof cloneFromId === "string" && cloneFromId) {
    const src = await prisma.dashboard.findFirst({
      where: { id: cloneFromId, workspaceId },
      include: { widgets: { orderBy: { position: "asc" } } },
    });
    if (src) {
      for (let i = 0; i < src.widgets.length; i++) {
        const w = src.widgets[i];
        await prisma.dashboardWidget.create({
          data: {
            dashboardId: dashboard.id,
            projectId,
            workspaceId,
            type: w.type,
            title: w.title,
            config: w.config as never,
            width: w.width,
            position: i,
          },
        });
      }
    }
  }

  return NextResponse.json({ dashboard }, { status: 201 });
}
