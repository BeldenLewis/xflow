"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Plus, Trash2, Bell, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatKstDateTime } from "@/lib/datetime";

interface Report {
  id: string;
  name: string;
  cron: string;
  channel: string;
  target: string;
  isActive: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

interface Props {
  dashboardId: string;
  dashboardName: string;
  onClose: () => void;
}

const PRESET_CRONS = [
  { label: "매일 오전 9시", value: "0 9 * * *" },
  { label: "매주 월 9시", value: "0 9 * * 1" },
  { label: "매 시간 정각", value: "0 * * * *" },
  { label: "매 30분", value: "*/30 * * * *" },
];

export default function ReportsModal({ dashboardId, dashboardName, onClose }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", cron: "0 9 * * 1", channel: "slack", target: "" });
  const [saving, setSaving] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/reports`);
      const data = await res.json();
      setReports(data.reports ?? []);
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.target.trim()) { toast.error("이름과 대상이 필요해요"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboards/${dashboardId}/reports`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), target: form.target.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "생성 실패"); return; }
      toast.success("리포트가 추가됐어요");
      setForm({ name: "", cron: "0 9 * * 1", channel: "slack", target: "" });
      setAdding(false);
      fetchReports();
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (r: Report) => {
    await fetch(`/api/dashboards/${dashboardId}/reports/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    fetchReports();
  };

  const handleDelete = async (r: Report) => {
    if (!confirm(`"${r.name}" 리포트를 삭제할까요?`)) return;
    await fetch(`/api/dashboards/${dashboardId}/reports/${r.id}`, { method: "DELETE" });
    fetchReports();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold">정기 리포트 — {dashboardName}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            지정된 일정에 맞춰 보드 요약(총 제출 + 상위 UTM 소스)을 슬랙으로 자동 발송합니다.
            크론은 KST 기준이에요.
          </p>

          {loading ? (
            <div className="flex items-center justify-center h-20"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : reports.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">아직 등록된 리포트가 없어요</p>
          ) : (
            <div className="space-y-1.5">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-background">
                  <input type="checkbox" checked={r.isActive} onChange={() => handleToggle(r)} className="accent-violet-500 cursor-pointer" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      <Clock className="inline w-3 h-3 mr-1" />
                      <code className="font-mono">{r.cron}</code> · {r.channel} → {r.target.length > 40 ? r.target.slice(0, 40) + "…" : r.target}
                    </p>
                    {r.nextRunAt && <p className="text-[10px] text-muted-foreground mt-0.5">다음 실행: {formatKstDateTime(r.nextRunAt)} KST</p>}
                  </div>
                  <button onClick={() => handleDelete(r)} className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-500 text-muted-foreground">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="space-y-3 p-3 rounded-xl border border-violet-400/30 bg-violet-500/5">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="리포트 이름 (예: 주간 요약)"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
              />
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">발송 주기</label>
                <div className="flex items-center gap-1 mb-2 flex-wrap">
                  {PRESET_CRONS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setForm((f) => ({ ...f, cron: p.value }))}
                      className={`px-2 py-1 rounded text-[10px] font-medium ${
                        form.cron === p.value ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  value={form.cron}
                  onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
                  className="w-full px-3 py-1.5 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:border-violet-400"
                />
                <p className="text-[10px] text-muted-foreground mt-1">분 시 일 월 요일 (0=일요일, KST)</p>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground mb-1 block">채널</label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
                  className="px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                >
                  <option value="slack">Slack Webhook</option>
                  <option value="email">Email (placeholder)</option>
                </select>
              </div>
              <input
                value={form.target}
                onChange={(e) => setForm((f) => ({ ...f, target: e.target.value }))}
                placeholder={form.channel === "slack" ? "https://hooks.slack.com/services/..." : "email@example.com"}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:border-violet-400"
              />
              <div className="flex items-center gap-2">
                <button onClick={handleCreate} disabled={saving} className="px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium disabled:opacity-40">
                  {saving ? "추가 중..." : "추가"}
                </button>
                <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground">취소</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border text-xs text-muted-foreground hover:border-violet-400 hover:text-violet-500 transition-colors w-full justify-center">
              <Plus className="w-3.5 h-3.5" />리포트 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
