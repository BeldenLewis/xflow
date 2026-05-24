"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Props {
  sourceId: string;
  sourceName: string;
  recordCount: number;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DangerDeleteModal({ sourceId, sourceName, recordCount, onClose, onDeleted }: Props) {
  const [nameInput, setNameInput] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canDelete = nameInput === sourceName && acknowledged && recordCount > 0;

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/records/all`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirm: true,
          confirmName: sourceName,
          expectedCount: recordCount,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "삭제 실패"); return; }
      toast.success(`${data.deleted.toLocaleString()}건 모두 삭제됐어요`);
      onDeleted();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.97 }}
        transition={spring}
        className="bg-background border-2 border-red-500/40 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-red-500/20 bg-red-500/5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">모든 레코드 삭제 — 위험</h2>
          </div>
          <motion.button
            whileHover={{ rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            transition={spring}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 큰 경고 박스 */}
          <div className="p-4 rounded-xl border-2 border-red-500/30 bg-red-500/5 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                이 작업은 되돌릴 수 없습니다
              </p>
            </div>
            <p className="text-xs text-red-700/80 dark:text-red-300/80 leading-relaxed">
              <span className="font-bold">{sourceName}</span> 소스의 모든 수집 레코드 <span className="font-bold">{recordCount.toLocaleString()}건</span>이 영구적으로 삭제됩니다.
              필드 설정·스크립트·소스 자체는 유지되지만, 수집된 데이터는 모두 사라져요.
            </p>
          </div>

          {/* 권장 행동 */}
          <div className="p-3 rounded-xl border border-border bg-secondary/30 space-y-2">
            <p className="text-xs font-medium">진행 전에 확인하세요</p>
            <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside leading-relaxed">
              <li>중요한 데이터는 먼저 <b>CSV로 내보내기</b> 해두셨나요?</li>
              <li>특정 레코드만 지우고 싶다면 체크박스 + "선택 삭제"가 더 안전해요</li>
              <li>중복만 정리하려면 "중복 정리" 기능을 사용하세요</li>
              <li>삭제 후에도 새로운 데이터는 계속 수집됩니다</li>
            </ul>
          </div>

          {/* 소스 이름 입력 확인 */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground block">
              계속하려면 소스 이름 <code className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">{sourceName}</code> 을(를) 그대로 입력하세요
            </label>
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={sourceName}
              autoFocus
              className={`w-full px-3 py-2 rounded-xl border bg-background text-sm focus:outline-none transition-colors ${
                nameInput === sourceName
                  ? "border-red-500/60"
                  : "border-border focus:border-red-400"
              }`}
            />
          </div>

          {/* 체크박스 */}
          <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-border bg-background hover:bg-secondary/40 transition-colors">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 accent-red-500 cursor-pointer"
            />
            <span className="text-xs leading-relaxed">
              위 내용을 모두 이해했고, <b>{recordCount.toLocaleString()}건</b>이 영구 삭제됨을 확인합니다.
            </span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-secondary/30">
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
            onClick={handleDelete}
            disabled={!canDelete || deleting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {deleting ? "삭제 중..." : `${recordCount.toLocaleString()}건 영구 삭제`}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
