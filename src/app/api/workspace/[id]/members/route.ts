import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function requireMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
}

// 멤버 목록 조회
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const membership = await requireMembership(user.id, id);
  if (!membership) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: id },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({ members });
}

// 멤버 초대 (이메일로)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const membership = await requireMembership(user.id, id);
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "초대 권한이 없어요" }, { status: 403 });
  }

  const { email, role = "MEMBER" } = await request.json();
  if (!email) return NextResponse.json({ error: "이메일을 입력해주세요" }, { status: 400 });

  // Supabase에서 해당 이메일 유저 찾기 (서비스 롤 필요)
  const adminClient = await createClient();
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (!existingUser) {
    return NextResponse.json({ error: "해당 이메일로 가입된 계정이 없어요. 먼저 가입 후 초대해주세요." }, { status: 404 });
  }

  const alreadyMember = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: existingUser.id, workspaceId: id } },
  });
  if (alreadyMember) {
    return NextResponse.json({ error: "이미 워크스페이스 멤버예요" }, { status: 409 });
  }

  const newMember = await prisma.workspaceMember.create({
    data: { id: crypto.randomUUID(), userId: existingUser.id, workspaceId: id, role },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });

  return NextResponse.json({ member: newMember });
}

// 역할 변경
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const membership = await requireMembership(user.id, id);
  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ error: "소유자만 역할을 변경할 수 있어요" }, { status: 403 });
  }

  const { memberId, role } = await request.json();
  if (!["ADMIN", "MEMBER"].includes(role)) {
    return NextResponse.json({ error: "올바른 역할이 아니에요" }, { status: 400 });
  }

  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target || target.workspaceId !== id) {
    return NextResponse.json({ error: "멤버를 찾을 수 없어요" }, { status: 404 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "소유자의 역할은 변경할 수 없어요" }, { status: 403 });
  }

  const updated = await prisma.workspaceMember.update({
    where: { id: memberId },
    data: { role },
    include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
  });

  return NextResponse.json({ member: updated });
}

// 멤버 제거
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const membership = await requireMembership(user.id, id);
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { memberId } = await request.json();

  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) return NextResponse.json({ error: "멤버를 찾을 수 없어요" }, { status: 404 });
  if (target.role === "OWNER") {
    return NextResponse.json({ error: "소유자는 제거할 수 없어요" }, { status: 403 });
  }
  if (membership.role === "ADMIN" && target.role === "ADMIN") {
    return NextResponse.json({ error: "편집자는 다른 편집자를 제거할 수 없어요" }, { status: 403 });
  }

  await prisma.workspaceMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
