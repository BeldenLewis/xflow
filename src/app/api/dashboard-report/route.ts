import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";

interface ReportFilters {
  sourceId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  attribution?: "last" | "first";
}

interface RequestBody {
  workspaceId: string;
  projectId: string;
  from?: string;
  to?: string;
  filters?: ReportFilters;
}

const KST_OFFSET = 9 * 60 * 60_000;
const DAY_MS = 86_400_000;

type TimedRecord = { createdAt: Date; data: Prisma.JsonValue };

const VISITOR_DIMENSIONS = [
  {
    key: "industry",
    label: "산업/업종",
    candidates: ["industry", "industries", "산업", "업종", "종사 산업", "관심 산업", "관심분야", "관심 분야"],
  },
  {
    key: "role",
    label: "직무/직책",
    candidates: ["jobTitle", "job_title", "position", "role", "title", "직책", "직함", "직급", "직위", "부서", "department", "담당업무"],
  },
  {
    key: "interest",
    label: "관심 분야",
    candidates: ["interest", "interests", "관심", "관심 제품", "관심분야", "관심 분야", "참관목적", "참관 목적", "참관 희망 전시회", "희망 전시회", "전시회", "방문 목적", "visit_purpose"],
  },
  {
    key: "company",
    label: "회사/기관",
    candidates: ["company", "organization", "org", "회사", "소속 회사", "기관", "기관명", "소속"],
  },
] as const;

const TIME_FIELD_CANDIDATES = [
  "createdAt",
  "created_at",
  "created",
  "submittedAt",
  "submitted_at",
  "submitted",
  "submissionTime",
  "submission_time",
  "timestamp",
  "datetime",
  "dateTime",
  "time",
  "date",
  "registeredAt",
  "registered_at",
  "appliedAt",
  "applied_at",
  "응답시간",
  "응답 시간",
  "응답일시",
  "응답 일시",
  "신청일시",
  "신청 일시",
  "신청시간",
  "신청 시간",
  "신청일",
  "신청 일",
  "등록일시",
  "등록 일시",
  "등록시간",
  "등록 시간",
  "등록일",
  "등록 일",
  "접수일시",
  "접수 일시",
  "접수시간",
  "접수 시간",
  "접수일",
  "접수 일",
  "작성일시",
  "작성 일시",
  "작성시간",
  "작성 시간",
  "작성일",
  "작성 일",
  "일시",
  "날짜",
  "시간",
] as const;

function parseDate(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function getKstDayStart(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET);
}

function getUtmColumns(filters?: ReportFilters) {
  const useFirst = filters?.attribution === "first";
  return useFirst
    ? { source: "firstUtmSource", medium: "firstUtmMedium", campaign: "firstUtmCampaign" }
    : { source: "utmSource", medium: "utmMedium", campaign: "utmCampaign" };
}

function buildWhere(params: {
  workspaceId: string;
  projectId: string;
  filters?: ReportFilters;
  from?: Date;
  to?: Date;
  lt?: Date;
}) {
  const { workspaceId, projectId, filters, from, to, lt } = params;
  const utm = getUtmColumns(filters);
  const where: Prisma.CollectRecordWhereInput = { workspaceId, projectId };

  if (filters?.sourceId && filters.sourceId !== "all") where.sourceId = filters.sourceId;
  if (filters?.utmSource) Object.assign(where, { [utm.source]: filters.utmSource });
  if (filters?.utmMedium) Object.assign(where, { [utm.medium]: filters.utmMedium });
  if (filters?.utmCampaign) Object.assign(where, { [utm.campaign]: filters.utmCampaign });
  if (from || to || lt) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
      ...(lt ? { lt } : {}),
    };
  }
  return where;
}

function normalizeKey(key: string) {
  return key.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function hasMeaningfulKstTime(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET);
  return kst.getUTCHours() !== 0 || kst.getUTCMinutes() !== 0 || kst.getUTCSeconds() !== 0 || kst.getUTCMilliseconds() !== 0;
}

function makeKstDateTimeFromParts(params: { year: string | number; month: string | number; day: string | number; hour?: string | number; minute?: string | number; second?: string | number }) {
  const iso = `${params.year}-${String(params.month).padStart(2, "0")}-${String(params.day).padStart(2, "0")}T${String(params.hour ?? 0).padStart(2, "0")}:${String(params.minute ?? 0).padStart(2, "0")}:${String(params.second ?? 0).padStart(2, "0")}+09:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateLike(value: unknown, baseDate?: Date): { date: Date; hasTime: boolean } | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return {
      date: value,
      hasTime: hasMeaningfulKstTime(value),
    };
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const timeOnly = raw.match(/^(오전|오후|AM|PM|am|pm)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeOnly && baseDate) {
    const baseKst = new Date(baseDate.getTime() + KST_OFFSET);
    let hour = Number(timeOnly[2]);
    const minute = Number(timeOnly[3]);
    const second = Number(timeOnly[4] ?? 0);
    const meridiem = timeOnly[1]?.toLowerCase();

    if (meridiem === "오후" || meridiem === "pm") {
      if (hour < 12) hour += 12;
    } else if ((meridiem === "오전" || meridiem === "am") && hour === 12) {
      hour = 0;
    }

    const parsed = makeKstDateTimeFromParts({
      year: baseKst.getUTCFullYear(),
      month: baseKst.getUTCMonth() + 1,
      day: baseKst.getUTCDate(),
      hour,
      minute,
      second,
    });
    if (parsed) return { date: parsed, hasTime: true };
  }

  const hasExplicitZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (hasExplicitZone) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return { date: parsed, hasTime: /\d{1,2}:\d{2}/.test(raw) };
  }

  const dateTime = raw.match(/^(\d{4})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})(?:\s*(?:[T ]|일|\.)\s*)?(?:(오전|오후|AM|PM|am|pm)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dateTime) {
    let hour = dateTime[5] ? Number(dateTime[5]) : 0;
    const minute = dateTime[6] ? Number(dateTime[6]) : 0;
    const second = dateTime[7] ? Number(dateTime[7]) : 0;
    const meridiem = dateTime[4]?.toLowerCase();

    if (meridiem === "오후" || meridiem === "pm") {
      if (hour < 12) hour += 12;
    } else if ((meridiem === "오전" || meridiem === "am") && hour === 12) {
      hour = 0;
    }

    const parsed = makeKstDateTimeFromParts({
      year: dateTime[1],
      month: dateTime[2],
      day: dateTime[3],
      hour,
      minute,
      second,
    });
    if (parsed) {
      return { date: parsed, hasTime: !!dateTime[5] };
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    date: parsed,
    hasTime: /\d{1,2}:\d{2}/.test(raw) || /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw),
  };
}

function resolveEventTime(record: TimedRecord) {
  // 수집 레코드 자체의 createdAt 시간을 메인 기준으로 사용한다.
  // CSV/엑셀 일괄등록에서 createdAt이 날짜만 들어와 KST 00:00이 된 경우에만
  // 원본 데이터의 시간 필드로 보정한다.
  if (hasMeaningfulKstTime(record.createdAt)) return record.createdAt;

  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    const data = record.data as Record<string, unknown>;
    const normalizedCandidates = new Set(TIME_FIELD_CANDIDATES.map(normalizeKey));

    for (const [key, value] of Object.entries(data)) {
      if (!normalizedCandidates.has(normalizeKey(key))) continue;

      const parsed = parseDateLike(value, record.createdAt);
      if (parsed?.hasTime) return parsed.date;
    }
  }

  return record.createdAt;
}

function splitValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(splitValues);
  if (typeof value === "boolean") return value ? ["동의"] : [];
  return String(value)
    .split(/[,;/|、，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickValue(data: Prisma.JsonValue, candidates: readonly string[]) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  const normalizedCandidates = candidates.map(normalizeKey).filter((candidate) => candidate.length > 1);
  const entries = Object.entries(record).map(([key, value]) => ({ key, value, normalizedKey: normalizeKey(key) }));

  for (const candidate of normalizedCandidates) {
    const matched = entries.find(({ normalizedKey }) => (
      normalizedKey === candidate ||
      normalizedKey.includes(candidate) ||
      candidate.includes(normalizedKey)
    ));
    if (matched) return splitValues(matched.value);
  }
  return [];
}

function topEntries(counts: Map<string, number>, limit: number, total?: number) {
  const denominator = total ?? Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, percent: denominator > 0 ? (count / denominator) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function buildHeatmap(records: TimedRecord[]) {
  const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dayTotals = Array(7).fill(0) as number[];
  const hourTotals = Array(24).fill(0) as number[];

  for (const record of records) {
    const eventTime = resolveEventTime(record);
    const kst = new Date(eventTime.getTime() + KST_OFFSET);
    const dayIndex = (kst.getUTCDay() + 6) % 7;
    const hour = kst.getUTCHours();
    matrix[dayIndex][hour] += 1;
    dayTotals[dayIndex] += 1;
    hourTotals[hour] += 1;
  }

  const max = matrix.flat().reduce((peak, count) => Math.max(peak, count), 0);
  const peakDayIndex = dayTotals.reduce((best, count, index) => count > dayTotals[best] ? index : best, 0);
  const peakHour = hourTotals.reduce((best, count, index) => count > hourTotals[best] ? index : best, 0);
  const topSlots = matrix
    .flatMap((row, dayIndex) => row.map((count, hour) => ({ day: dayLabels[dayIndex], hour, count })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    dayLabels,
    matrix,
    max,
    peakDay: { label: dayLabels[peakDayIndex], count: dayTotals[peakDayIndex] ?? 0 },
    peakHour: { hour: peakHour, count: hourTotals[peakHour] ?? 0 },
    topSlots,
  };
}

function getKstDateKey(date: Date) {
  const kst = new Date(date.getTime() + KST_OFFSET);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildCumulativeTrend(records: TimedRecord[], from: Date, to: Date, initialCount: number) {
  const dailyCounts = new Map<string, number>();
  for (const record of records) {
    const key = getKstDateKey(resolveEventTime(record));
    dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + 1);
  }

  const points: Array<{ date: string; label: string; count: number; cumulative: number }> = [];
  let cumulative = initialCount;
  let cursor = getKstDayStart(from);
  const end = getKstDayStart(to);

  while (cursor.getTime() <= end.getTime()) {
    const date = getKstDateKey(cursor);
    const count = dailyCounts.get(date) ?? 0;
    cumulative += count;
    points.push({
      date,
      label: date.slice(5).replace("-", "."),
      count,
      cumulative,
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
  }

  return points;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body: RequestBody = await request.json();
  const { workspaceId, projectId, filters } = body;
  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId, projectId 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return NextResponse.json({ error: "프로젝트 없음" }, { status: 404 });

  const now = new Date();
  const to = parseDate(body.to, now);
  const from = parseDate(body.from, new Date(to.getTime() - 7 * DAY_MS));
  const todayStart = getKstDayStart(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
  const span = Math.max(to.getTime() - from.getTime(), DAY_MS);
  const previousFrom = new Date(from.getTime() - span);

  const baseParams = { workspaceId, projectId, filters };
  const rangeWhere = buildWhere({ ...baseParams, from, to });

  const [yesterdayCount, todayCount, cumulativeCount, rangeCount, previousRangeCount, cumulativeBeforeRange, rangeRecords, heatmapRecords, utmGroups] = await Promise.all([
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: yesterdayStart, lt: todayStart }) }),
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: todayStart, to: now }) }),
    prisma.collectRecord.count({ where: buildWhere(baseParams) }),
    prisma.collectRecord.count({ where: rangeWhere }),
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, from: previousFrom, lt: from }) }),
    prisma.collectRecord.count({ where: buildWhere({ ...baseParams, lt: from }) }),
    prisma.collectRecord.findMany({
      where: rangeWhere,
      select: { data: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.collectRecord.findMany({
      where: rangeWhere,
      select: { createdAt: true, data: true },
      orderBy: { createdAt: "asc" },
      take: 50000,
    }),
    (prisma.collectRecord.groupBy as unknown as (args: {
      by: string[];
      where: Prisma.CollectRecordWhereInput;
      _count: { _all: true };
    }) => Promise<Array<Record<string, string | null> & { _count: { _all: number } }>>)({
      by: [getUtmColumns(filters).source, getUtmColumns(filters).medium, getUtmColumns(filters).campaign],
      where: rangeWhere,
      _count: { _all: true },
    }),
  ]);

  const composition = VISITOR_DIMENSIONS.map((dimension) => {
    const counts = new Map<string, number>();
    for (const record of rangeRecords) {
      for (const value of pickValue(record.data, dimension.candidates)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    const items = topEntries(counts, 5, rangeRecords.length);
    return { key: dimension.key, label: dimension.label, items, total: Array.from(counts.values()).reduce((sum, count) => sum + count, 0) };
  }).filter((section) => section.items.length > 0).slice(0, 4);

  const utmCols = getUtmColumns(filters);
  const utmTotal = utmGroups.reduce((sum, group) => sum + group._count._all, 0);
  const utmTop = utmGroups
    .map((group) => ({
      source: group[utmCols.source] || "(없음)",
      medium: group[utmCols.medium] || "(없음)",
      campaign: group[utmCols.campaign] || "(없음)",
      count: group._count._all,
      percent: utmTotal > 0 ? (group._count._all / utmTotal) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const rangeChange = previousRangeCount > 0 ? ((rangeCount - previousRangeCount) / previousRangeCount) * 100 : null;

  return NextResponse.json({
    generatedAt: now.toISOString(),
    project: { id: project.id, name: project.name },
    performance: {
      yesterdayCount,
      todayCount,
      cumulativeCount,
      rangeCount,
      previousRangeCount,
      rangeChange,
    },
    composition,
    cumulativeTrend: buildCumulativeTrend(heatmapRecords, from, to, cumulativeBeforeRange),
    utmTop,
    heatmap: buildHeatmap(heatmapRecords),
  });
}
