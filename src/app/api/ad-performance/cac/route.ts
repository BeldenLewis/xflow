import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

interface RequestBody {
  workspaceId: string;
  projectId: string;
  from?: string;
  to?: string;
  sourceId?: string | null;
  attribution?: "last" | "first";
}

interface CacRow {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string | null;
  cost: number;
  impressions: number;
  clicks: number;
  adConversions: number;
  registrations: number;
  cac: number | null;
  ctr: number;
  cvr: number | null;
}

// AdPerformanceRecord에는 utmSource/utmMedium/utmCampaign 컬럼이 없고
// sourceType (GOOGLE | META | LINKEDIN | MANUAL) + campaignName 만 있음.
// 사전등록 UTM과 매칭하기 위해 각 광고 채널의 가능한 별칭(alias)을 확장 관리.
// 실데이터 분석: META에는 fb/ig/meta/facebook/instagram 등이 혼재.
const SOURCE_ALIASES: Record<string, string[]> = {
  GOOGLE: ["google", "google_ads", "googleads", "g", "gads"],
  META: ["meta", "facebook", "fb", "instagram", "ig", "fbads", "facebook_ads"],
  LINKEDIN: ["linkedin", "li", "linkedin_ads"],
};

// 표시용 — 첫 번째 alias가 대표 이름.
function representativeSource(sourceType: string) {
  return (SOURCE_ALIASES[sourceType]?.[0] ?? sourceType).toLowerCase();
}

// 광고 매체별 UTM medium 별칭. 광고 측 컨벤션과 사전등록 측이 자주 다름.
const MEDIUM_ALIASES: Record<string, string[]> = {
  GOOGLE: ["cpc", "paid", "ppc", "paid_search"],
  META: ["paid_social", "paid", "social", "cpc", "da"],
  LINKEDIN: ["paid_social", "paid", "social", "cpc"],
};

function representativeMedium(sourceType: string) {
  return (MEDIUM_ALIASES[sourceType]?.[0] ?? "cpc").toLowerCase();
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

// 캠페인명 정규화 — 공백/하이픈/언더스코어 제거. "STK 2026" ↔ "stk_2026" ↔ "stk-2026" 동일 처리.
function normCampaign(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, "");
}

function looseKey(source: string, campaign: string) {
  return `${norm(source)}||${normCampaign(campaign)}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = (await request.json()) as RequestBody;
  const { workspaceId, projectId, sourceId, attribution } = body;
  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId, projectId 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return NextResponse.json({ error: "프로젝트 없음" }, { status: 404 });

  const from = parseDate(body.from);
  const to = parseDate(body.to);

  // --- Ad side ---
  const adWhere: Prisma.AdPerformanceRecordWhereInput = {
    workspaceId,
    projectId,
    ...(from || to
      ? {
          OR: [
            {
              reportDate: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            },
            {
              reportDate: null,
              ...(from ? { reportEnd: { gte: from } } : {}),
              ...(to ? { reportStart: { lte: to } } : {}),
            },
          ],
        }
      : {}),
  };

  const adGroups = await prisma.adPerformanceRecord.groupBy({
    by: ["sourceType", "campaignName"],
    where: adWhere,
    _sum: { cost: true, impressions: true, clicks: true, conversions: true },
  });

  // --- Collect side ---
  const useFirst = attribution === "first";
  const collectWhere: Prisma.CollectRecordWhereInput = {
    workspaceId,
    projectId,
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(sourceId && sourceId !== "all" ? { sourceId } : {}),
  };

  const collectGroups = await (prisma.collectRecord.groupBy as unknown as (args: {
    by: string[];
    where: Prisma.CollectRecordWhereInput;
    _count: { _all: true };
  }) => Promise<Array<Record<string, string | null> & { _count: { _all: number } }>>)({
    by: useFirst
      ? ["firstUtmSource", "firstUtmMedium", "firstUtmCampaign"]
      : ["utmSource", "utmMedium", "utmCampaign"],
    where: collectWhere,
    _count: { _all: true },
  });

  const srcCol = useFirst ? "firstUtmSource" : "utmSource";
  const campCol = useFirst ? "firstUtmCampaign" : "utmCampaign";

  // Build lookup map keyed by (normalizedSource, normalizedCampaign).
  // utmSource나 utmCampaign 둘 다 비어있는 레코드는 매칭 후보가 아니므로 제외.
  // (UTM 없는 다이렉트 트래픽은 광고 ↔ 사전등록 매칭 대상이 아님)
  const collectLookup = new Map<string, number>(); // key = source||campaign
  for (const group of collectGroups) {
    const source = group[srcCol] ?? "";
    const campaign = group[campCol] ?? "";
    if (!source && !campaign) continue; // UTM 없음 → 매칭 제외
    const count = group._count._all;
    const lk = looseKey(source, campaign);
    collectLookup.set(lk, (collectLookup.get(lk) ?? 0) + count);
  }

  // 매칭된 collect 키 추적 (unattributed 계산용)
  const attributedKeys = new Set<string>();

  const rows: CacRow[] = adGroups
    .map((group) => {
      const utmSource = representativeSource(group.sourceType);
      const utmMedium = representativeMedium(group.sourceType);
      const utmCampaign = group.campaignName || null;
      const cost = group._sum.cost ?? 0;
      const impressions = group._sum.impressions ?? 0;
      const clicks = group._sum.clicks ?? 0;
      const adConversions = group._sum.conversions ?? 0;

      // 광고 매체의 모든 source alias × 캠페인명 정규화 매칭 시도.
      const sourceAliases = SOURCE_ALIASES[group.sourceType] ?? [group.sourceType.toLowerCase()];
      const normalizedCampaign = normCampaign(utmCampaign);
      let registrations = 0;
      for (const alias of sourceAliases) {
        const lk = `${alias}||${normalizedCampaign}`;
        const matched = collectLookup.get(lk);
        if (matched) {
          registrations += matched;
          attributedKeys.add(lk);
        }
      }

      const cac = registrations > 0 ? cost / registrations : null;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cvr = clicks > 0 ? (registrations / clicks) * 100 : null;

      return {
        utmSource,
        utmMedium,
        utmCampaign,
        cost,
        impressions,
        clicks,
        adConversions,
        registrations,
        cac,
        ctr,
        cvr,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  // Totals
  const totals = rows.reduce(
    (acc, r) => {
      acc.cost += r.cost;
      acc.impressions += r.impressions;
      acc.clicks += r.clicks;
      acc.adConversions += r.adConversions;
      acc.registrations += r.registrations;
      return acc;
    },
    { cost: 0, impressions: 0, clicks: 0, adConversions: 0, registrations: 0 },
  );

  // 매칭되지 않은 사전등록 = UTM은 있지만 광고 캠페인과 매핑이 안 되는 것.
  // UTM 없는 다이렉트 트래픽은 이미 collectLookup에서 제외했으므로 자연스럽게 무시됨.
  let totalUtmCollect = 0;
  let attributedCollect = 0;
  for (const [lk, count] of collectLookup.entries()) {
    totalUtmCollect += count;
    if (attributedKeys.has(lk)) attributedCollect += count;
  }
  const unattributed = { registrations: Math.max(0, totalUtmCollect - attributedCollect) };

  // 매체(채널) 단위 집계 — 캠페인명 매칭 실패해도 source alias로 등록 수 집계.
  // 같은 source의 모든 사전등록(캠페인 무관)을 합산. 광고 채널 비교용.
  const channelRows = (["GOOGLE", "META", "LINKEDIN"] as const).map((sourceType) => {
    const adRowsForChannel = adGroups.filter((g) => g.sourceType === sourceType);
    if (adRowsForChannel.length === 0) {
      return null;
    }
    const cost = adRowsForChannel.reduce((s, g) => s + (g._sum.cost ?? 0), 0);
    const impressions = adRowsForChannel.reduce((s, g) => s + (g._sum.impressions ?? 0), 0);
    const clicks = adRowsForChannel.reduce((s, g) => s + (g._sum.clicks ?? 0), 0);
    const adConversions = adRowsForChannel.reduce((s, g) => s + (g._sum.conversions ?? 0), 0);

    // 같은 source alias의 사전등록 전체 합산.
    const aliases = SOURCE_ALIASES[sourceType] ?? [sourceType.toLowerCase()];
    let registrations = 0;
    for (const group of collectGroups) {
      const groupSource = norm(group[srcCol] ?? "");
      if (aliases.includes(groupSource)) {
        registrations += group._count._all;
      }
    }

    return {
      sourceType,
      label: representativeSource(sourceType).toUpperCase(),
      cost,
      impressions,
      clicks,
      adConversions,
      registrations,
      cac: registrations > 0 ? cost / registrations : null,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cvr: clicks > 0 ? (registrations / clicks) * 100 : null,
    };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  return NextResponse.json({
    rows: rows.slice(0, 200),
    totals: {
      ...totals,
      cac: totals.registrations > 0 ? totals.cost / totals.registrations : null,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cvr: totals.clicks > 0 ? (totals.registrations / totals.clicks) * 100 : null,
    },
    unattributed,
    matchedCampaignCount: rows.filter((r) => r.registrations > 0).length,
    channelRows, // 매체 단위 집계 — 캠페인명 매칭이 어려울 때 폴백.
  });
}
