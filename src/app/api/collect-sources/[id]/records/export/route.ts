import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { formatKstDateTime, kstDateString } from "@/lib/datetime";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({
    where: { id },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const records = await prisma.collectRecord.findMany({
    where: { sourceId: id },
    orderBy: { createdAt: "desc" },
  });

  const headers = [
    "시간 (KST)",
    ...source.fieldMappings.map((f) => f.label || f.key),
    "UTM 소스", "UTM 매체", "UTM 캠페인", "UTM 키워드", "UTM 콘텐츠",
    "Referrer",
  ];

  const rows = records.map((r) => {
    const data = (r.data ?? {}) as Record<string, unknown>;
    return [
      formatKstDateTime(r.createdAt),
      ...source.fieldMappings.map((f) => data[f.key] ?? ""),
      r.utmSource ?? "",
      r.utmMedium ?? "",
      r.utmCampaign ?? "",
      r.utmTerm ?? "",
      r.utmContent ?? "",
      r.referrer ?? "",
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  // UTF-8 BOM 추가 (엑셀 한글 깨짐 방지)
  const body = "﻿" + csv;

  const safeName = (source.name || "collect").replace(/[^a-zA-Z0-9가-힣_-]+/g, "_");
  const filename = `${safeName}_${kstDateString()}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
