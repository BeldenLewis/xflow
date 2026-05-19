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
  const q = searchParams.get("q")?.trim();
  const utmSource = searchParams.get("utmSource");
  const utmMedium = searchParams.get("utmMedium");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Postgres JSONB ::text 캐스팅으로 모든 필드값에서 ILIKE 검색
  // 큰 데이터셋에서도 일관된 응답 시간 (인덱스 활용 어렵지만 정확성 우선)
  const where: Record<string, unknown> = { sourceId: id };
  if (utmSource) where.utmSource = utmSource;
  if (utmMedium) where.utmMedium = utmMedium;
  if (from || to) {
    const range: Record<string, Date> = {};
    if (from) range.gte = new Date(from);
    if (to) range.lte = new Date(to);
    where.createdAt = range;
  }

  let records, total;
  if (q) {
    // 검색은 raw SQL 로 JSONB 텍스트 검색 + utm 필드
    const escaped = q.replace(/[%_\\]/g, (m) => "\\" + m);
    const pattern = `%${escaped}%`;
    const fromDate = from ? new Date(from) : new Date(0);
    const toDate = to ? new Date(to) : new Date();
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "CollectRecord"
      WHERE "sourceId" = ${id}
        AND "createdAt" >= ${fromDate}
        AND "createdAt" <= ${toDate}
        AND (
          "data"::text ILIKE ${pattern}
          OR COALESCE("utmSource",'') ILIKE ${pattern}
          OR COALESCE("utmMedium",'') ILIKE ${pattern}
          OR COALESCE("utmCampaign",'') ILIKE ${pattern}
          OR COALESCE("referrer",'') ILIKE ${pattern}
        )
      ORDER BY "createdAt" DESC
      LIMIT ${limit} OFFSET ${skip}
    `;
    const ids = rows.map((r) => r.id);
    records = await prisma.collectRecord.findMany({ where: { id: { in: ids } }, orderBy: { createdAt: "desc" } });
    const countRow = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "CollectRecord"
      WHERE "sourceId" = ${id}
        AND "createdAt" >= ${fromDate}
        AND "createdAt" <= ${toDate}
        AND (
          "data"::text ILIKE ${pattern}
          OR COALESCE("utmSource",'') ILIKE ${pattern}
          OR COALESCE("utmMedium",'') ILIKE ${pattern}
          OR COALESCE("utmCampaign",'') ILIKE ${pattern}
          OR COALESCE("referrer",'') ILIKE ${pattern}
        )
    `;
    total = Number(countRow[0]?.count ?? 0);
  } else {
    const [r, t] = await prisma.$transaction([
      prisma.collectRecord.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
      prisma.collectRecord.count({ where }),
    ]);
    records = r;
    total = t;
  }

  return NextResponse.json({ records, total, page, limit, q });
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
