"use client";

import { useState, useRef } from "react";
import { Upload, X, FileSpreadsheet, Loader2, ArrowRight, Check } from "lucide-react";
import { toast } from "sonner";

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
}

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

export default function ImportModal({ sourceId, fieldMappings, onClose, onImported }: ImportModalProps) {
  const [step, setStep] = useState<"upload" | "map">("upload");
  const [parsing, setParsing] = useState(false);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [targets, setTargets] = useState<ColumnTarget[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [dedupMode, setDedupMode] = useState<"skip" | "merge" | "all">("skip");
  const [mergeKeyField, setMergeKeyField] = useState<string>(fieldMappings[0]?.key ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParsing(true);
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
      // raw:false → 셀 표시 형식 그대로 가져옴 (예: 휴대폰 010-1234-5678 보존)
      // cellDates:true 와 함께 쓰면 날짜는 Date 인스턴스, 나머지는 표시된 문자열
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, raw: false });
      if (rawRows.length < 2) {
        toast.error("데이터가 비어있어요 (헤더 + 1행 이상 필요)");
        return;
      }
      const headers = (rawRows[0] as unknown[]).map((h) => String(h ?? "").trim());
      const dataRowsRaw = rawRows.slice(1) as unknown[][];
      const dataRows = dataRowsRaw.map((r) =>
        headers.map((_, i) => {
          const v = r[i];
          if (v instanceof Date) return v.toISOString();
          return v === null || v === undefined ? "" : String(v);
        })
      );
      setSheet({ headers, rows: dataRows, rawRows: dataRowsRaw });
      setTargets(headers.map((h) => autoMapColumn(h, fieldMappings)));
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "파일 파싱 실패");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!sheet) return;
    setImporting(true);
    try {
      const records = sheet.rawRows.map((rawRow) => {
        const data: Record<string, string> = {};
        const rec: {
          data: Record<string, string>;
          createdAt?: string;
          utmSource?: string;
          utmMedium?: string;
          utmCampaign?: string;
          utmTerm?: string;
          utmContent?: string;
          referrer?: string;
        } = { data };

        sheet.headers.forEach((_, i) => {
          const target = targets[i];
          if (target.kind === "ignore") return;
          const v = rawRow[i];
          if (v === null || v === undefined || v === "") return;
          if (target.kind === "field") {
            data[target.key] = v instanceof Date ? v.toISOString() : String(v);
          } else if (target.kind === "createdAt") {
            if (v instanceof Date) rec.createdAt = v.toISOString();
            else {
              const d = new Date(String(v));
              if (!isNaN(d.getTime())) rec.createdAt = d.toISOString();
            }
          } else {
            const strVal = v instanceof Date ? v.toISOString() : String(v);
            rec[target.kind] = strVal;
          }
        });

        return rec;
      }).filter((r) => Object.keys(r.data).length > 0 || r.createdAt);

      if (records.length === 0) {
        toast.error("가져올 데이터가 없어요. 매핑을 확인해주세요");
        return;
      }

      if (dedupMode === "merge" && !mergeKeyField) {
        toast.error("업데이트 모드는 기준 필드가 필요해요");
        return;
      }
      const res = await fetch(`/api/collect-sources/${sourceId}/records/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          records,
          mode: dedupMode,
          ...(dedupMode === "merge" ? { keyField: mergeKeyField } : {}),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error ?? "가져오기 실패");
        return;
      }
      const parts: string[] = [];
      if (result.imported > 0) parts.push(`신규 ${result.imported}건`);
      if (result.updated > 0) parts.push(`업데이트 ${result.updated}건`);
      if (result.skipped > 0) parts.push(`중복 ${result.skipped}건 건너뜀`);
      toast.success(parts.length > 0 ? parts.join(" · ") : "변경된 데이터가 없어요");
      onImported();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "가져오기 실패");
    } finally {
      setImporting(false);
    }
  };

  const previewRows = sheet?.rows.slice(0, 3) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold">엑셀/CSV 데이터 가져오기</h2>
            {fileName && <span className="text-xs text-muted-foreground">· {fileName}</span>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
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
            </div>
          )}
        </div>

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
              <p className="text-[11px] text-muted-foreground">
                같은 <b>{fieldMappings.find((f) => f.key === mergeKeyField)?.label ?? mergeKeyField}</b> 값을 가진 기존 레코드를 찾아 <b>새 파일에서 값이 있는 컬럼만</b> 덮어씁니다. (createdAt 은 보존, 매칭 안 되면 신규 추가)
              </p>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={() => { setStep("upload"); setSheet(null); setFileName(""); }}
                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                다시 선택
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
              >
                {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {importing ? "가져오는 중..." : `${sheet?.rows.length ?? 0}건 가져오기`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
