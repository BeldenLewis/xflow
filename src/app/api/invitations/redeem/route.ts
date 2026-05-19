import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// 가입 직후 호출 — token 으로 미가입자 초대를 redeem.
// 가입 시 사용한 이메일과 invitation.invitedEmail 이 일치해야 자동 멤버십 부여.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { token } = body as { token?: string };
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });

  const invitation = await prisma.workspaceInvitation.findUnique({ where: { token } });
  if (!invitation) return NextResponse.json({ error: "초대를 찾을 수 없어요" }, { status: 404 });
  if (invitation.status !== "PENDING") return NextResponse.json({ error: "이미 처리됨" }, { status: 409 });

  // 이메일 일치 확인
  const userEmail = user.email?.toLowerCase() ?? "";
  if (invitation.invitedEmail?.toLowerCase() !== userEmail) {
    return NextResponse.json({ error: "초대 받은 이메일과 가입 이메일이 달라요" }, { status: 403 });
  }

  // 멤버십 생성 + 상태 변경
  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invitation.workspaceId } },
      create: { userId: user.id, workspaceId: invitation.workspaceId, role: invitation.role },
      update: {},
    });
    await tx.workspaceInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", invitedUserId: user.id },
    });
  });

  return NextResponse.json({ ok: true, workspaceId: invitation.workspaceId });
}
