import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

export async function DELETE(_request: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const batch = await prisma.adPerformanceImportBatch.findUnique({
    where: { id: batchId },
    select: { id: true, workspaceId: true },
  });

  if (!batch) return NextResponse.json({ error: "가져오기 이력을 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: batch.workspaceId } },
  });

  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  await prisma.adPerformanceImportBatch.delete({ where: { id: batch.id } });

  await logActivity({
    workspaceId: batch.workspaceId,
    userId: user.id,
    action: "ad.batch_deleted",
    meta: { batchId: batch.id },
  });

  return NextResponse.json({ ok: true });
}
