"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Loader2, Clock, Check } from "lucide-react";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Props { sourceId: string }

export default function RetentionPolicyEditor({ sourceId }: Props) {
  const [retainDays, setRetainDays] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/collect-sources/${sourceId}/retention`);
      const data = await res.json();
      setRetainDays(data.policy?.retainDays ?? 0);
      setLoading(false);
    })();
  }, [sourceId]);

  const handleSave = async (days: number) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/retention`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retainDays: days }),
      });
      if (!res.ok) { toast.error("저장 실패"); return; }
      setRetainDays(days);
      toast.success(days === 0 ? "보관 정책 해제됨 (영구 보관)" : `${days}일 보관으로 설정됨`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />로드 중...</div>;

  const presets = [0, 30, 90, 180, 365];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {presets.map((d) => (
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            key={d}
            onClick={() => handleSave(d)}
            disabled={saving}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              retainDays === d
                ? "border-violet-500 bg-violet-500 text-white"
                : "border-border hover:bg-secondary"
            }`}
          >
            {d === 0 ? "영구 보관" : `${d}일`}
          </motion.button>
        ))}
        <input
          type="number"
          min={0}
          value={retainDays}
          onChange={(e) => setRetainDays(parseInt(e.target.value) || 0)}
          onBlur={() => handleSave(retainDays)}
          className="w-20 px-2 py-1.5 rounded-lg border border-border bg-background text-xs transition-colors focus:border-violet-400 focus:outline-none"
        />
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {retainDays === 0
          ? "수집된 데이터를 영구 보관합니다."
          : `${retainDays}일 지난 레코드는 매일 자동 삭제됩니다.`}
      </p>
    </div>
  );
}
