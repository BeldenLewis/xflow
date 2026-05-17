"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Database, Globe, ToggleLeft, ToggleRight, Loader2, ChevronRight, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import Link from "next/link";

interface CollectSource {
  id: string;
  name: string;
  description: string | null;
  siteUrl: string | null;
  isActive: boolean;
  createdAt: string;
  _count: { records: number };
}

export default function CollectPage() {
  const { workspace, currentProject, isLoading: wsLoading } = useWorkspace();
  const [sources, setSources] = useState<CollectSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", siteUrl: "" });
  const [isCreating, setIsCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    if (!workspace || !currentProject) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/collect-sources?workspaceId=${workspace.id}&projectId=${currentProject.id}`);
      const data = await res.json();
      setSources(data.sources ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [workspace, currentProject]);

  useEffect(() => { fetchSources(); }, [fetchSources]);

  const handleCreate = async () => {
    if (!form.name.trim() || !workspace || !currentProject) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/collect-sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: currentProject.id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          siteUrl: form.siteUrl.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "생성 실패"); return; }
      toast.success(`'${data.source.name}' 수집 소스가 생성됐어요`);
      setForm({ name: "", description: "", siteUrl: "" });
      setShowCreate(false);
      fetchSources();
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (source: CollectSource) => {
    const res = await fetch(`/api/collect-sources/${source.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !source.isActive }),
    });
    if (!res.ok) { toast.error("상태 변경 실패"); return; }
    setSources((prev) => prev.map((s) => s.id === source.id ? { ...s, isActive: !source.isActive } : s));
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/collect-sources/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    toast.success("수집 소스가 삭제됐어요");
    setDeleteId(null);
    setSources((prev) => prev.filter((s) => s.id !== id));
  };

  if (wsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Database className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">프로젝트를 먼저 선택해주세요</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">데이터 수집</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{currentProject.name} · 외부 사이트 폼 데이터 수집</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          수집 소스 추가
        </motion.button>
      </div>

      {/* 생성 폼 */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-4 p-5 rounded-2xl border border-violet-400/30 bg-violet-500/5"
          >
            <h3 className="text-sm font-semibold mb-4">새 수집 소스</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">이름 *</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="예: 2025 서울 국제아트페어"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setShowCreate(false); }}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">설명</label>
                <input
                  type="text"
                  placeholder="수집 소스에 대한 메모"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">사이트 URL</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={form.siteUrl}
                  onChange={(e) => setForm((f) => ({ ...f, siteUrl: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleCreate}
                  disabled={!form.name.trim() || isCreating}
                  className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
                >
                  {isCreating ? "생성 중..." : "생성"}
                </motion.button>
                <button
                  onClick={() => { setShowCreate(false); setForm({ name: "", description: "", siteUrl: "" }); }}
                  className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Database className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">아직 수집 소스가 없어요</p>
          <p className="text-xs text-muted-foreground/60 mt-1">외부 사이트에 스크립트를 삽입해 폼 데이터를 수집할 수 있어요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <div key={source.id} className="group flex items-center gap-4 p-4 rounded-2xl border border-border bg-background hover:border-violet-400/30 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0">
                <Database className="w-4 h-4" />
              </div>
              <Link href={`/collect/${source.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{source.name}</span>
                  {!source.isActive && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">비활성</span>
                  )}
                </div>
                {source.description && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{source.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />{source._count.records.toLocaleString()}건
                  </span>
                  {source.siteUrl && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                      <Globe className="w-3 h-3 shrink-0" />{source.siteUrl}
                    </span>
                  )}
                </div>
              </Link>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => { e.preventDefault(); handleToggle(source); }}
                  className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground"
                  title={source.isActive ? "비활성화" : "활성화"}
                >
                  {source.isActive
                    ? <ToggleRight className="w-4 h-4 text-violet-500" />
                    : <ToggleLeft className="w-4 h-4" />}
                </button>
                <button
                  onClick={(e) => { e.preventDefault(); setDeleteId(source.id); }}
                  className="p-2 rounded-xl hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 삭제 확인 */}
      <AnimatePresence>
        {deleteId && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setDeleteId(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-2xl p-6 w-80 shadow-xl"
            >
              <h3 className="text-base font-semibold mb-2">수집 소스 삭제</h3>
              <p className="text-sm text-muted-foreground mb-5">수집된 모든 데이터도 함께 삭제돼요. 되돌릴 수 없어요.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDelete(deleteId)}
                  className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  삭제
                </button>
                <button
                  onClick={() => setDeleteId(null)}
                  className="flex-1 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors"
                >
                  취소
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
