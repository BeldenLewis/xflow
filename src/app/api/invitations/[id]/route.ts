import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { action } = await request.json(); // "accept" | "decline"

  if (action !== "accept" && action !== "decline") {
    return NextResponse.json({ error: "올바르지 않은 액션이에요" }, { status: 400 });
  }

  // 모든 검증 + 상태 변경을 단일 트랜잭션으로 — race condition 방지
  try {
    const result = await prisma.$transaction(async (tx) => {
      const invitation = await tx.workspaceInvitation.findUnique({ where: { id } });
      if (!invitation) throw new Error("NOT_FOUND");
      if (invitation.invitedUserId !== user.id) throw new Error("FORBIDDEN");
      if (invitation.status !== "PENDING") throw new Error("ALREADY_PROCESSED");

      if (action === "accept") {
        // unique([userId, workspaceId]) 가 동시 수락 방어
        await tx.workspaceMember.upsert({
          where: { userId_workspaceId: { userId: user.id, workspaceId: invitation.workspaceId } },
          create: { userId: user.id, workspaceId: invitation.workspaceId, role: invitation.role },
          update: {},
        });
        await tx.workspaceInvitation.update({ where: { id }, data: { status: "ACCEPTED" } });
      } else {
        await tx.workspaceInvitation.update({ where: { id }, data: { status: "DECLINED" } });
      }

      await tx.notification.updateMany({
        where: { userId: user.id, data: { path: ["invitationId"], equals: id } },
        data: { read: true },
      });

      return action === "accept" ? "accepted" : "declined";
    });

    return NextResponse.json({ ok: true, action: result });
  } catch (e) {
    const code = e instanceof Error ? e.message : "INTERNAL";
    if (code === "NOT_FOUND") return NextResponse.json({ error: "초대를 찾을 수 없어요" }, { status: 404 });
    if (code === "FORBIDDEN") return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    if (code === "ALREADY_PROCESSED") return NextResponse.json({ error: "이미 처리된 초대예요" }, { status: 409 });
    console.error("[invitation] failed:", e);
    return NextResponse.json({ error: "처리 중 오류" }, { status: 500 });
  }
}
