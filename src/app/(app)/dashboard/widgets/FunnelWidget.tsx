"use client";

interface Stage {
  sourceId: string;
  name: string;
  count: number;
  percentOfTop: number;
  percentOfPrev: number;
}

export default function FunnelWidget({ stages }: { stages: Stage[] }) {
  if (!stages || stages.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">단계 설정이 없어요. 위젯 설정에서 소스 단계를 지정하세요.</div>;
  }
  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div key={s.sourceId}>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs font-medium">{i + 1}. {s.name}</span>
            <span className="text-xs tabular-nums">
              {s.count.toLocaleString()}
              {i > 0 && <span className="ml-1.5 text-muted-foreground">({s.percentOfPrev.toFixed(0)}% 전환)</span>}
            </span>
          </div>
          <div className="h-5 rounded-md bg-secondary overflow-hidden relative">
            <div
              className="h-full rounded-md transition-all"
              style={{
                width: `${Math.max(2, s.percentOfTop)}%`,
                background: `linear-gradient(90deg, #8b5cf6 0%, #a78bfa 100%)`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
