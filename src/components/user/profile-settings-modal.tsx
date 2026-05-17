"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Edit2, Check } from "lucide-react";
import { toast } from "sonner";

const smInputCls = "rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition-all";

interface Props { open: boolean; onClose: () => void; }

export function ProfileSettingsModal({ open, onClose }: Props) {
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/user/profile");
    const data = await res.json();
    if (data.profile) {
      setProfileName(data.profile.name ?? "");
      setProfileEmail(data.profile.email ?? "");
    }
  }, []);

  useEffect(() => { if (open) fetchProfile(); }, [open, fetchProfile]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSaveName = async () => {
    if (!editingName.trim()) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      if (!res.ok) { toast.error("이름을 저장하지 못했어요. 다시 시도해주세요"); return; }
      setProfileName(editingName.trim());
      setIsEditingName(false);
      toast.success("이름이 변경됐어요");
    } finally { setIsSaving(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-sm bg-background rounded-2xl shadow-xl pointer-events-auto">

              {/* 헤더 */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4">
                <div>
                  <h2 className="text-base font-semibold">프로필</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">내 계정 정보를 관리해요</p>
                </div>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mx-6 h-px bg-border" />

              {/* 콘텐츠 */}
              <div className="px-6 py-5 space-y-6">
                {/* 아바타 */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-violet-500/20 flex items-center justify-center text-violet-500 text-lg font-semibold shrink-0">
                    {(profileName || profileEmail || "?")[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold">{profileName || "이름 없음"}</p>
                    <p className="text-sm text-muted-foreground">{profileEmail}</p>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* 이름 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">이름</label>
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input type="text" value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setIsEditingName(false); }}
                        className={`${smInputCls} flex-1`} autoFocus />
                      <motion.button whileTap={{ scale: 0.95 }} onClick={handleSaveName}
                        disabled={!editingName.trim() || isSaving}
                        className="p-2 rounded-xl bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-40">
                        <Check className="w-4 h-4" />
                      </motion.button>
                      <button onClick={() => setIsEditingName(false)}
                        className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-sm">{profileName || <span className="text-muted-foreground">이름을 입력해주세요</span>}</span>
                      <button onClick={() => { setEditingName(profileName); setIsEditingName(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs hover:bg-secondary transition-colors text-muted-foreground">
                        <Edit2 className="w-3 h-3" />편집
                      </button>
                    </div>
                  )}
                </div>

                {/* 이메일 */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">이메일</label>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-muted-foreground">{profileEmail}</span>
                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-lg">변경 불가</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
