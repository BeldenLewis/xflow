"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Point {
  date: string;
  count: number;
}

export default function TimeSeriesWidget({ points, granularity }: { points: Point[]; granularity: string }) {
  if (!points || points.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">데이터 없음</div>;
  }

  // X축 라벨 줄이기
  const formatTick = (s: string) => {
    if (granularity === "hour") return s.slice(11, 16); // HH:00
    return s.slice(5);    // MM-DD
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
        <XAxis
          dataKey="date"
          tickFormatter={formatTick}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.5rem",
            fontSize: "11px",
          }}
          labelFormatter={(l) => l}
        />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
