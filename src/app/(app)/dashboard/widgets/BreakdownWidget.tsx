"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";

const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1", "#84cc16", "#f97316", "#14b8a6"];

interface Item {
  key: string;
  count: number;
  percent?: number;
}

export default function BreakdownWidget({
  items,
  chartType = "donut",
  total = 0,
}: {
  items: Item[];
  chartType?: "bar" | "donut";
  total?: number;
}) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">데이터 없음</div>;
  }

  const shown = items.slice(0, 10);
  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "0.5rem",
    fontSize: "11px",
  };

  if (chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={shown} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="key"
            width={100}
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "hsl(var(--muted))" }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {shown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={180}>
        <PieChart>
          <Pie
            data={shown}
            dataKey="count"
            nameKey="key"
            innerRadius={45}
            outerRadius={70}
            paddingAngle={2}
          >
            {shown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1 text-xs">
        {shown.slice(0, 6).map((it, i) => (
          <div key={it.key} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="flex-1 truncate" title={it.key}>{it.key}</span>
            <span className="text-muted-foreground tabular-nums">
              {it.count} ({total > 0 ? ((it.count / total) * 100).toFixed(0) : 0}%)
            </span>
          </div>
        ))}
        {items.length > 6 && <p className="text-[10px] text-muted-foreground/60 pt-1">외 {items.length - 6}개...</p>}
      </div>
    </div>
  );
}
