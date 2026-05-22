export type SourceType = "GOOGLE" | "META" | "LINKEDIN" | "MANUAL";
export type SourceChoice = "AUTO" | SourceType;

export type AdColumnKey =
  | "campaignName"
  | "adGroupName"
  | "reportDate"
  | "reportStart"
  | "reportEnd"
  | "cost"
  | "impressions"
  | "reach"
  | "clicks"
  | "cpm"
  | "cpc"
  | "ctr"
  | "conversions"
  | "costPerConversion"
  | "conversionRate"
  | "status"
  | "currency"
  | "resultType";

export type ColumnMapping = Partial<Record<AdColumnKey, number>>;

export interface NormalizedAdRow {
  sourceType?: SourceType;
  campaignName: string;
  adGroupName?: string | null;
  reportDate?: string | null;
  reportStart?: string | null;
  reportEnd?: string | null;
  status?: string | null;
  currency?: string | null;
  cost?: number | null;
  impressions?: number | null;
  reach?: number | null;
  clicks?: number | null;
  cpm?: number | null;
  cpc?: number | null;
  ctr?: number | null;
  conversions?: number | null;
  costPerConversion?: number | null;
  conversionRate?: number | null;
  resultType?: string | null;
  raw: Record<string, string>;
}

export interface ParsedPreview {
  sourceType: SourceType;
  rows: NormalizedAdRow[];
  warnings: string[];
  reportStart?: string | null;
  reportEnd?: string | null;
}

export interface SheetAnalysis {
  rows: unknown[][];
  headerIndex: number;
  headers: string[];
  sourceType: SourceType;
  mapping: ColumnMapping;
}

export const AD_COLUMN_FIELDS: Array<{ key: AdColumnKey; label: string; required?: boolean; hint?: string }> = [
  { key: "campaignName", label: "광고 캠페인", required: true, hint: "캠페인명" },
  { key: "adGroupName", label: "광고세트/그룹", hint: "Meta 광고세트, Google 광고그룹" },
  { key: "reportDate", label: "일자", hint: "일자별 리포트용" },
  { key: "reportStart", label: "보고 시작일" },
  { key: "reportEnd", label: "보고 종료일" },
  { key: "cost", label: "지출/비용", hint: "광고비" },
  { key: "impressions", label: "노출" },
  { key: "reach", label: "도달" },
  { key: "clicks", label: "클릭" },
  { key: "conversions", label: "결과/전환" },
  { key: "cpm", label: "CPM" },
  { key: "cpc", label: "CPC" },
  { key: "ctr", label: "CTR" },
  { key: "costPerConversion", label: "결과당 비용" },
  { key: "conversionRate", label: "전환율" },
  { key: "status", label: "상태" },
  { key: "currency", label: "통화" },
  { key: "resultType", label: "결과 유형" },
];

export const FIELD_ALIASES: Record<AdColumnKey, string[]> = {
  campaignName: ["캠페인", "캠페인 이름", "캠페인명", "Campaign", "Campaign name", "Campaign Name"],
  adGroupName: ["광고그룹", "광고 그룹", "광고그룹 이름", "광고 세트 이름", "광고 세트", "광고세트", "Ad group", "Ad group name", "Ad set", "Ad set name"],
  reportDate: ["일", "날짜", "일자", "기간", "시작일(UTC 시간)", "Date", "Day", "Date range"],
  reportStart: ["보고 시작", "보고 시작일", "시작일", "Start date", "Reporting starts", "Report start", "Date Range (Start)", "Start Date"],
  reportEnd: ["보고 종료", "보고 종료일", "종료일", "End date", "Reporting ends", "Report end", "Date Range (End)", "End Date"],
  cost: ["비용", "지출", "총 지출", "지출 금액", "지출 금액 (KRW)", "지출금액(KRW)", "Amount spent", "Cost", "Spend", "Total spent", "Total Spent"],
  impressions: ["노출", "노출수", "Impressions"],
  reach: ["도달", "도달수", "Reach"],
  clicks: ["클릭", "클릭수", "링크 클릭", "Clicks", "Link clicks"],
  cpm: ["평균 CPM", "CPM", "CPM(1,000회 노출당 비용)", "Avg. CPM", "CPM (Avg.)", "Average CPM"],
  cpc: ["평균 CPC", "CPC", "CPC(링크 클릭당 비용)", "Avg. CPC", "CPC (Avg.)", "Average CPC"],
  ctr: ["클릭률(CTR)", "CTR", "CTR(링크 클릭률)", "Click-through rate"],
  conversions: ["전환", "전환수", "결과", "Conversions", "Results"],
  costPerConversion: ["전환당비용", "전환당 비용", "전환 비용", "결과당 비용", "Cost / conv.", "Cost per result"],
  conversionRate: ["전환율", "링크 클릭당 결과 비율", "Conversion rate"],
  status: ["캠페인 상태", "광고그룹 상태", "게재 상태", "게재 수준", "Status", "Delivery status"],
  currency: ["통화 코드", "통화", "Currency", "Currency code"],
  resultType: ["결과 유형", "Result type"],
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toDateKey(value: unknown) {
  const raw = toText(value);
  if (!raw) return null;

  const ymd = raw.match(/(\d{4})[-/.]\s*(\d{1,2})[-/.]\s*(\d{1,2})/);
  if (ymd) {
    return `${ymd[1]}-${String(ymd[2]).padStart(2, "0")}-${String(ymd[3]).padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const kst = new Date(parsed.getTime() + 9 * 60 * 60_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function normalizeHeader(value: unknown) {
  return toText(value).replace(/\s+/g, "").toLowerCase();
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = toText(value);
  if (!raw || raw === "-") return null;
  const cleaned = raw.replace(/,/g, "").replace(/%/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function rawObject(header: unknown[], row: unknown[]) {
  return header.reduce<Record<string, string>>((acc, value, index) => {
    const key = toText(value) || `column_${index + 1}`;
    acc[key] = toText(row[index]);
    return acc;
  }, {});
}

function findColumnIndex(headers: string[], field: AdColumnKey) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const aliases = FIELD_ALIASES[field].map(normalizeHeader);

  for (const alias of aliases) {
    const index = normalizedHeaders.findIndex((header) => header === alias);
    if (index >= 0) return index;
  }

  if (field === "campaignName" || field === "status") return undefined;

  for (const alias of aliases) {
    const index = normalizedHeaders.findIndex((header) => header && alias && (header.includes(alias) || alias.includes(header)));
    if (index >= 0) return index;
  }

  return undefined;
}

function buildColumnMapping(headers: string[]) {
  return AD_COLUMN_FIELDS.reduce<ColumnMapping>((acc, field) => {
    const index = findColumnIndex(headers, field.key);
    if (index !== undefined) acc[field.key] = index;
    return acc;
  }, {});
}

function inferSourceFromHeaders(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  const metaScore = [
    "캠페인이름",
    "광고세트이름",
    "보고시작",
    "보고종료",
    "지출금액(krw)",
    "결과유형",
  ].filter((name) => normalized.includes(name)).length;
  const googleScore = [
    "캠페인",
    "광고그룹",
    "비용",
    "클릭수",
    "통화코드",
    "전환당비용",
  ].filter((name) => normalized.includes(name)).length;
  const linkedinScore = [
    "총지출",
    "광고세트이름",
    "광고세트상태",
    "총참여",
    "totalspent",
    "daterange(start)",
  ].filter((name) => normalized.includes(name)).length;

  const max = Math.max(metaScore, googleScore, linkedinScore);
  if (max === 0) return "GOOGLE";
  if (linkedinScore === max) return "LINKEDIN";
  return metaScore >= googleScore ? "META" : "GOOGLE";
}

export function analyzeSheetRows(rows: unknown[][], sourceChoice: SourceChoice): SheetAnalysis {
  let best: { headerIndex: number; headers: string[]; mapping: ColumnMapping; score: number } | null = null;
  const candidates = rows.slice(0, Math.min(rows.length, 30));

  for (let headerIndex = 0; headerIndex < candidates.length; headerIndex += 1) {
    const row = candidates[headerIndex];
    const headers = row.map(toText);
    const nonEmpty = headers.filter(Boolean).length;
    if (nonEmpty < 2) continue;

    const mapping = buildColumnMapping(headers);
    const metricScore = ["cost", "impressions", "clicks", "conversions", "reach"].filter((key) => mapping[key as AdColumnKey] !== undefined).length;
    const score =
      (mapping.campaignName !== undefined ? 8 : 0) +
      (mapping.adGroupName !== undefined ? 3 : 0) +
      metricScore * 2 +
      (mapping.reportDate !== undefined || mapping.reportStart !== undefined || mapping.reportEnd !== undefined ? 2 : 0) +
      Math.min(nonEmpty, 8) * 0.1;

    if (!best || score > best.score) best = { headerIndex, headers, mapping, score };
  }

  if (!best || best.score < 4) {
    const headerIndex = rows.findIndex((row) => row.filter((cell) => toText(cell)).length >= 2);
    if (headerIndex < 0) throw new Error("파일에서 헤더 행을 찾지 못했어요.");
    const headers = rows[headerIndex].map(toText);
    best = { headerIndex, headers, mapping: buildColumnMapping(headers), score: 0 };
  }

  const sourceType = sourceChoice === "AUTO"
    ? inferSourceFromHeaders(best.headers)
    : sourceChoice === "MANUAL"
    ? "MANUAL"
    : sourceChoice;

  return {
    rows,
    headerIndex: best.headerIndex,
    headers: best.headers,
    mapping: best.mapping,
    sourceType,
  };
}

function cellText(row: unknown[], mapping: ColumnMapping, field: AdColumnKey) {
  const index = mapping[field];
  return index === undefined ? "" : toText(row[index]);
}

function cellNumber(row: unknown[], mapping: ColumnMapping, field: AdColumnKey) {
  const index = mapping[field];
  return index === undefined ? null : toNumber(row[index]);
}

function inferReportPeriod(parsedRows: NormalizedAdRow[]) {
  const dates = parsedRows
    .flatMap((row) => [row.reportDate, row.reportStart, row.reportEnd])
    .map(toDateKey)
    .filter((date): date is string => !!date)
    .sort((a, b) => a.localeCompare(b));

  return {
    reportStart: dates[0] ?? null,
    reportEnd: dates[dates.length - 1] ?? null,
  };
}

export function parseMappedRows(analysis: SheetAnalysis): ParsedPreview {
  if (analysis.mapping.campaignName === undefined) {
    throw new Error("광고 캠페인 컬럼을 선택해주세요.");
  }

  const parsed = analysis.rows.slice(analysis.headerIndex + 1).map((row) => {
    const campaignName = cellText(row, analysis.mapping, "campaignName");
    if (!campaignName || campaignName === "전체") return null;

    return {
      sourceType: analysis.sourceType,
      campaignName,
      adGroupName: cellText(row, analysis.mapping, "adGroupName") || null,
      reportDate: toDateKey(cellText(row, analysis.mapping, "reportDate")),
      reportStart: toDateKey(cellText(row, analysis.mapping, "reportStart")),
      reportEnd: toDateKey(cellText(row, analysis.mapping, "reportEnd")),
      status: cellText(row, analysis.mapping, "status") || null,
      currency: cellText(row, analysis.mapping, "currency") || "KRW",
      cost: cellNumber(row, analysis.mapping, "cost"),
      cpm: cellNumber(row, analysis.mapping, "cpm"),
      impressions: cellNumber(row, analysis.mapping, "impressions"),
      reach: cellNumber(row, analysis.mapping, "reach"),
      clicks: cellNumber(row, analysis.mapping, "clicks"),
      cpc: cellNumber(row, analysis.mapping, "cpc"),
      ctr: cellNumber(row, analysis.mapping, "ctr"),
      conversions: cellNumber(row, analysis.mapping, "conversions"),
      costPerConversion: cellNumber(row, analysis.mapping, "costPerConversion"),
      conversionRate: cellNumber(row, analysis.mapping, "conversionRate"),
      resultType: cellText(row, analysis.mapping, "resultType") || null,
      raw: rawObject(analysis.headers, row),
    };
  }).filter(Boolean) as NormalizedAdRow[];

  const period = inferReportPeriod(parsed);
  const warnings = [
    ...(analysis.mapping.adGroupName === undefined
      ? ["광고세트/광고그룹 컬럼이 매핑되지 않았어요. 캠페인별 성과는 볼 수 있지만 광고세트별 세부 분석은 제한됩니다."]
      : []),
    ...(period.reportStart && period.reportEnd
      ? []
      : ["파일 안에서 날짜 컬럼을 찾지 못했어요. 이 데이터는 업로드일 기준으로 조회됩니다."]),
  ];

  return {
    sourceType: analysis.sourceType,
    rows: parsed,
    warnings,
    ...period,
  };
}


export function summarizeRows(rows: NormalizedAdRow[]) {
  return rows.reduce((acc, row) => {
    acc.cost += row.cost ?? 0;
    acc.impressions += row.impressions ?? 0;
    acc.clicks += row.clicks ?? 0;
    acc.conversions += row.conversions ?? 0;
    return acc;
  }, { cost: 0, impressions: 0, clicks: 0, conversions: 0 });
}
