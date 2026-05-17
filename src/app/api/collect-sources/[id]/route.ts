import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function getSourceWithAuth(id: string, userId: string, requireAdmin = false) {
  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return { error: "소스를 찾을 수 없어요", status: 404 };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: source.workspaceId } },
  });
  if (!membership) return { error: "접근 권한 없음", status: 403 };
  if (requireAdmin && membership.role === "MEMBER") return { error: "권한 없음", status: 403 };

  return { source, membership };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const result = await getSourceWithAuth(id, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const source = await prisma.collectSource.findUnique({
    where: { id },
    include: {
      fieldMappings: { orderBy: { sortOrder: "asc" } },
      _count: { select: { records: true } },
    },
  });

  return NextResponse.json({ source });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const result = await getSourceWithAuth(id, user.id, true);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await request.json();
  const { name, description, siteUrl, successTrigger, redirectUrl, isActive } = body;

  const source = await prisma.collectSource.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(siteUrl !== undefined && { siteUrl: siteUrl || null }),
      ...(successTrigger !== undefined && { successTrigger }),
      ...(redirectUrl !== undefined && { redirectUrl: redirectUrl || null }),
      ...(isActive !== undefined && { isActive }),
    },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });

  return NextResponse.json({ source });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const result = await getSourceWithAuth(id, user.id, true);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  await prisma.collectSource.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
