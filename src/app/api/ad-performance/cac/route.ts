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

// AdPerformanceRecord doesn't carry utmSource/utmMedium/utmCampaign columns —
// it has sourceType (GOOGLE | META | LINKEDIN | MANUAL) + campaignName.
// We derive a UTM-like join key from those fields so we can match against
// CollectRecord.utmSource / utmCampaign (which arrive from the landing page).
const SOURCE_TYPE_TO_UTM_SOURCE: Record<string, string> = {
  GOOGLE: "google",
  META: "facebook",
  LINKEDIN: "linkedin",
};

const SOURCE_TYPE_TO_UTM_MEDIUM: Record<string, string> = {
  GOOGLE: "cpc",
  META: "paid_social",
  LINKEDIN: "paid_social",
};

function deriveUtmSource(sourceType: string) {
  return SOURCE_TYPE_TO_UTM_SOURCE[sourceType] ?? sourceType.toLowerCase();
}

function deriveUtmMedium(sourceType: string) {
  return SOURCE_TYPE_TO_UTM_MEDIUM[sourceType] ?? "cpc";
}

function parseDate(value: string | undefined) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function matchKey(source: string, medium: string, campaign: string) {
  return `${norm(source)}|${norm(medium)}|${norm(campaign)}`;
}

// Looser fallback key (source + campaign only) — UTM medium often diverges
// between ad platforms (cpc/paid_social) and what the landing page captures.
function looseKey(source: string, campaign: string) {
  return `${norm(source)}||${norm(campaign)}`;
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
  const medCol = useFirst ? "firstUtmMedium" : "utmMedium";
  const campCol = useFirst ? "firstUtmCampaign" : "utmCampaign";

  // Build lookup maps from collect data
  const collectFullKey = new Map<string, number>();
  const collectLooseKey = new Map<string, number>();
  let totalCollect = 0;
  for (const group of collectGroups) {
    const source = group[srcCol] ?? "";
    const medium = group[medCol] ?? "";
    const campaign = group[campCol] ?? "";
    const count = group._count._all;
    totalCollect += count;
    const fk = matchKey(source, medium, campaign);
    collectFullKey.set(fk, (collectFullKey.get(fk) ?? 0) + count);
    const lk = looseKey(source, campaign);
    collectLooseKey.set(lk, (collectLooseKey.get(lk) ?? 0) + count);
  }

  // Track which collect groups got attributed (to compute unattributed)
  const attributedFullKeys = new Set<string>();
  const attributedLooseKeys = new Set<string>();

  const rows: CacRow[] = adGroups
    .map((group) => {
      const utmSource = deriveUtmSource(group.sourceType);
      const utmMedium = deriveUtmMedium(group.sourceType);
      const utmCampaign = group.campaignName || null;
      const cost = group._sum.cost ?? 0;
      const impressions = group._sum.impressions ?? 0;
      const clicks = group._sum.clicks ?? 0;
      const adConversions = group._sum.conversions ?? 0;

      const fk = matchKey(utmSource, utmMedium, utmCampaign ?? "");
      const lk = looseKey(utmSource, utmCampaign ?? "");
      let registrations = collectFullKey.get(fk) ?? 0;
      if (registrations > 0) {
        attributedFullKeys.add(fk);
        attributedLooseKeys.add(lk);
      } else {
        // Fallback to source+campaign match (ignore medium discrepancies)
        registrations = collectLooseKey.get(lk) ?? 0;
        if (registrations > 0) attributedLooseKeys.add(lk);
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

  // Unattributed: collect rows that didn't match any ad row.
  // Use loose-key set so we don't double-penalize medium-only mismatches.
  let attributedCollect = 0;
  for (const [lk, count] of collectLooseKey.entries()) {
    if (attributedLooseKeys.has(lk)) attributedCollect += count;
  }
  const unattributed = { registrations: Math.max(0, totalCollect - attributedCollect) };

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
  });
}
