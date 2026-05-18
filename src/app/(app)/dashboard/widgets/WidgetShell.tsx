"use client";

import { ReactNode } from "react";
import { Loader2, Settings2, Trash2, GripVertical } from "lucide-react";
import { Widget, WidgetWidth } from "./types";

const WIDTH_CLASS: Record<WidgetWidth, string> = {
  full:  "col-span-12",
  half:  "col-span-12 md:col-span-6",
  third: "col-span-12 md:col-span-6 lg:col-span-4",
};

interface Props {
  widget: Widget;
  loading?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onResize?: (width: WidgetWidth) => void;
  children: ReactNode;
}

export default function WidgetShell({ widget, loading, editing, onEdit, onDelete, onResize, children }: Props) {
  return (
    <div className={`${WIDTH_CLASS[widget.width]} rounded-2xl border border-border bg-card p-5 relative group transition-shadow ${editing ? "ring-2 ring-violet-500/30" : ""}`}>
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {editing && <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
          <h3 className="text-sm font-medium truncate">{widget.title}</h3>
        </div>
        {editing && (
          <div className="flex items-center gap-0.5 shrink-0">
            {onResize && (
              <select
                value={widget.width}
                onChange={(e) => onResize(e.target.value as WidgetWidth)}
                className="px-1.5 py-0.5 rounded text-[10px] border border-border bg-background focus:outline-none focus:border-violet-400"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="third">1/3</option>
                <option value="half">1/2</option>
                <option value="full">전체</option>
              </select>
            )}
            <button onClick={onEdit} className="p-1 rounded hover:bg-secondary text-muted-foreground" title="설정">
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={onDelete} className="p-1 rounded hover:bg-red-500/10 hover:text-red-500 text-muted-foreground" title="삭제">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
