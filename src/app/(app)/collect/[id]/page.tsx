"use client";

import { useState, useEffect, useCallback } from "react";
import { use } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  ArrowLeft, Database, Globe, Copy, Check, Plus, Trash2,
  GripVertical, Code2, Table2, Settings2, Loader2, RefreshCw,
  ToggleLeft, ToggleRight, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface FieldMapping {
  id: string;
  index: number;
  key: string;
  label: string;
  type: string;
  isRequired: boolean;
  sortOrder: number;
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
  fieldMappings: FieldMapping[];
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

const TABS = [
  { id: "records", label: "수집 데이터", icon: Table2 },
  { id: "fields", label: "필드 설정", icon: Settings2 },
  { id: "script", label: "스크립트", icon: Code2 },
] as const;

type Tab = typeof TABS[number]["id"];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function timeStr(dateStr: string) {
  return new Date(dateStr).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CollectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [source, setSource] = useState<CollectSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("records");

  // records tab
  const [records, setRecords] = useState<CollectRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // fields tab
  const [fields, setFields] = useState<FieldMapping[]>([]);
  const [isSavingFields, setIsSavingFields] = useState(false);

  // script tab
  const [script, setScript] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);

  // settings
  const [successTrigger, setSuccessTrigger] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");

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
    } finally {
      setRecordsLoading(false);
    }
  }, [id]);

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

  useEffect(() => { fetchSource(); }, [fetchSource]);
  useEffect(() => { if (tab === "records") fetchRecords(); }, [tab, fetchRecords]);
  useEffect(() => { if (tab === "script") fetchScript(); }, [tab, fetchScript]);

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
      fetchScript();
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
    fetchSource();
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
    <div className="p-6 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="mb-6">
        <Link href="/collect" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="w-3.5 h-3.5" />데이터 수집 목록
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">{source.name}</h1>
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
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleToggle} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-sm hover:bg-secondary transition-colors">
              {source.isActive
                ? <><ToggleRight className="w-4 h-4 text-violet-500" /><span className="text-violet-500">활성</span></>
                : <><ToggleLeft className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">비활성</span></>}
            </button>
          </div>
        </div>

        {/* API Key */}
        <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary border border-border">
          <span className="text-xs text-muted-foreground font-mono shrink-0">API Key</span>
          <span className="text-xs font-mono truncate flex-1">{source.apiKey}</span>
          <CopyButton text={source.apiKey} />
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map(({ id: tabId, label, icon: Icon }) => (
          <button
            key={tabId}
            onClick={() => setTab(tabId)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === tabId
                ? "border-violet-500 text-violet-500"
                : "border-transparent text-muted-foreground hover:text-foreground"
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

      {/* 탭 콘텐츠 */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {/* 수집 데이터 */}
          {tab === "records" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-muted-foreground">총 {recordsTotal.toLocaleString()}건</p>
                <button onClick={fetchRecords} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
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
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">시간</th>
                        {source.fieldMappings.map((f) => (
                          <th key={f.id} className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">{f.label}</th>
                        ))}
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">UTM 소스</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground">UTM 매체</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr key={record.id} className="border-b border-border last:border-0 hover:bg-secondary/30 transition-colors">
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
            </div>
          )}

          {/* 필드 설정 */}
          {tab === "fields" && (
            <div>
              <div className="mb-4 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">성공 트리거 텍스트</label>
                  <input
                    type="text"
                    value={successTrigger}
                    onChange={(e) => setSuccessTrigger(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">폼 제출 후 페이지에 이 텍스트가 나타나면 데이터를 수집해요</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">제출 후 리다이렉트 URL</label>
                  <input
                    type="url"
                    value={redirectUrl}
                    onChange={(e) => setRedirectUrl(e.target.value)}
                    placeholder="https://example.com/thank-you (선택)"
                    className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                  />
                </div>
                <button
                  onClick={handleSaveSettings}
                  className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
                >
                  설정 저장
                </button>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium">필드 매핑</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">아임웹 폼의 form-group 순서(0부터)와 매핑해요</p>
                  </div>
                </div>

                <Reorder.Group axis="y" values={fields} onReorder={setFields} className="space-y-2">
                  {fields.map((field, idx) => (
                    <Reorder.Item key={field.id} value={field}>
                      <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-background">
                        <GripVertical className="w-4 h-4 text-muted-foreground/40 cursor-grab shrink-0" />
                        <div className="w-10 shrink-0">
                          <input
                            type="number"
                            min={0}
                            value={field.index}
                            onChange={(e) => updateField(idx, { index: parseInt(e.target.value) || 0 })}
                            className="w-full px-2 py-1 rounded-lg border border-border bg-background text-xs text-center focus:outline-none focus:border-violet-400"
                            title="form-group 인덱스"
                          />
                        </div>
                        <input
                          type="text"
                          value={field.key}
                          onChange={(e) => updateField(idx, { key: e.target.value })}
                          placeholder="키 (영문)"
                          className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                        />
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateField(idx, { label: e.target.value })}
                          placeholder="라벨 (예: 이름)"
                          className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                        />
                        <select
                          value={field.type}
                          onChange={(e) => updateField(idx, { type: e.target.value })}
                          className="px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                        >
                          <option value="text">텍스트</option>
                          <option value="select">선택</option>
                          <option value="checkbox">체크박스</option>
                        </select>
                        <button
                          onClick={() => removeField(idx)}
                          className="p-1 rounded-lg hover:bg-red-500/10 hover:text-red-500 transition-colors text-muted-foreground shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Reorder.Item>
                  ))}
                </Reorder.Group>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={addField}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-violet-400 hover:text-violet-500 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />필드 추가
                  </button>
                  <button
                    onClick={handleSaveFields}
                    disabled={isSavingFields}
                    className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
                  >
                    {isSavingFields ? "저장 중..." : "필드 저장"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 스크립트 */}
          {tab === "script" && (
            <div>
              <div className="mb-4 p-4 rounded-2xl border border-amber-400/30 bg-amber-500/5">
                <p className="text-sm font-medium text-amber-600">설치 방법</p>
                <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                  <li>아임웹 관리자 → 사이트 설정 → 사용자 정의 코드</li>
                  <li>하단 아래에 아래 스크립트를 붙여넣기</li>
                  <li>필드 설정 탭에서 form-group 인덱스를 먼저 맞춰주세요</li>
                </ol>
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
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
