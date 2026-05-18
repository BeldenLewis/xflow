"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { use } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  ArrowLeft, Database, Globe, Copy, Check, Plus, Trash2,
  GripVertical, Code2, Table2, Settings2, Loader2, RefreshCw,
  ToggleLeft, ToggleRight, ExternalLink, Sparkles, ClipboardPaste,
  Download, Upload, ArrowUp, ArrowDown, ChevronsUpDown, Wand2,
  ChevronLeft, ChevronRight, Search, Filter, Activity, Shield,
  RefreshCcw, Bell, Webhook, KeyRound, Eraser, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/contexts/workspace";
import ImportModal from "./ImportModal";
import CleanupModal from "./CleanupModal";
import RecordDetailModal from "./RecordDetailModal";
import NormalizeModal from "./NormalizeModal";
import TestModal from "./TestModal";
import DangerDeleteModal from "./DangerDeleteModal";
import { formatKst, formatKstDateTime } from "@/lib/datetime";

type SortKind = "createdAt" | "field" | "utmSource" | "utmMedium";
interface SortState {
  kind: SortKind;
  fieldKey?: string;
  dir: "asc" | "desc";
}

interface FieldMapping {
  id: string;
  index: number;
  key: string;
  label: string;
  type: string;
  isRequired: boolean;
  sortOrder: number;
}

interface DiscoveredField {
  index: number;
  label: string;
  type: string;
}

interface CollectSource {
  id: string;
  name: string;
  description: string | null;
  apiKey: string;
  siteUrl: string | null;
  successTrigger: string;
  redirectUrl: string | null;
  isActive: boolean;
  projectId: string;
  workspaceId: string;
  webhookUrl: string | null;
  notifyOnSubmit: boolean;
  allowedOrigins: string[];
  fieldMappings: FieldMapping[];
  discoveredFields: DiscoveredField[] | null;
  _count: { records: number };
}

interface CollectRecord {
  id: string;
  data: Record<string, string>;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  referrer: string | null;
  createdAt: string;
}

interface ActivityLogEntry {
  id: string;
  action: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
}

const TABS = [
  { id: "records", label: "수집 데이터", icon: Table2 },
  { id: "fields", label: "필드 설정", icon: Settings2 },
  { id: "script", label: "스크립트", icon: Code2 },
  { id: "settings", label: "보안/알림", icon: Shield },
  { id: "activity", label: "활동 로그", icon: Activity },
] as const;

type Tab = typeof TABS[number]["id"];

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className={className ?? "p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"}>
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function timeStr(dateStr: string) {
  return formatKst(dateStr, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function toKey(label: string, index: number) {
  const romanized = label
    .replace(/[가-힣]+/g, (_, offset) => `field${offset}`)
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .toLowerCase();
  return romanized || `field_${index}`;
}

export default function CollectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { currentProject, workspace, setCurrentProject, projects } = useWorkspace();
  const [source, setSource] = useState<CollectSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("records");

  const [records, setRecords] = useState<CollectRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showCleanup, setShowCleanup] = useState(false);
  const [showNormalize, setShowNormalize] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [showDangerDelete, setShowDangerDelete] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>({ kind: "createdAt", dir: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // 검색/필터
  const [searchQuery, setSearchQuery] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterUtmSource, setFilterUtmSource] = useState("");
  const [filterUtmMedium, setFilterUtmMedium] = useState("");

  // 설정 폼
  const [settingsWebhookUrl, setSettingsWebhookUrl] = useState("");
  const [settingsNotifyOnSubmit, setSettingsNotifyOnSubmit] = useState(false);
  const [settingsAllowedOrigins, setSettingsAllowedOrigins] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  // 활동 로그
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [fields, setFields] = useState<FieldMapping[]>([]);
  const [isSavingFields, setIsSavingFields] = useState(false);
  const [successTrigger, setSuccessTrigger] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");

  const [script, setScript] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  // console sniffer paste
  const [pasteJson, setPasteJson] = useState("");
  const [pasteError, setPasteError] = useState("");

  const fetchSource = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/collect-sources/${id}`);
      const data = await res.json();
      if (!res.ok) return;
      setSource(data.source);
      setFields(data.source.fieldMappings ?? []);
      setSuccessTrigger(data.source.successTrigger);
      setRedirectUrl(data.source.redirectUrl ?? "");
      setSettingsWebhookUrl(data.source.webhookUrl ?? "");
      setSettingsNotifyOnSubmit(!!data.source.notifyOnSubmit);
      setSettingsAllowedOrigins((data.source.allowedOrigins ?? []).join("\n"));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const res = await fetch(`/api/collect-sources/${id}/records`);
      const data = await res.json();
      setRecords(data.records ?? []);
      setRecordsTotal(data.total ?? 0);
      setSelectedIds(new Set());
    } finally {
      setRecordsLoading(false);
    }
  }, [id]);

  const toggleSelect = (recordId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) next.delete(recordId);
      else next.add(recordId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = pagedRecords.map((r) => r.id);
    const allChecked = pageIds.length > 0 && pageIds.every((rid) => selectedIds.has(rid));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) pageIds.forEach((rid) => next.delete(rid));
      else pageIds.forEach((rid) => next.add(rid));
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`선택한 ${selectedIds.size}건을 삭제할까요? 되돌릴 수 없어요.`)) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/collect-sources/${id}/records`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "삭제 실패"); return; }
      toast.success(`${data.deleted}건 삭제됐어요`);
      await fetchRecords();
    } finally {
      setIsDeleting(false);
    }
  };

  // 필터/선택이 없으면 서버 export(전체), 있으면 클라이언트에서 필터된 결과 export
  const handleExportCsv = () => { handleExportCsvWithFilter(); };

  const cycleSort = (kind: SortKind, fieldKey?: string) => {
    setSort((prev) => {
      const same = prev && prev.kind === kind && prev.fieldKey === fieldKey;
      if (!same) return { kind, fieldKey, dir: "asc" };
      if (prev.dir === "asc") return { kind, fieldKey, dir: "desc" };
      return null;
    });
  };

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const fromTs = filterDateFrom ? new Date(filterDateFrom + "T00:00:00+09:00").getTime() : null;
    const toTs = filterDateTo ? new Date(filterDateTo + "T23:59:59+09:00").getTime() : null;
    return records.filter((r) => {
      if (q) {
        const haystack = [
          ...Object.values(r.data ?? {}),
          r.utmSource, r.utmMedium, r.utmCampaign, r.utmTerm, r.utmContent, r.referrer,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (fromTs || toTs) {
        const t = new Date(r.createdAt).getTime();
        if (fromTs && t < fromTs) return false;
        if (toTs && t > toTs) return false;
      }
      if (filterUtmSource && (r.utmSource ?? "") !== filterUtmSource) return false;
      if (filterUtmMedium && (r.utmMedium ?? "") !== filterUtmMedium) return false;
      return true;
    });
  }, [records, searchQuery, filterDateFrom, filterDateTo, filterUtmSource, filterUtmMedium]);

  const sortedRecords = useMemo(() => {
    if (!sort) return filteredRecords;
    const dir = sort.dir === "asc" ? 1 : -1;
    const getValue = (r: CollectRecord): string | number | null => {
      if (sort.kind === "createdAt") return new Date(r.createdAt).getTime();
      if (sort.kind === "utmSource") return r.utmSource ?? "";
      if (sort.kind === "utmMedium") return r.utmMedium ?? "";
      return r.data?.[sort.fieldKey ?? ""] ?? "";
    };
    return [...filteredRecords].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av === null || av === undefined || av === "") return 1;
      if (bv === null || bv === undefined || bv === "") return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "ko", { numeric: true }) * dir;
    });
  }, [filteredRecords, sort]);

  const utmSourceOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.utmSource).filter((v): v is string => !!v))).sort(),
    [records],
  );
  const utmMediumOptions = useMemo(
    () => Array.from(new Set(records.map((r) => r.utmMedium).filter((v): v is string => !!v))).sort(),
    [records],
  );

  const hasActiveFilter = !!(searchQuery || filterDateFrom || filterDateTo || filterUtmSource || filterUtmMedium);
  const resetFilters = () => {
    setSearchQuery(""); setFilterDateFrom(""); setFilterDateTo("");
    setFilterUtmSource(""); setFilterUtmMedium("");
  };

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEnd = pageStart + pageSize;
  const pagedRecords = useMemo(
    () => sortedRecords.slice(pageStart, pageEnd),
    [sortedRecords, pageStart, pageEnd],
  );

  // 정렬/페이지 크기/필터 변경 시 1페이지로
  useEffect(() => { setPage(1); }, [sort, pageSize, recordsTotal, searchQuery, filterDateFrom, filterDateTo, filterUtmSource, filterUtmMedium]);

  const sortIcon = (kind: SortKind, fieldKey?: string) => {
    const active = sort && sort.kind === kind && sort.fieldKey === fieldKey;
    if (!active) return <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40" />;
    return sort.dir === "asc"
      ? <ArrowUp className="w-3 h-3 text-violet-500" />
      : <ArrowDown className="w-3 h-3 text-violet-500" />;
  };

  const fetchScript = useCallback(async () => {
    setScriptLoading(true);
    try {
      const res = await fetch(`/api/collect-sources/${id}/script`);
      const data = await res.json();
      setScript(data.script ?? "");
    } finally {
      setScriptLoading(false);
    }
  }, [id]);

  const fetchActivity = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/collect-sources/${id}/activity`);
      const data = await res.json();
      setActivityLogs(data.logs ?? []);
    } finally {
      setActivityLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchSource(); }, [fetchSource]);

  // 프로젝트 컨텍스트 ↔ URL 의 소스 동기화
  // - 처음 로드: URL 의 소스 projectId 와 currentProject 가 다르면 currentProject 를 맞춤
  // - 그 뒤 사용자가 프로젝트를 다른 곳으로 전환하면 /collect 목록으로 이동
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!source || !currentProject || projects.length === 0) return;
    if (source.projectId === currentProject.id) {
      syncedRef.current = true;
      return;
    }
    if (!syncedRef.current) {
      // 초기 동기화: URL 기준으로 프로젝트 맞추기
      const proj = projects.find((p) => p.id === source.projectId);
      if (proj) setCurrentProject(proj);
      else router.replace("/collect");
    } else {
      // 사용자가 프로젝트를 바꿈 → 목록으로
      router.replace("/collect");
    }
  }, [source, currentProject, projects, setCurrentProject, router]);

  // 워크스페이스가 다르면 접근 불가 → 목록으로
  useEffect(() => {
    if (!source || !workspace) return;
    if (source.workspaceId !== workspace.id) router.replace("/collect");
  }, [source, workspace, router]);
  useEffect(() => { if (tab === "records") fetchRecords(); }, [tab, fetchRecords]);
  useEffect(() => { if (tab === "script") fetchScript(); }, [tab, fetchScript]);
  useEffect(() => { if (tab === "activity") fetchActivity(); }, [tab, fetchActivity]);

  const handleSaveSecuritySettings = async () => {
    setSavingSettings(true);
    try {
      const origins = settingsAllowedOrigins
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`/api/collect-sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: settingsWebhookUrl || null,
          notifyOnSubmit: settingsNotifyOnSubmit,
          allowedOrigins: origins,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "저장 실패"); return; }
      toast.success("저장됐어요");
      setSource(data.source);
      setSettingsAllowedOrigins((data.source.allowedOrigins ?? []).join("\n"));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRegenerateKey = async () => {
    if (!confirm("API 키를 재발급할까요? 기존 키로 설치된 스크립트는 즉시 동작을 멈춥니다.")) return;
    setRegeneratingKey(true);
    try {
      const res = await fetch(`/api/collect-sources/${id}/regenerate-key`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "재발급 실패"); return; }
      toast.success("새 키가 발급됐어요. 스크립트를 다시 복사해주세요.");
      setSource((s) => s ? { ...s, apiKey: data.apiKey } : s);
      if (tab === "script") fetchScript();
    } finally {
      setRegeneratingKey(false);
    }
  };

  const handleExportCsvWithFilter = () => {
    if (!hasActiveFilter && selectedIds.size === 0) {
      window.location.href = `/api/collect-sources/${id}/records/export`;
      return;
    }
    // 필터/선택된 결과만 클라이언트에서 CSV 생성
    const targetRecords = selectedIds.size > 0
      ? records.filter((r) => selectedIds.has(r.id))
      : sortedRecords;
    if (!source) return;
    const csvEscape = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "시간 (KST)",
      ...source.fieldMappings.map((f) => f.label || f.key),
      "UTM 소스", "UTM 매체", "UTM 캠페인", "UTM 키워드", "UTM 콘텐츠", "Referrer",
    ];
    const rows = targetRecords.map((r) => [
      formatKstDateTime(r.createdAt),
      ...source.fieldMappings.map((f) => r.data?.[f.key] ?? ""),
      r.utmSource ?? "", r.utmMedium ?? "", r.utmCampaign ?? "",
      r.utmTerm ?? "", r.utmContent ?? "", r.referrer ?? "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    a.download = `${source.name.replace(/[^a-zA-Z0-9가-힣_-]+/g, "_")}_filtered_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleSaveFields = async () => {
    setIsSavingFields(true);
    try {
      const res = await fetch(`/api/collect-sources/${id}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: fields.map((f, i) => ({ ...f, sortOrder: i })) }),
      });
      if (!res.ok) { toast.error("저장 실패"); return; }
      toast.success("필드 설정이 저장됐어요");
      if (tab === "script") fetchScript();
    } finally {
      setIsSavingFields(false);
    }
  };

  const handleSaveSettings = async () => {
    const res = await fetch(`/api/collect-sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ successTrigger, redirectUrl: redirectUrl || null }),
    });
    if (!res.ok) { toast.error("저장 실패"); return; }
    toast.success("설정이 저장됐어요");
    setSource((s) => s ? { ...s, successTrigger, redirectUrl: redirectUrl || null } : s);
  };

  const handleToggle = async () => {
    if (!source) return;
    const res = await fetch(`/api/collect-sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !source.isActive }),
    });
    if (!res.ok) { toast.error("상태 변경 실패"); return; }
    setSource((s) => s ? { ...s, isActive: !s.isActive } : s);
  };

  // 감지된 필드 한 번에 적용
  const applyDiscoveredFields = () => {
    if (!source?.discoveredFields) return;
    const applied: FieldMapping[] = source.discoveredFields.map((f, i) => ({
      id: `discovered-${i}`,
      index: f.index,
      key: toKey(f.label, f.index),
      label: f.label || `필드 ${f.index}`,
      type: f.type || "text",
      isRequired: false,
      sortOrder: i,
    }));
    setFields(applied);
    toast.success("감지된 필드가 적용됐어요. 저장 버튼을 눌러 확정하세요");
    setTab("fields");
  };

  // 콘솔 스니퍼 JSON 붙여넣기로 필드 적용
  const applyPastedJson = () => {
    setPasteError("");
    try {
      const parsed = JSON.parse(pasteJson);
      if (!Array.isArray(parsed)) throw new Error("배열 형식이 아니에요");
      const applied: FieldMapping[] = parsed.map((f: { index?: number; key?: string; label?: string; type?: string }, i: number) => ({
        id: `pasted-${i}`,
        index: typeof f.index === "number" ? f.index : i,
        key: f.key || toKey(f.label ?? "", i),
        label: f.label || `필드 ${i}`,
        type: f.type || "text",
        isRequired: false,
        sortOrder: i,
      }));
      setFields(applied);
      setPasteJson("");
      toast.success(`${applied.length}개 필드가 적용됐어요. 저장 버튼을 눌러 확정하세요`);
      setTab("fields");
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : "JSON 형식이 올바르지 않아요");
    }
  };

  const addField = () => {
    const newIndex = fields.length;
    setFields((f) => [...f, {
      id: `new-${Date.now()}`,
      index: newIndex,
      key: `field_${newIndex}`,
      label: "",
      type: "text",
      isRequired: false,
      sortOrder: newIndex,
    }]);
  };

  const removeField = (idx: number) => {
    setFields((f) => f.filter((_, i) => i !== idx).map((fld, i) => ({ ...fld, index: i, sortOrder: i })));
  };

  const updateField = (idx: number, patch: Partial<FieldMapping>) => {
    setFields((f) => f.map((fld, i) => i === idx ? { ...fld, ...patch } : fld));
  };

  // 콘솔 스니퍼 스크립트
  const snifferScript = `(function() {
  var groups = document.querySelectorAll(".form-group");
  var fields = Array.from(groups).map(function(g, i) {
    var label = g.querySelector("label");
    var input = g.querySelector("input, select, textarea");
    var labelText = (label ? label.textContent.trim() : "") ||
      (input ? (input.placeholder || input.getAttribute("name") || "") : "");
    var type = "text";
    if (input) {
      if (input.tagName === "SELECT") type = "select";
      else if (input.type === "checkbox") type = "checkbox";
    }
    return { index: i, key: "field_" + i, label: labelText, type: type };
  });
  try { copy(JSON.stringify(fields, null, 2)); } catch(e) {}
  console.log(JSON.stringify(fields, null, 2));
  return fields;
})();`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">소스를 찾을 수 없어요</p>
        <Link href="/collect" className="text-sm text-violet-500 mt-2">목록으로</Link>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* 헤더 */}
      <div>
        <Link href="/collect" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="w-3.5 h-3.5" />데이터 수집 목록
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{source.name}</h1>
              <div className="flex items-center gap-3 mt-0.5">
                {source.description && <p className="text-sm text-muted-foreground">{source.description}</p>}
                {source.siteUrl && (
                  <a href={source.siteUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3" />{source.siteUrl}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
          <button onClick={handleToggle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-sm hover:bg-secondary transition-colors shrink-0">
            {source.isActive
              ? <><ToggleRight className="w-4 h-4 text-violet-500" /><span className="text-violet-500">활성</span></>
              : <><ToggleLeft className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">비활성</span></>}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary border border-border">
          <span className="text-xs text-muted-foreground font-mono shrink-0">API Key</span>
          <span className="text-xs font-mono truncate flex-1">{source.apiKey}</span>
          <CopyButton text={source.apiKey} />
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button key={tabId} onClick={() => setTab(tabId)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === tabId ? "border-violet-500 text-violet-500" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />{label}
            {tabId === "records" && recordsTotal > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-500">
                {recordsTotal.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {/* 수집 데이터 탭 */}
          {tab === "records" && (
            <div>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  {hasActiveFilter
                    ? <>필터 결과 <span className="text-foreground font-medium">{filteredRecords.length.toLocaleString()}</span> / {recordsTotal.toLocaleString()}건</>
                    : <>총 {recordsTotal.toLocaleString()}건</>}
                  {selectedIds.size > 0 && <span className="ml-2 text-violet-500">· {selectedIds.size}건 선택</span>}
                </p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedIds.size > 0 && (
                    <button
                      onClick={handleDeleteSelected}
                      disabled={isDeleting}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/5 text-red-500 text-xs font-medium hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isDeleting ? "삭제 중..." : `선택 삭제`}
                    </button>
                  )}
                  <button
                    onClick={() => setShowImport(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-400/30 bg-violet-500/5 text-violet-500 text-xs font-medium hover:bg-violet-500/10 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />엑셀/CSV 가져오기
                  </button>
                  <button
                    onClick={() => setShowNormalize(true)}
                    disabled={recordsTotal === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-emerald-600 text-xs font-medium hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                  >
                    <Eraser className="w-3.5 h-3.5" />정규화
                  </button>
                  <button
                    onClick={() => setShowCleanup(true)}
                    disabled={recordsTotal === 0 || source.fieldMappings.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-500 text-xs font-medium hover:bg-amber-500/10 transition-colors disabled:opacity-40"
                  >
                    <Wand2 className="w-3.5 h-3.5" />중복 정리
                  </button>
                  <button
                    onClick={handleExportCsv}
                    disabled={recordsTotal === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-secondary transition-colors disabled:opacity-40"
                    title={hasActiveFilter || selectedIds.size > 0 ? "필터/선택된 결과만 내보냅니다" : "전체 데이터를 내보냅니다"}
                  >
                    <Download className="w-3.5 h-3.5" />CSV 내보내기
                  </button>
                  <button onClick={fetchRecords} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 검색/필터 바 */}
              {records.length > 0 && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="이름·이메일·휴대폰 등 모든 필드 검색"
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                    />
                  </div>
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                    title="시작일 (KST)"
                  />
                  <span className="text-xs text-muted-foreground">~</span>
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                    title="종료일 (KST)"
                  />
                  {utmSourceOptions.length > 0 && (
                    <select
                      value={filterUtmSource}
                      onChange={(e) => setFilterUtmSource(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                    >
                      <option value="">UTM 소스 전체</option>
                      {utmSourceOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                  {utmMediumOptions.length > 0 && (
                    <select
                      value={filterUtmMedium}
                      onChange={(e) => setFilterUtmMedium(e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                    >
                      <option value="">UTM 매체 전체</option>
                      {utmMediumOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                  )}
                  {hasActiveFilter && (
                    <button onClick={resetFilters} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-secondary transition-colors">
                      <Filter className="w-3 h-3" />필터 해제
                    </button>
                  )}
                </div>
              )}

              {/* 필터된 전체 선택 배너 */}
              {selectedIds.size > 0 && selectedIds.size < filteredRecords.length && pagedRecords.every((r) => selectedIds.has(r.id)) && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-violet-500/5 border border-violet-400/30 text-xs flex items-center justify-between">
                  <span>이 페이지의 {pagedRecords.length}건이 선택됐어요.</span>
                  <button
                    onClick={() => setSelectedIds(new Set(filteredRecords.map((r) => r.id)))}
                    className="text-violet-500 font-medium hover:underline"
                  >
                    {hasActiveFilter ? `필터된 ${filteredRecords.length}건 전체 선택` : `전체 ${filteredRecords.length}건 선택`}
                  </button>
                </div>
              )}
              {recordsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : records.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Table2 className="w-8 h-8 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">아직 수집된 데이터가 없어요</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">스크립트를 설치하면 폼 제출 시 자동으로 수집돼요</p>
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Filter className="w-8 h-8 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">필터 조건에 맞는 데이터가 없어요</p>
                  <button onClick={resetFilters} className="text-xs text-violet-500 hover:underline mt-2">필터 해제</button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="px-3 py-2.5 w-10">
                          <input
                            type="checkbox"
                            checked={pagedRecords.length > 0 && pagedRecords.every((r) => selectedIds.has(r.id))}
                            onChange={toggleSelectAll}
                            className="accent-violet-500 cursor-pointer"
                            aria-label="현재 페이지 모두 선택"
                          />
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                          <button onClick={() => cycleSort("createdAt")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            시간 {sortIcon("createdAt")}
                          </button>
                        </th>
                        {source.fieldMappings.map((f) => (
                          <th key={f.id} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                            <button onClick={() => cycleSort("field", f.key)} className="flex items-center gap-1 hover:text-foreground transition-colors">
                              {f.label} {sortIcon("field", f.key)}
                            </button>
                          </th>
                        ))}
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                          <button onClick={() => cycleSort("utmSource")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            UTM 소스 {sortIcon("utmSource")}
                          </button>
                        </th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                          <button onClick={() => cycleSort("utmMedium")} className="flex items-center gap-1 hover:text-foreground transition-colors">
                            UTM 매체 {sortIcon("utmMedium")}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRecords.map((record) => (
                        <tr
                          key={record.id}
                          onClick={() => setDetailRecordId(record.id)}
                          className={`border-b border-border last:border-0 hover:bg-secondary/30 transition-colors cursor-pointer ${selectedIds.has(record.id) ? "bg-violet-500/5" : ""}`}
                        >
                          <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(record.id)}
                              onChange={() => toggleSelect(record.id)}
                              className="accent-violet-500 cursor-pointer"
                              aria-label="선택"
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{timeStr(record.createdAt)}</td>
                          {source.fieldMappings.map((f) => (
                            <td key={f.id} className="px-4 py-3 text-xs max-w-[160px] truncate">{record.data[f.key] ?? "-"}</td>
                          ))}
                          <td className="px-4 py-3 text-xs text-muted-foreground">{record.utmSource ?? "-"}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{record.utmMedium ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {!recordsLoading && records.length > 0 && (
                <div className="flex items-center justify-between gap-3 mt-3 px-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {(pageStart + 1).toLocaleString()}–{Math.min(pageEnd, sortedRecords.length).toLocaleString()} / {sortedRecords.length.toLocaleString()}건
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <label className="flex items-center gap-1">
                      페이지당
                      <select
                        value={pageSize}
                        onChange={(e) => setPageSize(parseInt(e.target.value))}
                        className="px-1.5 py-0.5 rounded border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                      >
                        {[25, 50, 100, 200, 500].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage(1)}
                      disabled={safePage === 1}
                      className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      처음
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="p-1 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="이전 페이지"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-muted-foreground px-2 tabular-nums">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="p-1 rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      aria-label="다음 페이지"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setPage(totalPages)}
                      disabled={safePage === totalPages}
                      className="px-2 py-1 rounded-lg text-xs text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      마지막
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 필드 설정 탭 */}
          {tab === "fields" && (
            <div className="space-y-5">
              {/* A: 자동 감지된 필드 */}
              {source.discoveredFields && source.discoveredFields.length > 0 && (
                <div className="p-4 rounded-2xl border border-violet-400/30 bg-violet-500/5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-500" />
                      <span className="text-sm font-medium text-violet-500">스크립트가 감지한 필드</span>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={applyDiscoveredFields}
                      className="px-3 py-1.5 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors"
                    >
                      한 번에 적용
                    </motion.button>
                  </div>
                  <div className="space-y-1.5">
                    {source.discoveredFields.map((f) => (
                      <div key={f.index} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-background border border-border text-xs">
                        <span className="w-6 text-center font-mono text-muted-foreground">{f.index}</span>
                        <span className="flex-1 font-medium">{f.label || <span className="text-muted-foreground italic">라벨 없음</span>}</span>
                        <span className="text-muted-foreground">{f.type}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">실제 폼 제출 시 스크립트가 감지한 필드예요. "한 번에 적용" 후 라벨과 키를 수정하세요.</p>
                </div>
              )}

              {/* 트리거/리다이렉트 설정 */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">성공 트리거 텍스트</label>
                  <input type="text" value={successTrigger} onChange={(e) => setSuccessTrigger(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400" />
                  <p className="text-[11px] text-muted-foreground mt-1">폼 제출 후 이 텍스트가 나타나면 데이터를 수집해요</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">제출 후 리다이렉트 URL</label>
                  <input type="url" value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)}
                    placeholder="https://example.com/thank-you (선택)"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400" />
                </div>
                <button onClick={handleSaveSettings}
                  className="px-4 py-2 rounded-xl bg-secondary border border-border text-sm font-medium hover:bg-secondary/80 transition-colors">
                  설정 저장
                </button>
              </div>

              {/* 필드 매핑 편집기 */}
              <div className="border-t border-border pt-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium">필드 매핑</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">인덱스는 아임웹 form-group 순서(0부터)예요</p>
                  </div>
                </div>

                <Reorder.Group axis="y" values={fields} onReorder={setFields} className="space-y-2">
                  {fields.map((field, idx) => (
                    <Reorder.Item key={field.id} value={field}>
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-background">
                        <GripVertical className="w-4 h-4 text-muted-foreground/40 cursor-grab shrink-0" />
                        <div className="w-10 shrink-0">
                          <input type="number" min={0} value={field.index}
                            onChange={(e) => updateField(idx, { index: parseInt(e.target.value) || 0 })}
                            className="w-full px-2 py-1 rounded-lg border border-border bg-background text-xs text-center focus:outline-none focus:border-violet-400"
                            title="form-group 인덱스" />
                        </div>
                        <input type="text" value={field.key} onChange={(e) => updateField(idx, { key: e.target.value })}
                          placeholder="키 (영문)"
                          className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400" />
                        <input type="text" value={field.label} onChange={(e) => updateField(idx, { label: e.target.value })}
                          placeholder="라벨 (예: 이름)"
                          className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400" />
                        <select value={field.type} onChange={(e) => updateField(idx, { type: e.target.value })}
                          className="px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400">
                          <option value="text">텍스트</option>
                          <option value="select">선택</option>
                          <option value="checkbox">체크박스</option>
                        </select>
                        <button onClick={() => removeField(idx)}
                          className="p-1 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>

                <div className="flex gap-2 mt-3">
                  <button onClick={addField}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-violet-400 hover:text-violet-500 transition-colors">
                    <Plus className="w-3.5 h-3.5" />필드 추가
                  </button>
                  <button onClick={handleSaveFields} disabled={isSavingFields}
                    className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40">
                    {isSavingFields ? "저장 중..." : "필드 저장"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 스크립트 탭 */}
          {tab === "script" && (
            <div className="space-y-5">
              {/* B: 콘솔 스니퍼 */}
              <div className="p-4 rounded-2xl border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium">필드 자동 감지 (설치 전 사용)</span>
                </div>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside mb-3">
                  <li>아임웹 등록 폼 페이지를 열고 브라우저 콘솔(F12)을 엽니다</li>
                  <li>아래 스크립트를 복사해서 콘솔에 붙여넣고 Enter</li>
                  <li>출력된 JSON을 아래에 붙여넣기 → 필드 자동 입력</li>
                </ol>
                <div className="relative mb-3">
                  <div className="absolute top-2 right-2">
                    <CopyButton text={snifferScript} />
                  </div>
                  <pre className="p-3 rounded-xl bg-secondary border border-border text-[11px] font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed pr-10">
                    {snifferScript}
                  </pre>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ClipboardPaste className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">콘솔 출력 결과 붙여넣기</span>
                  </div>
                  <textarea
                    value={pasteJson}
                    onChange={(e) => { setPasteJson(e.target.value); setPasteError(""); }}
                    placeholder={'[\n  { "index": 0, "key": "field_0", "label": "이름", "type": "text" },\n  ...\n]'}
                    rows={4}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-xs font-mono focus:outline-none focus:border-violet-400 resize-none"
                  />
                  {pasteError && <p className="text-xs text-red-500">{pasteError}</p>}
                  <button
                    onClick={applyPastedJson}
                    disabled={!pasteJson.trim()}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-40"
                  >
                    <Check className="w-3.5 h-3.5" />필드 적용
                  </button>
                </div>
              </div>

              {/* 실제 수집 스크립트 */}
              <div>
                <div className="mb-3 p-4 rounded-2xl border border-border bg-secondary/30 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium mb-1">아임웹 설치</p>
                    <p className="text-xs text-muted-foreground">관리자 → 사이트 설정 → 사용자 정의 코드 → &lt;/body&gt; 앞에 붙여넣기</p>
                  </div>
                  <button
                    onClick={() => setShowTest(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors shrink-0"
                  >
                    <Activity className="w-3.5 h-3.5" />설치 테스트
                  </button>
                </div>
                {scriptLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : script ? (
                  <div className="relative">
                    <div className="absolute top-3 right-3 z-10">
                      <CopyButton text={`<script>\n${script}\n</script>`} />
                    </div>
                    <pre className="p-4 rounded-2xl bg-secondary border border-border text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {`<script>\n${script}\n</script>`}
                    </pre>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Code2 className="w-8 h-8 text-muted-foreground/20 mb-3" />
                    <p className="text-sm text-muted-foreground">필드를 먼저 설정하면 스크립트가 생성돼요</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 보안/알림 탭 */}
          {tab === "settings" && (
            <div className="space-y-5 max-w-2xl">
              {/* API 키 */}
              <div className="p-4 rounded-2xl border border-border bg-background space-y-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-violet-500" />
                  <h3 className="text-sm font-medium">API 키</h3>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary border border-border">
                  <span className="text-xs font-mono truncate flex-1">{source.apiKey}</span>
                  <CopyButton text={source.apiKey} />
                </div>
                <div className="flex items-start gap-2">
                  <button
                    onClick={handleRegenerateKey}
                    disabled={regeneratingKey}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/5 text-red-500 text-xs font-medium hover:bg-red-500/10 transition-colors disabled:opacity-40"
                  >
                    {regeneratingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                    키 재발급
                  </button>
                  <p className="text-[11px] text-muted-foreground">
                    키가 유출됐거나 정기 교체할 때 사용하세요. 재발급 시 기존 스크립트는 즉시 동작을 멈추고, 새 키로 다시 설치해야 해요.
                  </p>
                </div>
              </div>

              {/* 허용 Origin */}
              <div className="p-4 rounded-2xl border border-border bg-background space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-medium">허용 Origin (CORS)</h3>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  비워두면 모든 출처에서 호출 가능합니다. 보안을 위해 실제 폼이 있는 도메인만 허용하세요. 한 줄에 하나씩, 또는 쉼표로 구분.
                </p>
                <textarea
                  value={settingsAllowedOrigins}
                  onChange={(e) => setSettingsAllowedOrigins(e.target.value)}
                  placeholder={"https://example.com\nhttps://www.example.com"}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:border-violet-400 resize-none"
                />
              </div>

              {/* 알림 */}
              <div className="p-4 rounded-2xl border border-border bg-background space-y-3">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-medium">새 제출 알림</h3>
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsNotifyOnSubmit}
                    onChange={(e) => setSettingsNotifyOnSubmit(e.target.checked)}
                    className="mt-0.5 accent-violet-500 cursor-pointer"
                  />
                  <div>
                    <p className="text-sm">인앱 알림 켜기</p>
                    <p className="text-[11px] text-muted-foreground">새 폼 제출이 있을 때 워크스페이스 멤버들에게 알림이 표시돼요</p>
                  </div>
                </label>
              </div>

              {/* 웹훅 */}
              <div className="p-4 rounded-2xl border border-border bg-background space-y-3">
                <div className="flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-medium">웹훅 URL</h3>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  새 레코드가 수집되면 이 URL로 POST 요청을 보냅니다. Slack incoming webhook, Discord, Zapier 등에 연결할 수 있어요.
                </p>
                <input
                  type="url"
                  value={settingsWebhookUrl}
                  onChange={(e) => setSettingsWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:border-violet-400"
                />
                <details className="text-[11px] text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">전송되는 페이로드 형식</summary>
                  <pre className="mt-2 p-2 rounded-lg bg-secondary border border-border overflow-x-auto">{`{
  "event": "record.created",
  "sourceId": "...",
  "sourceName": "...",
  "recordId": "...",
  "data": { ... },
  "utm": { "utmSource": "...", ... },
  "createdAt": "ISO 8601"
}`}</pre>
                </details>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveSecuritySettings}
                  disabled={savingSettings}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
                >
                  {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  설정 저장
                </button>
              </div>

              {/* 위험 영역 */}
              <div className="p-4 rounded-2xl border-2 border-red-500/30 bg-red-500/5 space-y-3 mt-8">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">위험 영역</h3>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">모든 수집 레코드 삭제</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      이 소스에 수집된 모든 데이터({recordsTotal.toLocaleString()}건)를 영구 삭제합니다. 되돌릴 수 없어요.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDangerDelete(true)}
                    disabled={recordsTotal === 0}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />전체 삭제
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 활동 로그 탭 */}
          {tab === "activity" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">최근 활동 {activityLogs.length}건</p>
                <button onClick={fetchActivity} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {activityLoading ? (
                <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : activityLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Activity className="w-8 h-8 text-muted-foreground/20 mb-3" />
                  <p className="text-sm text-muted-foreground">기록된 활동이 없어요</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {activityLogs.map((log) => (
                    <ActivityRow key={log.id} log={log} />
                  ))}
                </div>
              )}
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {showImport && (
        <ImportModal
          sourceId={id}
          fieldMappings={source.fieldMappings}
          onClose={() => setShowImport(false)}
          onImported={() => { fetchRecords(); fetchSource(); }}
        />
      )}

      {showCleanup && (
        <CleanupModal
          sourceId={id}
          fieldMappings={source.fieldMappings}
          onClose={() => setShowCleanup(false)}
          onCleaned={() => { fetchRecords(); fetchSource(); }}
        />
      )}

      {showNormalize && (
        <NormalizeModal
          sourceId={id}
          fieldMappings={source.fieldMappings}
          onClose={() => setShowNormalize(false)}
          onApplied={() => { fetchRecords(); }}
        />
      )}

      {showTest && (
        <TestModal
          sourceId={id}
          siteUrl={source.siteUrl}
          fieldMappings={source.fieldMappings}
          onClose={() => setShowTest(false)}
          onRecordReceived={() => { fetchRecords(); }}
        />
      )}

      {showDangerDelete && (
        <DangerDeleteModal
          sourceId={id}
          sourceName={source.name}
          recordCount={recordsTotal}
          onClose={() => setShowDangerDelete(false)}
          onDeleted={() => { fetchRecords(); fetchSource(); }}
        />
      )}

      {detailRecordId && (
        <RecordDetailModal
          sourceId={id}
          recordId={detailRecordId}
          fieldMappings={source.fieldMappings}
          onClose={() => setDetailRecordId(null)}
          onChanged={() => { fetchRecords(); }}
        />
      )}
    </div>
  );
}

// ── 활동 로그 행 ──────────────────────────────────────
function ActivityRow({ log }: { log: ActivityLogEntry }) {
  const { label, color } = activityLabel(log.action);
  const meta = log.meta ?? {};
  const summary = activitySummary(log.action, meta);
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-border bg-background">
      <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-sm font-medium">{label}</p>
          {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {formatKstDateTime(log.createdAt)} KST
          {log.user && <> · {log.user.name ?? log.user.email}</>}
        </p>
      </div>
    </div>
  );
}

function activityLabel(action: string): { label: string; color: string } {
  switch (action) {
    case "source.created":         return { label: "소스 생성",         color: "bg-emerald-500" };
    case "source.updated":         return { label: "소스 설정 변경",     color: "bg-blue-500" };
    case "source.deleted":         return { label: "소스 삭제",         color: "bg-red-500" };
    case "source.key_regenerated": return { label: "API 키 재발급",      color: "bg-amber-500" };
    case "record.created":         return { label: "레코드 생성",        color: "bg-emerald-500" };
    case "record.updated":         return { label: "레코드 편집",        color: "bg-blue-500" };
    case "record.deleted":         return { label: "레코드 삭제",        color: "bg-red-500" };
    case "records.bulk_deleted":   return { label: "레코드 일괄 삭제",   color: "bg-red-500" };
    case "records.imported":       return { label: "데이터 가져오기",    color: "bg-violet-500" };
    case "records.cleaned":        return { label: "중복 정리",          color: "bg-amber-500" };
    case "records.normalized":     return { label: "데이터 정규화",      color: "bg-emerald-500" };
    default:                       return { label: action,              color: "bg-muted-foreground/40" };
  }
}

function activitySummary(action: string, meta: Record<string, unknown>): string {
  if (action === "records.imported") {
    const parts: string[] = [];
    if (typeof meta.imported === "number") parts.push(`신규 ${meta.imported}`);
    if (typeof meta.updated === "number" && meta.updated > 0) parts.push(`업데이트 ${meta.updated}`);
    if (typeof meta.skipped === "number" && meta.skipped > 0) parts.push(`스킵 ${meta.skipped}`);
    return parts.join(" · ");
  }
  if (action === "records.bulk_deleted" && typeof meta.count === "number") {
    return `${meta.count}건`;
  }
  if (action === "records.cleaned" && typeof meta.deleted === "number") {
    return `${meta.deleted}건 정리 (${String(meta.keyField ?? "")} 기준)`;
  }
  if (action === "records.normalized" && typeof meta.changedRows === "number") {
    return `${meta.changedRows}건 수정`;
  }
  if (action === "source.updated" && Array.isArray(meta.fields)) {
    return `${(meta.fields as string[]).join(", ")}`;
  }
  if ((action === "source.created" || action === "source.deleted") && typeof meta.name === "string") {
    return meta.name;
  }
  return "";
}
