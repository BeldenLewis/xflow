"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { CHANGELOG } from "@/data/changelog";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

const STORAGE_KEY = "mach_changelog_seen_v";
const LEGACY_STORAGE_KEY = "x" + "flow_changelog_seen_v";

// 가장 최근 변경 로그 date 를 본 사용자에겐 빨간 점 숨김
function latestVersion() {
  return CHANGELOG[0]?.date ?? "";
}

export default function WhatsNewPanel() {
  const [open, setOpen] = useState(false);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      try {
        let seen = localStorage.getItem(STORAGE_KEY);
        if (!seen) {
          seen = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (seen) {
            localStorage.setItem(STORAGE_KEY, seen);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        }
        setHasNew(seen !== latestVersion());
      } catch { /* private mode */ }
    });
  }, []);

  const handleOpen = () => {
    setOpen(true);
    try {
      localStorage.setItem(STORAGE_KEY, latestVersion());
      setHasNew(false);
    } catch { /* ignore */ }
  };

  return (
    <>
      <motion.button
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.92 }}
        transition={spring}
        onClick={handleOpen}
        className="relative p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground"
        aria-label="최근 업데이트"
        title="최근 업데이트"
      >
        <Sparkles className="w-4 h-4" />
        {hasNew && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={spring}
            className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-500"
          />
        )}
      </motion.button>
      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={spring}
            className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="최근 업데이트"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                <h2 className="text-sm font-semibold">최근 업데이트</h2>
              </div>
              <motion.button
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={spring}
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {CHANGELOG.map((entry, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">{entry.date}</span>
                    {entry.type && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        entry.type === "feature" ? "bg-violet-500/10 text-violet-500" :
                        entry.type === "fix" ? "bg-red-500/10 text-red-500" :
                        "bg-emerald-500/10 text-emerald-500"
                      }`}>
                        {entry.type === "feature" ? "신기능" : entry.type === "fix" ? "수정" : "개선"}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-semibold">{entry.title}</h3>
                  <ul className="space-y-1">
                    {entry.items.map((item, j) => (
                      <li key={j} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                        <span className="text-violet-500/40 mt-1">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
