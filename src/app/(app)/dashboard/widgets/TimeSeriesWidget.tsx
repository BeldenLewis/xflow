"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Point {
  date: string;
  count: number;
}

interface Props {
  points: Point[];
  prevPoints?: Point[] | null;
  granularity: string;
}

export default function TimeSeriesWidget({ points, prevPoints, granularity }: Props) {
  if (!points || points.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">데이터 없음</div>;
  }

  // 이전 기간을 같은 x축에 매핑하기 위해 date 키로 merge
  const merged = points.map((p, i) => ({
    date: p.date,
    current: p.count,
    previous: prevPoints?.[i]?.count ?? null,
  }));

  const formatTick = (s: string) => {
    if (granularity === "hour") return s.slice(11, 16);
    return s.slice(5);
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={merged} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis dataKey="date" tickFormatter={formatTick} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.5rem",
            fontSize: "11px",
          }}
        />
        {prevPoints && (
          <Legend
            wrapperStyle={{ fontSize: "10px", paddingTop: "4px" }}
            iconType="line"
            formatter={(v) => v === "current" ? "이번 기간" : "이전 기간"}
          />
        )}
        <Line type="monotone" dataKey="current" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        {prevPoints && (
          <Line type="monotone" dataKey="previous" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
