import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

type WidgetType =
  | "kpi"
  | "time_series"
  | "utm_breakdown"
  | "top_n"
  | "field_distribution"
  | "recent_feed";

interface RequestBody {
  workspaceId: string;
  projectId: string;
  type: WidgetType;
  config: Record<string, unknown>;
  from?: string;
  to?: string;
}

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s) return fallback;
  const d = new Date(s);
  return isNaN(d.getTime()) ? fallback : d;
}

function getStringConfig(config: Record<string, unknown>, key: string): string | undefined {
  const v = config[key];
  return typeof v === "string" && v ? v : undefined;
}

function getNumberConfig(config: Record<string, unknown>, key: string, def: number): number {
  const v = config[key];
  return typeof v === "number" && !isNaN(v) ? v : def;
}

// 데이터 범위 빌더
async function recordWhere(projectId: string, config: Record<string, unknown>, from: Date, to: Date) {
  const sourceId = getStringConfig(config, "sourceId");
  return {
    projectId,
    ...(sourceId && sourceId !== "all" ? { sourceId } : {}),
    createdAt: { gte: from, lte: to },
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body: RequestBody = await request.json();
  const { workspaceId, projectId, type, config } = body;
  if (!workspaceId || !projectId || !type) {
    return NextResponse.json({ error: "workspaceId, projectId, type 필요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) return NextResponse.json({ error: "프로젝트 없음" }, { status: 404 });

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 86400_000);
  const from = parseDate(body.from, defaultFrom);
  const to = parseDate(body.to, now);

  const where = await recordWhere(projectId, config ?? {}, from, to);

  switch (type) {
    case "kpi": {
      const total = await prisma.collectRecord.count({ where });
      let previous: number | null = null;
      if (config?.compareWithPrevious) {
        const span = to.getTime() - from.getTime();
        const prevFrom = new Date(from.getTime() - span);
        const prevTo = from;
        previous = await prisma.collectRecord.count({
          where: { ...where, createdAt: { gte: prevFrom, lt: prevTo } },
        });
      }
      const change = previous !== null && previous > 0
        ? ((total - previous) / previous) * 100
        : null;
      return NextResponse.json({ value: total, previous, change });
    }

    case "time_series": {
      const granularity = (getStringConfig(config ?? {}, "granularity") ?? "day") as "hour" | "day" | "week";
      const records = await prisma.collectRecord.findMany({
        where,
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      const points = bucketize(records.map((r) => r.createdAt), granularity, from, to);
      return NextResponse.json({ points, granularity });
    }

    case "utm_breakdown": {
      const dimension = (getStringConfig(config ?? {}, "dimension") ?? "utmSource") as string;
      // 허용된 컬럼만 query 에 사용
      const ALLOWED = new Set([
        "utmSource", "utmMedium", "utmCampaign", "utmTerm", "utmContent",
        "firstUtmSource", "firstUtmMedium", "firstUtmCampaign", "firstUtmTerm", "firstUtmContent",
      ]);
      const safeDim = ALLOWED.has(dimension) ? dimension : "utmSource";
      const records = await prisma.collectRecord.findMany({
        where,
        select: { [safeDim]: true } as never,
      }) as unknown as Array<Record<string, string | null>>;

      const counts = new Map<string, number>();
      for (const r of records) {
        const v = (r[safeDim] ?? "").trim() || "(없음)";
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const total = records.length;
      const items = Array.from(counts.entries())
        .map(([key, count]) => ({ key, count, percent: total > 0 ? (count / total) * 100 : 0 }))
        .sort((a, b) => b.count - a.count);
      return NextResponse.json({ items, total });
    }

    case "top_n": {
      const dimension = (getStringConfig(config ?? {}, "dimension") ?? "utmCampaign") as string;
      const topN = getNumberConfig(config ?? {}, "topN", 5);

      let valueExtractor: (r: Record<string, unknown>) => string;
      if (dimension.startsWith("data.")) {
        const fieldKey = dimension.slice(5);
        valueExtractor = (r) => {
          const data = (r.data ?? {}) as Record<string, unknown>;
          const v = data[fieldKey];
          return v == null ? "" : String(v);
        };
      } else {
        valueExtractor = (r) => {
          const v = r[dimension];
          return v == null ? "" : String(v);
        };
      }

      const records = await prisma.collectRecord.findMany({
        where,
        select: {
          data: true,
          utmSource: true, utmMedium: true, utmCampaign: true, utmTerm: true, utmContent: true,
          firstUtmSource: true, firstUtmMedium: true, firstUtmCampaign: true, firstUtmTerm: true, firstUtmContent: true,
          referrer: true,
        },
      });
      const counts = new Map<string, number>();
      for (const r of records) {
        const v = valueExtractor(r as Record<string, unknown>).trim();
        if (!v) continue;
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const items = Array.from(counts.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);
      return NextResponse.json({ items });
    }

    case "field_distribution": {
      const fieldKey = getStringConfig(config ?? {}, "field");
      if (!fieldKey) {
        return NextResponse.json({ items: [], error: "field 설정 필요" });
      }
      const records = await prisma.collectRecord.findMany({
        where,
        select: { data: true },
      });
      const counts = new Map<string, number>();
      for (const r of records) {
        const data = (r.data ?? {}) as Record<string, unknown>;
        const raw = data[fieldKey];
        if (raw == null) continue;
        // 콤마/쉼표로 구분된 다중 선택값도 분리
        const values = String(raw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
        for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
      const items = Array.from(counts.entries())
        .map(([key, count]) => ({ key, count, percent: total > 0 ? (count / total) * 100 : 0 }))
        .sort((a, b) => b.count - a.count);
      return NextResponse.json({ items, total });
    }

    case "recent_feed": {
      const limit = getNumberConfig(config ?? {}, "limit", 10);
      const records = await prisma.collectRecord.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(limit, 1), 50),
        include: { source: { select: { id: true, name: true } } },
      });
      return NextResponse.json({ items: records });
    }

    default:
      return NextResponse.json({ error: "지원하지 않는 위젯 타입" }, { status: 400 });
  }
}

// 시계열 버킷화: KST 기준 day/hour/week 로 그룹핑
function bucketize(dates: Date[], granularity: "hour" | "day" | "week", from: Date, to: Date) {
  const KST_OFFSET = 9 * 60 * 60_000;
  const buckets = new Map<string, number>();

  const bucketKey = (d: Date): string => {
    const kst = new Date(d.getTime() + KST_OFFSET);
    if (granularity === "hour") {
      return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")} ${String(kst.getUTCHours()).padStart(2, "0")}:00`;
    }
    if (granularity === "week") {
      // ISO week 시작(월요일) KST 기준
      const dow = kst.getUTCDay() || 7;
      const monday = new Date(kst.getTime() - (dow - 1) * 86400_000);
      return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`;
    }
    // day
    return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  };

  // 미리 모든 버킷을 0으로 채워서 빈 구간도 표시
  const fillBuckets = () => {
    const start = new Date(from.getTime());
    const step = granularity === "hour" ? 3600_000 : granularity === "week" ? 7 * 86400_000 : 86400_000;
    for (let t = start.getTime(); t <= to.getTime(); t += step) {
      buckets.set(bucketKey(new Date(t)), 0);
    }
  };
  fillBuckets();

  for (const d of dates) {
    const k = bucketKey(d);
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
    else buckets.set(k, 1);
  }

  return Array.from(buckets.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
