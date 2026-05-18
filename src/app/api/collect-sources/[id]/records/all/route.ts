import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

// 한 소스의 모든 레코드를 비웁니다.
// 안전장치:
//  1) 본문에 { confirm: true } 필요
//  2) 본문에 confirmName 으로 소스 이름이 정확히 일치해야 함
//  3) 본문에 expectedCount 가 실제 카운트와 일치해야 함 (선택, 보내면 검사)
//  4) 워크스페이스 ADMIN 이상만 가능
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });
  if (membership.role === "MEMBER") return NextResponse.json({ error: "권한 없음 (ADMIN 이상)" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { confirm, confirmName, expectedCount } = body as {
    confirm?: boolean;
    confirmName?: string;
    expectedCount?: number;
  };

  if (!confirm) {
    return NextResponse.json({ error: "confirm: true 가 필요해요" }, { status: 400 });
  }
  if (typeof confirmName !== "string" || confirmName !== source.name) {
    return NextResponse.json({ error: "소스 이름이 일치하지 않아요" }, { status: 400 });
  }

  if (typeof expectedCount === "number") {
    const actual = await prisma.collectRecord.count({ where: { sourceId: id } });
    if (actual !== expectedCount) {
      return NextResponse.json({
        error: `데이터 카운트가 변경됐어요 (예상 ${expectedCount} → 실제 ${actual}). 새로고침 후 다시 시도하세요.`,
      }, { status: 409 });
    }
  }

  const result = await prisma.collectRecord.deleteMany({ where: { sourceId: id } });

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "records.bulk_deleted",
    meta: { all: true, count: result.count, sourceName: source.name },
  });

  return NextResponse.json({ deleted: result.count });
}
