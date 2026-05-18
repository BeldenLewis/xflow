import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function authorize(workspaceId: string, projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return { error: NextResponse.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 404 }) };

  return { userId: user.id, project, membership };
}

// 프로젝트의 보드 중 하나를 반환 (없으면 자동 생성)
async function ensureDashboard(projectId: string, workspaceId: string, dashboardId?: string | null) {
  if (dashboardId) {
    const d = await prisma.dashboard.findFirst({ where: { id: dashboardId, projectId } });
    if (d) return d;
  }
  // 기본 보드 찾기
  let def = await prisma.dashboard.findFirst({ where: { projectId, isDefault: true } });
  if (!def) {
    def = await prisma.dashboard.findFirst({ where: { projectId }, orderBy: { sortOrder: "asc" } });
  }
  if (!def) {
    def = await prisma.dashboard.create({
      data: { projectId, workspaceId, name: "기본 보드", isDefault: true, sortOrder: 0 },
    });
  }
  return def;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");
  const dashboardId = searchParams.get("dashboardId");
  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId, projectId 필요" }, { status: 400 });
  }
  const auth = await authorize(workspaceId, projectId);
  if ("error" in auth) return auth.error;

  const dashboard = await ensureDashboard(projectId, workspaceId, dashboardId);

  const widgets = await prisma.dashboardWidget.findMany({
    where: { dashboardId: dashboard.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ widgets, dashboardId: dashboard.id });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { workspaceId, projectId, dashboardId, type, title, config, width } = body;
  if (!workspaceId || !projectId || !type || !title) {
    return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
  }
  const auth = await authorize(workspaceId, projectId);
  if ("error" in auth) return auth.error;

  const dashboard = await ensureDashboard(projectId, workspaceId, dashboardId);

  // 다음 position (해당 dashboard 안에서)
  const last = await prisma.dashboardWidget.findFirst({
    where: { dashboardId: dashboard.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const widget = await prisma.dashboardWidget.create({
    data: {
      dashboardId: dashboard.id,
      projectId,
      workspaceId,
      type,
      title,
      config: config ?? {},
      width: width ?? "half",
      position,
    },
  });

  return NextResponse.json({ widget }, { status: 201 });
}
