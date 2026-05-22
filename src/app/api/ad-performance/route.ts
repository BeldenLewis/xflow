import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const MAX_IMPORT_ROWS = 20_000;
const CREATE_CHUNK_SIZE = 1_000;

type SourceType = "GOOGLE" | "META" | "MANUAL";
type DetailGroupBy = "campaign" | "adGroup";
type DetailDateGranularity = "day" | "week" | "month";

const DEFAULT_DETAIL_PAGE_SIZE = 20;
const MAX_DETAIL_PAGE_SIZE = 100;

interface ImportRowInput {
  sourceType?: SourceType;
  campaignName?: string;
  adGroupName?: string | null;
  reportDate?: string | null;
  reportStart?: string | null;
  reportEnd?: string | null;
  status?: string | null;
  currency?: string | null;
  cost?: number | null;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  cpm?: number | null;
  cpc?: number | null;
  ctr?: number | null;
  conversions?: number | null;
  costPerConversion?: number | null;
  conversionRate?: number | null;
  resultType?: string | null;
  raw?: Prisma.InputJsonValue;
}

function toDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(`${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T00:00:00+09:00`)
    : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toFiniteNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function toInt(value: unknown) {
  const n = toFiniteNumber(value);
  return n == null ? null : Math.round(n);
}

function toBoundedInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(1, Math.floor(parsed)), max);
}

function parseDetailGroupBy(value: string | null): DetailGroupBy {
  return value === "adGroup" ? "adGroup" : "campaign";
}

function parseDetailDateGranularity(value: string | null): DetailDateGranularity {
  if (value === "week" || value === "month") return value;
  return "day";
}

function dateKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function monthKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

function weekKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60_000);
  const day = kst.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  kst.setUTCDate(kst.getUTCDate() - diffToMonday);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function detailPeriodKey(date: Date, granularity: DetailDateGranularity) {
  if (granularity === "month") return monthKey(date);
  if (granularity === "week") return weekKey(date);
  return dateKey(date);
}

function pickRecordDate(record: {
  reportDate: Date | null;
  reportStart: Date | null;
  createdAt: Date;
}) {
  return record.reportDate ?? record.reportStart ?? record.createdAt;
}

function normalizeRowMetric(row: {
  cost: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}) {
  const cost = row.cost ?? 0;
  const impressions = row.impressions ?? 0;
  const clicks = row.clicks ?? 0;
  const conversions = row.conversions ?? 0;
  return { cost, impressions, clicks, conversions };
}

function withDerivedMetrics<T extends {
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
}>(row: T) {
  return {
    ...row,
    ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0,
    cvr: row.clicks > 0 ? (row.conversions / row.clicks) * 100 : 0,
    cpc: row.clicks > 0 ? row.cost / row.clicks : 0,
    cpm: row.impressions > 0 ? (row.cost / row.impressions) * 1000 : 0,
    costPerConversion: row.conversions > 0 ? row.cost / row.conversions : 0,
  };
}

async function getMembership(workspaceId: string, userId: string) {
  return prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");
  const sourceType = searchParams.get("sourceType");
  const campaignName = searchParams.get("campaignName")?.trim() || null;
  const adGroupName = searchParams.get("adGroupName")?.trim() || null;
  const from = toDate(searchParams.get("from"));
  const to = toDate(searchParams.get("to"));
  const detailGroupBy = parseDetailGroupBy(searchParams.get("detailGroupBy"));
  const detailDateGranularity = parseDetailDateGranularity(searchParams.get("detailDateGranularity"));
  const requestedDetailPeriod = searchParams.get("detailPeriod")?.trim() || null;
  const requestedDetailPage = toBoundedInt(searchParams.get("detailPage"), 1, Number.MAX_SAFE_INTEGER);
  const detailPageSize = toBoundedInt(searchParams.get("detailPageSize"), DEFAULT_DETAIL_PAGE_SIZE, MAX_DETAIL_PAGE_SIZE);

  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId/projectId 필요" }, { status: 400 });
  }

  const membership = await getMembership(workspaceId, user.id);
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const rangeWhere = from || to
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
          {
            reportDate: null,
            reportStart: null,
            reportEnd: null,
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          },
        ],
      }
    : {};

  const mediaSummaryWhere: Prisma.AdPerformanceRecordWhereInput = {
    workspaceId,
    projectId,
    ...rangeWhere,
  };

  const sourceWhere = sourceType && sourceType !== "ALL" ? { sourceType } : {};

  const where: Prisma.AdPerformanceRecordWhereInput = {
    workspaceId,
    projectId,
    ...sourceWhere,
    ...(campaignName ? { campaignName } : {}),
    ...(adGroupName ? { adGroupName } : {}),
    ...rangeWhere,
  };

  const campaignSummaryWhere: Prisma.AdPerformanceRecordWhereInput = {
    workspaceId,
    projectId,
    ...sourceWhere,
    ...rangeWhere,
  };

  const adGroupSummaryWhere: Prisma.AdPerformanceRecordWhereInput = {
    workspaceId,
    projectId,
    ...sourceWhere,
    ...(campaignName ? { campaignName } : {}),
    ...rangeWhere,
  };

  const [records, mediaRecords, campaignRecords, adGroupRecords, batches] = await Promise.all([
    prisma.adPerformanceRecord.findMany({
      where,
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      take: 20_000,
    }),
    prisma.adPerformanceRecord.findMany({
      where: mediaSummaryWhere,
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      take: 20_000,
    }),
    prisma.adPerformanceRecord.findMany({
      where: campaignSummaryWhere,
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      take: 20_000,
    }),
    prisma.adPerformanceRecord.findMany({
      where: adGroupSummaryWhere,
      orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
      take: 20_000,
    }),
    prisma.adPerformanceImportBatch.findMany({
      where: { workspaceId, projectId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { _count: { select: { records: true } } },
    }),
  ]);

  const totals = records.reduce((acc, row) => {
    const metric = normalizeRowMetric(row);
    acc.cost += metric.cost;
    acc.impressions += metric.impressions;
    acc.clicks += metric.clicks;
    acc.conversions += metric.conversions;
    acc.reach += row.reach ?? 0;
    return acc;
  }, { cost: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0 });

  const topCampaignMap = new Map<string, {
    campaignName: string;
    sourceType: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>();

  const topAdGroupMap = new Map<string, {
    campaignName: string;
    adGroupName: string | null;
    sourceType: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>();

  const campaignSummaryMap = new Map<string, {
    campaignName: string;
    sourceType: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>();

  const adGroupSummaryMap = new Map<string, {
    campaignName: string;
    adGroupName: string | null;
    sourceType: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>();

  const sourceMap = new Map<string, {
    sourceType: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>();

  const mediaMap = new Map<string, {
    sourceType: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>();

  const dailyMap = new Map<string, {
    date: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>();

  const detailMap = new Map<string, {
    id: string;
    periodKey: string;
    sourceType: string;
    campaignName: string;
    adGroupName: string | null;
    reportDate: string | null;
    reportStart: string | null;
    cost: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
  }>();
  const detailPeriodSet = new Set<string>();

  for (const row of records) {
    const metric = normalizeRowMetric(row);
    const campaignKey = `${row.sourceType}:${row.campaignName}`;
    const campaign = topCampaignMap.get(campaignKey) ?? {
      campaignName: row.campaignName,
      sourceType: row.sourceType,
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    campaign.cost += metric.cost;
    campaign.impressions += metric.impressions;
    campaign.clicks += metric.clicks;
    campaign.conversions += metric.conversions;
    topCampaignMap.set(campaignKey, campaign);

    const adGroupKey = `${row.sourceType}:${row.campaignName}:${row.adGroupName ?? ""}`;
    const adGroup = topAdGroupMap.get(adGroupKey) ?? {
      campaignName: row.campaignName,
      adGroupName: row.adGroupName,
      sourceType: row.sourceType,
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    adGroup.cost += metric.cost;
    adGroup.impressions += metric.impressions;
    adGroup.clicks += metric.clicks;
    adGroup.conversions += metric.conversions;
    topAdGroupMap.set(adGroupKey, adGroup);

    const source = sourceMap.get(row.sourceType) ?? {
      sourceType: row.sourceType,
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    source.cost += metric.cost;
    source.impressions += metric.impressions;
    source.clicks += metric.clicks;
    source.conversions += metric.conversions;
    sourceMap.set(row.sourceType, source);

    const key = dateKey(pickRecordDate(row));
    const day = dailyMap.get(key) ?? {
      date: key,
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    day.cost += metric.cost;
    day.impressions += metric.impressions;
    day.clicks += metric.clicks;
    day.conversions += metric.conversions;
    dailyMap.set(key, day);

    const periodKey = detailPeriodKey(pickRecordDate(row), detailDateGranularity);
    detailPeriodSet.add(periodKey);
    const detailAdGroupName = detailGroupBy === "adGroup" ? row.adGroupName : null;
    const detailKey = `${periodKey}:${row.sourceType}:${row.campaignName}:${detailAdGroupName ?? ""}`;
    const detail = detailMap.get(detailKey) ?? {
      id: crypto.createHash("sha1").update(detailKey).digest("hex"),
      periodKey,
      sourceType: row.sourceType,
      campaignName: row.campaignName,
      adGroupName: detailAdGroupName,
      reportDate: detailDateGranularity === "day" ? periodKey : null,
      reportStart: periodKey,
      cost: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      conversions: 0,
    };
    detail.cost += metric.cost;
    detail.impressions += metric.impressions;
    detail.reach += row.reach ?? 0;
    detail.clicks += metric.clicks;
    detail.conversions += metric.conversions;
    detailMap.set(detailKey, detail);
  }

  for (const row of mediaRecords) {
    const metric = normalizeRowMetric(row);
    const media = mediaMap.get(row.sourceType) ?? {
      sourceType: row.sourceType,
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    media.cost += metric.cost;
    media.impressions += metric.impressions;
    media.clicks += metric.clicks;
    media.conversions += metric.conversions;
    mediaMap.set(row.sourceType, media);
  }

  for (const row of campaignRecords) {
    const metric = normalizeRowMetric(row);
    const campaignKey = `${row.sourceType}:${row.campaignName}`;
    const campaign = campaignSummaryMap.get(campaignKey) ?? {
      campaignName: row.campaignName,
      sourceType: row.sourceType,
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    campaign.cost += metric.cost;
    campaign.impressions += metric.impressions;
    campaign.clicks += metric.clicks;
    campaign.conversions += metric.conversions;
    campaignSummaryMap.set(campaignKey, campaign);
  }

  for (const row of adGroupRecords) {
    const metric = normalizeRowMetric(row);
    const adGroupKey = `${row.sourceType}:${row.campaignName}:${row.adGroupName ?? ""}`;
    const adGroup = adGroupSummaryMap.get(adGroupKey) ?? {
      campaignName: row.campaignName,
      adGroupName: row.adGroupName,
      sourceType: row.sourceType,
      cost: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    };
    adGroup.cost += metric.cost;
    adGroup.impressions += metric.impressions;
    adGroup.clicks += metric.clicks;
    adGroup.conversions += metric.conversions;
    adGroupSummaryMap.set(adGroupKey, adGroup);
  }

  const sortedDetailPeriods = Array.from(detailPeriodSet).sort((a, b) => b.localeCompare(a));
  const selectedDetailPeriod = requestedDetailPeriod && detailPeriodSet.has(requestedDetailPeriod)
    ? requestedDetailPeriod
    : sortedDetailPeriods[0] ?? null;

  const detailPeriodCounts = new Map<string, number>();
  for (const detail of detailMap.values()) {
    detailPeriodCounts.set(detail.periodKey, (detailPeriodCounts.get(detail.periodKey) ?? 0) + 1);
  }

  const detailRowsAll = Array.from(detailMap.values())
    .filter((row) => !selectedDetailPeriod || row.periodKey === selectedDetailPeriod)
    .map(withDerivedMetrics)
    .sort((a, b) => {
      const dateOrder = b.periodKey.localeCompare(a.periodKey);
      if (dateOrder !== 0) return dateOrder;
      const costOrder = b.cost - a.cost;
      if (costOrder !== 0) return costOrder;
      return a.campaignName.localeCompare(b.campaignName, "ko-KR", { numeric: true });
    });
  const detailTotal = detailRowsAll.length;
  const detailTotalPages = Math.max(1, Math.ceil(detailTotal / detailPageSize));
  const detailPage = Math.min(requestedDetailPage, detailTotalPages);
  const detailStart = (detailPage - 1) * detailPageSize;
  const detailRows = detailRowsAll.slice(detailStart, detailStart + detailPageSize);

  return NextResponse.json({
    totals: withDerivedMetrics(totals),
    sourceSummary: Array.from(sourceMap.values()).map(withDerivedMetrics).sort((a, b) => b.cost - a.cost),
    mediaSummary: Array.from(mediaMap.values()).map(withDerivedMetrics).sort((a, b) => b.cost - a.cost),
    campaignSummary: Array.from(campaignSummaryMap.values()).map(withDerivedMetrics).sort((a, b) => b.cost - a.cost).slice(0, 100),
    adGroupSummary: Array.from(adGroupSummaryMap.values()).map(withDerivedMetrics).sort((a, b) => b.cost - a.cost).slice(0, 100),
    topCampaigns: Array.from(topCampaignMap.values()).map(withDerivedMetrics).sort((a, b) => b.cost - a.cost).slice(0, 50),
    topAdGroups: Array.from(topAdGroupMap.values()).map(withDerivedMetrics).sort((a, b) => b.cost - a.cost).slice(0, 50),
    dailyTrend: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    detailRows,
    detailPeriodOptions: sortedDetailPeriods.map((value) => ({
      value,
      rowCount: detailPeriodCounts.get(value) ?? 0,
    })),
    detailPagination: {
      page: detailPage,
      pageSize: detailPageSize,
      total: detailTotal,
      totalPages: detailTotalPages,
      groupBy: detailGroupBy,
      dateGranularity: detailDateGranularity,
      period: selectedDetailPeriod,
    },
    recentRows: detailRows,
    batches,
  });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const body = await request.json();
    const {
      workspaceId,
      projectId,
      sourceType,
      sourceName,
      fileName,
      reportStart,
      reportEnd,
      rows,
    } = body as {
      workspaceId?: string;
      projectId?: string;
      sourceType?: SourceType;
      sourceName?: string;
      fileName?: string;
      reportStart?: string | null;
      reportEnd?: string | null;
      rows?: ImportRowInput[];
    };

    if (!workspaceId || !projectId || !sourceType || !fileName || !Array.isArray(rows)) {
      return NextResponse.json({ error: "필수 항목 누락" }, { status: 400 });
    }

    if (rows.length < 1) {
      return NextResponse.json({ error: "가져올 성과 row가 없어요" }, { status: 400 });
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({ error: `한 번에 최대 ${MAX_IMPORT_ROWS.toLocaleString()}건까지 가져올 수 있어요` }, { status: 400 });
    }

    const membership = await getMembership(workspaceId, user.id);
    if (!membership || membership.role === "MEMBER") {
      return NextResponse.json({ error: "권한 없음" }, { status: 403 });
    }

    const batchStart = toDate(reportStart);
    const batchEnd = toDate(reportEnd);
    const sanitizedRows = rows
      .map((row) => ({
        ...row,
        campaignName: typeof row.campaignName === "string" ? row.campaignName.trim() : "",
      }))
      .filter((row) => row.campaignName);

    if (!sanitizedRows.length) {
      return NextResponse.json({ error: "캠페인명이 있는 row가 없어요" }, { status: 400 });
    }

    const batch = await prisma.$transaction(async (tx) => {
      const createdBatch = await tx.adPerformanceImportBatch.create({
        data: {
          workspaceId,
          projectId,
          uploadedById: user.id,
          sourceType,
          sourceName: sourceName?.trim() || null,
          fileName,
          rowCount: sanitizedRows.length,
          reportStart: batchStart,
          reportEnd: batchEnd,
        },
      });

      for (let i = 0; i < sanitizedRows.length; i += CREATE_CHUNK_SIZE) {
        const chunk = sanitizedRows.slice(i, i + CREATE_CHUNK_SIZE);
        await tx.adPerformanceRecord.createMany({
          data: chunk.map((row) => ({
            id: crypto.randomUUID(),
            batchId: createdBatch.id,
            workspaceId,
            projectId,
            sourceType,
            campaignName: row.campaignName,
            adGroupName: row.adGroupName?.trim() || null,
            reportDate: toDate(row.reportDate),
            reportStart: toDate(row.reportStart) ?? batchStart,
            reportEnd: toDate(row.reportEnd) ?? batchEnd,
            status: row.status?.trim() || null,
            currency: row.currency?.trim() || null,
            cost: toFiniteNumber(row.cost),
            impressions: toInt(row.impressions),
            reach: toInt(row.reach),
            clicks: toInt(row.clicks),
            cpm: toFiniteNumber(row.cpm),
            cpc: toFiniteNumber(row.cpc),
            ctr: toFiniteNumber(row.ctr),
            conversions: toFiniteNumber(row.conversions),
            costPerConversion: toFiniteNumber(row.costPerConversion),
            conversionRate: toFiniteNumber(row.conversionRate),
            resultType: row.resultType?.trim() || null,
            raw: row.raw ?? {},
          })),
        });
      }

      return createdBatch;
    });

    return NextResponse.json({ batch }, { status: 201 });
  } catch (error) {
    console.error("[ad-performance] import failed", error);
    const message = error instanceof Error ? error.message : "알 수 없는 오류";
    return NextResponse.json({ error: `가져오기 실패: ${message}` }, { status: 500 });
  }
}
