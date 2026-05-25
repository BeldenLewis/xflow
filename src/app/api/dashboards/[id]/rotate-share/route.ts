import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "node:crypto";
import { logActivity } from "@/lib/activity";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const dashboard = await prisma.dashboard.findUnique({ where: { id } });
  if (!dashboard) return NextResponse.json({ error: "보드 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: dashboard.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const newToken = randomBytes(24).toString("base64url");
  const updated = await prisma.dashboard.update({
    where: { id },
    data: { shareToken: newToken, shareEnabled: true },
  });

  await logActivity({
    workspaceId: dashboard.workspaceId,
    userId: user.id,
    action: "dashboardShareToken.rotated",
    meta: { dashboardId: id, dashboardName: dashboard.name },
  });

  return NextResponse.json({ shareToken: updated.shareToken });
}
