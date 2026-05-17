import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { action } = await request.json(); // "accept" | "decline"

  const invitation = await prisma.workspaceInvitation.findUnique({ where: { id } });
  if (!invitation) return NextResponse.json({ error: "초대를 찾을 수 없어요" }, { status: 404 });
  if (invitation.invitedUserId !== user.id) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  if (invitation.status !== "PENDING") return NextResponse.json({ error: "이미 처리된 초대예요" }, { status: 409 });

  if (action === "accept") {
    await prisma.$transaction([
      prisma.workspaceMember.create({
        data: {
          id: crypto.randomUUID(),
          userId: user.id,
          workspaceId: invitation.workspaceId,
          role: invitation.role,
        },
      }),
      prisma.workspaceInvitation.update({
        where: { id },
        data: { status: "ACCEPTED" },
      }),
      prisma.notification.updateMany({
        where: { userId: user.id, data: { path: ["invitationId"], equals: id } },
        data: { read: true },
      }),
    ]);
    return NextResponse.json({ ok: true, action: "accepted" });
  }

  if (action === "decline") {
    await prisma.$transaction([
      prisma.workspaceInvitation.update({
        where: { id },
        data: { status: "DECLINED" },
      }),
      prisma.notification.updateMany({
        where: { userId: user.id, data: { path: ["invitationId"], equals: id } },
        data: { read: true },
      }),
    ]);
    return NextResponse.json({ ok: true, action: "declined" });
  }

  return NextResponse.json({ error: "올바르지 않은 액션이에요" }, { status: 400 });
}
