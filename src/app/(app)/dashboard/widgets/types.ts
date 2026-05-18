export type WidgetType =
  | "kpi"
  | "time_series"
  | "utm_breakdown"
  | "top_n"
  | "field_distribution"
  | "recent_feed";

export type WidgetWidth = "full" | "half" | "third";

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  config: WidgetConfig;
  width: WidgetWidth;
  position: number;
}

export type UtmDimension = "utmSource" | "utmMedium" | "utmCampaign" | "utmTerm" | "utmContent";
export type Granularity = "hour" | "day" | "week";

export interface WidgetConfig {
  sourceId?: string;              // "all" 이거나 특정 source id
  dimension?: string;             // utm_breakdown / top_n
  field?: string;                 // field_distribution: data 의 key
  granularity?: Granularity;      // time_series
  topN?: number;                  // top_n
  limit?: number;                 // recent_feed
  compareWithPrevious?: boolean;  // kpi
  chartType?: "bar" | "donut";    // utm_breakdown
  [key: string]: unknown;
}

export interface SourceOption {
  id: string;
  name: string;
  fields: { key: string; label: string }[];
}

export const WIDGET_CATALOG: { type: WidgetType; label: string; description: string; defaultWidth: WidgetWidth }[] = [
  { type: "kpi",                label: "KPI 카드",      description: "기간 내 총 제출 수 + 전기간 대비 변화",       defaultWidth: "third" },
  { type: "time_series",        label: "시계열 차트",   description: "시간별 / 일별 / 주별 제출 추이",              defaultWidth: "full" },
  { type: "utm_breakdown",      label: "UTM 분포",      description: "소스·매체·캠페인별 비중 (도넛/막대)",          defaultWidth: "half" },
  { type: "top_n",              label: "TOP N",          description: "상위 N개 캠페인/필드값 순위",                   defaultWidth: "half" },
  { type: "field_distribution", label: "필드 분포",     description: "특정 필드(관람구분, 유입경로 등) 값별 분포",   defaultWidth: "half" },
  { type: "recent_feed",        label: "최근 제출 피드", description: "최신 폼 제출 라이브 피드",                    defaultWidth: "half" },
];
