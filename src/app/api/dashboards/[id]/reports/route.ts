import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { nextRunFromNow } from "@/lib/cron";

async function authorize(dashboardId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const dashboard = await prisma.dashboard.findUnique({ where: { id: dashboardId } });
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

  const reports = await prisma.scheduledReport.findMany({
    where: { dashboardId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ reports });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { name, cron, channel, target } = body;
  if (!name || !cron || !channel || !target) {
    return NextResponse.json({ error: "name, cron, channel, target 필요" }, { status: 400 });
  }
  if (channel !== "slack" && channel !== "email") {
    return NextResponse.json({ error: "channel 은 slack 또는 email" }, { status: 400 });
  }

  const nextRunAt = nextRunFromNow(cron);
  const report = await prisma.scheduledReport.create({
    data: {
      dashboardId: id,
      workspaceId: auth.dashboard.workspaceId,
      name, cron, channel, target,
      nextRunAt,
    },
  });
  return NextResponse.json({ report });
}
