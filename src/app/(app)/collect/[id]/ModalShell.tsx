"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<Size, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: Size;
  closeOnBackdrop?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  headerAccent?: "default" | "danger";
  headerExtra?: ReactNode;
}

export default function ModalShell({
  open,
  onClose,
  title,
  description,
  size = "md",
  closeOnBackdrop = true,
  children,
  footer,
  headerAccent = "default",
  headerExtra,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => { if (closeOnBackdrop) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={spring}
            className={`bg-background ${headerAccent === "danger" ? "border-2 border-red-500/40" : "border border-border"} rounded-2xl shadow-2xl w-full ${SIZE_MAP[size]} max-h-[85vh] overflow-hidden flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b ${headerAccent === "danger" ? "border-red-500/20 bg-red-500/5" : "border-border"}`}>
              <div className="min-w-0">
                <h2 className={`text-sm font-semibold ${headerAccent === "danger" ? "text-red-600 dark:text-red-400" : ""}`}>{title}</h2>
                {description && <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {headerExtra}
                <motion.button
                  whileHover={{ rotate: 90 }}
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                  aria-label="닫기"
                >
                  <X className="w-4 h-4" />
                </motion.button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {children}
            </div>

            {footer && (
              <div className="px-5 py-3 border-t border-border bg-secondary/30 flex items-center justify-end gap-2">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
