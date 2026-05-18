export type WidgetType =
  | "kpi"
  | "time_series"
  | "utm_breakdown"
  | "top_n"
  | "field_distribution"
  | "recent_feed"
  | "performance_table"
  | "heatmap"
  | "gauge"
  | "sparkline_kpi"
  | "funnel"
  | "auto_insight";

export interface DashboardFilters {
  sourceId?: string;          // 위젯 설정 위에 override
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  attribution?: "last" | "first";
}

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
  dimension?: string;             // utm_breakdown / top_n / performance_table
  field?: string;                 // field_distribution / funnel: data 의 key
  granularity?: Granularity;      // time_series
  topN?: number;                  // top_n / performance_table
  limit?: number;                 // recent_feed
  compareWithPrevious?: boolean;  // kpi / time_series
  chartType?: "bar" | "donut";    // utm_breakdown
  target?: number;                // gauge: 목표값
  funnelStages?: string[];        // funnel: 각 단계 sourceId 배열
  [key: string]: unknown;
}

export interface SourceOption {
  id: string;
  name: string;
  fields: { key: string; label: string }[];
}

export const WIDGET_CATALOG: { type: WidgetType; label: string; description: string; defaultWidth: WidgetWidth }[] = [
  { type: "kpi",                label: "KPI 카드",        description: "기간 내 총 제출 수 + 전기간 대비 변화",       defaultWidth: "third" },
  { type: "sparkline_kpi",      label: "KPI + 스파크라인", description: "큰 숫자 옆에 미니 트렌드선",                  defaultWidth: "third" },
  { type: "gauge",              label: "목표 게이지",     description: "목표값 대비 달성률 진행률",                   defaultWidth: "third" },
  { type: "time_series",        label: "시계열 차트",     description: "시간별 / 일별 / 주별 제출 추이 (비교선 가능)", defaultWidth: "full" },
  { type: "performance_table",  label: "퍼포먼스 표",     description: "캠페인/소스별 신규·전기간 대비 표",            defaultWidth: "full" },
  { type: "heatmap",            label: "요일×시간 히트맵", description: "언제 제출이 많은지 캘린더 형태로",            defaultWidth: "full" },
  { type: "utm_breakdown",      label: "UTM 분포",        description: "소스·매체·캠페인별 비중 (도넛/막대)",          defaultWidth: "half" },
  { type: "top_n",              label: "TOP N",            description: "상위 N개 캠페인/필드값 순위",                  defaultWidth: "half" },
  { type: "field_distribution", label: "필드 분포",       description: "특정 필드(관람구분, 유입경로 등) 값별 분포",   defaultWidth: "half" },
  { type: "funnel",             label: "퍼널",            description: "여러 소스를 순차 단계로 (전환률)",            defaultWidth: "half" },
  { type: "recent_feed",        label: "최근 제출 피드",   description: "최신 폼 제출 라이브 피드",                    defaultWidth: "half" },
  { type: "auto_insight",       label: "자동 인사이트",   description: "이상 변화·급증/급감 자동 감지",                defaultWidth: "half" },
];
