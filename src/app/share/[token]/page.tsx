"use client";

import { useState, useEffect, use } from "react";
import { Loader2, LayoutDashboard } from "lucide-react";
import { formatKstDateTime } from "@/lib/datetime";

interface Widget {
  id: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  width: string;
}

interface PublicDashboard {
  id: string;
  name: string;
  description: string | null;
  projectName: string;
  widgets: Widget[];
}

const WIDTH: Record<string, string> = {
  full:  "col-span-12",
  half:  "col-span-12 md:col-span-6",
  third: "col-span-12 md:col-span-6 lg:col-span-4",
};

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [dashboard, setDashboard] = useState<PublicDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [widgetData, setWidgetData] = useState<Record<string, unknown>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/public/dashboard/${token}`);
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "공유된 보드를 찾을 수 없어요"); return; }
        setDashboard(data.dashboard);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // 위젯 데이터 fetch
  useEffect(() => {
    if (!dashboard) return;
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86400_000);
    dashboard.widgets.forEach(async (w) => {
      const res = await fetch("/api/public/dashboard-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token, type: w.type, config: w.config,
          from: from.toISOString(), to: now.toISOString(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      setWidgetData((m) => ({ ...m, [w.id]: data }));
    });
  }, [dashboard, token]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (error || !dashboard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <LayoutDashboard className="w-12 h-12 text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header>
          <p className="text-xs text-muted-foreground">{dashboard.projectName} · 공유된 보드</p>
          <h1 className="text-2xl font-semibold mt-1">{dashboard.name}</h1>
          {dashboard.description && <p className="text-sm text-muted-foreground mt-1">{dashboard.description}</p>}
        </header>

        <div className="grid grid-cols-12 gap-4">
          {dashboard.widgets.map((w) => {
            const data = widgetData[w.id] as Record<string, unknown> | undefined;
            return (
              <div key={w.id} className={`${WIDTH[w.width] ?? "col-span-12"} rounded-2xl border border-border bg-card p-5`}>
                <h3 className="text-sm font-medium mb-3">{w.title}</h3>
                {!data ? (
                  <div className="flex items-center justify-center h-24"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
                ) : (
                  <PublicWidgetBody type={w.type} data={data} />
                )}
              </div>
            );
          })}
        </div>

        <footer className="text-center pt-8 text-[11px] text-muted-foreground">
          이 페이지는 읽기 전용 공유 보드입니다 · 마지막 조회 {formatKstDateTime(new Date().toISOString())} KST
        </footer>
      </div>
    </div>
  );
}

function PublicWidgetBody({ type, data }: { type: string; data: Record<string, unknown> }) {
  if (data.error) return <p className="text-xs text-muted-foreground">{String(data.error)}</p>;
  if (type === "kpi") {
    return <p className="text-3xl font-semibold tabular-nums">{((data.value as number) ?? 0).toLocaleString()}</p>;
  }
  if (type === "time_series") {
    const points = (data.points as { date: string; count: number }[]) ?? [];
    if (points.length === 0) return <p className="text-xs text-muted-foreground">데이터 없음</p>;
    const max = Math.max(...points.map((p) => p.count), 1);
    return (
      <div className="flex items-end gap-0.5 h-32">
        {points.map((p, i) => (
          <div key={i} className="flex-1 bg-violet-500/60 rounded-t-sm" style={{ height: `${(p.count / max) * 100}%` }} title={`${p.date}: ${p.count}`} />
        ))}
      </div>
    );
  }
  return <p className="text-xs text-muted-foreground">이 위젯은 공개 보드에서 지원하지 않아요</p>;
}
