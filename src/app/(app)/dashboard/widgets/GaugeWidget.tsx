"use client";

export default function GaugeWidget({ value, target, percent }: { value: number; target: number; percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  const overshoot = percent > 100;
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
        <p className="text-sm text-muted-foreground">/ 목표 {target.toLocaleString()}</p>
      </div>
      <p className={`text-xs mt-1 font-medium ${overshoot ? "text-emerald-500" : clamped >= 80 ? "text-violet-500" : "text-muted-foreground"}`}>
        {percent.toFixed(1)}% {overshoot ? "달성 (목표 초과)" : "달성"}
      </p>
      <div className="mt-3 h-2.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${overshoot ? "bg-emerald-500" : "bg-violet-500"}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
