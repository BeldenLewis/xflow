import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const token = await prisma.apiToken.findUnique({ where: { id } });
  if (!token) return NextResponse.json({ error: "토큰 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: token.workspaceId } },
  });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  await prisma.apiToken.delete({ where: { id } });

  await logActivity({
    workspaceId: token.workspaceId,
    userId: user.id,
    action: "apiToken.revoked",
    meta: { tokenId: id, tokenName: token.name, prefix: token.prefix },
  });

  return NextResponse.json({ ok: true });
}
