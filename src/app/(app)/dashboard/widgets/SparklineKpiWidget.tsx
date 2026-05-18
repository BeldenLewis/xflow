"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Data {
  value: number;
  points: { date: string; count: number }[];
  previous: number;
  change: number | null;
}

export default function SparklineKpiWidget({ data }: { data: Data }) {
  if (!data) return null;
  const trendUp = (data.change ?? 0) > 0;
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-3xl font-semibold tabular-nums">{data.value.toLocaleString()}</p>
        {data.change !== null && (
          <p className={`text-xs flex items-center gap-1 mt-1 ${trendUp ? "text-emerald-500" : "text-red-500"}`}>
            {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span className="font-medium">{data.change.toFixed(1)}%</span>
            <span className="text-muted-foreground">vs {data.previous}</span>
          </p>
        )}
      </div>
      <div className="flex-1 max-w-[140px] h-12">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.points}>
            <Line type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
