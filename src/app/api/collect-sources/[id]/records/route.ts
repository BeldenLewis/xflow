import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function authorize(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return { error: NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  return { source, userId: user.id };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const rawLimit = parseInt(searchParams.get("limit") ?? "10000");
  const limit = Math.min(Math.max(rawLimit, 1), 10000);
  const skip = (page - 1) * limit;

  const [records, total] = await prisma.$transaction([
    prisma.collectRecord.findMany({
      where: { sourceId: id },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.collectRecord.count({ where: { sourceId: id } }),
  ]);

  return NextResponse.json({ records, total, page, limit });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const ids: unknown = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((v) => typeof v === "string")) {
    return NextResponse.json({ error: "삭제할 레코드 ID 배열이 필요해요" }, { status: 400 });
  }

  const result = await prisma.collectRecord.deleteMany({
    where: { sourceId: id, id: { in: ids as string[] } },
  });

  await logActivity({
    workspaceId: auth.source.workspaceId,
    sourceId: id,
    userId: auth.userId,
    action: "records.bulk_deleted",
    meta: { count: result.count },
  });

  return NextResponse.json({ deleted: result.count });
}
