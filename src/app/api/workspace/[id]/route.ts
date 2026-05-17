import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
    include: { workspace: { include: { projects: { orderBy: { createdAt: "asc" } } } } },
  });

  if (!membership) return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  return NextResponse.json({
    workspace: { id: membership.workspace.id, name: membership.workspace.name, slug: membership.workspace.slug },
    projects: membership.workspace.projects,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
  });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const workspace = await prisma.workspace.update({
    where: { id },
    data: { name: name.trim() },
  });

  return NextResponse.json({ workspace });
}
