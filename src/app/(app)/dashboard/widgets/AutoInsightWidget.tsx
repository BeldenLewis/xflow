"use client";

interface Insight {
  type: "up" | "down" | "new" | "gone";
  label: string;
  detail: string;
  change: number | null;
}

const COLOR: Record<Insight["type"], string> = {
  up:   "border-emerald-500/30 bg-emerald-500/5",
  down: "border-amber-500/30 bg-amber-500/5",
  new:  "border-violet-500/30 bg-violet-500/5",
  gone: "border-red-500/30 bg-red-500/5",
};

export default function AutoInsightWidget({ insights }: { insights: Insight[] }) {
  if (!insights || insights.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">큰 변화 없음 — 모든 채널이 안정적이에요</div>;
  }
  return (
    <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
      {insights.map((it, i) => (
        <div key={i} className={`px-3 py-2 rounded-lg border ${COLOR[it.type]}`}>
          <p className="text-xs font-medium">{it.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{it.detail}</p>
        </div>
      ))}
    </div>
  );
}
