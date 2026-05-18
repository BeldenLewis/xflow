"use client";

import { useState } from "react";
import { Plus, X, Edit3, Copy, MoreHorizontal, Trash2, Share2 } from "lucide-react";
import { toast } from "sonner";

export interface DashboardSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  shareEnabled: boolean;
  shareToken: string | null;
  _count?: { widgets: number };
}

interface Props {
  workspaceId: string;
  projectId: string;
  dashboards: DashboardSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  onChange: () => void;
  onOpenShare: (dashboard: DashboardSummary) => void;
  onOpenReports: (dashboard: DashboardSummary) => void;
}

export default function BoardTabs({ workspaceId, projectId, dashboards, activeId, onSelect, onChange, onOpenShare, onOpenReports }: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cloneFrom, setCloneFrom] = useState<string>("");
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const res = await fetch("/api/dashboards", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, projectId, name: name.trim(), cloneFromId: cloneFrom || undefined }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "생성 실패"); return; }
    toast.success("보드가 만들어졌어요");
    setName(""); setCloneFrom(""); setShowCreate(false);
    onChange();
    if (data.dashboard?.id) onSelect(data.dashboard.id);
  };

  const handleRename = async (id: string, newName: string) => {
    if (!newName.trim()) return;
    const res = await fetch(`/api/dashboards/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!res.ok) { toast.error("이름 변경 실패"); return; }
    onChange();
    setEditingId(null);
  };

  const handleDelete = async (d: DashboardSummary) => {
    if (d.isDefault) { toast.error("기본 보드는 삭제할 수 없어요"); return; }
    if (!confirm(`"${d.name}" 보드를 삭제할까요? 안에 있는 모든 위젯이 함께 삭제돼요.`)) return;
    const res = await fetch(`/api/dashboards/${d.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    toast.success("보드가 삭제됐어요");
    onChange();
  };

  const handleDuplicate = async (d: DashboardSummary) => {
    const res = await fetch("/api/dashboards", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, projectId, name: `${d.name} (복사본)`, cloneFromId: d.id }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "복제 실패"); return; }
    toast.success("보드가 복제됐어요");
    onChange();
    if (data.dashboard?.id) onSelect(data.dashboard.id);
  };

  return (
    <div className="flex items-center gap-1 flex-wrap border-b border-border">
      {dashboards.map((d) => {
        const isActive = d.id === activeId;
        const isEditing = editingId === d.id;
        return (
          <div key={d.id} className="relative">
            {isEditing ? (
              <input
                autoFocus
                defaultValue={d.name}
                onBlur={(e) => handleRename(d.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="px-3 py-2 text-sm border-b-2 border-violet-500 bg-transparent focus:outline-none -mb-px"
              />
            ) : (
              <button
                onClick={() => onSelect(d.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  isActive ? "border-violet-500 text-violet-500" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {d.name}
                {d.shareEnabled && <Share2 className="w-3 h-3 text-emerald-500" />}
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === d.id ? null : d.id); }}
                  className="p-0.5 rounded hover:bg-secondary"
                >
                  <MoreHorizontal className="w-3 h-3" />
                </button>
              </button>
            )}
            {menuFor === d.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                <div className="absolute left-2 top-full mt-1 w-44 bg-card border border-border rounded-lg shadow-lg z-20 py-1">
                  <button onClick={() => { setEditingId(d.id); setMenuFor(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary flex items-center gap-2">
                    <Edit3 className="w-3 h-3" />이름 변경
                  </button>
                  <button onClick={() => { handleDuplicate(d); setMenuFor(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary flex items-center gap-2">
                    <Copy className="w-3 h-3" />복제 (위젯 포함)
                  </button>
                  <button onClick={() => { onOpenShare(d); setMenuFor(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary flex items-center gap-2">
                    <Share2 className="w-3 h-3" />공유 링크
                  </button>
                  <button onClick={() => { onOpenReports(d); setMenuFor(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-secondary flex items-center gap-2">
                    📨 정기 리포트
                  </button>
                  {!d.isDefault && (
                    <button onClick={() => { handleDelete(d); setMenuFor(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-red-500/10 text-red-500 flex items-center gap-2 border-t border-border">
                      <Trash2 className="w-3 h-3" />보드 삭제
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {showCreate ? (
        <div className="flex items-center gap-1.5 px-2 py-1.5 -mb-px border-b-2 border-violet-500/30">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
            placeholder="보드 이름"
            className="text-sm bg-transparent focus:outline-none w-24"
          />
          <select
            value={cloneFrom}
            onChange={(e) => setCloneFrom(e.target.value)}
            className="text-[10px] border border-border rounded px-1 py-0.5 bg-background"
          >
            <option value="">빈 보드</option>
            {dashboards.map((d) => <option key={d.id} value={d.id}>📋 {d.name} 복제</option>)}
          </select>
          <button onClick={handleCreate} className="text-xs text-violet-500 font-medium">추가</button>
          <button onClick={() => setShowCreate(false)} className="text-muted-foreground"><X className="w-3 h-3" /></button>
        </div>
      ) : (
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground border-b-2 border-transparent -mb-px"
          title="새 보드"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
