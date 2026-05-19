import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dashboardCache } from "@/lib/cache";
import { rateLimit } from "@/lib/ratelimit";
import { createHash } from "node:crypto";

// 공유된 보드에서 위젯 데이터 가져오기 (토큰으로 인증)
// 보안: 토큰이 유효해야만 해당 보드 + 그 보드 projectId 의 데이터만 조회 가능
// 이 핸들러는 dashboard-data 의 일부 로직을 재사용하지만 토큰 기반.

export async function POST(request: Request) {
  const body = await request.json();
  const { token, type, config, from, to, filters } = body;

  if (!token || typeof token !== "string" || token.length < 32 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return NextResponse.json({ error: "토큰 형식 오류" }, { status: 401 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  const rl = rateLimit(`share-data:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "요청이 너무 잦아요" }, { status: 429 });
  }

  const dashboard = await prisma.dashboard.findUnique({
    where: { shareToken: token },
    select: { id: true, projectId: true, workspaceId: true, shareEnabled: true, widgets: { select: { id: true, type: true, config: true } } },
  });
  if (!dashboard || !dashboard.shareEnabled) {
    return NextResponse.json({ error: "공유가 비활성화됐어요" }, { status: 403 });
  }

  // 유효성: 요청한 type/config 가 이 보드 위젯 중 하나여야 함 (보호)
  // 위젯이 정확히 같진 않을 수 있으니, 적어도 type 이 보드 안에 존재해야 함
  const hasMatchingWidget = dashboard.widgets.some((w) => w.type === type);
  if (!hasMatchingWidget) {
    return NextResponse.json({ error: "위젯이 이 보드에 존재하지 않아요" }, { status: 403 });
  }

  // dashboard-data 라우트에 위임하지 않고 직접 처리. 일관성 위해 내부 fetch.
  const internalReq = new Request("http://internal/api/dashboard-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: dashboard.workspaceId,
      projectId: dashboard.projectId,
      type, config, from, to, filters,
    }),
  });

  // 토큰 기반이므로 dashboard-data 의 auth 를 통과시킬 수 없음.
  // 따라서 일부 집계 로직을 인라인으로 호출하는 대신 cache + 직접 query 처리.
  // 간단히: dashboard-data 의 핵심 일부만 재구현하면 코드 중복.
  // 실용적 절충: 토큰 검증 후 내부 RPC 로 인증 우회 헤더 사용.
  // 여기서는 가장 안전한 길 — 직접 query.
  void internalReq;

  // ── 인라인 집계 (dashboard-data 와 동일 로직 일부) ──
  const parseDate = (s: string | undefined, fallback: Date): Date => {
    if (!s) return fallback;
    const d = new Date(s);
    return isNaN(d.getTime()) ? fallback : d;
  };
  const now = new Date();
  const fromD = parseDate(from, new Date(now.getTime() - 30 * 86400_000));
  const toD = parseDate(to, now);

  const cacheKey = "pub:" + createHash("sha1").update(JSON.stringify({
    token, type, config, from: fromD.toISOString(), to: toD.toISOString(), filters,
  })).digest("hex");
  const cached = dashboardCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  const where: Record<string, unknown> = {
    projectId: dashboard.projectId,
    createdAt: { gte: fromD, lte: toD },
  };
  const c = (config ?? {}) as Record<string, unknown>;
  const sourceId = typeof c.sourceId === "string" && c.sourceId !== "all" ? c.sourceId : undefined;
  if (sourceId) where.sourceId = sourceId;

  let payload: unknown = null;
  // 일부 위젯만 지원 (간단형 — 보안상 복잡한 위젯은 비공개)
  if (type === "kpi") {
    const total = await prisma.collectRecord.count({ where });
    payload = { value: total, previous: null, change: null };
  } else if (type === "time_series") {
    const records = await prisma.collectRecord.findMany({ where, select: { createdAt: true } });
    const KST = 9 * 60 * 60_000;
    const buckets = new Map<string, number>();
    for (let t = fromD.getTime(); t <= toD.getTime(); t += 86400_000) {
      const k = new Date(t + KST).toISOString().slice(0, 10);
      buckets.set(k, 0);
    }
    for (const r of records) {
      const k = new Date(r.createdAt.getTime() + KST).toISOString().slice(0, 10);
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    }
    payload = {
      points: Array.from(buckets.entries()).map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
      granularity: "day",
    };
  } else {
    return NextResponse.json({ error: "이 위젯은 공개 보드에서 지원하지 않아요" }, { status: 400 });
  }

  dashboardCache.set(cacheKey, payload);
  return NextResponse.json(payload);
}
