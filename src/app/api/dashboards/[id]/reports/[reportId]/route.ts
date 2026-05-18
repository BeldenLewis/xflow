import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { nextRunFromNow } from "@/lib/cron";

async function authorize(reportId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const report = await prisma.scheduledReport.findUnique({ where: { id: reportId } });
  if (!report) return { error: NextResponse.json({ error: "리포트 없음" }, { status: 404 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: report.workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  return { report };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { reportId } = await params;
  const auth = await authorize(reportId);
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.cron !== undefined) {
    data.cron = body.cron;
    data.nextRunAt = nextRunFromNow(body.cron);
  }
  if (body.channel !== undefined) data.channel = body.channel;
  if (body.target !== undefined) data.target = body.target;
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  const updated = await prisma.scheduledReport.update({ where: { id: reportId }, data });
  return NextResponse.json({ report: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { reportId } = await params;
  const auth = await authorize(reportId);
  if ("error" in auth) return auth.error;

  await prisma.scheduledReport.delete({ where: { id: reportId } });
  return NextResponse.json({ ok: true });
}
