"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import ModalShell from "./ModalShell";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  bulletWarnings?: string[];
  confirmPhrase?: string;
  confirmLabel?: string;
  loading?: boolean;
}

export default function DangerConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  bulletWarnings,
  confirmPhrase,
  confirmLabel = "삭제",
  loading = false,
}: Props) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const canConfirm = confirmPhrase ? typed === confirmPhrase : true;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      headerAccent="danger"
      footer={
        <>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            취소
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => { if (canConfirm && !loading) void onConfirm(); }}
            disabled={!canConfirm || loading}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {loading ? "처리 중..." : confirmLabel}
          </motion.button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-xl border border-red-500/30 bg-red-500/5">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700/90 dark:text-red-300/90 leading-relaxed">{description}</p>
        </div>

        {bulletWarnings && bulletWarnings.length > 0 && (
          <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside leading-relaxed">
            {bulletWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        {confirmPhrase && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground block">
              계속하려면 <code className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">{confirmPhrase}</code> 을(를) 그대로 입력하세요
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmPhrase}
              autoFocus
              className={`w-full px-3 py-2 rounded-xl border bg-background text-sm focus:outline-none transition-colors ${
                typed === confirmPhrase ? "border-red-500/60" : "border-border focus:border-red-400"
              }`}
            />
          </div>
        )}
      </div>
    </ModalShell>
  );
}
