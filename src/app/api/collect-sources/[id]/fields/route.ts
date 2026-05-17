import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { fields } = await request.json();
  // fields: Array<{ index: number; key: string; label: string; type: string; isRequired: boolean; sortOrder: number }>

  await prisma.$transaction([
    prisma.fieldMapping.deleteMany({ where: { sourceId: id } }),
    prisma.fieldMapping.createMany({
      data: fields.map((f: { index: number; key: string; label: string; type?: string; isRequired?: boolean; sortOrder?: number }) => ({
        sourceId: id,
        index: f.index,
        key: f.key,
        label: f.label,
        type: f.type ?? "text",
        isRequired: f.isRequired ?? false,
        sortOrder: f.sortOrder ?? f.index,
      })),
    }),
  ]);

  const updated = await prisma.fieldMapping.findMany({
    where: { sourceId: id },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json({ fields: updated });
}
