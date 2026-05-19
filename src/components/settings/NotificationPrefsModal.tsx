"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Bell } from "lucide-react";
import { toast } from "sonner";

interface Pref {
  eventType: string;
  label: string;
  enabled: boolean;
}

export default function NotificationPrefsModal({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/notification-prefs");
      const data = await res.json();
      setPrefs(data.prefs ?? []);
      setLoading(false);
    })();
  }, []);

  const toggle = async (p: Pref) => {
    const next = !p.enabled;
    setPrefs((arr) => arr.map((x) => x.eventType === p.eventType ? { ...x, enabled: next } : x));
    const res = await fetch("/api/notification-prefs", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: p.eventType, enabled: next }),
    });
    if (!res.ok) {
      toast.error("저장 실패");
      setPrefs((arr) => arr.map((x) => x.eventType === p.eventType ? { ...x, enabled: !next } : x));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="알림 설정">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold">알림 설정</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground" aria-label="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-xs text-muted-foreground mb-4">받고 싶은 인앱 알림 종류를 선택하세요.</p>
          {loading ? (
            <div className="flex items-center justify-center h-20"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="space-y-1.5">
              {prefs.map((p) => (
                <label key={p.eventType} className="flex items-center justify-between p-3 rounded-xl border border-border cursor-pointer hover:bg-secondary/40 transition-colors">
                  <span className="text-sm">{p.label}</span>
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={() => toggle(p)}
                    className="accent-violet-500 cursor-pointer"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
