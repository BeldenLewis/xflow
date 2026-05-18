"use client";

import { useState, useMemo } from "react";
import { ArrowUp, ArrowDown, Minus, ArrowUpDown } from "lucide-react";

interface Row {
  key: string;
  display: string;
  count: number;
  previous: number;
  change: number | null;
  share: number;
}

type SortKey = "display" | "count" | "previous" | "change" | "share";

export default function PerformanceTableWidget({ items, dimension }: { items: Row[]; dimension: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? items.filter((i) => i.display.toLowerCase().includes(q) || i.key.toLowerCase().includes(q)) : items;
  }, [items, query]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ko") * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const cycle = (k: SortKey) => {
    if (sortKey !== k) { setSortKey(k); setSortDir("desc"); return; }
    setSortDir((d) => d === "desc" ? "asc" : "desc");
  };

  if (items.length === 0) return <div className="text-xs text-muted-foreground text-center py-8">데이터 없음</div>;

  const dimensionLabel: Record<string, string> = {
    utmCampaign: "캠페인", utmSource: "소스", utmMedium: "매체", utmTerm: "키워드", utmContent: "콘텐츠",
    firstUtmCampaign: "First 캠페인", firstUtmSource: "First 소스", firstUtmMedium: "First 매체",
    sourceId: "수집 소스",
  };

  const Header = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th className={`px-2 py-1.5 text-[11px] font-medium text-muted-foreground ${align === "right" ? "text-right" : "text-left"}`}>
      <button onClick={() => cycle(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label} {sortKey === k ? (sortDir === "desc" ? <ArrowDown className="w-3 h-3 text-violet-500" /> : <ArrowUp className="w-3 h-3 text-violet-500" />) : <ArrowUpDown className="w-3 h-3 text-muted-foreground/40" />}
      </button>
    </th>
  );

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="검색"
        className="w-full mb-2 px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
      />
      <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-secondary/50 sticky top-0 border-b border-border">
            <tr>
              <Header k="display" label={dimensionLabel[dimension] ?? "키"} />
              <Header k="count" label="이번 기간" align="right" />
              <Header k="previous" label="이전 기간" align="right" />
              <Header k="change" label="변화" align="right" />
              <Header k="share" label="비중" align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-2 py-1.5 max-w-[280px] truncate" title={r.display}>{r.display}</td>
                <td className="px-2 py-1.5 text-right font-medium tabular-nums">{r.count.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">{r.previous.toLocaleString()}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${
                  r.change === null ? "text-muted-foreground" : r.change > 0 ? "text-emerald-500" : r.change < 0 ? "text-red-500" : "text-muted-foreground"
                }`}>
                  <span className="inline-flex items-center gap-0.5 justify-end">
                    {r.change === null ? <Minus className="w-3 h-3" /> : r.change > 0 ? <ArrowUp className="w-3 h-3" /> : r.change < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                    {r.change === null ? "신규" : `${r.change > 0 ? "+" : ""}${r.change.toFixed(0)}%`}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">{r.share.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
