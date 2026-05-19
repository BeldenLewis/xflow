"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Plus, Edit3, Eye, RefreshCw, Loader2, LayoutDashboard, Sparkles, Filter, X, Copy } from "lucide-react";
import { toast } from "sonner";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useWorkspace } from "@/contexts/workspace";
import DateRangePicker, { DateRange } from "./DateRangePicker";
import WidgetShell from "./widgets/WidgetShell";
import WidgetConfigModal from "./widgets/WidgetConfigModal";
import KpiWidget from "./widgets/KpiWidget";
import TimeSeriesWidget from "./widgets/TimeSeriesWidget";
import BreakdownWidget from "./widgets/BreakdownWidget";
import TopNWidget from "./widgets/TopNWidget";
import RecentFeedWidget from "./widgets/RecentFeedWidget";
import PerformanceTableWidget from "./widgets/PerformanceTableWidget";
import HeatmapWidget from "./widgets/HeatmapWidget";
import GaugeWidget from "./widgets/GaugeWidget";
import SparklineKpiWidget from "./widgets/SparklineKpiWidget";
import FunnelWidget from "./widgets/FunnelWidget";
import AutoInsightWidget from "./widgets/AutoInsightWidget";
import BoardTabs, { DashboardSummary } from "./BoardTabs";
import ShareModal from "./ShareModal";
import ReportsModal from "./ReportsModal";
import { Widget, WidgetWidth, SourceOption, DashboardFilters } from "./widgets/types";
import { formatKstDateTime, kstDateString } from "@/lib/datetime";

const AUTO_REFRESH_MS = 30_000;

function defaultRange(): DateRange {
  const ks = kstDateString(new Date());
  const today = new Date(ks + "T00:00:00+09:00");
  const from = new Date(today.getTime() - 7 * 86400_000);
  const to = new Date(today.getTime() + 86400_000 - 1);
  return { from, to, label: "최근 7일" };
}

// 위젯 데이터로 CSV 만들기 (위젯 타입별)
function widgetToCsv(widget: Widget, data: unknown): { filename: string; csv: string } | null {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines: string[][] = [];
  const d = data as Record<string, unknown>;
  switch (widget.type) {
    case "time_series": {
      const points = (d?.points ?? []) as { date: string; count: number }[];
      const prev = (d?.prevPoints ?? null) as { date: string; count: number }[] | null;
      lines.push(prev ? ["date", "current", "previous"] : ["date", "count"]);
      points.forEach((p, i) => {
        if (prev) lines.push([p.date, String(p.count), String(prev[i]?.count ?? 0)]);
        else lines.push([p.date, String(p.count)]);
      });
      break;
    }
    case "utm_breakdown":
    case "field_distribution": {
      const items = (d?.items ?? []) as { key: string; count: number; percent?: number }[];
      lines.push(["키", "건수", "비중(%)"]);
      items.forEach((i) => lines.push([i.key, String(i.count), (i.percent ?? 0).toFixed(2)]));
      break;
    }
    case "top_n": {
      const items = (d?.items ?? []) as { key: string; count: number }[];
      lines.push(["순위", "키", "건수"]);
      items.forEach((i, idx) => lines.push([String(idx + 1), i.key, String(i.count)]));
      break;
    }
    case "performance_table": {
      const items = (d?.items ?? []) as { display: string; count: number; previous: number; change: number | null; share: number }[];
      lines.push(["항목", "이번", "이전", "변화(%)", "비중(%)"]);
      items.forEach((i) => lines.push([
        i.display, String(i.count), String(i.previous),
        i.change === null ? "" : i.change.toFixed(2), i.share.toFixed(2),
      ]));
      break;
    }
    case "heatmap": {
      const matrix = (d?.matrix ?? []) as number[][];
      const days = ["월", "화", "수", "목", "금", "토", "일"];
      lines.push(["요일/시", ...Array.from({ length: 24 }, (_, h) => `${h}시`)]);
      matrix.forEach((row, i) => lines.push([days[i], ...row.map(String)]));
      break;
    }
    case "recent_feed": {
      const items = (d?.items ?? []) as { id: string; createdAt: string; data: Record<string, string>; utmSource: string | null; utmMedium: string | null }[];
      lines.push(["시각", "UTM 소스", "UTM 매체", "데이터(JSON)"]);
      items.forEach((it) => lines.push([
        formatKstDateTime(it.createdAt), it.utmSource ?? "", it.utmMedium ?? "", JSON.stringify(it.data ?? {}),
      ]));
      break;
    }
    default:
      return null;
  }
  const csv = lines.map((l) => l.map(esc).join(",")).join("\r\n");
  const safe = widget.title.replace(/[^a-zA-Z0-9가-힣_-]+/g, "_");
  const filename = `${safe}_${kstDateString()}.csv`;
  return { filename, csv: "﻿" + csv };
}

// 정렬 가능한 셸 래퍼
function SortableWidget({ widget, children, editing }: { widget: Widget; children: React.ReactNode; editing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !editing });
  const widthClass = widget.width === "full" ? "col-span-12" : widget.width === "third" ? "col-span-12 md:col-span-6 lg:col-span-4" : "col-span-12 md:col-span-6";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className={widthClass}
      {...attributes}
      {...(editing ? listeners : {})}
    >
      {children}
    </div>
  );
}

export default function DashboardPage() {
  const { workspace, currentProject, isLoading: wsLoading } = useWorkspace();
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [activeDashboardId, setActiveDashboardId] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [editing, setEditing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [shareDashboard, setShareDashboard] = useState<DashboardSummary | null>(null);
  const [reportsDashboard, setReportsDashboard] = useState<DashboardSummary | null>(null);
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({});
  const [widgetLoading, setWidgetLoading] = useState<Record<string, boolean>>({});
  const [widgetUpdatedAt, setWidgetUpdatedAt] = useState<Record<string, string>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  // 글로벌 필터
  const [filters, setFilters] = useState<DashboardFilters>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // 보드 목록 + 소스 목록
  const fetchBoards = useCallback(async () => {
    if (!workspace || !currentProject) return;
    const [dRes, sRes] = await Promise.all([
      fetch(`/api/dashboards?workspaceId=${workspace.id}&projectId=${currentProject.id}`),
      fetch(`/api/collect-sources?workspaceId=${workspace.id}&projectId=${currentProject.id}`),
    ]);
    const dData = await dRes.json().catch(() => ({}));
    const sData = await sRes.json().catch(() => ({}));
    const list: DashboardSummary[] = dData.dashboards ?? [];
    setDashboards(list);
    setSources((sData.sources ?? []).map((s: { id: string; name: string; fieldMappings?: { key: string; label: string }[] }) => ({
      id: s.id, name: s.name, fields: s.fieldMappings ?? [],
    })));
    // 활성 보드 유지하거나 첫 번째로
    setActiveDashboardId((prev) => {
      if (prev && list.find((d) => d.id === prev)) return prev;
      return list[0]?.id ?? null;
    });
  }, [workspace, currentProject]);

  // 활성 보드의 위젯
  const fetchWidgets = useCallback(async () => {
    if (!workspace || !currentProject || !activeDashboardId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard-widgets?workspaceId=${workspace.id}&projectId=${currentProject.id}&dashboardId=${activeDashboardId}`);
      const data = await res.json().catch(() => ({}));
      setWidgets(data.widgets ?? []);
    } finally {
      setLoading(false);
    }
  }, [workspace, currentProject, activeDashboardId]);

  const fetchAll = useCallback(async () => {
    await fetchBoards();
  }, [fetchBoards]);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);
  useEffect(() => { fetchWidgets(); }, [fetchWidgets]);

  const fetchWidgetData = useCallback(async (widget: Widget) => {
    if (!workspace || !currentProject) return;
    setWidgetLoading((m) => ({ ...m, [widget.id]: true }));
    try {
      const res = await fetch("/api/dashboard-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: currentProject.id,
          type: widget.type,
          config: widget.config,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          filters,
        }),
      });
      const data = await res.json();
      setWidgetData((m) => ({ ...m, [widget.id]: data }));
      setWidgetUpdatedAt((m) => ({ ...m, [widget.id]: new Date().toISOString() }));
    } finally {
      setWidgetLoading((m) => ({ ...m, [widget.id]: false }));
    }
  }, [workspace, currentProject, range, filters]);

  useEffect(() => {
    widgets.forEach((w) => fetchWidgetData(w));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets, range, refreshTick, filters]);

  useEffect(() => {
    if (editing) return;
    const id = setInterval(() => setRefreshTick((t) => t + 1), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [editing]);

  const handleDelete = async (widget: Widget) => {
    if (!confirm(`"${widget.title}" 위젯을 삭제할까요?`)) return;
    const res = await fetch(`/api/dashboard-widgets/${widget.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    toast.success("삭제됐어요");
    fetchAll();
  };

  const handleResize = async (widget: Widget, width: WidgetWidth) => {
    const res = await fetch(`/api/dashboard-widgets/${widget.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width }),
    });
    if (!res.ok) { toast.error("너비 변경 실패"); return; }
    setWidgets((ws) => ws.map((w) => w.id === widget.id ? { ...w, width } : w));
  };

  const handleDuplicate = async (widget: Widget) => {
    if (!workspace || !currentProject) return;
    const res = await fetch("/api/dashboard-widgets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: workspace.id, projectId: currentProject.id,
        dashboardId: activeDashboardId,
        type: widget.type, title: `${widget.title} (복사본)`, config: widget.config, width: widget.width,
      }),
    });
    if (!res.ok) { toast.error("복제 실패"); return; }
    toast.success("위젯이 복제됐어요");
    fetchWidgets();
  };

  const handleExportWidget = (widget: Widget) => {
    const data = widgetData[widget.id];
    if (!data) { toast.error("아직 데이터가 없어요"); return; }
    const out = widgetToCsv(widget, data);
    if (!out) { toast.info("이 위젯은 CSV 내보내기 지원 안 함"); return; }
    const blob = new Blob([out.csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = out.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = widgets.findIndex((w) => w.id === active.id);
    const newIdx = widgets.findIndex((w) => w.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(widgets, oldIdx, newIdx);
    setWidgets(reordered);
    if (!currentProject) return;
    await fetch("/api/dashboard-widgets/reorder", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: currentProject.id, dashboardId: activeDashboardId, order: reordered.map((w) => w.id) }),
    });
  };

  const renderWidgetBody = (w: Widget) => {
    const data = widgetData[w.id] as Record<string, unknown> | undefined;
    if (!data) return <div className="text-xs text-muted-foreground">데이터 로딩 중...</div>;
    switch (w.type) {
      case "kpi":
        return <KpiWidget data={data as never} />;
      case "sparkline_kpi":
        return <SparklineKpiWidget data={data as never} />;
      case "gauge":
        return <GaugeWidget value={(data.value as number) ?? 0} target={(data.target as number) ?? 100} percent={(data.percent as number) ?? 0} />;
      case "time_series":
        return <TimeSeriesWidget
          points={(data.points as never[]) ?? []}
          prevPoints={(data.prevPoints as never[]) ?? null}
          granularity={(data.granularity as string) ?? "day"}
        />;
      case "utm_breakdown":
        return <BreakdownWidget
          items={(data.items as never[]) ?? []}
          chartType={(w.config.chartType as "donut" | "bar") ?? "donut"}
          total={(data.total as number) ?? 0}
        />;
      case "top_n":
        return <TopNWidget items={(data.items as never[]) ?? []} />;
      case "field_distribution":
        return <BreakdownWidget items={(data.items as never[]) ?? []} chartType="bar" total={(data.total as number) ?? 0} />;
      case "performance_table":
        return <PerformanceTableWidget items={(data.items as never[]) ?? []} dimension={(data.dimension as string) ?? ""} />;
      case "heatmap":
        return <HeatmapWidget matrix={(data.matrix as number[][]) ?? []} max={(data.max as number) ?? 0} />;
      case "funnel":
        return <FunnelWidget stages={(data.stages as never[]) ?? []} />;
      case "auto_insight":
        return <AutoInsightWidget insights={(data.insights as never[]) ?? []} />;
      case "recent_feed":
        return <RecentFeedWidget items={(data.items as never[]) ?? []} />;
      default:
        return null;
    }
  };

  const hasWidgets = widgets.length > 0;

  const handleQuickStart = async () => {
    if (!workspace || !currentProject) return;
    const presets = [
      { type: "kpi" as const, title: "총 제출", config: { sourceId: "all", compareWithPrevious: true }, width: "third" as const },
      { type: "sparkline_kpi" as const, title: "추세", config: { sourceId: "all" }, width: "third" as const },
      { type: "gauge" as const, title: "목표 달성", config: { sourceId: "all", target: 100 }, width: "third" as const },
      { type: "time_series" as const, title: "일자별 추이", config: { sourceId: "all", granularity: "day", compareWithPrevious: true }, width: "full" as const },
      { type: "performance_table" as const, title: "캠페인 퍼포먼스", config: { sourceId: "all", dimension: "utmCampaign", topN: 20 }, width: "full" as const },
      { type: "utm_breakdown" as const, title: "UTM 소스 분포", config: { sourceId: "all", dimension: "utmSource", chartType: "donut" }, width: "half" as const },
      { type: "heatmap" as const, title: "요일·시간 히트맵", config: { sourceId: "all" }, width: "half" as const },
      { type: "auto_insight" as const, title: "자동 인사이트", config: { sourceId: "all" }, width: "half" as const },
      { type: "recent_feed" as const, title: "최근 제출", config: { sourceId: "all", limit: 10 }, width: "half" as const },
    ];
    let failed = 0;
    for (const p of presets) {
      const res = await fetch("/api/dashboard-widgets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, projectId: currentProject.id, dashboardId: activeDashboardId, ...p }),
      });
      if (!res.ok) failed++;
    }
    if (failed > 0) toast.error(`${failed}개 실패`); else toast.success("기본 보드가 만들어졌어요");
    fetchWidgets();
  };

  // 필터 옵션
  const filterUtmSources = useMemo(() => {
    // 동적으로 수집된 utm 값들을 받아오긴 어려우니 위젯 데이터로부터 추정
    const s = new Set<string>();
    Object.values(widgetData).forEach((d) => {
      const items = (d as { items?: { key: string }[] })?.items;
      if (Array.isArray(items)) items.forEach((it) => it.key && s.add(it.key));
    });
    return Array.from(s).slice(0, 50);
  }, [widgetData]);

  if (wsLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <LayoutDashboard className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">프로젝트를 먼저 선택해주세요</p>
      </div>
    );
  }

  const hasActiveFilter = !!(filters.sourceId || filters.utmSource || filters.utmMedium || filters.utmCampaign);

  return (
    <div className="p-8 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold">대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">{currentProject.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <button onClick={() => setRefreshTick((t) => t + 1)} className="p-1.5 rounded-xl border border-border hover:bg-secondary transition-colors text-muted-foreground" title="새로고침">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setEditing((e) => !e)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${editing ? "border-violet-500 bg-violet-500 text-white" : "border-border bg-background hover:bg-secondary"}`}>
            {editing ? <><Eye className="w-3.5 h-3.5" />보기</> : <><Edit3 className="w-3.5 h-3.5" />편집</>}
          </button>
          <button onClick={() => { if (!editing) setEditing(true); setShowAddModal(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors">
            <Plus className="w-3.5 h-3.5" />위젯 추가
          </button>
        </div>
      </div>

      {/* 보드 탭 */}
      {workspace && currentProject && dashboards.length > 0 && activeDashboardId && (
        <BoardTabs
          workspaceId={workspace.id}
          projectId={currentProject.id}
          dashboards={dashboards}
          activeId={activeDashboardId}
          onSelect={setActiveDashboardId}
          onChange={fetchBoards}
          onOpenShare={setShareDashboard}
          onOpenReports={setReportsDashboard}
        />
      )}

      {/* 글로벌 필터 바 */}
      {hasWidgets && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl border border-border bg-secondary/20">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">필터</span>
          <select
            value={filters.sourceId ?? "all"}
            onChange={(e) => setFilters((f) => ({ ...f, sourceId: e.target.value === "all" ? undefined : e.target.value }))}
            className="px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
          >
            <option value="all">모든 소스</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input
            type="text"
            placeholder="UTM 소스"
            value={filters.utmSource ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, utmSource: e.target.value || undefined }))}
            list="filter-utm-sources"
            className="px-2 py-1 rounded-lg border border-border bg-background text-xs w-32 focus:outline-none focus:border-violet-400"
          />
          <datalist id="filter-utm-sources">{filterUtmSources.map((v) => <option key={v} value={v} />)}</datalist>
          <input
            type="text"
            placeholder="UTM 매체"
            value={filters.utmMedium ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, utmMedium: e.target.value || undefined }))}
            className="px-2 py-1 rounded-lg border border-border bg-background text-xs w-32 focus:outline-none focus:border-violet-400"
          />
          <input
            type="text"
            placeholder="UTM 캠페인"
            value={filters.utmCampaign ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, utmCampaign: e.target.value || undefined }))}
            className="px-2 py-1 rounded-lg border border-border bg-background text-xs w-40 focus:outline-none focus:border-violet-400"
          />
          <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-background">
            {(["last", "first"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setFilters((f) => ({ ...f, attribution: a }))}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium ${(filters.attribution ?? "last") === a ? "bg-violet-500 text-white" : "text-muted-foreground"}`}
                title={a === "last" ? "최종 유입 (Last touch)" : "최초 유입 (First touch)"}
              >
                {a === "last" ? "Last" : "First"}
              </button>
            ))}
          </div>
          {hasActiveFilter && (
            <button onClick={() => setFilters({ attribution: filters.attribution })} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-1">
              <X className="w-3 h-3" />초기화
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !hasWidgets ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <LayoutDashboard className="w-12 h-12 text-muted-foreground/20 mb-4" />
          <h3 className="text-base font-medium mb-1">아직 위젯이 없어요</h3>
          <p className="text-sm text-muted-foreground mb-5 max-w-md">
            이 프로젝트의 수집 데이터를 한눈에 볼 수 있는 마케팅 대시보드를 만들어보세요
          </p>
          <div className="flex items-center gap-2">
            <button onClick={handleQuickStart} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors">
              <Sparkles className="w-3.5 h-3.5" />기본 보드로 시작
            </button>
            <button onClick={() => { setEditing(true); setShowAddModal(true); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors">
              <Plus className="w-3.5 h-3.5" />빈 보드에서 시작
            </button>
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-12 gap-4">
              {widgets.map((w) => {
                const isLoading = widgetLoading[w.id];
                const hasData = widgetData[w.id] !== undefined;
                return (
                  <SortableWidget key={w.id} widget={w} editing={editing}>
                    <WidgetShell
                      widget={w}
                      // 데이터 있으면 새로고침 중에도 차트 유지 (깜빡임 방지)
                      loading={isLoading && !hasData}
                      refreshing={isLoading && hasData}
                      editing={editing}
                      updatedAt={widgetUpdatedAt[w.id]}
                      onEdit={() => setEditingWidget(w)}
                      onDelete={() => handleDelete(w)}
                      onResize={(width) => handleResize(w, width)}
                      onDuplicate={() => handleDuplicate(w)}
                      onRefresh={() => fetchWidgetData(w)}
                      onExport={() => handleExportWidget(w)}
                    >
                      {renderWidgetBody(w)}
                    </WidgetShell>
                  </SortableWidget>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showAddModal && workspace && currentProject && (
        <WidgetConfigModal
          mode="create"
          workspaceId={workspace.id}
          projectId={currentProject.id}
          dashboardId={activeDashboardId ?? undefined}
          sources={sources}
          onClose={() => setShowAddModal(false)}
          onSaved={fetchWidgets}
        />
      )}
      {editingWidget && workspace && currentProject && (
        <WidgetConfigModal
          mode="edit"
          workspaceId={workspace.id}
          projectId={currentProject.id}
          dashboardId={activeDashboardId ?? undefined}
          sources={sources}
          initialWidget={editingWidget}
          onClose={() => setEditingWidget(null)}
          onSaved={fetchWidgets}
        />
      )}

      {shareDashboard && (
        <ShareModal
          dashboard={shareDashboard}
          onClose={() => setShareDashboard(null)}
          onChange={fetchBoards}
        />
      )}

      {reportsDashboard && (
        <ReportsModal
          dashboardId={reportsDashboard.id}
          dashboardName={reportsDashboard.name}
          onClose={() => setReportsDashboard(null)}
        />
      )}
    </div>
  );
}
