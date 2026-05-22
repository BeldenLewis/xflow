"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Database,
  FileSpreadsheet,
  Loader2,
  History,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useWorkspace } from "@/contexts/workspace";

type SourceType = "GOOGLE" | "META" | "MANUAL";
type SourceChoice = "AUTO" | SourceType;
type SourceAddMode = "file" | "googleSheet";
type ChartMetric = "cost" | "cpm" | "cpc" | "ctr" | "cvr" | "conversions" | "costPerConversion";
type DetailGroupBy = "campaign" | "adGroup";
type DetailDateGranularity = "day" | "week" | "month";

interface NormalizedAdRow {
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

interface ParsedPreview {
  sourceType: SourceType;
  rows: NormalizedAdRow[];
  warnings: string[];
  reportStart?: string | null;
  reportEnd?: string | null;
}

type AdColumnKey =
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

type ColumnMapping = Partial<Record<AdColumnKey, number>>;

interface SheetAnalysis {
  rows: unknown[][];
  headerIndex: number;
  headers: string[];
  sourceType: SourceType;
  mapping: ColumnMapping;
}

interface MetricSummary {
  sourceType: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cvr: number;
  cpc: number;
  cpm: number;
  costPerConversion: number;
}

interface SummaryRow extends MetricSummary {
  campaignName: string;
  adGroupName?: string | null;
}

interface DetailRow {
  id: string;
  periodKey: string;
  sourceType: string;
  campaignName: string;
  adGroupName: string | null;
  reportDate: string | null;
  reportStart: string | null;
  cost: number;
  impressions: number;
  reach?: number;
  clicks: number;
  conversions: number;
  cpm: number;
  cpc: number;
  ctr: number;
  cvr: number;
  costPerConversion: number;
  conversionRate?: number | null;
}

interface PerformanceResponse {
  totals: {
    cost: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cvr: number;
    cpc: number;
    cpm: number;
    costPerConversion: number;
  };
  sourceSummary: MetricSummary[];
  mediaSummary: MetricSummary[];
  campaignSummary: SummaryRow[];
  adGroupSummary: SummaryRow[];
  topCampaigns: SummaryRow[];
  topAdGroups: SummaryRow[];
  dailyTrend: Array<{
    date: string;
    cost: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>;
  detailRows: DetailRow[];
  detailPeriodOptions: Array<{
    value: string;
    rowCount: number;
  }>;
  detailPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    groupBy: DetailGroupBy;
    dateGranularity: DetailDateGranularity;
    period: string | null;
  };
  recentRows?: DetailRow[];
  batches: Array<{
    id: string;
    sourceType: string;
    sourceName: string | null;
    fileName: string;
    rowCount: number;
    reportStart: string | null;
    reportEnd: string | null;
    createdAt: string;
    _count: { records: number };
  }>;
}

const SOURCE_LABELS: Record<string, string> = {
  ALL: "전체 매체",
  GOOGLE: "Google Ads",
  META: "Meta Ads",
  MANUAL: "직접 업로드",
};

const MEDIA_FILTERS = [
  { value: "ALL", label: "전체" },
  { value: "GOOGLE", label: "Google" },
  { value: "META", label: "Meta" },
];

const CHART_METRICS: Array<{ value: ChartMetric; label: string }> = [
  { value: "cost", label: "지출" },
  { value: "cpm", label: "CPM" },
  { value: "cpc", label: "CPC" },
  { value: "ctr", label: "CTR" },
  { value: "cvr", label: "CVR" },
  { value: "conversions", label: "전환수" },
  { value: "costPerConversion", label: "결과당 비용" },
];

const DETAIL_PAGE_SIZE = 20;

const DETAIL_GROUP_OPTIONS: Array<{ value: DetailGroupBy; label: string }> = [
  { value: "campaign", label: "캠페인" },
  { value: "adGroup", label: "광고세트" },
];

const DETAIL_DATE_OPTIONS: Array<{ value: DetailDateGranularity; label: string; header: string }> = [
  { value: "day", label: "일", header: "일자" },
  { value: "week", label: "주", header: "주 시작" },
  { value: "month", label: "월", header: "월" },
];

const AD_COLUMN_FIELDS: Array<{ key: AdColumnKey; label: string; required?: boolean; hint?: string }> = [
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

const FIELD_ALIASES: Record<AdColumnKey, string[]> = {
  campaignName: ["캠페인", "캠페인 이름", "캠페인명", "Campaign", "Campaign name", "Campaign Name"],
  adGroupName: ["광고그룹", "광고 그룹", "광고그룹 이름", "광고 세트 이름", "광고 세트", "광고세트", "Ad group", "Ad group name", "Ad set", "Ad set name"],
  reportDate: ["일", "날짜", "일자", "기간", "Date", "Day", "Date range"],
  reportStart: ["보고 시작", "보고 시작일", "시작일", "Start date", "Reporting starts", "Report start"],
  reportEnd: ["보고 종료", "보고 종료일", "종료일", "End date", "Reporting ends", "Report end"],
  cost: ["비용", "지출", "지출 금액", "지출 금액 (KRW)", "지출금액(KRW)", "Amount spent", "Cost", "Spend"],
  impressions: ["노출", "노출수", "Impressions"],
  reach: ["도달", "도달수", "Reach"],
  clicks: ["클릭", "클릭수", "링크 클릭", "Clicks", "Link clicks"],
  cpm: ["평균 CPM", "CPM", "CPM(1,000회 노출당 비용)", "Avg. CPM"],
  cpc: ["평균 CPC", "CPC", "CPC(링크 클릭당 비용)", "Avg. CPC"],
  ctr: ["클릭률(CTR)", "CTR", "CTR(링크 클릭률)", "Click-through rate"],
  conversions: ["전환", "전환수", "결과", "Conversions", "Results"],
  costPerConversion: ["전환당비용", "전환당 비용", "결과당 비용", "Cost / conv.", "Cost per result"],
  conversionRate: ["전환율", "링크 클릭당 결과 비율", "Conversion rate"],
  status: ["캠페인 상태", "광고그룹 상태", "게재 상태", "게재 수준", "Status", "Delivery status"],
  currency: ["통화 코드", "통화", "Currency", "Currency code"],
  resultType: ["결과 유형", "Result type"],
};

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

function todayInputValue(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  const kst = new Date(date.getTime() + 9 * 60 * 60_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}

function formatNumber(value: number | null | undefined) {
  return Math.round(value ?? 0).toLocaleString("ko-KR");
}

function formatKRW(value: number | null | undefined) {
  return `${Math.round(value ?? 0).toLocaleString("ko-KR")}원`;
}

function formatPct(value: number | null | undefined) {
  return `${(value ?? 0).toFixed(2)}%`;
}

function calcCtr(clicks: number, impressions: number) {
  return impressions > 0 ? (clicks / impressions) * 100 : 0;
}

function calcCpc(cost: number, clicks: number) {
  return clicks > 0 ? cost / clicks : 0;
}

function calcCostPerResult(cost: number, conversions: number) {
  return conversions > 0 ? cost / conversions : 0;
}

function calcCvr(conversions: number, clicks: number) {
  return clicks > 0 ? (conversions / clicks) * 100 : 0;
}

function getChartMetricValue(row: { cost: number; impressions: number; clicks: number; conversions: number }, metric: ChartMetric) {
  if (metric === "cost") return row.cost;
  if (metric === "cpm") return row.impressions > 0 ? (row.cost / row.impressions) * 1000 : 0;
  if (metric === "cpc") return calcCpc(row.cost, row.clicks);
  if (metric === "ctr") return calcCtr(row.clicks, row.impressions);
  if (metric === "cvr") return calcCvr(row.conversions, row.clicks);
  if (metric === "conversions") return row.conversions;
  return calcCostPerResult(row.cost, row.conversions);
}

function formatMetricValue(metric: ChartMetric, value: number | null | undefined) {
  if (metric === "ctr" || metric === "cvr") return formatPct(value);
  if (metric === "conversions") return formatNumber(value);
  return formatKRW(value);
}

function formatDetailPeriod(value: string | null | undefined, granularity: DetailDateGranularity) {
  if (!value) return "-";
  if (granularity === "month") return value;
  if (granularity === "week") return `${value} 주`;
  return value;
}

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
  return metaScore > googleScore ? "META" : "GOOGLE";
}

function analyzeSheetRows(rows: unknown[][], sourceChoice: SourceChoice): SheetAnalysis {
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

  return {
    rows,
    headerIndex: best.headerIndex,
    headers: best.headers,
    mapping: best.mapping,
    sourceType: sourceChoice === "AUTO" ? inferSourceFromHeaders(best.headers) : sourceChoice,
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

function parseMappedRows(analysis: SheetAnalysis): ParsedPreview {
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

async function readSheetRows(file: File) {
  const buffer = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type.includes("csv");
  const workbook = isCsv
    ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), { type: "string", raw: false, cellDates: false })
    : XLSX.read(buffer, { type: "array", raw: false, cellDates: false });
  return workbookToRows(workbook);
}

function readCsvRows(csvText: string) {
  const workbook = XLSX.read(csvText.replace(/^\uFEFF/, ""), { type: "string", raw: false, cellDates: false });
  return workbookToRows(workbook);
}

function workbookToRows(workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
}

function summarizeRows(rows: NormalizedAdRow[]) {
  return rows.reduce((acc, row) => {
    acc.cost += row.cost ?? 0;
    acc.impressions += row.impressions ?? 0;
    acc.clicks += row.clicks ?? 0;
    acc.conversions += row.conversions ?? 0;
    return acc;
  }, { cost: 0, impressions: 0, clicks: 0, conversions: 0 });
}

export default function AnalyticsPage() {
  const { workspace, currentProject, isLoading: wsLoading } = useWorkspace();
  const hasLoadedRef = useRef(false);
  const [data, setData] = useState<PerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rangeDays, setRangeDays] = useState("30");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [selectedCampaignName, setSelectedCampaignName] = useState<string | null>(null);
  const [selectedAdGroupName, setSelectedAdGroupName] = useState<string | null>(null);
  const [chartMetric, setChartMetric] = useState<ChartMetric>("cost");
  const [detailGroupBy, setDetailGroupBy] = useState<DetailGroupBy>("campaign");
  const [detailDateGranularity, setDetailDateGranularity] = useState<DetailDateGranularity>("day");
  const [detailPeriod, setDetailPeriod] = useState<string | null>(null);
  const [detailPage, setDetailPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const selectSource = (nextSource: string) => {
    setSourceFilter(nextSource);
    setSelectedCampaignName(null);
    setSelectedAdGroupName(null);
    setDetailPeriod(null);
    setDetailPage(1);
  };

  const selectCampaign = (campaignName: string | null) => {
    setSelectedCampaignName(campaignName);
    setSelectedAdGroupName(null);
    setDetailPeriod(null);
    setDetailPage(1);
  };

  const selectAdGroup = (adGroupName: string | null) => {
    setSelectedAdGroupName(adGroupName);
    setDetailPeriod(null);
    setDetailPage(1);
  };

  const changeRangeDays = (nextRange: string) => {
    setRangeDays(nextRange);
    setDetailPeriod(null);
    setDetailPage(1);
  };

  const changeDetailGroupBy = (nextGroupBy: DetailGroupBy) => {
    setDetailGroupBy(nextGroupBy);
    setDetailPage(1);
  };

  const changeDetailDateGranularity = (nextGranularity: DetailDateGranularity) => {
    setDetailDateGranularity(nextGranularity);
    setDetailPeriod(null);
    setDetailPage(1);
  };

  const changeDetailPeriod = (nextPeriod: string) => {
    setDetailPeriod(nextPeriod || null);
    setDetailPage(1);
  };

  const fetchData = useCallback(async () => {
    if (!workspace || !currentProject) return;
    const isInitialLoad = !hasLoadedRef.current;
    if (isInitialLoad) setLoading(true);
    else setRefreshing(true);

    try {
      const params = new URLSearchParams({
        workspaceId: workspace.id,
        projectId: currentProject.id,
        sourceType: sourceFilter,
        detailGroupBy,
        detailDateGranularity,
        detailPage: String(detailPage),
        detailPageSize: String(DETAIL_PAGE_SIZE),
      });

      if (rangeDays !== "all") {
        params.set("from", `${todayInputValue(-Number(rangeDays))}T00:00:00+09:00`);
        params.set("to", `${todayInputValue(0)}T23:59:59+09:00`);
      }

      if (selectedCampaignName) params.set("campaignName", selectedCampaignName);
      if (selectedAdGroupName) params.set("adGroupName", selectedAdGroupName);
      if (detailPeriod) params.set("detailPeriod", detailPeriod);

      const res = await fetch(`/api/ad-performance?${params.toString()}`);
      const next = await res.json().catch(() => null);
      if (!res.ok) throw new Error(next?.error ?? "광고 성과를 불러오지 못했어요");
      setData(next);
      hasLoadedRef.current = true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "광고 성과를 불러오지 못했어요");
      if (isInitialLoad) setData(null);
    } finally {
      if (isInitialLoad) setLoading(false);
      setRefreshing(false);
    }
  }, [
    workspace,
    currentProject,
    rangeDays,
    sourceFilter,
    selectedCampaignName,
    selectedAdGroupName,
    detailGroupBy,
    detailDateGranularity,
    detailPeriod,
    detailPage,
  ]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchData();
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchData]);

  const totals = data?.totals;
  const currentSourceLabel = sourceFilter === "ALL" ? "전체 매체" : SOURCE_LABELS[sourceFilter] ?? sourceFilter;
  const currentScopeLabel = [
    currentSourceLabel,
    selectedCampaignName,
    selectedAdGroupName,
  ].filter(Boolean).join(" · ");
  const mediaSummaries = useMemo(() => {
    const sourceRows = data?.mediaSummary ?? data?.sourceSummary ?? [];
    const lookup = new Map(sourceRows.map((source) => [source.sourceType, source]));
    const fixed = (["GOOGLE", "META"] as SourceType[]).map((sourceType) => {
      const row = lookup.get(sourceType);
      return {
        sourceType,
        cost: row?.cost ?? 0,
        impressions: row?.impressions ?? 0,
        clicks: row?.clicks ?? 0,
        conversions: row?.conversions ?? 0,
      };
    });
    const extras = sourceRows.filter((row) => !["GOOGLE", "META"].includes(row.sourceType));
    return [...fixed, ...extras];
  }, [data]);
  const chartRows = useMemo(() => {
    return (data?.dailyTrend ?? []).map((row) => ({
      ...row,
      value: getChartMetricValue(row, chartMetric),
    }));
  }, [data, chartMetric]);
  const chartMetricLabel = CHART_METRICS.find((metric) => metric.value === chartMetric)?.label ?? "지출";
  const detailRows = data?.detailRows ?? data?.recentRows ?? [];
  const detailPagination = data?.detailPagination ?? {
    page: detailPage,
    pageSize: DETAIL_PAGE_SIZE,
    total: detailRows.length,
    totalPages: Math.max(1, Math.ceil(detailRows.length / DETAIL_PAGE_SIZE)),
    groupBy: detailGroupBy,
    dateGranularity: detailDateGranularity,
    period: detailPeriod,
  };
  const detailPeriodOptions = data?.detailPeriodOptions ?? [];
  const selectedDetailPeriod = detailPagination.period ?? detailPeriod ?? detailPeriodOptions[0]?.value ?? "";
  const detailDateHeader = DETAIL_DATE_OPTIONS.find((option) => option.value === detailDateGranularity)?.header ?? "일자";
  const detailStartIndex = detailPagination.total === 0 ? 0 : (detailPagination.page - 1) * detailPagination.pageSize + 1;
  const detailEndIndex = Math.min(detailPagination.total, detailPagination.page * detailPagination.pageSize);

  if (wsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">프로젝트를 먼저 선택해주세요</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="space-y-5 p-8"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">광고 성과</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            매체별 성과 파일을 업로드하고 비용, 클릭, 전환 흐름을 한 곳에서 봅니다
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="grid h-10 grid-cols-3 rounded-xl border border-border bg-secondary/30 p-1">
            {MEDIA_FILTERS.map((filter) => (
              <motion.button
                key={filter.value}
                onClick={() => selectSource(filter.value)}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                className={`relative rounded-lg px-3 text-xs font-medium transition-colors ${
                  sourceFilter === filter.value
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {sourceFilter === filter.value && (
                  <motion.div
                    layoutId="ad-media-filter-bg"
                    className="absolute inset-0 rounded-lg bg-background shadow-sm"
                    transition={spring}
                    style={{ zIndex: 0 }}
                  />
                )}
                <span className="relative z-10">{filter.label}</span>
              </motion.button>
            ))}
          </div>
          <select
            value={rangeDays}
            onChange={(event) => changeRangeDays(event.target.value)}
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-violet-400"
          >
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="90">최근 90일</option>
            <option value="365">최근 365일</option>
            <option value="all">전체 기간</option>
          </select>
          <motion.button
            onClick={fetchData}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.94 }}
            transition={spring}
            className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-secondary"
            aria-label="새로고침"
          >
            <RefreshCw className={`h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`} />
          </motion.button>
          <motion.button
            onClick={() => setHistoryOpen(true)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={spring}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm transition-colors hover:bg-secondary"
          >
            <History className="h-4 w-4" />
            소스 이력
          </motion.button>
          <motion.button
            onClick={() => setUploadOpen(true)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={spring}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-500 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-600"
          >
            <Upload className="h-4 w-4" />
            소스 추가
          </motion.button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <MetricCard label="지출" value={formatKRW(totals?.cost)} sub={currentScopeLabel} />
        <MetricCard label="CPM" value={formatKRW(totals?.cpm)} sub={`노출 ${formatNumber(totals?.impressions)}`} />
        <MetricCard label="CPC" value={formatKRW(totals?.cpc)} sub={`클릭 ${formatNumber(totals?.clicks)}`} />
        <MetricCard label="CTR" value={formatPct(totals?.ctr)} />
        <MetricCard label="CVR" value={formatPct(totals?.cvr)} sub={`결과 ${formatNumber(totals?.conversions)}`} />
        <MetricCard label="전환수" value={formatNumber(totals?.conversions)} />
        <MetricCard label="결과당 비용" value={formatKRW(totals?.costPerConversion)} />
      </div>

      {loading ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex h-80 items-center justify-center rounded-2xl border border-border"
        >
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </motion.div>
      ) : !data || data.batches.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-border text-center"
        >
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}>
            <FileSpreadsheet className="mb-3 h-10 w-10 text-muted-foreground/30" />
          </motion.div>
          <p className="text-sm font-medium">아직 추가된 광고 소스가 없어요</p>
          <p className="mt-1 text-xs text-muted-foreground">CSV/엑셀 파일이나 Google Sheets를 연결하면 리포트가 생성됩니다.</p>
          <motion.button
            onClick={() => setUploadOpen(true)}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={spring}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
          >
            <Upload className="h-4 w-4" />
            첫 소스 추가
          </motion.button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="space-y-4"
        >
          <div className="space-y-4">
            <motion.section
              whileHover={{ borderColor: "rgba(139, 92, 246, 0.22)" }}
              transition={spring}
              className="rounded-2xl border border-border bg-background p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">성과 범위</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">매체, 캠페인, 광고세트를 순서대로 좁혀 봅니다.</p>
                </div>
                {(sourceFilter !== "ALL" || selectedCampaignName || selectedAdGroupName) && (
                  <motion.button
                    onClick={() => selectSource("ALL")}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={spring}
                    className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    전체 보기
                  </motion.button>
                )}
              </div>

              <div className="flex gap-2 overflow-x-auto px-0.5 py-1.5">
                <MediaPerformanceCard
                  sourceType="ALL"
                  active={sourceFilter === "ALL"}
                  cost={mediaSummaries.reduce((sum, source) => sum + source.cost, 0)}
                  impressions={mediaSummaries.reduce((sum, source) => sum + source.impressions, 0)}
                  clicks={mediaSummaries.reduce((sum, source) => sum + source.clicks, 0)}
                  conversions={mediaSummaries.reduce((sum, source) => sum + source.conversions, 0)}
                  onClick={() => selectSource("ALL")}
                />
                {mediaSummaries.map((source) => (
                  <MediaPerformanceCard
                    key={source.sourceType}
                    sourceType={source.sourceType}
                    active={sourceFilter === source.sourceType}
                    cost={source.cost}
                    impressions={source.impressions}
                    clicks={source.clicks}
                    conversions={source.conversions}
                    onClick={() => selectSource(source.sourceType)}
                  />
                ))}
              </div>

              <AnimatePresence>
                {sourceFilter !== "ALL" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={spring}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">광고 캠페인</p>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">{data.campaignSummary.length.toLocaleString()}개</span>
                          {(selectedCampaignName || selectedAdGroupName) && (
                            <motion.button
                              onClick={() => selectCampaign(null)}
                              whileHover={{ y: -1 }}
                              whileTap={{ scale: 0.96 }}
                              transition={spring}
                              className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                              캠페인 해제
                            </motion.button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 overflow-x-auto px-0.5 py-1.5">
                        {data.campaignSummary.map((campaign) => (
                          <PerformancePickCard
                            key={`${campaign.sourceType}:${campaign.campaignName}`}
                            title={campaign.campaignName}
                            meta={`지출 ${formatKRW(campaign.cost)} · 전환 ${formatNumber(campaign.conversions)}`}
                            active={selectedCampaignName === campaign.campaignName}
                            onClick={() => selectCampaign(selectedCampaignName === campaign.campaignName ? null : campaign.campaignName)}
                          />
                        ))}
                        {data.campaignSummary.length === 0 && (
                          <CompactEmpty label="선택한 매체에서 캠페인을 찾지 못했어요." />
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {sourceFilter !== "ALL" && selectedCampaignName && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={spring}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 border-t border-border pt-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-medium text-muted-foreground">광고세트 / 광고그룹</p>
                        {selectedAdGroupName && (
                          <motion.button
                            onClick={() => selectAdGroup(null)}
                            whileHover={{ y: -1 }}
                            whileTap={{ scale: 0.96 }}
                            transition={spring}
                            className="rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          >
                            광고세트 해제
                          </motion.button>
                        )}
                      </div>
                      <div className="flex gap-2 overflow-x-auto px-0.5 py-1.5">
                        {data.adGroupSummary.map((adGroup) => (
                          <PerformancePickCard
                            key={`${adGroup.sourceType}:${adGroup.campaignName}:${adGroup.adGroupName ?? ""}`}
                            title={adGroup.adGroupName || "광고세트/그룹 없음"}
                            meta={`지출 ${formatKRW(adGroup.cost)} · 전환 ${formatNumber(adGroup.conversions)}`}
                            active={selectedAdGroupName === adGroup.adGroupName}
                            onClick={() => selectAdGroup(selectedAdGroupName === adGroup.adGroupName ? null : adGroup.adGroupName ?? null)}
                          />
                        ))}
                        {data.adGroupSummary.length === 0 && (
                          <CompactEmpty label="이 캠페인에서 광고세트/광고그룹 데이터를 찾지 못했어요." />
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.section>

            <motion.section
              whileHover={{ borderColor: "rgba(139, 92, 246, 0.18)" }}
              transition={spring}
              className="rounded-2xl border border-border bg-background p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{chartMetricLabel} 추이</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">{currentScopeLabel} 기준으로 일자별 흐름을 확인합니다.</p>
                </div>
                <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-secondary/30 p-1">
                  {CHART_METRICS.map((metric) => (
                    <motion.button
                      key={metric.value}
                      onClick={() => setChartMetric(metric.value)}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.96 }}
                      transition={spring}
                      className={`relative rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        chartMetric === metric.value
                          ? "text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {chartMetric === metric.value && (
                        <motion.div
                          layoutId="ad-chart-metric-bg"
                          className="absolute inset-0 rounded-lg bg-background shadow-sm"
                          transition={spring}
                          style={{ zIndex: 0 }}
                        />
                      )}
                      <span className="relative z-10">{metric.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRows}>
                    <defs>
                      <linearGradient id="adSpendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(value) => formatMetricValue(chartMetric, Number(value))}
                      width={82}
                    />
                    <Tooltip formatter={(value) => formatMetricValue(chartMetric, Number(value ?? 0))} />
                    <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#adSpendFill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.section>

            <motion.section
              whileHover={{ borderColor: "rgba(139, 92, 246, 0.18)" }}
              transition={spring}
              className="rounded-2xl border border-border bg-background"
            >
              <div className="border-b border-border p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">결과 상세</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      선택한 일/주/월 안에서 기준별 성과를 20개씩 확인합니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <motion.div
                      whileHover={{ y: detailPeriodOptions.length ? -1 : 0 }}
                      transition={spring}
                      className="flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-2.5"
                    >
                      <span className="text-xs font-medium text-muted-foreground">기간</span>
                      <select
                        value={selectedDetailPeriod}
                        onChange={(event) => changeDetailPeriod(event.target.value)}
                        disabled={detailPeriodOptions.length === 0}
                        className="h-7 min-w-32 bg-transparent text-xs font-medium outline-none disabled:cursor-not-allowed disabled:text-muted-foreground"
                      >
                        {detailPeriodOptions.length === 0 ? (
                          <option value="">기간 없음</option>
                        ) : (
                          detailPeriodOptions.map((period) => (
                            <option key={period.value} value={period.value}>
                              {formatDetailPeriod(period.value, detailDateGranularity)} · {period.rowCount.toLocaleString()}개
                            </option>
                          ))
                        )}
                      </select>
                    </motion.div>
                    <div className="grid h-9 grid-cols-2 rounded-xl border border-border bg-secondary/30 p-1">
                      {DETAIL_GROUP_OPTIONS.map((option) => (
                        <motion.button
                          key={option.value}
                          type="button"
                          onClick={() => changeDetailGroupBy(option.value)}
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.96 }}
                          transition={spring}
                          className={`relative rounded-lg px-3 text-xs font-medium transition-colors ${
                            detailGroupBy === option.value
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {detailGroupBy === option.value && (
                            <motion.div
                              layoutId="ad-detail-group-bg"
                              className="absolute inset-0 rounded-lg bg-background shadow-sm"
                              transition={spring}
                              style={{ zIndex: 0 }}
                            />
                          )}
                          <span className="relative z-10">{option.label}</span>
                        </motion.button>
                      ))}
                    </div>
                    <div className="grid h-9 grid-cols-3 rounded-xl border border-border bg-secondary/30 p-1">
                      {DETAIL_DATE_OPTIONS.map((option) => (
                        <motion.button
                          key={option.value}
                          type="button"
                          onClick={() => changeDetailDateGranularity(option.value)}
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.96 }}
                          transition={spring}
                          className={`relative rounded-lg px-3 text-xs font-medium transition-colors ${
                            detailDateGranularity === option.value
                              ? "text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {detailDateGranularity === option.value && (
                            <motion.div
                              layoutId="ad-detail-date-bg"
                              className="absolute inset-0 rounded-lg bg-background shadow-sm"
                              transition={spring}
                              style={{ zIndex: 0 }}
                            />
                          )}
                          <span className="relative z-10">{option.label}</span>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1060px] text-sm">
                  <thead className="bg-secondary/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{detailDateHeader}</th>
                      <th className="px-4 py-3 text-left font-medium">매체</th>
                      <th className="px-4 py-3 text-left font-medium">캠페인</th>
                      <th className="px-4 py-3 text-left font-medium">광고세트/그룹</th>
                      <th className="px-4 py-3 text-right font-medium">지출</th>
                      <th className="px-4 py-3 text-right font-medium">CPM</th>
                      <th className="px-4 py-3 text-right font-medium">CPC</th>
                      <th className="px-4 py-3 text-right font-medium">CTR</th>
                      <th className="px-4 py-3 text-right font-medium">CVR</th>
                      <th className="px-4 py-3 text-right font-medium">전환수</th>
                      <th className="px-4 py-3 text-right font-medium">결과당 비용</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.map((row) => {
                      const cost = row.cost ?? 0;
                      const impressions = row.impressions ?? 0;
                      const clicks = row.clicks ?? 0;
                      const conversions = row.conversions ?? 0;
                      return (
                      <motion.tr
                        key={row.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileHover={{ backgroundColor: "rgba(139, 92, 246, 0.045)" }}
                        className="border-t border-border"
                      >
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {formatDetailPeriod(row.periodKey ?? row.reportDate ?? row.reportStart, detailDateGranularity)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{SOURCE_LABELS[row.sourceType] ?? row.sourceType}</td>
                        <td className="max-w-xs truncate px-4 py-3 font-medium">{row.campaignName}</td>
                        <td className="max-w-xs truncate px-4 py-3 text-muted-foreground">{row.adGroupName || "-"}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatKRW(cost)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatKRW(row.cpm ?? getChartMetricValue({ cost, impressions, clicks, conversions }, "cpm"))}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatKRW(row.cpc ?? getChartMetricValue({ cost, impressions, clicks, conversions }, "cpc"))}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatPct(row.ctr ?? calcCtr(clicks, impressions))}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatPct(row.cvr ?? row.conversionRate ?? calcCvr(conversions, clicks))}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatNumber(conversions)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{formatKRW(row.costPerConversion ?? calcCostPerResult(cost, conversions))}</td>
                      </motion.tr>
                      );
                    })}
                    {detailRows.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-sm text-muted-foreground">
                          표시할 성과 데이터가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
                <p className="text-xs text-muted-foreground">
                  전체 {detailPagination.total.toLocaleString()}개 중 {detailStartIndex.toLocaleString()}-{detailEndIndex.toLocaleString()}개 · {detailPagination.page} / {detailPagination.totalPages}
                </p>
                <div className="flex items-center gap-1.5">
                  <motion.button
                    type="button"
                    disabled={detailPagination.page <= 1}
                    onClick={() => setDetailPage(1)}
                    whileHover={detailPagination.page <= 1 ? undefined : { y: -1 }}
                    whileTap={detailPagination.page <= 1 ? undefined : { scale: 0.96 }}
                    transition={spring}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    처음
                  </motion.button>
                  <motion.button
                    type="button"
                    disabled={detailPagination.page <= 1}
                    onClick={() => setDetailPage(Math.max(1, detailPagination.page - 1))}
                    whileHover={detailPagination.page <= 1 ? undefined : { y: -1 }}
                    whileTap={detailPagination.page <= 1 ? undefined : { scale: 0.96 }}
                    transition={spring}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    이전
                  </motion.button>
                  <motion.button
                    type="button"
                    disabled={detailPagination.page >= detailPagination.totalPages}
                    onClick={() => setDetailPage(Math.min(detailPagination.totalPages, detailPagination.page + 1))}
                    whileHover={detailPagination.page >= detailPagination.totalPages ? undefined : { y: -1 }}
                    whileTap={detailPagination.page >= detailPagination.totalPages ? undefined : { scale: 0.96 }}
                    transition={spring}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    다음
                  </motion.button>
                  <motion.button
                    type="button"
                    disabled={detailPagination.page >= detailPagination.totalPages}
                    onClick={() => setDetailPage(detailPagination.totalPages)}
                    whileHover={detailPagination.page >= detailPagination.totalPages ? undefined : { y: -1 }}
                    whileTap={detailPagination.page >= detailPagination.totalPages ? undefined : { scale: 0.96 }}
                    transition={spring}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    마지막
                  </motion.button>
                </div>
              </div>
            </motion.section>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {uploadOpen && workspace && currentProject && (
          <UploadModal
            workspaceId={workspace.id}
            projectId={currentProject.id}
            onClose={() => setUploadOpen(false)}
            onImported={() => {
              setUploadOpen(false);
              void fetchData();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {historyOpen && data && (
          <ImportHistoryPanel
            batches={data.batches}
            onClose={() => setHistoryOpen(false)}
            onDelete={(id) => deleteBatch(id, fetchData)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, borderColor: "rgba(139, 92, 246, 0.35)" }}
      transition={spring}
      className="rounded-2xl border border-border bg-background p-4"
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

function PerformancePickCard({
  title,
  meta,
  active,
  onClick,
}: {
  title: string;
  meta: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      whileHover={{ scale: 1.012, boxShadow: "0 8px 22px rgba(15, 23, 42, 0.08)" }}
      whileTap={{ scale: 0.97 }}
      transition={spring}
      className={`min-w-[220px] max-w-[280px] rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-violet-400 bg-violet-500/10"
          : "border-border bg-background hover:border-violet-300/60 hover:bg-secondary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          active ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground"
        }`}>
          {active ? "선택" : "보기"}
        </span>
      </div>
    </motion.button>
  );
}

function CompactEmpty({ label }: { label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring}
      className="min-w-[260px] rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
    >
      {label}
    </motion.div>
  );
}

function MediaPerformanceCard({
  sourceType,
  active,
  cost,
  impressions,
  clicks,
  conversions,
  onClick,
}: {
  sourceType: string;
  active: boolean;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      whileHover={{ scale: 1.012, boxShadow: "0 8px 22px rgba(15, 23, 42, 0.08)" }}
      whileTap={{ scale: 0.97 }}
      transition={spring}
      className={`min-w-[210px] rounded-xl border px-3 py-2.5 text-left transition-colors ${
        active
          ? "border-violet-400 bg-violet-500/10"
          : "border-border bg-background hover:border-violet-300/60 hover:bg-secondary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{SOURCE_LABELS[sourceType] ?? sourceType}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">지출 {formatKRW(cost)}</p>
        </div>
        <motion.span layout className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          active ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground"
        }`}>
          {active ? "선택" : "보기"}
        </motion.span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>전환 {formatNumber(conversions)}</span>
        <span>CTR {formatPct(calcCtr(clicks, impressions))}</span>
      </div>
    </motion.button>
  );
}

async function deleteBatch(id: string, onDone: () => Promise<void>) {
  if (!confirm("이 소스 이력과 성과 데이터를 삭제할까요?")) return;
  const res = await fetch(`/api/ad-performance/batches/${id}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast.error(data.error ?? "삭제하지 못했어요");
    return;
  }
  toast.success("소스 이력이 삭제됐어요");
  await onDone();
}

function ImportHistoryPanel({
  batches,
  onClose,
  onDelete,
}: {
  batches: PerformanceResponse["batches"];
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />
      <motion.aside
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={spring}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <h2 className="text-lg font-semibold">소스 이력</h2>
            <p className="mt-1 text-sm text-muted-foreground">업로드한 파일과 저장된 row를 관리합니다.</p>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ rotate: 4, scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            transition={spring}
            className="rounded-xl p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {batches.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <Database className="mb-3 h-9 w-9 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">아직 추가된 소스 이력이 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {batches.map((batch) => (
                <motion.div
                  key={batch.id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ x: -2, borderColor: "rgba(139, 92, 246, 0.28)" }}
                  transition={spring}
                  className="group rounded-2xl border border-border p-4"
                >
                  <div className="flex items-start gap-3">
                    <Database className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{batch.fileName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {SOURCE_LABELS[batch.sourceType] ?? batch.sourceType} · {batch._count.records.toLocaleString()}건
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {batch.reportStart && batch.reportEnd
                          ? `${batch.reportStart.slice(0, 10)} ~ ${batch.reportEnd.slice(0, 10)}`
                          : "파일 날짜 미인식"}
                      </p>
                    </div>
                    <motion.button
                      onClick={() => void onDelete(batch.id)}
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.94 }}
                      transition={spring}
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                      aria-label="소스 이력 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.aside>
    </>
  );
}

function UploadModal({
  workspaceId,
  projectId,
  onClose,
  onImported,
}: {
  workspaceId: string;
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [addMode, setAddMode] = useState<SourceAddMode>("file");
  const [sourceChoice, setSourceChoice] = useState<SourceChoice>("AUTO");
  const [file, setFile] = useState<File | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");
  const [analysis, setAnalysis] = useState<SheetAnalysis | null>(null);
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [parsing, setParsing] = useState(false);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const previewTotals = useMemo(() => summarizeRows(preview?.rows ?? []), [preview]);
  const coreFields = useMemo(
    () => AD_COLUMN_FIELDS.filter((field) => ["campaignName", "adGroupName", "reportDate", "cost", "impressions", "clicks", "conversions"].includes(field.key)),
    []
  );
  const extraFields = useMemo(
    () => AD_COLUMN_FIELDS.filter((field) => !["campaignName", "adGroupName", "reportDate", "cost", "impressions", "clicks", "conversions"].includes(field.key)),
    []
  );

  const previewFromAnalysis = (nextAnalysis: SheetAnalysis, showEmptyToast = false) => {
    setAnalysis(nextAnalysis);
    try {
      const parsed = parseMappedRows(nextAnalysis);
      if (!parsed.rows.length) throw new Error("가져올 성과 row가 없어요");
      setPreview(parsed);
      return parsed;
    } catch (error) {
      setPreview(null);
      if (showEmptyToast) toast.error(error instanceof Error ? error.message : "컬럼 매핑을 확인해주세요");
      return null;
    }
  };

  const clearLoadedSource = () => {
    setFile(null);
    setSourceFileName(null);
    setAnalysis(null);
    setPreview(null);
  };

  const changeAddMode = (nextMode: SourceAddMode) => {
    if (addMode === nextMode) return;
    setAddMode(nextMode);
    clearLoadedSource();
  };

  const handleFile = async (nextFile: File | null) => {
    setFile(nextFile);
    setSourceFileName(nextFile?.name ?? null);
    setAnalysis(null);
    setPreview(null);
    if (!nextFile) return;

    setParsing(true);
    try {
      const rows = await readSheetRows(nextFile);
      const nextAnalysis = analyzeSheetRows(rows, sourceChoice);
      const parsed = previewFromAnalysis(nextAnalysis, true);
      if (parsed && sourceChoice === "AUTO") setSourceChoice(parsed.sourceType);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파일을 읽지 못했어요");
      setPreview(null);
    } finally {
      setParsing(false);
    }
  };

  const loadGoogleSheet = async () => {
    const trimmedUrl = sheetUrl.trim();
    if (!trimmedUrl) {
      toast.error("Google Sheets URL을 입력해주세요");
      return;
    }

    clearLoadedSource();
    setSheetLoading(true);
    try {
      const res = await fetch("/api/ad-performance/google-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Google Sheets를 불러오지 못했어요");

      const rows = readCsvRows(String(data.csv ?? ""));
      const nextAnalysis = analyzeSheetRows(rows, sourceChoice);
      const parsed = previewFromAnalysis(nextAnalysis, true);
      setSourceFileName(String(data.fileName ?? "google-sheets.csv"));
      if (parsed && sourceChoice === "AUTO") setSourceChoice(parsed.sourceType);
      toast.success("Google Sheets를 분석했어요");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google Sheets를 불러오지 못했어요");
      setPreview(null);
    } finally {
      setSheetLoading(false);
    }
  };

  const reparse = async () => {
    if (analysis) {
      previewFromAnalysis(analysis, true);
      return;
    }
    if (!file) return;
    await handleFile(file);
  };

  const changeSourceChoice = (nextChoice: SourceChoice) => {
    setSourceChoice(nextChoice);
    setPreview(null);
    if (!analysis) return;
    const nextAnalysis = analyzeSheetRows(analysis.rows, nextChoice);
    previewFromAnalysis(nextAnalysis);
  };

  const updateMapping = (field: AdColumnKey, value: string) => {
    if (!analysis) return;
    const mapping = { ...analysis.mapping };
    if (value === "") delete mapping[field];
    else mapping[field] = Number(value);
    previewFromAnalysis({ ...analysis, mapping });
  };

  const importRows = async () => {
    if (!sourceFileName || !preview) return;
    setImporting(true);
    try {
      const res = await fetch("/api/ad-performance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          projectId,
          sourceType: preview.sourceType,
          sourceName: SOURCE_LABELS[preview.sourceType],
          fileName: sourceFileName,
          reportStart: preview.reportStart,
          reportEnd: preview.reportEnd,
          rows: preview.rows,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "소스 추가에 실패했어요");
      toast.success(`${preview.rows.length.toLocaleString()}건의 광고 성과를 추가했어요`);
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "소스 추가에 실패했어요");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: 36, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 36, opacity: 0 }}
        transition={spring}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-6">
          <div>
            <h2 className="text-lg font-semibold">소스 추가</h2>
            <p className="mt-1 text-sm text-muted-foreground">CSV/엑셀 파일 또는 Google Sheets를 광고 성과 소스로 추가합니다.</p>
          </div>
          <motion.button
            onClick={onClose}
            whileHover={{ rotate: 4, scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            transition={spring}
            className="rounded-xl p-2 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="grid grid-cols-2 rounded-2xl border border-border bg-secondary/30 p-1">
            {[
              { value: "file" as const, label: "CSV/엑셀", desc: "파일 가져오기" },
              { value: "googleSheet" as const, label: "Google Sheets", desc: "시트 URL 연결" },
            ].map((mode) => {
              const active = addMode === mode.value;
              return (
                <motion.button
                  key={mode.value}
                  type="button"
                  onClick={() => changeAddMode(mode.value)}
                  whileHover={{ scale: active ? 1 : 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  transition={spring}
                  className={`relative rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.div
                      layoutId="ad-source-mode-bg"
                      className="absolute inset-0 rounded-xl bg-background shadow-sm"
                      transition={spring}
                      style={{ zIndex: 0 }}
                    />
                  )}
                  <span className="relative z-10 block text-sm font-semibold">{mode.label}</span>
                  <span className="relative z-10 mt-0.5 block text-[11px]">{mode.desc}</span>
                </motion.button>
              );
            })}
          </div>

          <div className="grid gap-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">매체</span>
              <select
                value={sourceChoice}
                onChange={(event) => {
                  changeSourceChoice(event.target.value as SourceChoice);
                }}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-violet-400"
              >
                <option value="AUTO">자동 인식</option>
                <option value="GOOGLE">Google Ads</option>
                <option value="META">Meta Ads</option>
              </select>
            </label>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {addMode === "file" ? (
              <motion.label
                key="file-source"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                whileHover={{ y: -2, borderColor: "rgba(139, 92, 246, 0.6)" }}
                whileTap={{ scale: 0.995 }}
                transition={{ duration: 0.18 }}
                className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border px-4 py-8 text-center transition-colors hover:bg-violet-500/5"
              >
                <motion.div animate={parsing ? { rotate: 360 } : { rotate: 0 }} transition={parsing ? { duration: 1, repeat: Infinity, ease: "linear" } : spring}>
                  <FileSpreadsheet className="mb-3 h-8 w-8 text-violet-500" />
                </motion.div>
                <span className="text-sm font-medium">{file ? file.name : "CSV/엑셀 파일 선택"}</span>
                <span className="mt-1 text-xs text-muted-foreground">.csv, .xlsx, .xls 파일을 지원합니다.</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
                />
              </motion.label>
            ) : (
              <motion.div
                key="sheet-source"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.18 }}
                className="rounded-2xl border border-border bg-secondary/20 p-4"
              >
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Google Sheets URL</span>
                  <input
                    value={sheetUrl}
                    onChange={(event) => setSheetUrl(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
                    className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-violet-400"
                  />
                </label>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <p className="text-xs leading-5 text-muted-foreground">
                    링크가 있는 사용자가 볼 수 있는 시트만 불러올 수 있어요. 첫 번째 탭 또는 URL의 gid 탭을 읽습니다.
                  </p>
                  <motion.button
                    type="button"
                    onClick={() => void loadGoogleSheet()}
                    disabled={sheetLoading}
                    whileHover={!sheetLoading ? { y: -1 } : undefined}
                    whileTap={!sheetLoading ? { scale: 0.97 } : undefined}
                    transition={spring}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-violet-500 px-3 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
                  >
                    {sheetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    시트 불러오기
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {sourceFileName && !preview && (
            <motion.button
              onClick={reparse}
              disabled={parsing || sheetLoading}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.97 }}
              transition={spring}
              className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50"
            >
              {parsing || sheetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              다시 분석
            </motion.button>
          )}

          {analysis && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring}
              className="rounded-2xl border border-border bg-secondary/20 p-4"
            >
              <div className="mb-3">
                <p className="text-sm font-semibold">컬럼 매핑</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  보고서 컬럼명이 달라도 표준 항목에 맞춰 선택하면 그대로 가져올 수 있어요.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {coreFields.map((field) => (
                  <ColumnMappingSelect
                    key={field.key}
                    field={field}
                    headers={analysis.headers}
                    value={analysis.mapping[field.key]}
                    onChange={(value) => updateMapping(field.key, value)}
                  />
                ))}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  추가 지표 매핑
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {extraFields.map((field) => (
                    <ColumnMappingSelect
                      key={field.key}
                      field={field}
                      headers={analysis.headers}
                      value={analysis.mapping[field.key]}
                      onChange={(value) => updateMapping(field.key, value)}
                    />
                  ))}
                </div>
              </details>
            </motion.div>
          )}

          <AnimatePresence>
            {preview && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={spring}
                className="space-y-3"
              >
              <motion.div whileHover={{ borderColor: "rgba(139, 92, 246, 0.42)" }} transition={spring} className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{SOURCE_LABELS[preview.sourceType]}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {preview.rows.length.toLocaleString()}건 · {preview.reportStart && preview.reportEnd
                        ? `${preview.reportStart} ~ ${preview.reportEnd}`
                        : "파일 날짜 미인식"}
                    </p>
                  </div>
                  <motion.button
                    onClick={reparse}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={spring}
                    className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs hover:bg-secondary"
                  >
                    다시 분석
                  </motion.button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <PreviewMetric label="지출" value={formatKRW(previewTotals.cost)} />
                  <PreviewMetric label="노출" value={formatNumber(previewTotals.impressions)} />
                  <PreviewMetric label="클릭" value={formatNumber(previewTotals.clicks)} />
                  <PreviewMetric label="결과" value={formatNumber(previewTotals.conversions)} />
                </div>
              </motion.div>

              {preview.warnings.map((warning) => (
                <motion.p
                  key={warning}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs text-amber-700"
                >
                  {warning}
                </motion.p>
              ))}

              <div className="max-h-72 overflow-auto rounded-2xl border border-border">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">캠페인</th>
                      <th className="px-3 py-2 text-left font-medium">광고그룹/세트</th>
                      <th className="px-3 py-2 text-right font-medium">지출</th>
                      <th className="px-3 py-2 text-right font-medium">클릭</th>
                      <th className="px-3 py-2 text-right font-medium">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 8).map((row, index) => (
                      <motion.tr
                        key={`${row.campaignName}:${index}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        whileHover={{ backgroundColor: "rgba(139, 92, 246, 0.045)" }}
                        className="border-t border-border"
                      >
                        <td className="max-w-52 truncate px-3 py-2 font-medium">{row.campaignName}</td>
                        <td className="max-w-48 truncate px-3 py-2 text-muted-foreground">{row.adGroupName || "-"}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatKRW(row.cost)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(row.clicks)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatNumber(row.conversions)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t border-border p-4">
          <motion.button
            onClick={importRows}
            disabled={!preview || importing}
            whileHover={preview && !importing ? { y: -1 } : undefined}
            whileTap={preview && !importing ? { scale: 0.98 } : undefined}
            transition={spring}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-500 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-40"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            소스 추가
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}

function ColumnMappingSelect({
  field,
  headers,
  value,
  onChange,
}: {
  field: { key: AdColumnKey; label: string; required?: boolean; hint?: string };
  headers: string[];
  value: number | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="flex items-center justify-between gap-2 text-xs font-medium">
        <span>
          {field.label}
          {field.required && <span className="ml-1 text-violet-500">*</span>}
        </span>
        {field.hint && <span className="truncate text-[11px] font-normal text-muted-foreground">{field.hint}</span>}
      </span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-violet-400"
      >
        <option value="">사용 안 함</option>
        {headers.map((header, index) => (
          <option key={`${header}:${index}`} value={index}>
            {header || `column_${index + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1, borderColor: "rgba(139, 92, 246, 0.32)" }}
      transition={spring}
      className="rounded-xl border border-border bg-background p-3"
    >
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono font-semibold">{value}</p>
    </motion.div>
  );
}
