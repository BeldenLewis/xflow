"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Copy, Check, QrCode, Link2, Trash2, ExternalLink,
  ChevronDown, FolderOpen, Layers, Sparkles, X, Save,
  RotateCcw, Search, ChevronRight, Loader2, Edit2, FileDown,
  AlertCircle, ArrowUpDown, CopyPlus, CheckCircle2, LayoutList,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import { Select } from "@/components/ui/select";

const BASIC_SOURCES = [
  { label: "구글",       value: "google" },
  { label: "네이버",     value: "naver" },
  { label: "카카오",     value: "kakao" },
  { label: "인스타그램", value: "instagram" },
  { label: "페이스북",   value: "facebook" },
  { label: "유튜브",     value: "youtube" },
  { label: "이메일",     value: "email" },
];

const BASIC_MEDIUMS = [
  { label: "검색 광고",   value: "cpc",      desc: "구글·네이버 키워드 광고" },
  { label: "소셜미디어",  value: "social",   desc: "SNS 게시물·피드 광고" },
  { label: "이메일",     value: "email",    desc: "뉴스레터·이메일 발송" },
  { label: "디스플레이",  value: "display",  desc: "배너·동영상 광고" },
  { label: "자연검색",   value: "organic",  desc: "검색 결과 자연 유입" },
  { label: "추천링크",   value: "referral", desc: "다른 사이트 링크" },
];

const FALLBACK_SOURCES = ["google", "naver", "kakao", "instagram", "facebook", "youtube", "email"];
const FALLBACK_MEDIUMS = ["cpc", "organic", "social", "email", "referral", "display"];
const DRAFT_KEY = "xflow-utm-draft";

interface UTMLink {
  id: string; name: string | null; url: string;
  utmSource: string; utmMedium: string; utmCampaign: string;
  utmTerm: string | null; utmContent: string | null;
  fullUrl: string; shortUrl: string | null; createdAt: string;
  createdById: string;
  createdBy: { name: string | null };
}
interface Preset   { id: string; field: string; value: string; label?: string | null; }
interface Template { id: string; name: string; source: string; medium: string; campaign?: string | null; term?: string | null; content?: string | null; }
interface FormState { url: string; source: string; medium: string; campaign: string; term: string; content: string; name: string; }

const EMPTY_FORM: FormState = { url: "", source: "", medium: "", campaign: "", term: "", content: "", name: "" };

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "어제";
  if (diffDays < 7)  return "이번 주";
  if (diffDays < 30) return "이번 달";
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function hasCampaignFormatIssue(campaign: string) {
  return /\s/.test(campaign) || /[A-Z]/.test(campaign);
}

function normalizeCampaign(campaign: string) {
  return campaign.replace(/\s+/g, "_").toLowerCase();
}

function exportToCSV(links: UTMLink[]) {
  const headers = ["이름", "URL", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "전체 URL", "단축 URL", "생성일", "생성자"];
  const rows = links.map((l) => [
    l.name ?? "", l.url, l.utmSource, l.utmMedium, l.utmCampaign,
    l.utmTerm ?? "", l.utmContent ?? "", l.fullUrl, l.shortUrl ?? "",
    new Date(l.createdAt).toLocaleDateString("ko-KR"), l.createdBy.name ?? "",
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `utm-links-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  toast.success("CSV 다운로드됨");
}

// ── 복사 버튼 ──────────────────────────────────────────────
function CopyButton({ text, size = "sm" }: { text: string; size?: "sm" | "md" }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success("복사됐어요");
        setTimeout(() => setCopied(false), 2000);
      }}
      whileTap={{ scale: 0.95 }}
      className={`flex items-center gap-1.5 rounded-lg font-medium border border-border hover:bg-secondary transition-colors ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm"}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied
          ? <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1 text-green-500"><Check className="w-3 h-3" />복사됨</motion.span>
          : <motion.span key="u" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="flex items-center gap-1"><Copy className="w-3 h-3" />복사</motion.span>}
      </AnimatePresence>
    </motion.button>
  );
}

const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition-all";

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground">
          {label}{required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {hint && <span className="text-[11px] text-muted-foreground/50 shrink-0">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function PresetSelect({ label, options, allowCustom, value, onChange, placeholder, required }: {
  label: string; options: string[]; allowCustom: boolean;
  value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
  const isCustom = allowCustom && value !== "" && !options.includes(value);
  const selectValue = isCustom ? "__custom__" : value;
  const selectOptions = [
    ...options.map((o) => ({ value: o, label: o })),
    ...(allowCustom ? [{ value: "__custom__", label: "직접 입력", dividerBefore: true }] : []),
  ];
  return (
    <Field label={label} required={required}>
      <div className="space-y-2">
        <Select
          value={selectValue}
          onChange={(v) => { if (v !== "__custom__") onChange(v); else onChange(""); }}
          options={selectOptions}
          placeholder="선택"
        />
        <AnimatePresence>
          {allowCustom && (selectValue === "__custom__" || isCustom) && (
            <motion.input initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              type="text" placeholder={placeholder} value={isCustom ? value : ""}
              onChange={(e) => onChange(e.target.value)} className={inputCls} autoFocus />
          )}
        </AnimatePresence>
      </div>
    </Field>
  );
}

function TagInput({ tags, onChange, suggestions, placeholder }: {
  tags: string[]; onChange: (tags: string[]) => void;
  suggestions?: string[]; placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const add = (val: string) => {
    const v = val.trim().toLowerCase().replace(/,/g, "");
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput("");
  };

  const remove = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div className="space-y-2">
      <div className="min-h-[42px] flex flex-wrap gap-1.5 rounded-xl border border-border bg-background px-3 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-400/20 transition-all cursor-text"
        onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-violet-500/10 text-violet-500 text-xs font-mono font-medium">
            {t}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(t); }} className="hover:text-violet-700 transition-colors leading-none">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input); }
            else if (e.key === "Backspace" && !input && tags.length > 0) remove(tags[tags.length - 1]);
          }}
          onBlur={() => { if (input.trim()) add(input); }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[80px] bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      </div>
      {suggestions && suggestions.filter((s) => !tags.includes(s)).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.filter((s) => !tags.includes(s)).map((s) => (
            <button key={s} type="button" onClick={() => add(s)}
              className="px-2 py-1 rounded-lg border border-border text-xs text-muted-foreground hover:border-violet-400 hover:text-violet-500 transition-colors">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatePicker({ templates, onSelect }: { templates: Template[]; onSelect: (t: Template) => void }) {
  const [open, setOpen] = useState(false);
  if (templates.length === 0) return null;
  return (
    <div className="relative">
      <motion.button whileTap={{ scale: 0.95 }} onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-violet-400/40 bg-violet-500/5 text-xs font-medium text-violet-500 hover:bg-violet-500/10 transition-colors">
        <Layers className="w-3.5 h-3.5" />템플릿
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.12 }}
              className="absolute top-full left-0 mt-1 w-64 bg-background border border-border rounded-2xl shadow-lg z-50 overflow-hidden">
              <div className="p-1">
                <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">템플릿</p>
                {templates.map((t) => (
                  <button key={t.id} onClick={() => { onSelect(t); setOpen(false); }}
                    className="w-full text-left px-3 py-2 rounded-xl hover:bg-secondary transition-colors">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{t.source} / {t.medium}{t.campaign ? ` / ${t.campaign}` : ""}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── UTM 목록 행 ────────────────────────────────────────────
function UTMRow({ link, onDelete, onShortUrlSaved, onEdit, onDuplicate }: {
  link: UTMLink;
  onDelete: (id: string) => void;
  onShortUrlSaved: (id: string, shortUrl: string) => void;
  onEdit: (link: UTMLink) => void;
  onDuplicate: (link: UTMLink) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isShortening, setIsShortening] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleShorten = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsShortening(true);
    const toastId = toast.loading("단축 중...");
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(link.fullUrl)}`);
      const short = await res.text();
      await fetch(`/api/utm/${link.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shortUrl: short }),
      });
      onShortUrlSaved(link.id, short);
      toast.success("단축 URL이 저장됐어요", { id: toastId });
    } catch { toast.error("URL을 단축하지 못했어요. 잠시 후 다시 시도해주세요", { id: toastId }); }
    finally { setIsShortening(false); }
  };

  return (
    <motion.div layout className="border-b border-border last:border-0">
      <div onClick={() => setExpanded(!expanded)}
        className="px-6 py-4 flex items-center gap-3 hover:bg-secondary/20 transition-colors cursor-pointer group">
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </motion.div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{link.name || "이름 없음"}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-medium">{link.utmSource}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{link.utmMedium}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{link.utmCampaign}</span>
            {link.shortUrl && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 flex items-center gap-1">
                <Link2 className="w-2.5 h-2.5" />단축 완료
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate font-mono">{link.fullUrl}</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}>
          <CopyButton text={link.shortUrl || link.fullUrl} />
          <button onClick={() => onEdit(link)} title="수정"
            className="p-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDuplicate(link)} title="복제"
            className="p-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">
            <CopyPlus className="w-3.5 h-3.5" />
          </button>
          <a href={link.fullUrl} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={() => onDelete(link.id)}
            className="p-1.5 rounded-lg border border-border hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-500 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-6 pb-5 pt-1 space-y-4 border-l-2 border-violet-500/20 ml-[52px]">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">전체 UTM URL</p>
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-xs font-mono text-muted-foreground bg-secondary/50 rounded-xl px-3 py-2.5 break-all leading-relaxed">{link.fullUrl}</p>
                  <CopyButton text={link.fullUrl} />
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">단축 URL</p>
                {link.shortUrl ? (
                  <div className="flex items-center gap-2">
                    <p className="flex-1 text-xs text-violet-400 font-mono bg-violet-500/5 rounded-xl px-3 py-2.5">{link.shortUrl}</p>
                    <CopyButton text={link.shortUrl} />
                  </div>
                ) : (
                  <motion.button whileTap={{ scale: 0.95 }} onClick={handleShorten} disabled={isShortening}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors disabled:opacity-40">
                    {isShortening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5 text-violet-500" />}
                    {isShortening ? "생성 중..." : "단축 URL 생성"}
                  </motion.button>
                )}
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">QR 코드</p>
                {showQR ? (
                  <div className="space-y-2">
                    <div className="inline-flex bg-white rounded-2xl p-3">
                      <QRCodeSVG id={`qr-${link.id}`} value={link.shortUrl || link.fullUrl} size={120} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => {
                        const svg = document.getElementById(`qr-${link.id}`);
                        if (!svg) return;
                        const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob); a.download = `qr-${link.name || link.id}.svg`; a.click();
                        toast.success("QR 다운로드됨");
                      }} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">
                        SVG 다운로드
                      </button>
                      <button onClick={() => setShowQR(false)}
                        className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg border border-border hover:bg-secondary transition-colors">
                        닫기
                      </button>
                    </div>
                  </div>
                ) : (
                  <motion.button whileTap={{ scale: 0.95 }} onClick={(e) => { e.stopPropagation(); setShowQR(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors">
                    <QrCode className="w-3.5 h-3.5 text-violet-500" />QR 코드 생성
                  </motion.button>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {new Date(link.createdAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} · {link.createdBy.name ?? "알 수 없음"}
                {link.utmTerm && <> · term: <span className="font-mono">{link.utmTerm}</span></>}
                {link.utmContent && <> · content: <span className="font-mono">{link.utmContent}</span></>}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── 생성 / 수정 드로어 ─────────────────────────────────────
function CreateDrawer({ open, onClose, presets, templates, onSaved, editingLink, duplicateFrom, existingLinks }: {
  open: boolean; onClose: () => void;
  presets: Preset[]; templates: Template[];
  onSaved: () => void;
  editingLink?: UTMLink | null;
  duplicateFrom?: UTMLink | null;
  existingLinks: UTMLink[];
}) {
  const { currentProject } = useWorkspace();
  const isEdit = !!editingLink;
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [advUrls, setAdvUrls] = useState<string[]>([]);
  const [advSources, setAdvSources] = useState<string[]>([]);
  const [advMediums, setAdvMediums] = useState<string[]>([]);
  const [shortUrl, setShortUrl] = useState("");
  const [isShortening, setIsShortening] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [urlStatus, setUrlStatus] = useState<"idle" | "checking" | "ok" | "warn">("idle");
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const urlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (key: keyof FormState) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  // 드로어 열릴 때 초기화
  useEffect(() => {
    if (!open) return;
    setUrlStatus("idle");
    setShowDraftBanner(false);
    if (editingLink) {
      setForm({ url: editingLink.url, source: editingLink.utmSource, medium: editingLink.utmMedium,
        campaign: editingLink.utmCampaign, term: editingLink.utmTerm || "", content: editingLink.utmContent || "", name: editingLink.name || "" });
      setShortUrl(editingLink.shortUrl || "");
      return;
    }
    if (duplicateFrom) {
      setForm({ url: duplicateFrom.url, source: duplicateFrom.utmSource, medium: duplicateFrom.utmMedium,
        campaign: duplicateFrom.utmCampaign, term: duplicateFrom.utmTerm || "", content: duplicateFrom.utmContent || "", name: "" });
      setShortUrl("");
      return;
    }
    // 신규: 드래프트 복원
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as FormState;
        if (Object.values(parsed).some(Boolean)) { setForm(parsed); setShowDraftBanner(true); }
      }
    } catch { /* ignore */ }
  }, [open, editingLink, duplicateFrom]);

  // 드래프트 자동저장 (신규 모드만)
  useEffect(() => {
    if (isEdit || !!duplicateFrom || !open) return;
    if (Object.values(form).some(Boolean)) localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    else localStorage.removeItem(DRAFT_KEY);
  }, [form, isEdit, duplicateFrom, open]);

  const generatedUrl = useMemo(() => {
    if (!form.url || !form.source || !form.medium || !form.campaign) return "";
    try {
      const base = form.url.startsWith("http") ? form.url : `https://${form.url}`;
      const u = new URL(base);
      u.searchParams.set("utm_source", form.source);
      u.searchParams.set("utm_medium", form.medium);
      u.searchParams.set("utm_campaign", form.campaign);
      if (form.term)    u.searchParams.set("utm_term", form.term);
      if (form.content) u.searchParams.set("utm_content", form.content);
      return u.toString();
    } catch { return ""; }
  }, [form]);

  // URL 유효성 검사
  const checkUrl = (url: string) => {
    if (!url) { setUrlStatus("idle"); return; }
    if (urlTimer.current) clearTimeout(urlTimer.current);
    setUrlStatus("checking");
    urlTimer.current = setTimeout(async () => {
      try {
        const full = url.startsWith("http") ? url : `https://${url}`;
        const res = await fetch(`/api/validate-url?url=${encodeURIComponent(full)}`);
        const data = await res.json();
        setUrlStatus(data.valid ? "ok" : "warn");
      } catch { setUrlStatus("warn"); }
    }, 800);
  };

  // 중복 감지
  const duplicate = useMemo(() => {
    if (!form.url || !form.source || !form.medium || !form.campaign) return null;
    const base = form.url.startsWith("http") ? form.url : `https://${form.url}`;
    return existingLinks.find((l) =>
      l.id !== editingLink?.id &&
      l.url === base &&
      l.utmSource === form.source &&
      l.utmMedium === form.medium &&
      l.utmCampaign === form.campaign
    ) ?? null;
  }, [form, existingLinks, editingLink]);

  const advCombinations = useMemo(() => {
    if (advUrls.length === 0 || !form.campaign || advSources.length === 0 || advMediums.length === 0) return [];
    return advUrls.flatMap((url) =>
      advSources.flatMap((source) =>
        advMediums.map((medium) => ({ url, source, medium }))
      )
    );
  }, [advUrls, form.campaign, advSources, advMediums]);

  const reset = () => {
    setForm(EMPTY_FORM);
    setShortUrl(""); setShowQR(false); setAppliedTemplate(null);
    setUrlStatus("idle"); setShowDraftBanner(false);
    setAdvUrls([]); setAdvSources([]); setAdvMediums([]);
    localStorage.removeItem(DRAFT_KEY);
  };

  const handleAdvancedSave = async () => {
    if (advCombinations.length === 0) return;
    setIsSaving(true);
    const n = advCombinations.length;
    const id = toast.loading(n > 1 ? `${n}개 생성 중...` : "저장 중...");
    try {
      await Promise.all(
        advCombinations.map(({ url, source, medium }) => {
          const base = url.startsWith("http") ? url : `https://${url}`;
          const u = new URL(base);
          u.searchParams.set("utm_source", source);
          u.searchParams.set("utm_medium", medium);
          u.searchParams.set("utm_campaign", form.campaign);
          if (form.term)    u.searchParams.set("utm_term", form.term);
          if (form.content) u.searchParams.set("utm_content", form.content);
          return fetch("/api/utm", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: n === 1 ? (form.name || null) : null,
              url: base, utmSource: source, utmMedium: medium,
              utmCampaign: form.campaign,
              utmTerm: form.term || null, utmContent: form.content || null,
              fullUrl: u.toString(), projectId: currentProject?.id || null,
            }),
          });
        })
      );
      toast.success(n > 1 ? `${n}개 UTM이 생성됐어요` : "UTM이 저장됐어요", { id });
      reset(); onSaved(); onClose();
    } catch { toast.error("저장하지 못했어요. 다시 시도해주세요", { id }); }
    finally { setIsSaving(false); }
  };

  const handleClose = () => {
    setShowDraftBanner(false);
    if (isEdit || !!duplicateFrom) { setForm(EMPTY_FORM); setShortUrl(""); setAppliedTemplate(null); }
    onClose();
  };

  const handleTemplateSelect = (t: Template) => {
    setForm((f) => ({ ...f, source: t.source, medium: t.medium, campaign: t.campaign || f.campaign, term: t.term || "", content: t.content || "" }));
    setAppliedTemplate(t.name);
    toast.success(`'${t.name}' 템플릿 적용됨`);
  };

  const handleShorten = async () => {
    if (!generatedUrl) return;
    setIsShortening(true);
    const id = toast.loading("URL 단축 중...");
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(generatedUrl)}`);
      setShortUrl(await res.text());
      toast.success("단축 URL 생성됨", { id });
    } catch { toast.error("URL을 단축하지 못했어요. 잠시 후 다시 시도해주세요", { id }); }
    finally { setIsShortening(false); }
  };

  const handleSave = async () => {
    if (!generatedUrl) return;
    setIsSaving(true);
    const id = toast.loading(isEdit ? "수정 중..." : "저장 중...");
    try {
      if (isEdit && editingLink) {
        await fetch(`/api/utm/${editingLink.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name || null, url: form.url,
            utmSource: form.source, utmMedium: form.medium, utmCampaign: form.campaign,
            utmTerm: form.term || null, utmContent: form.content || null, fullUrl: generatedUrl,
          }),
        });
        toast.success("수정됐어요", { id });
      } else {
        await fetch("/api/utm", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name || null, url: form.url,
            utmSource: form.source, utmMedium: form.medium, utmCampaign: form.campaign,
            utmTerm: form.term || null, utmContent: form.content || null,
            fullUrl: generatedUrl, shortUrl: shortUrl || null,
            projectId: currentProject?.id || null,
          }),
        });
        toast.success("UTM이 저장됐어요", { id });
      }
      localStorage.removeItem(DRAFT_KEY);
      reset();
      onSaved();
      onClose();
    } catch { toast.error(isEdit ? "수정하지 못했어요. 다시 시도해주세요" : "저장하지 못했어요. 다시 시도해주세요", { id }); }
    finally { setIsSaving(false); }
  };

  const getAdvancedOptions = (field: string, fallback: string[]) => {
    const vals = presets.filter((p) => p.field === field).map((p) => p.value);
    return vals.length > 0 ? vals : fallback;
  };
  const hasPresets = (field: string) => presets.some((p) => p.field === field);

  const basicSources = presets.some((p) => p.field === "source")
    ? presets.filter((p) => p.field === "source").map((p) => ({ label: p.label || p.value, value: p.value }))
    : BASIC_SOURCES;

  const basicMediums = presets.some((p) => p.field === "medium")
    ? presets.filter((p) => p.field === "medium").map((p) => ({ label: p.label || p.value, value: p.value, desc: "" }))
    : BASIC_MEDIUMS;

  const existingCampaigns = useMemo(() =>
    [...new Set(existingLinks.map((l) => l.utmCampaign))].sort(),
    [existingLinks]
  );

  const campaignIssue = form.campaign && hasCampaignFormatIssue(form.campaign);

  const UrlPreview = () => (
    <AnimatePresence>
      {generatedUrl && (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-violet-500" />생성된 URL
            </span>
            <CopyButton text={generatedUrl} />
          </div>
          <p className="text-[11px] text-muted-foreground break-all font-mono leading-relaxed">{generatedUrl}</p>
          <div className="pt-2 border-t border-border space-y-2">
            {shortUrl ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-violet-400 font-mono truncate">{shortUrl}</p>
                <CopyButton text={shortUrl} />
              </div>
            ) : (
              <button onClick={handleShorten} disabled={isShortening}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 disabled:opacity-40 transition-colors">
                <Link2 className="w-3 h-3" />{isShortening ? "단축 중..." : "단축 URL 생성 (선택)"}
              </button>
            )}
            {showQR ? (
              <div className="flex items-center gap-3">
                <div className="bg-white rounded-xl p-2"><QRCodeSVG id="qr-drawer" value={generatedUrl} size={80} /></div>
                <button onClick={() => {
                  const svg = document.getElementById("qr-drawer");
                  if (!svg) return;
                  const blob = new Blob([svg.outerHTML], { type: "image/svg+xml" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "qrcode.svg"; a.click();
                  toast.success("QR 다운로드됨");
                }} className="text-xs text-muted-foreground hover:text-foreground">다운로드</button>
              </div>
            ) : (
              <button onClick={() => setShowQR(true)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors">
                <QrCode className="w-3 h-3" />QR 코드 생성 (선택)
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const title = isEdit ? "UTM 수정" : duplicateFrom ? "UTM 복제" : "UTM 생성";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={handleClose} />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-screen w-[480px] bg-background border-l border-border z-50 flex flex-col shadow-2xl">

            {/* 헤더 */}
            <div className="px-6 py-5 border-b border-border shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{title}</h2>
                  {currentProject && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <FolderOpen className="w-3 h-3 text-violet-500" />{currentProject.name}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isEdit && !duplicateFrom && <TemplatePicker templates={templates} onSelect={handleTemplateSelect} />}
                  <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!isEdit && !duplicateFrom && (
                <div className="flex items-center gap-1 p-1 bg-secondary rounded-xl w-fit">
                  {(["basic", "advanced"] as const).map((m) => (
                    <motion.button key={m} onClick={() => setMode(m)}
                      className={`relative px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${mode === m ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {mode === m && <motion.div layoutId="mode-bg" className="absolute inset-0 bg-background rounded-lg shadow-sm" style={{ zIndex: 0 }} />}
                      <span className="relative z-10">{m === "basic" ? "기본 모드" : "고급 모드"}</span>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>

            {/* 폼 */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* 드래프트 배너 */}
              <AnimatePresence>
                {showDraftBanner && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-secondary border border-border text-xs text-muted-foreground">
                    <RotateCcw className="w-3.5 h-3.5 shrink-0 text-violet-500" />
                    <span>저장 안 된 작성 내용이 있어요. 이어서 작성하거나 <button onClick={() => { reset(); }} className="underline hover:text-foreground">초기화</button>할 수 있어요.</span>
                    <button onClick={() => setShowDraftBanner(false)} className="ml-auto"><X className="w-3 h-3" /></button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 프로젝트 미선택 경고 */}
              {!currentProject && !isEdit && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-400/20 text-xs text-amber-600">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>프로젝트가 선택되지 않았어요. 사이드바에서 프로젝트를 먼저 선택하면 더 체계적으로 관리할 수 있어요.</span>
                </div>
              )}

              {/* 중복 감지 경고 */}
              <AnimatePresence>
                {duplicate && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                    className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/10 border border-amber-400/20 text-xs text-amber-600">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>동일한 조합의 UTM이 이미 있어요. <span className="font-medium">'{duplicate.name || "이름 없음"}'</span> — 그래도 저장할 수 있어요.</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 템플릿 적용 배너 */}
              <AnimatePresence>
                {appliedTemplate && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-500/10 border border-violet-400/20 text-xs text-violet-500">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span><span className="font-medium">'{appliedTemplate}'</span> 적용됨 — 캠페인명을 입력해주세요</span>
                    <button onClick={() => setAppliedTemplate(null)} className="ml-auto"><X className="w-3 h-3" /></button>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence mode="wait">
                {/* 기본 모드 or 수정/복제 모드 */}
                {(isEdit || duplicateFrom || mode === "basic") && (
                  <motion.div key={isEdit ? "edit" : duplicateFrom ? "dup" : "basic"}
                    initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.18 }} className="space-y-6">

                    <Field label="이름 (선택)">
                      <input type="text" placeholder="예: 2025 여름 구글 검색 광고" value={form.name}
                        onChange={(e) => set("name")(e.target.value)} className={inputCls} />
                    </Field>

                    <Field label="이동할 링크 주소" required>
                      <div className="relative">
                        <input type="text" placeholder="https://example.com/event" value={form.url}
                          onChange={(e) => { set("url")(e.target.value); setUrlStatus("idle"); }}
                          onBlur={(e) => checkUrl(e.target.value)}
                          className={inputCls + (urlStatus === "ok" ? " border-green-400 focus:border-green-400 focus:ring-green-400/20" : urlStatus === "warn" ? " border-amber-400 focus:border-amber-400 focus:ring-amber-400/20" : "")} />
                        {urlStatus === "checking" && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />}
                        {urlStatus === "ok"       && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 absolute right-3 top-1/2 -translate-y-1/2" />}
                        {urlStatus === "warn"     && <AlertCircle  className="w-3.5 h-3.5 text-amber-500 absolute right-3 top-1/2 -translate-y-1/2" />}
                      </div>
                      {urlStatus === "ok"   && <p className="text-xs text-green-600 mt-1">접근 가능한 URL이에요</p>}
                      {urlStatus === "warn" && <p className="text-xs text-amber-600 mt-1">URL에 접근할 수 없어요. 주소를 다시 확인해주세요</p>}
                      {urlStatus === "idle" && <p className="text-xs text-muted-foreground mt-1">광고를 클릭했을 때 열릴 페이지 주소예요</p>}
                    </Field>

                    {/* 광고 채널 */}
                    <Field label="광고 채널" required hint="어디에서 노출되는 광고인가요?">
                      <Select
                        value={form.source}
                        onChange={set("source")}
                        options={basicSources}
                        placeholder="채널 선택"
                      />
                    </Field>

                    {/* 광고 유형 */}
                    <Field label="광고 유형" required hint="어떤 방식의 광고인가요?">
                      <Select
                        value={form.medium}
                        onChange={set("medium")}
                        options={basicMediums.map((m) => ({
                          value: m.value,
                          label: m.label + ("desc" in m && m.desc ? ` — ${m.desc}` : ""),
                        }))}
                        placeholder="유형 선택"
                      />
                    </Field>

                    {/* 캠페인 이름 */}
                    <Field label="캠페인 이름" required hint="언더바(_)로 단어를 구분해요">
                      {existingCampaigns.length > 0 ? (
                        <div className="space-y-2">
                          <Select
                            value={existingCampaigns.includes(form.campaign) ? form.campaign : form.campaign ? "__custom__" : ""}
                            onChange={(v) => { if (v !== "__custom__") { set("campaign")(v); setAppliedTemplate(null); } else set("campaign")(""); }}
                            options={[
                              ...existingCampaigns.map((c) => ({ value: c, label: c })),
                              { value: "__custom__", label: "직접 입력", dividerBefore: true },
                            ]}
                            placeholder="캠페인 선택"
                          />
                          <AnimatePresence>
                            {(!existingCampaigns.includes(form.campaign)) && (
                              <motion.input initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                                type="text" placeholder="예: 2025_여름_이벤트" value={form.campaign}
                                onChange={(e) => { set("campaign")(e.target.value); setAppliedTemplate(null); }}
                                className={inputCls} autoFocus />
                            )}
                          </AnimatePresence>
                        </div>
                      ) : (
                        <input type="text" placeholder="예: 2025_여름_이벤트" value={form.campaign}
                          onChange={(e) => { set("campaign")(e.target.value); setAppliedTemplate(null); }}
                          className={inputCls} />
                      )}
                      <AnimatePresence>
                        {campaignIssue && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/20 text-xs text-amber-600 mt-1.5">
                            <span>공백 또는 대문자가 있어요 → <span className="font-mono font-medium">{normalizeCampaign(form.campaign)}</span></span>
                            <button onClick={() => set("campaign")(normalizeCampaign(form.campaign))}
                              className="ml-2 px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-medium transition-colors shrink-0">
                              자동 변환
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Field>

                    <UrlPreview />
                  </motion.div>
                )}
                {!isEdit && !duplicateFrom && mode === "advanced" && (
                  <motion.div key="advanced" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.18 }} className="space-y-4">

                    <Field label="랜딩 페이지 URL (여러 개 가능)" required>
                      <TagInput tags={advUrls} onChange={setAdvUrls}
                        placeholder="입력 후 Enter — 예: https://example.com/page" />
                    </Field>

                    <Field label="utm_source (여러 개 가능)" required>
                      <TagInput tags={advSources} onChange={setAdvSources}
                        placeholder="입력 후 Enter — 예: google"
                        suggestions={basicSources.map((s) => s.value)} />
                    </Field>

                    <Field label="utm_medium (여러 개 가능)" required>
                      <TagInput tags={advMediums} onChange={setAdvMediums}
                        placeholder="입력 후 Enter — 예: cpc"
                        suggestions={basicMediums.map((m) => m.value)} />
                    </Field>

                    <Field label="utm_campaign" required>
                      <input type="text" placeholder="예: 2025_여름_프로모션" value={form.campaign}
                        onChange={(e) => { set("campaign")(e.target.value); setAppliedTemplate(null); }} className={inputCls} />
                      <AnimatePresence>
                        {campaignIssue && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/20 text-xs text-amber-600 mt-1.5">
                            <span>공백 또는 대문자가 있어요 → <span className="font-mono font-medium">{normalizeCampaign(form.campaign)}</span></span>
                            <button onClick={() => set("campaign")(normalizeCampaign(form.campaign))}
                              className="ml-2 px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-medium transition-colors shrink-0">
                              자동 변환
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Field>

                    <Field label="utm_term (선택)">
                      <input type="text" placeholder="예: 마케팅 자동화" value={form.term}
                        onChange={(e) => set("term")(e.target.value)} className={inputCls} />
                    </Field>

                    <Field label="utm_content (선택)">
                      <input type="text" placeholder="예: 배너_상단" value={form.content}
                        onChange={(e) => set("content")(e.target.value)} className={inputCls} />
                    </Field>

                    {/* 조합 미리보기 */}
                    <AnimatePresence>
                      {advCombinations.length > 1 && (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                          className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
                          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-violet-500" />
                            <span><span className="text-foreground font-semibold">{advCombinations.length}개</span> 조합이 생성됩니다</span>
                          </p>
                          <div className="space-y-1.5 max-h-44 overflow-y-auto">
                            {advCombinations.map(({ url, source, medium }) => {
                              const base = url.startsWith("http") ? url : `https://${url}`;
                              let preview = "";
                              try { const u = new URL(base); u.searchParams.set("utm_source", source); u.searchParams.set("utm_medium", medium); u.searchParams.set("utm_campaign", form.campaign); preview = u.toString(); } catch { preview = ""; }
                              return (
                                <div key={`${url}-${source}-${medium}`} className="space-y-0.5">
                                  <div className="flex items-center gap-1.5 text-[11px]">
                                    <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 font-mono shrink-0">{source}</span>
                                    <span className="text-muted-foreground/50">×</span>
                                    <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono shrink-0">{medium}</span>
                                    <span className="text-muted-foreground/40 truncate font-mono text-[10px]">{url}</span>
                                  </div>
                                  {preview && <p className="text-[10px] text-muted-foreground/50 font-mono truncate pl-1">{preview}</p>}
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 하단 버튼 */}
            <div className="px-6 py-4 border-t border-border shrink-0 flex gap-2">
              <button onClick={reset}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border text-sm hover:bg-secondary transition-colors text-muted-foreground">
                <RotateCcw className="w-3.5 h-3.5" />초기화
              </button>
              {mode === "advanced" && !isEdit && !duplicateFrom ? (
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleAdvancedSave}
                  disabled={advCombinations.length === 0 || isSaving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">
                  <Save className="w-4 h-4" />
                  {isSaving ? (advCombinations.length > 1 ? "생성 중..." : "저장 중...") : advCombinations.length > 1 ? `${advCombinations.length}개 UTM 생성` : "UTM 저장"}
                </motion.button>
              ) : (
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleSave}
                  disabled={!generatedUrl || isSaving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40">
                  <Save className="w-4 h-4" />{isSaving ? (isEdit ? "수정 중..." : "저장 중...") : (isEdit ? "수정 저장" : "UTM 저장")}
                </motion.button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ── 메인 페이지 ────────────────────────────────────────────
export default function UTMBuilderPage() {
  const { currentProject, workspace } = useWorkspace();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<UTMLink | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<UTMLink | null>(null);
  const [savedLinks, setSavedLinks] = useState<UTMLink[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [filterSource, setFilterSource] = useState("");
  const [filterMedium, setFilterMedium] = useState("");
  const [filterCampaign, setFilterCampaign] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "name" | "source">("date");
  const [groupView, setGroupView] = useState<"date" | "campaign">("date");
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(new Set());
  const deleteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const yearInitialized = useRef(false);

  const openDrawer = (edit?: UTMLink | null, dup?: UTMLink | null) => {
    setEditingLink(edit ?? null);
    setDuplicateFrom(dup ?? null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingLink(null);
    setDuplicateFrom(null);
  };

  const fetchLinks = useCallback(async () => {
    const url = currentProject ? `/api/utm?projectId=${currentProject.id}` : "/api/utm";
    const res = await fetch(url);
    const data = await res.json();
    setSavedLinks(data.utmLinks ?? []);
  }, [currentProject]);

  const fetchPresetsAndTemplates = useCallback(async () => {
    if (!workspace?.id) return;
    const [pr, tr] = await Promise.all([
      fetch(`/api/utm-presets?workspaceId=${workspace.id}`).then((r) => r.json()),
      fetch(`/api/utm-templates?workspaceId=${workspace.id}`).then((r) => r.json()),
    ]);
    setPresets(pr.presets ?? []);
    setTemplates(tr.templates ?? []);
  }, [workspace?.id]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);
  useEffect(() => { fetchPresetsAndTemplates(); }, [fetchPresetsAndTemplates]);

  const years    = useMemo(() => [...new Set(savedLinks.map((l) => String(new Date(l.createdAt).getFullYear())))].sort().reverse(), [savedLinks]);
  const sources  = useMemo(() => [...new Set(savedLinks.map((l) => l.utmSource))].sort(), [savedLinks]);
  const mediums  = useMemo(() => [...new Set(savedLinks.map((l) => l.utmMedium))].sort(), [savedLinks]);
  const campaigns = useMemo(() => [...new Set(savedLinks.map((l) => l.utmCampaign))].sort(), [savedLinks]);
  const authors  = useMemo(() => [...new Set(savedLinks.map((l) => l.createdBy.name).filter(Boolean))].sort() as string[], [savedLinks]);

  useEffect(() => {
    if (!yearInitialized.current && years.length > 0) {
      setFilterYear(years[0]);
      yearInitialized.current = true;
    }
  }, [years]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return savedLinks
      .filter((l) => !pendingDeletes.has(l.id))
      .filter((l) => {
        const matchSearch   = !q || [l.name, l.utmSource, l.utmMedium, l.utmCampaign, l.fullUrl].some((v) => v?.toLowerCase().includes(q));
        const matchYear     = !filterYear    || String(new Date(l.createdAt).getFullYear()) === filterYear;
        const matchSource   = !filterSource  || l.utmSource    === filterSource;
        const matchMedium   = !filterMedium  || l.utmMedium    === filterMedium;
        const matchCampaign = !filterCampaign || l.utmCampaign === filterCampaign;
        const matchAuthor   = !filterAuthor  || l.createdBy.name === filterAuthor;
        return matchSearch && matchYear && matchSource && matchMedium && matchCampaign && matchAuthor;
      });
  }, [savedLinks, pendingDeletes, search, filterYear, filterSource, filterMedium, filterCampaign, filterAuthor]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "name")   return (a.name ?? "").localeCompare(b.name ?? "", "ko");
      if (sortBy === "source") return a.utmSource.localeCompare(b.utmSource, "ko");
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filtered, sortBy]);

  // 날짜 그룹
  const grouped = useMemo(() => {
    const g: Record<string, UTMLink[]> = {};
    for (const l of sorted) {
      const k = getDateGroup(l.createdAt);
      (g[k] ??= []).push(l);
    }
    return g;
  }, [sorted]);

  // 캠페인 그룹
  const campaignGrouped = useMemo(() => {
    const g: Record<string, UTMLink[]> = {};
    for (const l of sorted) { (g[l.utmCampaign] ??= []).push(l); }
    return g;
  }, [sorted]);

  const DATE_ORDER = ["오늘", "어제", "이번 주", "이번 달"];
  const sortedDateGroups = [
    ...DATE_ORDER.filter((g) => grouped[g]),
    ...Object.keys(grouped).filter((g) => !DATE_ORDER.includes(g)).sort().reverse(),
  ];
  const sortedCampaignGroups = Object.keys(campaignGrouped).sort((a, b) => a.localeCompare(b, "ko"));

  const activeFilterCount = [filterSource, filterMedium, filterCampaign, filterAuthor].filter(Boolean).length;

  const handleDelete = (id: string) => {
    setPendingDeletes((prev) => new Set([...prev, id]));
    const timer = setTimeout(async () => {
      await fetch(`/api/utm/${id}`, { method: "DELETE" });
      setSavedLinks((prev) => prev.filter((l) => l.id !== id));
      setPendingDeletes((prev) => { const next = new Set(prev); next.delete(id); return next; });
      delete deleteTimers.current[id];
    }, 5000);
    deleteTimers.current[id] = timer;
    toast("삭제됐어요", {
      action: { label: "되돌리기", onClick: () => {
        clearTimeout(deleteTimers.current[id]);
        delete deleteTimers.current[id];
        setPendingDeletes((prev) => { const next = new Set(prev); next.delete(id); return next; });
        toast.success("복구됐어요");
      }},
      duration: 5000,
    });
  };

  const handleShortUrlSaved = (id: string, shortUrl: string) =>
    setSavedLinks((prev) => prev.map((l) => l.id === id ? { ...l, shortUrl } : l));

  const renderLinks = (links: UTMLink[]) => links.map((link) => (
    <UTMRow key={link.id} link={link}
      onDelete={handleDelete}
      onShortUrlSaved={handleShortUrlSaved}
      onEdit={(l) => openDrawer(l)}
      onDuplicate={(l) => openDrawer(null, l)} />
  ));

  const SORT_LABELS: Record<string, string> = { date: "최신순", name: "이름순", source: "채널순" };

  return (
    <>
      <div className="p-8 space-y-6">
        {/* 헤더 */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">UTM 빌더</h1>
            <p className="mt-1.5 text-sm text-muted-foreground flex items-center gap-1.5">
              {currentProject
                ? <><FolderOpen className="w-3.5 h-3.5 text-violet-500" /><span className="text-violet-500 font-medium">{currentProject.name}</span></>
                : "프로젝트를 선택해주세요"}
            </p>
          </div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => openDrawer()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
            <Plus className="w-4 h-4" />UTM 생성
          </motion.button>
        </div>

        {savedLinks.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Link2 className="w-6 h-6 text-violet-500" />
            </div>
            <div>
              <p className="font-medium">아직 생성된 UTM이 없어요</p>
              <p className="text-sm text-muted-foreground mt-1">UTM 생성 버튼을 눌러 첫 번째 링크를 만들어보세요</p>
            </div>
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => openDrawer()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors">
              <Plus className="w-3.5 h-3.5" />UTM 생성하기
            </motion.button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {/* 연도 필터 (pill 탭) */}
            {years.length > 0 && (
              <div className="flex items-center gap-1.5">
                {["전체", ...years].map((y) => {
                  const active = y === "전체" ? filterYear === null : filterYear === y;
                  return (
                    <motion.button key={y} whileTap={{ scale: 0.95 }}
                      onClick={() => setFilterYear(y === "전체" ? null : y)}
                      className={`relative px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {active && <motion.div layoutId="year-pill" className="absolute inset-0 bg-secondary border border-border rounded-full" style={{ zIndex: 0 }} />}
                      <span className="relative z-10">{y}</span>
                    </motion.button>
                  );
                })}
              </div>
            )}

            {/* 검색 + 필터 행 */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input type="text" placeholder="이름, 캠페인, URL 검색..." value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-violet-400 transition-all" />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                  </button>
                )}
              </div>

              {[
                { value: filterSource,   setter: setFilterSource,   placeholder: "모든 source",   opts: sources },
                { value: filterMedium,   setter: setFilterMedium,   placeholder: "모든 medium",   opts: mediums },
                { value: filterCampaign, setter: setFilterCampaign, placeholder: "모든 campaign", opts: campaigns },
                { value: filterAuthor,   setter: setFilterAuthor,   placeholder: "모든 작성자",   opts: authors },
              ].map(({ value, setter, placeholder, opts }) => (
                <Select
                  key={placeholder}
                  value={value}
                  onChange={setter}
                  options={opts.map((o) => ({ value: o, label: o }))}
                  placeholder={placeholder}
                  size="sm"
                />
              ))}

              <AnimatePresence>
                {activeFilterCount > 0 && (
                  <motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => { setFilterSource(""); setFilterMedium(""); setFilterCampaign(""); setFilterAuthor(""); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground border border-border hover:bg-secondary transition-colors">
                    <X className="w-3 h-3" />초기화 ({activeFilterCount})
                  </motion.button>
                )}
              </AnimatePresence>

              {/* 우측 유틸리티 */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-muted-foreground whitespace-nowrap mr-1">
                  {sorted.length !== savedLinks.length ? `${sorted.length} / ${savedLinks.length}개` : `총 ${savedLinks.length}개`}
                </span>

                {/* 정렬 */}
                <Select
                  size="sm"
                  value={sortBy}
                  onChange={(v) => setSortBy(v as typeof sortBy)}
                  options={[
                    { value: "date",   label: "최신순" },
                    { value: "name",   label: "이름순" },
                    { value: "source", label: "채널순" },
                  ]}
                  prefix={<ArrowUpDown className="w-3 h-3" />}
                />

                {/* 그룹 뷰 토글 */}
                <div className="flex items-center gap-0.5 p-1 bg-secondary rounded-xl">
                  {([
                    { key: "date",     icon: <LayoutList className="w-3.5 h-3.5" />, label: "날짜별" },
                    { key: "campaign", icon: <Layers className="w-3.5 h-3.5" />,     label: "캠페인별" },
                  ] as const).map(({ key, icon, label }) => (
                    <button key={key} onClick={() => setGroupView(key)} title={label}
                      className={`p-1.5 rounded-lg transition-colors ${groupView === key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                      {icon}
                    </button>
                  ))}
                </div>

                {/* CSV 내보내기 */}
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => exportToCSV(sorted)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors text-muted-foreground">
                  <FileDown className="w-3.5 h-3.5" />내보내기
                </motion.button>
              </div>
            </div>

            {/* 목록 */}
            {sorted.length === 0 ? (
              <div className="flex flex-col items-center py-16 space-y-3 text-center">
                <p className="text-sm text-muted-foreground">검색 결과가 없어요</p>
                {(search || activeFilterCount > 0) && (
                  <button onClick={() => { setSearch(""); setFilterSource(""); setFilterMedium(""); setFilterCampaign(""); setFilterAuthor(""); }}
                    className="text-xs text-violet-500 hover:underline">
                    모든 필터 초기화
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-2xl border border-border overflow-hidden">
                {groupView === "date" ? (
                  sortedDateGroups.map((group, gi) => (
                    <div key={group}>
                      <div className={`px-6 py-2.5 bg-secondary/30 flex items-center justify-between ${gi > 0 ? "border-t border-border" : ""}`}>
                        <span className="text-xs font-medium text-muted-foreground">{group}</span>
                        <span className="text-xs text-muted-foreground">{grouped[group].length}개</span>
                      </div>
                      {renderLinks(grouped[group])}
                    </div>
                  ))
                ) : (
                  sortedCampaignGroups.map((campaign, ci) => {
                    const links = campaignGrouped[campaign];
                    const uniqueSources = [...new Set(links.map((l) => l.utmSource))];
                    return (
                      <div key={campaign}>
                        <div className={`px-6 py-3 bg-secondary/30 flex items-center gap-3 ${ci > 0 ? "border-t border-border" : ""}`}>
                          <span className="text-xs font-semibold font-mono text-foreground">{campaign}</span>
                          <div className="flex items-center gap-1">
                            {uniqueSources.map((s) => (
                              <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 font-medium">{s}</span>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground ml-auto">{links.length}개</span>
                        </div>
                        {renderLinks(links)}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <CreateDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        presets={presets}
        templates={templates}
        onSaved={fetchLinks}
        editingLink={editingLink}
        duplicateFrom={duplicateFrom}
        existingLinks={savedLinks}
      />
    </>
  );
}
