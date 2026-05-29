"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Upload, FileSpreadsheet, Loader2, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";
import ModalShell from "./ModalShell";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface FieldMapping {
  id: string;
  key: string;
  label: string;
}

interface ImportModalProps {
  sourceId: string;
  fieldMappings: FieldMapping[];
  onClose: () => void;
  onImported: () => void;
}

type ColumnTarget =
  | { kind: "ignore" }
  | { kind: "field"; key: string }
  | { kind: "createdAt" }
  | { kind: "utmSource" }
  | { kind: "utmMedium" }
  | { kind: "utmCampaign" }
  | { kind: "utmTerm" }
  | { kind: "utmContent" }
  | { kind: "referrer" };

interface ParsedSheet {
  headers: string[];
  rows: string[][]; // string-converted values
  rawRows: unknown[][]; // for date detection
  headerRowIndex: number;
}

interface UpdateOption {
  key: string;
  label: string;
  defaultSelected: boolean;
}

interface ImportPayload {
  data: Record<string, string>;
  createdAt?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  referrer?: string;
}

interface ImportDiagnostics {
  totalRows: number;
  importableRows: number;
  mappedColumns: number;
  parsedCreatedAtRows: number;
}

interface ImportResult {
  imported?: number;
  updated?: number;
  skipped?: number;
  error?: string;
}

// Vercel 요청 본문 4.5MB 한도 회피. 실측: 1행 평균 ~960바이트(긴 한글 텍스트 포함).
// 4000건 ≈ 3.7MB로 한도 내 여유 확보 (5000건은 4.57MB로 초과).
const IMPORT_BATCH_SIZE = 4000;

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, "").replace(/[_\-/().]/g, "");
}

function autoMapColumn(header: string, fieldMappings: FieldMapping[]): ColumnTarget {
  const h = normalize(header);
  if (!h) return { kind: "ignore" };

  // 날짜/시간 관련
  if (/(신청일|등록일|접수일|일시|날짜|시간|created|date|time)/.test(h)) {
    return { kind: "createdAt" };
  }
  // UTM
  if (/(utmsource|utm소스|소스)/.test(h)) return { kind: "utmSource" };
  if (/(utmmedium|utm매체|매체)/.test(h)) return { kind: "utmMedium" };
  if (/(utmcampaign|utm캠페인|캠페인)/.test(h)) return { kind: "utmCampaign" };
  if (/(utmterm|utm키워드|키워드)/.test(h)) return { kind: "utmTerm" };
  if (/(utmcontent|utm콘텐츠|콘텐츠)/.test(h)) return { kind: "utmContent" };
  if (/(referrer|레퍼러|유입경로|출처)/.test(h)) return { kind: "referrer" };

  // 필드 매핑 라벨/키 매칭
  const exact = fieldMappings.find((f) => normalize(f.label) === h || normalize(f.key) === h);
  if (exact) return { kind: "field", key: exact.key };

  const partial = fieldMappings.find(
    (f) => normalize(f.label).includes(h) || h.includes(normalize(f.label))
  );
  if (partial && normalize(partial.label).length > 1) return { kind: "field", key: partial.key };

  return { kind: "ignore" };
}

function targetToValue(t: ColumnTarget): string {
  if (t.kind === "field") return `field:${t.key}`;
  return t.kind;
}

function valueToTarget(v: string): ColumnTarget {
  if (v.startsWith("field:")) return { kind: "field", key: v.slice(6) };
  switch (v) {
    case "createdAt":
    case "ignore":
    case "utmSource":
    case "utmMedium":
    case "utmCampaign":
    case "utmTerm":
    case "utmContent":
    case "referrer":
      return { kind: v };
    default:
      return { kind: "ignore" };
  }
}

function isBlankCell(value: unknown) {
  return value === null || value === undefined || String(value).trim() === "";
}

function excelSerialDateToISO(value: number): string | undefined {
  if (!Number.isFinite(value) || value < 20000 || value > 80000) return undefined;
  const utcDays = Math.floor(value - 25569);
  const utcValue = utcDays * 86400;
  const fractionalDay = value - Math.floor(value) + 0.0000001;
  const totalSeconds = Math.floor(86400 * fractionalDay);
  const d = new Date((utcValue + totalSeconds) * 1000);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function parseImportDate(value: unknown): string | undefined {
  if (typeof value === "number") return excelSerialDateToISO(value);
  if (value instanceof Date) return value.toISOString();
  const raw = String(value ?? "")
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ");
  if (!raw) return undefined;

  const explicitZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw);
  if (explicitZone) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  const numeric = Number(raw);
  const serialDate = excelSerialDateToISO(numeric);
  if (serialDate) return serialDate;

  const normalizedRaw = raw
    .replace(/시\s*(\d{1,2})\s*분/g, ":$1")
    .replace(/년/g, "-")
    .replace(/월/g, "-")
    .replace(/일/g, " ")
    .replace(/시/g, ":")
    .replace(/분/g, "")
    .replace(/[^\d:./\-\sAPMapm오전후]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const m = normalizedRaw.match(/^(\d{4})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})(?:\s*(?:[T ]|일|\.)\s*)?(?:(오전|오후|AM|PM|am|pm)?\s*(\d{1,2})(?::(\d{0,2}))?(?::(\d{0,2}))?)?/);
  if (m) {
    let hour = m[5] ? Number(m[5]) : 0;
    const minute = m[6] ? Number(m[6].padStart(2, "0")) : 0;
    const second = m[7] ? Number(m[7].padStart(2, "0")) : 0;
    const meridiem = m[4]?.toLowerCase();

    if (hour > 23 || minute > 59 || second > 59) return undefined;

    if (meridiem === "오후" || meridiem === "pm") {
      if (hour < 12) hour += 12;
    } else if ((meridiem === "오전" || meridiem === "am") && hour === 12) {
      hour = 0;
    }

    const iso = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}+09:00`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  const d = new Date(normalizedRaw);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

function getUpdateKey(target: ColumnTarget): string | null {
  if (target.kind === "ignore") return null;
  if (target.kind === "field") return `field:${target.key}`;
  return target.kind;
}

function getUpdateLabel(target: ColumnTarget, fieldMappings: FieldMapping[]): string {
  if (target.kind === "ignore") return "";
  if (target.kind === "field") {
    return fieldMappings.find((f) => f.key === target.key)?.label || target.key;
  }
  const labels: Record<Exclude<ColumnTarget["kind"], "ignore" | "field">, string> = {
    createdAt: "신청 시각(createdAt)",
    utmSource: "UTM 소스",
    utmMedium: "UTM 매체",
    utmCampaign: "UTM 캠페인",
    utmTerm: "UTM 키워드",
    utmContent: "UTM 콘텐츠",
    referrer: "Referrer",
  };
  return labels[target.kind];
}

function getUpdateOptions(targets: ColumnTarget[], fieldMappings: FieldMapping[]): UpdateOption[] {
  const seen = new Set<string>();
  const options: UpdateOption[] = [];
  for (const target of targets) {
    const key = getUpdateKey(target);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    options.push({
      key,
      label: getUpdateLabel(target, fieldMappings),
      defaultSelected: key !== "createdAt",
    });
  }
  return options;
}

function getDefaultUpdateFields(targets: ColumnTarget[], fieldMappings: FieldMapping[]) {
  return getUpdateOptions(targets, fieldMappings)
    .filter((option) => option.defaultSelected)
    .map((option) => option.key);
}

function hasImportPayload(record: ImportPayload) {
  return Object.keys(record.data).length > 0 ||
    Boolean(
      record.createdAt ||
      record.utmSource ||
      record.utmMedium ||
      record.utmCampaign ||
      record.utmTerm ||
      record.utmContent ||
      record.referrer,
    );
}

function scoreHeaderRow(row: unknown[], fieldMappings: FieldMapping[]) {
  let score = 0;
  let nonEmpty = 0;
  for (const cell of row) {
    const value = String(cell ?? "").trim();
    if (!value) continue;
    nonEmpty++;
    const normalized = normalize(value);
    const target = autoMapColumn(value, fieldMappings);
    if (target.kind !== "ignore") score += 3;
    if (/(응답시간|신청일|등록일|이메일|메일|연락처|휴대|전화|성함|이름|회사|소속)/.test(normalized)) {
      score += 2;
    }
  }
  return score + Math.min(nonEmpty, 8) * 0.1;
}

function detectHeaderRowIndex(rows: unknown[][], fieldMappings: FieldMapping[]) {
  const candidates = rows.slice(0, Math.min(rows.length, 10));
  let bestIndex = 0;
  let bestScore = -1;
  candidates.forEach((row, index) => {
    const score = scoreHeaderRow(row, fieldMappings);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestScore > 0 ? bestIndex : 0;
}

function buildImportRecords(sheet: ParsedSheet, targets: ColumnTarget[]) {
  let parsedCreatedAtRows = 0;
  const records = sheet.rawRows.map((rawRow, rowIndex) => {
    const data: Record<string, string> = {};
    const rec: ImportPayload = { data };
    const displayRow = sheet.rows[rowIndex] ?? [];

    sheet.headers.forEach((_, i) => {
      const target = targets[i];
      if (target.kind === "ignore") return;
      const rawValue = rawRow[i];
      if (target.kind === "field") {
        const v = isBlankCell(displayRow[i]) ? rawValue : displayRow[i];
        if (isBlankCell(v)) return;
        data[target.key] = v instanceof Date ? v.toISOString() : String(v);
      } else if (target.kind === "createdAt") {
        const parsed = parseImportDate(rawValue) ?? parseImportDate(displayRow[i]);
        if (parsed) {
          rec.createdAt = parsed;
          parsedCreatedAtRows++;
        }
      } else {
        const v = isBlankCell(displayRow[i]) ? rawValue : displayRow[i];
        if (isBlankCell(v)) return;
        const strVal = v instanceof Date ? v.toISOString() : String(v);
        rec[target.kind] = strVal;
      }
    });

    return rec;
  }).filter(hasImportPayload);

  const diagnostics: ImportDiagnostics = {
    totalRows: sheet.rawRows.length,
    importableRows: records.length,
    mappedColumns: targets.filter((target) => target.kind !== "ignore").length,
    parsedCreatedAtRows,
  };

  return { records, diagnostics };
}

async function readImportResponse(res: Response): Promise<ImportResult> {
  const text = await res.text();
  let parsed: ImportResult | null = null;

  if (text) {
    try {
      parsed = JSON.parse(text) as ImportResult;
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const rawMessage = parsed?.error || text || `HTTP ${res.status}`;
    const friendlyMessage = rawMessage.includes("Request Entity Too Large")
      ? "파일이 커서 한 번에 전송할 수 없어요. 페이지를 새로고침한 뒤 다시 시도해주세요."
      : rawMessage.slice(0, 240);
    throw new Error(friendlyMessage);
  }

  return parsed ?? {};
}

export default function ImportModal({ sourceId, fieldMappings, onClose, onImported }: ImportModalProps) {
  const [step, setStep] = useState<"upload" | "map">("upload");
  const [parsing, setParsing] = useState(false);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [targets, setTargets] = useState<ColumnTarget[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [dedupMode, setDedupMode] = useState<"skip" | "merge" | "all">("skip");
  const [mergeKeyField, setMergeKeyField] = useState<string>(fieldMappings[0]?.key ?? "");
  const [mergeUpdateFields, setMergeUpdateFields] = useState<string[]>([]);
  // skip 모드 dry-run 결과 — 버튼에 "신규 N건 (중복 M건 제외)" 표시용
  const [dryRun, setDryRun] = useState<{ wouldImport: number; wouldSkip: number } | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
    setImportProgress(null);
    setFileName(file.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) {
        toast.error("시트를 찾을 수 없어요");
        return;
      }
      // 표시값은 휴대폰/응답시간처럼 사람이 보는 형식을 보존하고,
      // 원본값은 엑셀 날짜 serial 값까지 보완하기 위해 따로 읽는다.
      const displayRowsAll = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: false, defval: "" });
      const rawRowsAll = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: true, defval: "" });
      if (displayRowsAll.length < 2) {
        toast.error("데이터가 비어있어요 (헤더 + 1행 이상 필요)");
        return;
      }
      const headerRowIndex = detectHeaderRowIndex(displayRowsAll as unknown[][], fieldMappings);
      const headers = (displayRowsAll[headerRowIndex] as unknown[]).map((h) => String(h ?? "").trim());
      const displayBodyRows = (displayRowsAll.slice(headerRowIndex + 1) as unknown[][]);
      const rawBodyRows = (rawRowsAll.slice(headerRowIndex + 1) as unknown[][]);
      const rowPairs = displayBodyRows
        .map((displayRow, index) => ({ displayRow, rawRow: rawBodyRows[index] ?? [] }))
        .filter(({ displayRow, rawRow }) =>
          headers.some((_, i) => !isBlankCell(displayRow[i]) || !isBlankCell(rawRow[i]))
        );
      const dataRowsRaw = rowPairs.map((row) => row.rawRow);
      const dataRows = rowPairs.map(({ displayRow }) =>
        headers.map((_, i) => {
          const v = displayRow[i];
          if (v instanceof Date) return v.toISOString();
          return v === null || v === undefined ? "" : String(v);
        })
      );
      const mappedTargets = headers.map((h) => autoMapColumn(h, fieldMappings));
      setSheet({ headers, rows: dataRows, rawRows: dataRowsRaw, headerRowIndex });
      setTargets(mappedTargets);
      setMergeUpdateFields(getDefaultUpdateFields(mappedTargets, fieldMappings));
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "파일 파싱 실패");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!sheet) return;
    if (dedupMode === "merge") {
      if (!mergeKeyField) {
        toast.error("업데이트 모드는 기준 필드가 필요해요");
        return;
      }
      const mergeKeyLabel = fieldMappings.find((f) => f.key === mergeKeyField)?.label ?? mergeKeyField;
      const hasMergeKeyColumn = targets.some((target) => target.kind === "field" && target.key === mergeKeyField);
      if (!hasMergeKeyColumn) {
        toast.error(`기준 필드(${mergeKeyLabel})로 사용할 파일 컬럼을 해당 필드로 매핑해주세요.`);
        return;
      }
    }
    setImporting(true);
    setImportProgress(null);
    try {
      const { records, diagnostics } = buildImportRecords(sheet, targets);

      if (records.length === 0) {
        toast.error(
          `가져올 데이터가 없어요. 헤더 ${sheet.headerRowIndex + 1}행 · 매핑 ${diagnostics.mappedColumns}개 · 날짜 인식 ${diagnostics.parsedCreatedAtRows}건`,
        );
        return;
      }

      const totals = { imported: 0, updated: 0, skipped: 0 };
      setImportProgress({ done: 0, total: records.length });

      for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
        const chunk = records.slice(i, i + IMPORT_BATCH_SIZE);
        const res = await fetch(`/api/collect-sources/${sourceId}/records/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            records: chunk,
            mode: dedupMode,
            ...(dedupMode === "merge" ? { keyField: mergeKeyField, updateFields: mergeUpdateFields } : {}),
          }),
        });
        const result = await readImportResponse(res);
        totals.imported += result.imported ?? 0;
        totals.updated += result.updated ?? 0;
        totals.skipped += result.skipped ?? 0;
        setImportProgress({ done: Math.min(i + chunk.length, records.length), total: records.length });
      }

      const parts: string[] = [];
      if (totals.imported > 0) parts.push(`신규 ${totals.imported.toLocaleString()}건`);
      if (totals.updated > 0) parts.push(`업데이트 ${totals.updated.toLocaleString()}건`);
      if (totals.skipped > 0) parts.push(`중복 ${totals.skipped.toLocaleString()}건 건너뜀`);
      toast.success(parts.length > 0 ? parts.join(" · ") : "변경된 데이터가 없어요");
      onImported();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "가져오기 실패");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const previewRows = sheet?.rows.slice(0, 3) ?? [];
  const mergeUpdateOptions = getUpdateOptions(targets, fieldMappings);
  const importDiagnostics = sheet ? buildImportRecords(sheet, targets).diagnostics : null;

  // skip 모드일 때 dry-run으로 실제 신규/중복 건수 미리 계산 (debounce 600ms)
  useEffect(() => {
    if (step !== "map" || !sheet || dedupMode !== "skip") {
      setDryRun(null);
      return;
    }
    let cancelled = false;
    setDryRunLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const { records } = buildImportRecords(sheet, targets);
        if (records.length === 0) { if (!cancelled) setDryRun(null); return; }
        // 4.5MB 본문 한도 회피 — 청크로 나눠서 dry-run. 서버는 각 청크를 기존 DB와
        // 비교하므로 DB 대비 중복은 정확. (파일 내부 청크 간 중복은 미세 오차 — 미리보기용으로 충분)
        let wouldImport = 0, wouldSkip = 0;
        for (let i = 0; i < records.length; i += IMPORT_BATCH_SIZE) {
          if (cancelled) return;
          const chunk = records.slice(i, i + IMPORT_BATCH_SIZE);
          const res = await fetch(`/api/collect-sources/${sourceId}/records/import`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: chunk, mode: "skip", dryRun: true }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.dryRun) { if (!cancelled) setDryRun(null); return; }
          wouldImport += data.wouldImport ?? 0;
          wouldSkip += data.wouldSkip ?? 0;
        }
        if (!cancelled) setDryRun({ wouldImport, wouldSkip });
      } catch { if (!cancelled) setDryRun(null); }
      finally { if (!cancelled) setDryRunLoading(false); }
    }, 600);
    return () => { cancelled = true; window.clearTimeout(timer); setDryRunLoading(false); };
  }, [step, sheet, targets, dedupMode, sourceId]);
  const importProgressPercent = importProgress && importProgress.total > 0
    ? Math.round((importProgress.done / importProgress.total) * 100)
    : 0;

  return (
    <ModalShell open onClose={onClose} size="xl" title="엑셀/CSV 데이터 가져오기" description={fileName ? fileName : undefined}>
      <div>
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-2xl p-12 text-center cursor-pointer hover:border-violet-400 hover:bg-violet-500/5 transition-colors"
              >
                {parsing ? (
                  <Loader2 className="w-8 h-8 mx-auto text-violet-500 animate-spin mb-3" />
                ) : (
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
                )}
                <p className="text-sm font-medium mb-1">
                  {parsing ? "파싱 중..." : "엑셀/CSV 파일을 선택하거나 끌어다 놓으세요"}
                </p>
                <p className="text-xs text-muted-foreground">.xlsx, .xls, .csv 지원 (엑셀은 첫 번째 시트만 읽어요)</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>
              <div className="p-3 rounded-xl bg-secondary/50 border border-border text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">자동 매핑</p>
                <p>업로드 후 컬럼명을 분석해서 필드, 날짜, UTM에 자동 매핑해요. 다음 단계에서 수정할 수 있어요.</p>
              </div>
            </div>
          )}

          {step === "map" && sheet && (
            <div className="space-y-5">
              <div>
                <p className="text-xs text-muted-foreground mb-2">
                  컬럼 매핑 · 총 <span className="text-foreground font-medium">{sheet.rows.length.toLocaleString()}</span>행 감지됨
                  {sheet.headerRowIndex > 0 && (
                    <span> · {sheet.headerRowIndex + 1}번째 줄을 헤더로 인식</span>
                  )}
                </p>
                <div className="space-y-1.5">
                  {sheet.headers.map((header, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-background">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{header || <span className="text-muted-foreground italic">(빈 헤더)</span>}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          예시: {previewRows.map((r) => r[i]).filter(Boolean).slice(0, 2).join(", ") || "-"}
                        </p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                      <select
                        value={targetToValue(targets[i])}
                        onChange={(e) => {
                          const next = [...targets];
                          next[i] = valueToTarget(e.target.value);
                          setTargets(next);
                          setMergeUpdateFields((current) => {
                            const options = getUpdateOptions(next, fieldMappings);
                            const allowed = new Set(options.map((option) => option.key));
                            const kept = current.filter((key) => allowed.has(key));
                            return kept.length > 0 ? kept : getDefaultUpdateFields(next, fieldMappings);
                          });
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400 min-w-[180px]"
                      >
                        <option value="ignore">— 무시 —</option>
                        <optgroup label="필드">
                          {fieldMappings.map((f) => (
                            <option key={f.key} value={`field:${f.key}`}>{f.label || f.key}</option>
                          ))}
                        </optgroup>
                        <optgroup label="시스템">
                          <option value="createdAt">신청 시각 (createdAt)</option>
                          <option value="utmSource">UTM 소스</option>
                          <option value="utmMedium">UTM 매체</option>
                          <option value="utmCampaign">UTM 캠페인</option>
                          <option value="utmTerm">UTM 키워드</option>
                          <option value="utmContent">UTM 콘텐츠</option>
                          <option value="referrer">Referrer</option>
                        </optgroup>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {previewRows.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">데이터 미리보기 (상위 3행)</p>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-secondary/50 border-b border-border">
                          {sheet.headers.map((h, i) => (
                            <th key={i} className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
                          <tr key={ri} className="border-b border-border last:border-0">
                            {row.map((cell, ci) => (
                              <td key={ci} className="px-3 py-2 max-w-[160px] truncate">{cell || "-"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importDiagnostics && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl border border-border bg-secondary/30 p-3">
                    <p className="text-[11px] text-muted-foreground">매핑된 컬럼</p>
                    <p className="mt-1 text-sm font-semibold">{importDiagnostics.mappedColumns.toLocaleString()}개</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-3">
                    <p className="text-[11px] text-muted-foreground">가져올 행</p>
                    <p className="mt-1 text-sm font-semibold">{importDiagnostics.importableRows.toLocaleString()}건</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-3">
                    <p className="text-[11px] text-muted-foreground">신청시각 인식</p>
                    <p className="mt-1 text-sm font-semibold">{importDiagnostics.parsedCreatedAtRows.toLocaleString()}건</p>
                  </div>
                  <div className="rounded-xl border border-border bg-secondary/30 p-3">
                    <p className="text-[11px] text-muted-foreground">헤더 위치</p>
                    <p className="mt-1 text-sm font-semibold">{sheet.headerRowIndex + 1}행</p>
                  </div>
                </div>
              )}
            </div>
          )}

        {step === "map" && (
          <div className="px-5 py-3 border-t border-border bg-secondary/30 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground shrink-0">중복 처리</span>
              <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-background">
                <button
                  onClick={() => setDedupMode("skip")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    dedupMode === "skip" ? "bg-violet-500 text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="시각과 모든 필드값이 같은 레코드는 건너뜁니다"
                >
                  중복 건너뛰기
                </button>
                <button
                  onClick={() => setDedupMode("merge")}
                  disabled={fieldMappings.length === 0}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 ${
                    dedupMode === "merge" ? "bg-violet-500 text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="기준 필드가 같은 기존 레코드는 비어있지 않은 컬럼만 업데이트"
                >
                  중복 업데이트
                </button>
                <button
                  onClick={() => setDedupMode("all")}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    dedupMode === "all" ? "bg-violet-500 text-white" : "text-muted-foreground hover:text-foreground"
                  }`}
                  title="중복 검사 없이 모두 추가"
                >
                  모두 추가
                </button>
              </div>

              {dedupMode === "merge" && (
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-xs text-muted-foreground">기준 필드</span>
                  <select
                    value={mergeKeyField}
                    onChange={(e) => setMergeKeyField(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                  >
                    {fieldMappings.map((f) => (
                      <option key={f.key} value={f.key}>{f.label || f.key}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {dedupMode === "merge" && (
              <div className="space-y-2 rounded-xl border border-border bg-background p-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-xs font-medium">업데이트할 컬럼</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      같은 <b>{fieldMappings.find((f) => f.key === mergeKeyField)?.label ?? mergeKeyField}</b> 값을 가진 기존 레코드를 찾아, 체크한 컬럼만 새 파일 값으로 갱신합니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setMergeUpdateFields(mergeUpdateOptions.map((option) => option.key))}
                      className="px-2 py-1 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      전체
                    </button>
                    <button
                      type="button"
                      onClick={() => setMergeUpdateFields([])}
                      className="px-2 py-1 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      해제
                    </button>
                  </div>
                </div>
                {mergeUpdateOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {mergeUpdateOptions.map((option) => {
                      const checked = mergeUpdateFields.includes(option.key);
                      return (
                        <label
                          key={option.key}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs cursor-pointer transition-colors ${
                            checked
                              ? "border-violet-500 bg-violet-500/10 text-violet-600"
                              : "border-border bg-secondary/30 text-muted-foreground"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setMergeUpdateFields((current) => (
                                e.target.checked
                                  ? Array.from(new Set([...current, option.key]))
                                  : current.filter((key) => key !== option.key)
                              ));
                            }}
                            className="accent-violet-500"
                          />
                          {option.label}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">업데이트할 수 있는 매핑 컬럼이 없습니다.</p>
                )}
                {mergeUpdateFields.length === 0 && (
                  <p className="text-[11px] text-amber-600">체크된 컬럼이 없으면 기존 레코드는 매칭되어도 갱신되지 않습니다.</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => { setStep("upload"); setSheet(null); setFileName(""); setImportProgress(null); }}
                disabled={importing}
                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                다시 선택
              </button>
              <div className="flex items-center gap-3">
                {importProgress && (
                  <div className="hidden sm:block w-44">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>{importProgress.done.toLocaleString()} / {importProgress.total.toLocaleString()}</span>
                      <span>{importProgressPercent}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-violet-500 transition-all"
                        style={{ width: `${importProgressPercent}%` }}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
                >
                  {importing || dryRunLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {importing && importProgress
                    ? `${importProgress.done.toLocaleString()} / ${importProgress.total.toLocaleString()} 처리 중`
                    : importing
                      ? "가져오는 중..."
                      : dedupMode === "skip" && dryRunLoading
                        ? "중복 확인 중..."
                        : dedupMode === "skip" && dryRun
                          ? (dryRun.wouldSkip > 0
                              ? `신규 ${dryRun.wouldImport.toLocaleString()}건 가져오기 (중복 ${dryRun.wouldSkip.toLocaleString()}건 제외)`
                              : `${dryRun.wouldImport.toLocaleString()}건 가져오기`)
                          : `${importDiagnostics?.importableRows ?? sheet?.rows.length ?? 0}건 가져오기`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
