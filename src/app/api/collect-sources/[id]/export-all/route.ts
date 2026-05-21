import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { kstDateString } from "@/lib/datetime";

// 소스 전체 백업 — 설정 + 필드 매핑 + 모든 레코드 JSON 한 파일로 다운로드.
// 나중에 import-all 로 복구 가능.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({
    where: { id },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "소스 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const records = await prisma.collectRecord.findMany({
    where: { sourceId: id },
    orderBy: { createdAt: "asc" },
  });

  const backup = {
    _schema: "mach.collect-source.backup.v1",
    exportedAt: new Date().toISOString(),
    source: {
      name: source.name,
      description: source.description,
      siteUrl: source.siteUrl,
      successTrigger: source.successTrigger,
      redirectUrl: source.redirectUrl,
      isActive: source.isActive,
      webhookUrl: source.webhookUrl,
      notifyOnSubmit: source.notifyOnSubmit,
      allowedOrigins: source.allowedOrigins,
      fieldMappings: source.fieldMappings.map((f) => ({
        index: f.index, key: f.key, label: f.label, type: f.type, isRequired: f.isRequired, sortOrder: f.sortOrder,
      })),
    },
    records: records.map((r) => ({
      data: r.data,
      utmSource: r.utmSource, utmMedium: r.utmMedium, utmCampaign: r.utmCampaign,
      utmTerm: r.utmTerm, utmContent: r.utmContent,
      firstUtmSource: r.firstUtmSource, firstUtmMedium: r.firstUtmMedium,
      firstUtmCampaign: r.firstUtmCampaign, firstUtmTerm: r.firstUtmTerm, firstUtmContent: r.firstUtmContent,
      firstReferrer: r.firstReferrer, firstSeenAt: r.firstSeenAt?.toISOString() ?? null,
      referrer: r.referrer, userAgent: r.userAgent, ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
  };

  const filename = `mach-backup-${source.name.replace(/[^a-zA-Z0-9가-힣_-]+/g, "_")}-${kstDateString()}.json`;
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
