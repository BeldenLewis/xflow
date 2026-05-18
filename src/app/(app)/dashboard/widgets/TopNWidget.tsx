"use client";

interface Item {
  key: string;
  count: number;
}

export default function TopNWidget({ items }: { items: Item[] }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">데이터 없음</div>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={item.key} className="flex items-center gap-2">
          <span className="w-5 text-center text-[11px] font-mono text-muted-foreground shrink-0">{i + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xs truncate flex-1" title={item.key}>{item.key}</span>
              <span className="text-xs font-medium tabular-nums">{item.count.toLocaleString()}</span>
            </div>
            <div className="mt-0.5 h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all"
                style={{ width: `${(item.count / max) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
