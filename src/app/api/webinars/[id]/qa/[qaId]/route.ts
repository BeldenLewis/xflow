import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; qaId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, qaId } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const { status } = await request.json();
  if (!["pending", "answered", "dismissed"].includes(String(status))) {
    return NextResponse.json({ error: "상태 값을 확인해주세요" }, { status: 400 });
  }

  const question = await prisma.webinarQA.findFirst({
    where: { id: qaId, webinarId: id },
    select: { id: true },
  });
  if (!question) return NextResponse.json({ error: "질문을 찾지 못했어요" }, { status: 404 });

  const updated = await prisma.webinarQA.update({
    where: { id: question.id },
    data: { status },
  });

  return NextResponse.json({ question: updated });
}
