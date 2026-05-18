"use client";

import { formatKstDateTime } from "@/lib/datetime";

interface FeedRecord {
  id: string;
  data: Record<string, string> | unknown;
  utmSource: string | null;
  utmMedium: string | null;
  createdAt: string;
  source?: { id: string; name: string } | null;
}

export default function RecentFeedWidget({ items }: { items: FeedRecord[] }) {
  if (!items || items.length === 0) {
    return <div className="text-xs text-muted-foreground text-center py-8">아직 제출이 없어요</div>;
  }
  return (
    <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
      {items.map((r) => {
        const data = (r.data ?? {}) as Record<string, string>;
        // 첫 1~2개 필드값 보여주기
        const sample = Object.values(data).filter(Boolean).slice(0, 2).join(" · ");
        return (
          <div key={r.id} className="px-3 py-2 rounded-lg border border-border bg-background hover:bg-secondary/30 transition-colors">
            <div className="flex items-baseline gap-2">
              <p className="text-xs flex-1 truncate font-medium">{sample || "(빈 제출)"}</p>
              <span className="text-[10px] text-muted-foreground shrink-0">{formatKstDateTime(r.createdAt).slice(5, 16)}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {r.source && <span className="text-[10px] text-muted-foreground truncate">{r.source.name}</span>}
              {r.utmSource && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500">
                  {r.utmSource}{r.utmMedium ? `·${r.utmMedium}` : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
