"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Edit3, Eye, RefreshCw, Loader2, LayoutDashboard, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import DateRangePicker, { DateRange } from "./DateRangePicker";
import WidgetShell from "./widgets/WidgetShell";
import WidgetConfigModal from "./widgets/WidgetConfigModal";
import KpiWidget from "./widgets/KpiWidget";
import TimeSeriesWidget from "./widgets/TimeSeriesWidget";
import BreakdownWidget from "./widgets/BreakdownWidget";
import TopNWidget from "./widgets/TopNWidget";
import RecentFeedWidget from "./widgets/RecentFeedWidget";
import { Widget, WidgetWidth, SourceOption, WIDGET_CATALOG } from "./widgets/types";
import { kstDateString } from "@/lib/datetime";

const AUTO_REFRESH_MS = 30_000;

function defaultRange(): DateRange {
  const ks = kstDateString(new Date());
  const today = new Date(ks + "T00:00:00+09:00");
  const from = new Date(today.getTime() - 7 * 86400_000);
  const to = new Date(today.getTime() + 86400_000 - 1);
  return { from, to, label: "최근 7일" };
}

export default function DashboardPage() {
  const { workspace, currentProject, isLoading: wsLoading } = useWorkspace();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [editing, setEditing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({});
  const [widgetLoading, setWidgetLoading] = useState<Record<string, boolean>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  // 소스 + 위젯 로드
  const fetchAll = useCallback(async () => {
    if (!workspace || !currentProject) return;
    setLoading(true);
    try {
      const [wRes, sRes] = await Promise.all([
        fetch(`/api/dashboard-widgets?workspaceId=${workspace.id}&projectId=${currentProject.id}`),
        fetch(`/api/collect-sources?workspaceId=${workspace.id}&projectId=${currentProject.id}`),
      ]);
      const wData = await wRes.json();
      const sData = await sRes.json();
      setWidgets(wData.widgets ?? []);
      setSources((sData.sources ?? []).map((s: { id: string; name: string; fieldMappings?: { key: string; label: string }[] }) => ({
        id: s.id,
        name: s.name,
        fields: s.fieldMappings ?? [],
      })));
    } finally {
      setLoading(false);
    }
  }, [workspace, currentProject]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // 위젯 데이터 fetch
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
        }),
      });
      const data = await res.json();
      setWidgetData((m) => ({ ...m, [widget.id]: data }));
    } finally {
      setWidgetLoading((m) => ({ ...m, [widget.id]: false }));
    }
  }, [workspace, currentProject, range]);

  // 위젯이나 기간이 바뀌면 모든 위젯 갱신
  useEffect(() => {
    widgets.forEach((w) => fetchWidgetData(w));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets, range, refreshTick]);

  // 자동 새로고침 (편집 모드 아닐 때)
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
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ width }),
    });
    if (!res.ok) { toast.error("너비 변경 실패"); return; }
    setWidgets((ws) => ws.map((w) => w.id === widget.id ? { ...w, width } : w));
  };

  const renderWidgetBody = (w: Widget) => {
    const data = widgetData[w.id] as Record<string, unknown> | undefined;
    if (!data) return <div className="text-xs text-muted-foreground">데이터 로딩 중...</div>;
    switch (w.type) {
      case "kpi":
        return <KpiWidget data={data as never} />;
      case "time_series":
        return <TimeSeriesWidget points={(data.points as never[]) ?? []} granularity={(data.granularity as string) ?? "day"} />;
      case "utm_breakdown":
        return <BreakdownWidget
          items={(data.items as never[]) ?? []}
          chartType={(w.config.chartType as "donut" | "bar") ?? "donut"}
          total={(data.total as number) ?? 0}
        />;
      case "top_n":
        return <TopNWidget items={(data.items as never[]) ?? []} />;
      case "field_distribution":
        return <BreakdownWidget
          items={(data.items as never[]) ?? []}
          chartType="bar"
          total={(data.total as number) ?? 0}
        />;
      case "recent_feed":
        return <RecentFeedWidget items={(data.items as never[]) ?? []} />;
      default:
        return null;
    }
  };

  const hasWidgets = widgets.length > 0;

  // 빠른 시작: 기본 위젯 4개 자동 생성
  const handleQuickStart = async () => {
    if (!workspace || !currentProject) return;
    const presets = [
      { type: "kpi" as const, title: "총 제출 수", config: { sourceId: "all", compareWithPrevious: true }, width: "third" as const },
      { type: "kpi" as const, title: "UTM 유입 비율", config: { sourceId: "all" }, width: "third" as const },
      { type: "kpi" as const, title: "활성 소스 수", config: { sourceId: "all" }, width: "third" as const },
      { type: "time_series" as const, title: "일자별 제출 추이", config: { sourceId: "all", granularity: "day" }, width: "full" as const },
      { type: "utm_breakdown" as const, title: "UTM 소스별 분포", config: { sourceId: "all", dimension: "utmSource", chartType: "donut" }, width: "half" as const },
      { type: "top_n" as const, title: "TOP 5 캠페인", config: { sourceId: "all", dimension: "utmCampaign", topN: 5 }, width: "half" as const },
      { type: "recent_feed" as const, title: "최근 제출", config: { sourceId: "all", limit: 10 }, width: "half" as const },
    ];
    let failed = 0;
    for (const p of presets) {
      const res = await fetch("/api/dashboard-widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: currentProject.id,
          ...p,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[quickstart] widget create failed:", p.title, res.status, err);
        failed++;
      }
    }
    if (failed > 0) toast.error(`${failed}개 위젯 추가 실패. 콘솔을 확인하세요`);
    else toast.success("기본 위젯이 추가됐어요. 이제 자유롭게 편집하세요");
    fetchAll();
  };

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

  return (
    <div className="p-8 space-y-6">
      {/* 헤더 */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">{currentProject.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            onClick={() => setRefreshTick((t) => t + 1)}
            className="p-1.5 rounded-xl border border-border hover:bg-secondary transition-colors text-muted-foreground"
            title="새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setEditing((e) => !e)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${
              editing
                ? "border-violet-500 bg-violet-500 text-white"
                : "border-border bg-background hover:bg-secondary"
            }`}
          >
            {editing ? <><Eye className="w-3.5 h-3.5" />보기 모드</> : <><Edit3 className="w-3.5 h-3.5" />편집 모드</>}
          </button>
          <button
            onClick={() => { if (!editing) setEditing(true); setShowAddModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />위젯 추가
          </button>
        </div>
      </div>

      {/* 위젯 그리드 */}
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
            <button
              onClick={handleQuickStart}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />기본 보드로 시작
            </button>
            <button
              onClick={() => { setEditing(true); setShowAddModal(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />빈 보드에서 시작
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          {widgets.map((w) => (
            <WidgetShell
              key={w.id}
              widget={w}
              loading={widgetLoading[w.id]}
              editing={editing}
              onEdit={() => setEditingWidget(w)}
              onDelete={() => handleDelete(w)}
              onResize={(width) => handleResize(w, width)}
            >
              {renderWidgetBody(w)}
            </WidgetShell>
          ))}
        </div>
      )}

      {showAddModal && workspace && currentProject && (
        <WidgetConfigModal
          mode="create"
          workspaceId={workspace.id}
          projectId={currentProject.id}
          sources={sources}
          onClose={() => setShowAddModal(false)}
          onSaved={fetchAll}
        />
      )}

      {editingWidget && workspace && currentProject && (
        <WidgetConfigModal
          mode="edit"
          workspaceId={workspace.id}
          projectId={currentProject.id}
          sources={sources}
          initialWidget={editingWidget}
          onClose={() => setEditingWidget(null)}
          onSaved={fetchAll}
        />
      )}
    </div>
  );
}
