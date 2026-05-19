"use client";

import { ReactNode, useState } from "react";
import { Loader2, Settings2, Trash2, GripVertical, Copy, RefreshCw, Download, MoreHorizontal } from "lucide-react";
import { Widget, WidgetWidth } from "./types";

const WIDTH_CLASS: Record<WidgetWidth, string> = {
  full:  "w-full",
  half:  "w-full",
  third: "w-full",
};

interface Props {
  widget: Widget;
  loading?: boolean;     // 초기 로드 (스피너로 children 대체)
  refreshing?: boolean;  // 백그라운드 새로고침 (children 유지하고 헤더에 작은 표시만)
  editing?: boolean;
  updatedAt?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onResize?: (width: WidgetWidth) => void;
  onDuplicate?: () => void;
  onRefresh?: () => void;
  onExport?: () => void;
  children: ReactNode;
}

function relativeTime(iso?: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5000) return "방금";
  if (diff < 60000) return `${Math.floor(diff / 1000)}초 전`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
  return `${Math.floor(diff / 3600000)}시간 전`;
}

export default function WidgetShell({ widget, loading, refreshing, editing, updatedAt, onEdit, onDelete, onResize, onDuplicate, onRefresh, onExport, children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`${WIDTH_CLASS[widget.width]} rounded-2xl border border-border bg-card p-5 relative group transition-shadow ${editing ? "ring-2 ring-violet-500/30" : ""}`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {editing && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0 cursor-grab" />}
          <h3 className="text-sm font-medium truncate">{widget.title}</h3>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {refreshing && (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40" />
          )}
          {!editing && updatedAt && (
            <span className="text-[10px] text-muted-foreground/60" title={`마지막 갱신: ${new Date(updatedAt).toLocaleString("ko-KR")}`}>
              {relativeTime(updatedAt)}
            </span>
          )}
          {editing ? (
            <>
              {onResize && (
                <select
                  value={widget.width}
                  onChange={(e) => onResize(e.target.value as WidgetWidth)}
                  className="px-1.5 py-0.5 rounded text-[10px] border border-border bg-background focus:outline-none focus:border-violet-400"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <option value="third">1/3</option>
                  <option value="half">1/2</option>
                  <option value="full">전체</option>
                </select>
              )}
              {onDuplicate && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground"
                  title="복제"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1 rounded hover:bg-secondary text-muted-foreground"
                title="설정"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1 rounded hover:bg-red-500/10 hover:text-red-500 text-muted-foreground"
                title="삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="p-1 rounded hover:bg-secondary text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                title="더보기"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-36 bg-card border border-border rounded-lg shadow-lg z-20 py-1">
                    {onRefresh && (
                      <button
                        onClick={() => { onRefresh(); setMenuOpen(false); }}
                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary flex items-center gap-2"
                      >
                        <RefreshCw className="w-3 h-3" />새로고침
                      </button>
                    )}
                    {onExport && (
                      <button
                        onClick={() => { onExport(); setMenuOpen(false); }}
                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary flex items-center gap-2"
                      >
                        <Download className="w-3 h-3" />CSV 내보내기
                      </button>
                    )}
                    {onEdit && (
                      <button
                        onClick={() => { onEdit(); setMenuOpen(false); }}
                        className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary flex items-center gap-2"
                      >
                        <Settings2 className="w-3 h-3" />설정 편집
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-[80px]">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : children}
      </div>
    </div>
  );
}
