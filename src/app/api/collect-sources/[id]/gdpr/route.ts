import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

// 개인정보 데이터 검색 + 일괄 삭제 (GDPR right-to-erasure 대응)
// POST { search: string, dryRun?: boolean }
// - data JSON 의 모든 값에서 검색어 일치하는 레코드 찾기
// - dryRun=true → 매칭 건수만 반환
// - dryRun=false → 실제 삭제 + 활동 로그
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { search, dryRun } = body as { search?: string; dryRun?: boolean };
  if (!search || typeof search !== "string" || search.trim().length < 3) {
    return NextResponse.json({ error: "검색어는 3자 이상이어야 해요" }, { status: 400 });
  }

  const pattern = `%${search.trim().replace(/[%_\\]/g, (m) => "\\" + m)}%`;
  const ids = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "CollectRecord"
    WHERE "sourceId" = ${id}
      AND (
        "data"::text ILIKE ${pattern}
        OR COALESCE("utmSource",'') ILIKE ${pattern}
        OR COALESCE("utmMedium",'') ILIKE ${pattern}
      )
    LIMIT 10000
  `;
  const matchedIds = ids.map((r) => r.id);

  // 미리보기 샘플 (최대 10건)
  const sample = await prisma.collectRecord.findMany({
    where: { id: { in: matchedIds.slice(0, 10) } },
    select: { id: true, createdAt: true, data: true },
    orderBy: { createdAt: "desc" },
  });

  if (dryRun !== false) {
    return NextResponse.json({ matched: matchedIds.length, sample, deleted: 0 });
  }

  const result = await prisma.collectRecord.deleteMany({
    where: { sourceId: id, id: { in: matchedIds } },
  });

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "records.bulk_deleted",
    meta: { reason: "gdpr", search: search.trim(), count: result.count },
  });

  return NextResponse.json({ matched: matchedIds.length, deleted: result.count });
}
