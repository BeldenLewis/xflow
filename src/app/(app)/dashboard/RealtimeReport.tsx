"use client";

import { Activity, CalendarDays, Clock3, TrendingUp, Users } from "lucide-react";
import type { ElementType } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatKstDateTime } from "@/lib/datetime";

interface MetricChange {
  rangeChange: number | null;
}

export interface RealtimeReportData {
  generatedAt: string;
  project: { id: string; name: string };
  performance: {
    yesterdayCount: number;
    todayCount: number;
    cumulativeCount: number;
    rangeCount: number;
    previousRangeCount: number;
    rangeChange: number | null;
  };
  composition: Array<{
    key: string;
    label: string;
    total: number;
    items: Array<{ label: string; count: number; percent: number }>;
  }>;
  cumulativeTrend: Array<{
    date: string;
    label: string;
    count: number;
    cumulative: number;
  }>;
  utmTop: Array<{
    source: string;
    medium: string;
    campaign: string;
    count: number;
    percent: number;
  }>;
  heatmap: {
    dayLabels: string[];
    matrix: number[][];
    max: number;
    peakDay: { label: string; count: number };
    peakHour: { hour: number; count: number };
    topSlots: Array<{ day: string; hour: number; count: number }>;
  };
}

interface Props {
  data: RealtimeReportData | null;
  loading: boolean;
  rangeLabel: string;
}

function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "비교 데이터 없음";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function MetricCard({ label, value, helper, icon: Icon }: {
  label: string;
  value: string;
  helper: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className="w-4 h-4 text-violet-500" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function ChangeBadge({ rangeChange }: MetricChange) {
  if (rangeChange === null) {
    return <span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">비교 준비 중</span>;
  }
  const positive = rangeChange >= 0;
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${positive ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
      {formatPercent(rangeChange)}
    </span>
  );
}

function CumulativeLineChart({ points }: { points: RealtimeReportData["cumulativeTrend"] }) {
  if (!points.length) {
    return (
      <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
        누적 추이를 표시할 등록 데이터가 아직 없습니다.
      </div>
    );
  }

  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">누적 등록 추이</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">선택 기간 동안 누적 등록 수가 어떻게 쌓였는지 보여줍니다.</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">기간 증분</p>
          <p className="text-sm font-semibold">{formatNumber(last.cumulative - first.cumulative + first.count)}건</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={points} margin={{ top: 8, right: 10, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.45} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            minTickGap={18}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            formatter={(value, name) => [
              `${formatNumber(Number(value))}건`,
              name === "cumulative" ? "누적 등록" : String(name),
            ]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "0.75rem",
              fontSize: "12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="#8b5cf6"
            strokeWidth={2.5}
            fill="url(#cumulativeGradient)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompositionSection({ section }: { section: RealtimeReportData["composition"][number] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{section.label}</h4>
        <span className="text-xs text-muted-foreground">{formatNumber(section.total)}건</span>
      </div>
      <div className="space-y-1.5">
        {section.items.map((item) => (
          <div key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">{item.label}</span>
                <span className="font-mono text-foreground">{formatNumber(item.count)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div className="h-full rounded-full bg-violet-500/70" style={{ width: `${Math.min(item.percent, 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ heatmap }: { heatmap: RealtimeReportData["heatmap"] }) {
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const gridClass = "grid grid-cols-[24px_repeat(24,minmax(20px,1fr))] gap-1 items-center";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-secondary/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">가장 강한 요일</p>
          <p className="mt-1 text-sm font-medium">{heatmap.peakDay.label}요일 · {formatNumber(heatmap.peakDay.count)}건</p>
        </div>
        <div className="rounded-2xl border border-border bg-secondary/20 px-3 py-2">
          <p className="text-xs text-muted-foreground">가장 강한 시간</p>
          <p className="mt-1 text-sm font-medium">{String(heatmap.peakHour.hour).padStart(2, "0")}시 · {formatNumber(heatmap.peakHour.count)}건</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[660px] space-y-1">
          <div className={gridClass}>
            <span className="text-[10px] text-muted-foreground" aria-hidden="true" />
            {hours.map((hour) => (
              <span
                key={hour}
                className="text-center font-mono text-[9px] leading-none text-muted-foreground"
                title={`${hour}시`}
              >
                {String(hour).padStart(2, "0")}
              </span>
            ))}
          </div>
          {heatmap.matrix.map((row, dayIndex) => (
            <div key={heatmap.dayLabels[dayIndex]} className={gridClass}>
              <span className="text-[10px] text-muted-foreground">{heatmap.dayLabels[dayIndex]}</span>
              {row.map((count, hour) => {
                const opacity = heatmap.max > 0 ? Math.max(0.08, count / heatmap.max) : 0.04;
                return (
                  <span
                    key={`${dayIndex}-${hour}`}
                    title={`${heatmap.dayLabels[dayIndex]} ${hour}시 · ${count}건`}
                    className="h-4 rounded-[4px] bg-violet-500"
                    style={{ opacity }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {heatmap.topSlots.filter((slot) => slot.count > 0).map((slot) => (
          <span key={`${slot.day}-${slot.hour}`} className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">
            {slot.day} {String(slot.hour).padStart(2, "0")}시 · {formatNumber(slot.count)}건
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RealtimeReport({ data, loading, rangeLabel }: Props) {
  if (loading && !data) {
    return (
      <section className="rounded-[28px] border border-border bg-secondary/10 p-6">
        <div className="h-5 w-36 rounded-full bg-secondary animate-pulse" />
        <div className="mt-4 h-16 rounded-2xl bg-secondary animate-pulse" />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="h-28 rounded-2xl bg-secondary animate-pulse" />
          <div className="h-28 rounded-2xl bg-secondary animate-pulse" />
          <div className="h-28 rounded-2xl bg-secondary animate-pulse" />
        </div>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className="space-y-4">
      <div className="rounded-[28px] border border-border bg-secondary/10 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">오늘의 사전등록 흐름</h2>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{rangeLabel}</p>
            <p className="mt-1">업데이트 {formatKstDateTime(data.generatedAt)}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <MetricCard icon={CalendarDays} label="어제 등록 수" value={`${formatNumber(data.performance.yesterdayCount)}건`} helper="KST 기준 전일 00:00-24:00" />
          <MetricCard icon={Activity} label="당일 실시간 등록 수" value={`${formatNumber(data.performance.todayCount)}건`} helper="오늘 00:00부터 현재까지" />
          <MetricCard icon={TrendingUp} label="누적 등록 수" value={`${formatNumber(data.performance.cumulativeCount)}건`} helper="프로젝트 전체 누적" />
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-sm">
          <Clock3 className="w-4 h-4 text-violet-500" />
          <span className="text-muted-foreground">선택 기간 등록</span>
          <span className="font-semibold">{formatNumber(data.performance.rangeCount)}건</span>
          <ChangeBadge rangeChange={data.performance.rangeChange} />
        </div>

        <div className="mt-4">
          <CumulativeLineChart points={data.cumulativeTrend} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[24px] border border-border bg-background p-5">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">주요 관람객 구성</h3>
          </div>
          {data.composition.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2">
              {data.composition.map((section) => <CompositionSection key={section.key} section={section} />)}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              관람객 구성으로 읽을 수 있는 항목이 아직 부족해요. 등록폼의 산업, 직책, 관심 분야 항목이 쌓이면 자동으로 표시됩니다.
            </p>
          )}
        </section>

        <section className="rounded-[24px] border border-border bg-background p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-semibold">최근 유입 UTM TOP 5</h3>
          </div>
          {data.utmTop.length > 0 ? (
            <div className="space-y-2">
              {data.utmTop.map((item, index) => (
                <div key={`${item.source}-${item.medium}-${item.campaign}`} className="rounded-2xl border border-border px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-muted-foreground">#{index + 1}</span>
                      <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-500">{item.source}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{item.medium}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{item.campaign}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{formatNumber(item.count)}건</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full bg-violet-500/70" style={{ width: `${Math.min(item.percent, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              선택한 기간에 UTM 유입 데이터가 아직 없습니다.
            </p>
          )}
        </section>
      </div>

      <section className="rounded-[24px] border border-border bg-background p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock3 className="w-4 h-4 text-violet-500" />
          <h3 className="text-sm font-semibold">요일/시간별 등록 성과</h3>
        </div>
        <Heatmap heatmap={data.heatmap} />
      </section>
    </section>
  );
}
