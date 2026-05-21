"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Users, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

interface Member {
  id: string;
  userId: string;
  role: "VIEWER" | "EDITOR" | "ADMIN";
  user: { id: string; name: string | null; email: string };
}

interface WsMember {
  id: string;
  userId: string;
  user: { id: string; name: string | null; email: string };
}

interface Props {
  projectId: string;
  projectName: string;
  workspaceId: string;
  onClose: () => void;
}

export default function ProjectMembersModal({ projectId, projectName, workspaceId, onClose }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [wsMembers, setWsMembers] = useState<WsMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ userId: "", role: "VIEWER" as "VIEWER" | "EDITOR" | "ADMIN" });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, wRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/members`),
        fetch(`/api/workspace/${workspaceId}/members`),
      ]);
      const m = await mRes.json();
      const w = await wRes.json();
      setMembers(m.members ?? []);
      setWsMembers(w.members ?? []);
    } finally {
      setLoading(false);
    }
  }, [projectId, workspaceId]);

  useEffect(() => { void Promise.resolve().then(fetchData); }, [fetchData]);

  const handleAdd = async () => {
    if (!addForm.userId) { toast.error("사용자를 선택해주세요"); return; }
    const res = await fetch(`/api/projects/${projectId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    if (!res.ok) {
      const d = await res.json();
      toast.error(d.error ?? "추가 실패");
      return;
    }
    toast.success("권한이 추가됐어요");
    setAddForm({ userId: "", role: "VIEWER" });
    setAdding(false);
    fetchData();
  };

  const handleRemove = async (m: Member) => {
    if (!confirm(`"${m.user.name ?? m.user.email}" 의 프로젝트 권한을 제거할까요? (워크스페이스 권한은 유지됩니다)`)) return;
    const res = await fetch(`/api/projects/${projectId}/members?userId=${m.userId}`, { method: "DELETE" });
    if (!res.ok) { toast.error("제거 실패"); return; }
    fetchData();
  };

  const handleChangeRole = async (m: Member, role: Member["role"]) => {
    await fetch(`/api/projects/${projectId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: m.userId, role }),
    });
    fetchData();
  };

  const candidates = wsMembers.filter((w) => !members.find((m) => m.userId === w.userId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="프로젝트 멤버">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold">프로젝트 권한 — {projectName}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground" aria-label="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            프로젝트 단위 권한입니다. 워크스페이스 권한 위에 좁은 권한을 덮어쓸 수 있어요.
            <br /><b>VIEWER</b>: 읽기만 / <b>EDITOR</b>: 데이터·보고서 편집 / <b>ADMIN</b>: 권한 관리까지.
          </p>

          {loading ? (
            <div className="flex items-center justify-center h-20"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">프로젝트 단위 권한이 없어요. 모든 워크스페이스 멤버가 기본 권한대로 접근합니다.</p>
          ) : (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background">
                  <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-500 text-xs font-bold shrink-0">
                    {(m.user.name ?? m.user.email)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.user.name ?? m.user.email}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{m.user.email}</p>
                  </div>
                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m, e.target.value as Member["role"])}
                    className="px-2 py-1 rounded-lg border border-border bg-background text-xs"
                  >
                    <option value="VIEWER">VIEWER</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                  <button onClick={() => handleRemove(m)} className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 text-muted-foreground" aria-label="제거">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="p-3 rounded-xl border border-violet-400/30 bg-violet-500/5 space-y-2">
              <select
                value={addForm.userId}
                onChange={(e) => setAddForm((f) => ({ ...f, userId: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                <option value="">— 워크스페이스 멤버 선택 —</option>
                {candidates.map((c) => (
                  <option key={c.userId} value={c.userId}>{c.user.name ?? c.user.email}</option>
                ))}
              </select>
              <select
                value={addForm.role}
                onChange={(e) => setAddForm((f) => ({ ...f, role: e.target.value as Member["role"] }))}
                className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
              >
                <option value="VIEWER">VIEWER</option>
                <option value="EDITOR">EDITOR</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <div className="flex gap-2">
                <button onClick={handleAdd} className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium">추가</button>
                <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground">취소</button>
              </div>
            </div>
          ) : candidates.length > 0 && (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-violet-400 hover:text-violet-500 transition-colors w-full justify-center">
              <Plus className="w-3.5 h-3.5" />멤버 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
