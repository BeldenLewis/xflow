"use client";

import { useState } from "react";
import { X, Loader2, Share2, Copy, RefreshCw, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

interface DashboardSummary {
  id: string;
  name: string;
  shareEnabled: boolean;
  shareToken: string | null;
}

interface Props {
  dashboard: DashboardSummary;
  onClose: () => void;
  onChange: () => void;
}

export default function ShareModal({ dashboard: initial, onClose, onChange }: Props) {
  const [dashboard, setDashboard] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = dashboard.shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${dashboard.shareToken}`
    : "";

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareEnabled: !dashboard.shareEnabled }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "변경 실패"); return; }
      setDashboard({
        ...dashboard,
        shareEnabled: data.dashboard.shareEnabled,
        shareToken: data.dashboard.shareToken,
      });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!confirm("새 공유 링크를 발급할까요? 기존 링크는 즉시 동작을 멈춰요.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dashboards/${dashboard.id}/rotate-share`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "재발급 실패"); return; }
      setDashboard({ ...dashboard, shareEnabled: true, shareToken: data.shareToken });
      toast.success("새 링크가 발급됐어요");
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("링크가 복사됐어요");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold">공유 링크</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            <b>{dashboard.name}</b> 보드를 토큰 링크로 외부에 공개합니다. 받는 사람은 로그인 없이 읽기 전용으로 볼 수 있어요.
          </p>

          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-border">
            <input
              type="checkbox"
              checked={dashboard.shareEnabled}
              onChange={toggle}
              disabled={busy}
              className="mt-0.5 accent-violet-500 cursor-pointer"
            />
            <div>
              <p className="text-sm font-medium">공유 활성화</p>
              <p className="text-[11px] text-muted-foreground">활성화 시 자동으로 토큰이 생성돼요. 비활성화하면 즉시 링크가 동작을 멈춥니다.</p>
            </div>
          </label>

          {dashboard.shareEnabled && dashboard.shareToken && (
            <div className="space-y-2">
              <p className="text-[11px] text-muted-foreground">공유 URL</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={url}
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-secondary/50 text-xs font-mono focus:outline-none"
                />
                <button onClick={copy} className="p-2 rounded-xl border border-border hover:bg-secondary">
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button onClick={rotate} disabled={busy} className="p-2 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-600 hover:bg-amber-500/10 disabled:opacity-40" title="새 링크 발급 (기존 링크 무효화)">
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  공개 보드에서는 KPI 카드와 시계열 차트만 보입니다 (데이터 보호 차원). 민감한 위젯은 인증 사용자만 볼 수 있어요.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
