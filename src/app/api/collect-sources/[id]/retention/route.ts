import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

// 데이터 자동 보관 정책: N일 지난 레코드 자동 삭제
// GET 현재 정책, PUT { retainDays: number }
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const policy = await prisma.collectRetentionPolicy.findUnique({ where: { sourceId: id } });
  return NextResponse.json({ policy });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "ADMIN 이상 필요" }, { status: 403 });
  }

  const body = await request.json();
  const days = parseInt(body?.retainDays);
  if (isNaN(days) || days < 0 || days > 365 * 10) {
    return NextResponse.json({ error: "retainDays 는 0~3650" }, { status: 400 });
  }

  if (days === 0) {
    await prisma.collectRetentionPolicy.delete({ where: { sourceId: id } }).catch(() => {});
    return NextResponse.json({ policy: null });
  }

  const policy = await prisma.collectRetentionPolicy.upsert({
    where: { sourceId: id },
    create: { sourceId: id, retainDays: days },
    update: { retainDays: days, updatedAt: new Date() },
  });
  return NextResponse.json({ policy });
}
