"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiData {
  value: number;
  previous: number | null;
  change: number | null;
}

export default function KpiWidget({ data }: { data: KpiData | null }) {
  if (!data) return null;
  const change = data.change;
  const hasChange = change !== null && data.previous !== null;
  const trendUp = (change ?? 0) > 0;
  const trendDown = (change ?? 0) < 0;

  return (
    <div>
      <p className="text-3xl font-semibold tabular-nums">{data.value.toLocaleString()}</p>
      {hasChange && (
        <p className={`mt-1.5 text-xs flex items-center gap-1 ${
          trendUp ? "text-emerald-500" : trendDown ? "text-red-500" : "text-muted-foreground"
        }`}>
          {trendUp ? <TrendingUp className="w-3 h-3" /> : trendDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
          <span className="font-medium">{change!.toFixed(1)}%</span>
          <span className="text-muted-foreground">vs 이전 기간 ({data.previous!.toLocaleString()})</span>
        </p>
      )}
    </div>
  );
}
