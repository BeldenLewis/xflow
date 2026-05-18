"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Check } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _unused = unknown;
import { toast } from "sonner";
import { Widget, WidgetType, WidgetConfig, WidgetWidth, SourceOption, WIDGET_CATALOG } from "./types";

interface Props {
  mode: "create" | "edit";
  workspaceId: string;
  projectId: string;
  dashboardId?: string;
  sources: SourceOption[];
  initialType?: WidgetType;
  initialWidget?: Widget;
  onClose: () => void;
  onSaved: () => void;
}

export default function WidgetConfigModal({ mode, workspaceId, projectId, dashboardId, sources, initialType, initialWidget, onClose, onSaved }: Props) {
  const [type, setType] = useState<WidgetType>(initialType ?? initialWidget?.type ?? "kpi");
  const [title, setTitle] = useState(initialWidget?.title ?? "");
  const [config, setConfig] = useState<WidgetConfig>(initialWidget?.config ?? {});
  const [width, setWidth] = useState<WidgetWidth>(initialWidget?.width ?? "half");
  const [saving, setSaving] = useState(false);

  // 타입 변경 시 기본 너비 적용
  useEffect(() => {
    if (mode !== "create") return;
    const def = WIDGET_CATALOG.find((c) => c.type === type)?.defaultWidth ?? "half";
    setWidth(def);
    if (!title) {
      const label = WIDGET_CATALOG.find((c) => c.type === type)?.label ?? "위젯";
      setTitle(label);
    }
  }, [type, mode, title]);

  const updateConfig = (patch: Partial<WidgetConfig>) => setConfig((c) => ({ ...c, ...patch }));

  const selectedSource = sources.find((s) => s.id === config.sourceId);
  const availableFields = selectedSource?.fields ?? [];

  const handleSave = async () => {
    if (!title.trim()) { toast.error("위젯 제목을 입력해주세요"); return; }
    setSaving(true);
    try {
      const endpoint = mode === "create"
        ? "/api/dashboard-widgets"
        : `/api/dashboard-widgets/${initialWidget!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const body = mode === "create"
        ? { workspaceId, projectId, dashboardId, type, title: title.trim(), config, width }
        : { title: title.trim(), config, width };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[widget save] failed:", res.status, data);
        toast.error(data.error ?? `저장 실패 (HTTP ${res.status})`);
        return;
      }
      toast.success(mode === "create" ? "위젯이 추가됐어요" : "위젯이 수정됐어요");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">{mode === "create" ? "위젯 추가" : "위젯 설정"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* 위젯 타입 (생성 모드만) */}
          {mode === "create" && (
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">위젯 종류</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {WIDGET_CATALOG.map((c) => (
                  <button
                    key={c.type}
                    onClick={() => setType(c.type)}
                    className={`text-left p-3 rounded-xl border transition-colors ${
                      type === c.type
                        ? "border-violet-500 bg-violet-500/5"
                        : "border-border bg-background hover:border-violet-400/40"
                    }`}
                  >
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{c.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 제목 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">위젯 제목</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 주간 신규 리드"
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
            />
          </div>

          {/* 소스 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">데이터 범위</label>
            <select
              value={config.sourceId ?? "all"}
              onChange={(e) => updateConfig({ sourceId: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
            >
              <option value="all">전체 소스 합계</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* 타입별 추가 설정 */}
          {type === "kpi" && (
            <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-border">
              <input
                type="checkbox"
                checked={!!config.compareWithPrevious}
                onChange={(e) => updateConfig({ compareWithPrevious: e.target.checked })}
                className="mt-0.5 accent-violet-500 cursor-pointer"
              />
              <div>
                <p className="text-sm">이전 기간과 비교 표시</p>
                <p className="text-[11px] text-muted-foreground">전기간 대비 변화율 (% ↑↓) 함께 보여줘요</p>
              </div>
            </label>
          )}

          {type === "time_series" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">시간 단위</label>
                <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-background w-fit">
                  {(["hour", "day", "week"] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => updateConfig({ granularity: g })}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        (config.granularity ?? "day") === g ? "bg-violet-500 text-white" : "text-muted-foreground"
                      }`}
                    >
                      {g === "hour" ? "시간" : g === "day" ? "일" : "주"}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-border">
                <input type="checkbox" checked={!!config.compareWithPrevious} onChange={(e) => updateConfig({ compareWithPrevious: e.target.checked })} className="mt-0.5 accent-violet-500 cursor-pointer" />
                <div>
                  <p className="text-sm">이전 기간 비교선 표시</p>
                  <p className="text-[11px] text-muted-foreground">같은 기간만큼 직전을 점선으로 오버레이</p>
                </div>
              </label>
            </>
          )}

          {type === "gauge" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">목표값</label>
              <input
                type="number"
                min={1}
                value={(config.target as number) ?? 100}
                onChange={(e) => updateConfig({ target: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
              />
              <p className="text-[11px] text-muted-foreground mt-1">예: 이번 달 목표 신청 건수</p>
            </div>
          )}

          {type === "performance_table" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">분석 차원</label>
                <select
                  value={config.dimension ?? "utmCampaign"}
                  onChange={(e) => updateConfig({ dimension: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                >
                  <optgroup label="UTM">
                    <option value="utmCampaign">UTM 캠페인</option>
                    <option value="utmSource">UTM 소스</option>
                    <option value="utmMedium">UTM 매체</option>
                    <option value="utmTerm">UTM 키워드</option>
                    <option value="utmContent">UTM 콘텐츠</option>
                  </optgroup>
                  <optgroup label="First-touch">
                    <option value="firstUtmCampaign">First 캠페인</option>
                    <option value="firstUtmSource">First 소스</option>
                    <option value="firstUtmMedium">First 매체</option>
                  </optgroup>
                  <optgroup label="기타">
                    <option value="sourceId">수집 소스별</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">상위 N개 (정렬은 표 안에서)</label>
                <select
                  value={config.topN ?? 20}
                  onChange={(e) => updateConfig({ topN: parseInt(e.target.value) })}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                >
                  {[10, 20, 50, 100].map((n) => <option key={n} value={n}>TOP {n}</option>)}
                </select>
              </div>
            </>
          )}

          {type === "funnel" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">단계 (위에서 아래 순서)</label>
              <p className="text-[11px] text-muted-foreground mb-2">여러 수집 소스를 깔때기 단계로 묶을 수 있어요 (예: 사전등록 → 본등록 → 결제)</p>
              <div className="space-y-1.5">
                {((config.funnelStages as string[]) ?? []).map((sid, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                    <select
                      value={sid}
                      onChange={(e) => {
                        const stages = [...((config.funnelStages as string[]) ?? [])];
                        stages[i] = e.target.value;
                        updateConfig({ funnelStages: stages });
                      }}
                      className="flex-1 px-2 py-1 rounded-lg border border-border bg-background text-xs focus:outline-none focus:border-violet-400"
                    >
                      <option value="">— 소스 선택 —</option>
                      {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button
                      onClick={() => {
                        const stages = ((config.funnelStages as string[]) ?? []).filter((_, j) => j !== i);
                        updateConfig({ funnelStages: stages });
                      }}
                      className="p-1 rounded hover:bg-red-500/10 hover:text-red-500 text-muted-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => updateConfig({ funnelStages: [...((config.funnelStages as string[]) ?? []), ""] })}
                  className="text-xs text-violet-500 hover:underline"
                >
                  + 단계 추가
                </button>
              </div>
            </div>
          )}

          {type === "utm_breakdown" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">UTM 차원</label>
                <select
                  value={config.dimension ?? "utmSource"}
                  onChange={(e) => updateConfig({ dimension: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                >
                  <optgroup label="최종 유입 (Last touch)">
                    <option value="utmSource">UTM 소스</option>
                    <option value="utmMedium">UTM 매체</option>
                    <option value="utmCampaign">UTM 캠페인</option>
                    <option value="utmTerm">UTM 키워드</option>
                    <option value="utmContent">UTM 콘텐츠</option>
                  </optgroup>
                  <optgroup label="최초 유입 (First touch)">
                    <option value="firstUtmSource">First UTM 소스</option>
                    <option value="firstUtmMedium">First UTM 매체</option>
                    <option value="firstUtmCampaign">First UTM 캠페인</option>
                    <option value="firstUtmTerm">First UTM 키워드</option>
                    <option value="firstUtmContent">First UTM 콘텐츠</option>
                  </optgroup>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">차트 모양</label>
                <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-background w-fit">
                  {(["donut", "bar"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => updateConfig({ chartType: c })}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        (config.chartType ?? "donut") === c ? "bg-violet-500 text-white" : "text-muted-foreground"
                      }`}
                    >
                      {c === "donut" ? "도넛" : "막대"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {type === "top_n" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">분석 차원</label>
                <select
                  value={config.dimension ?? "utmCampaign"}
                  onChange={(e) => updateConfig({ dimension: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                >
                  <optgroup label="최종 유입 (Last touch)">
                    <option value="utmSource">UTM 소스</option>
                    <option value="utmMedium">UTM 매체</option>
                    <option value="utmCampaign">UTM 캠페인</option>
                    <option value="utmTerm">UTM 키워드</option>
                    <option value="utmContent">UTM 콘텐츠</option>
                  </optgroup>
                  <optgroup label="최초 유입 (First touch)">
                    <option value="firstUtmSource">First UTM 소스</option>
                    <option value="firstUtmMedium">First UTM 매체</option>
                    <option value="firstUtmCampaign">First UTM 캠페인</option>
                    <option value="firstUtmTerm">First UTM 키워드</option>
                    <option value="firstUtmContent">First UTM 콘텐츠</option>
                  </optgroup>
                  <optgroup label="referrer">
                    <option value="referrer">Referrer</option>
                    <option value="firstReferrer">First Referrer</option>
                  </optgroup>
                  {availableFields.length > 0 && (
                    <optgroup label="필드값">
                      {availableFields.map((f) => (
                        <option key={f.key} value={`data.${f.key}`}>{f.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">상위 N개</label>
                <select
                  value={config.topN ?? 5}
                  onChange={(e) => updateConfig({ topN: parseInt(e.target.value) })}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                >
                  {[3, 5, 10, 20].map((n) => <option key={n} value={n}>TOP {n}</option>)}
                </select>
              </div>
            </>
          )}

          {type === "field_distribution" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">필드 선택</label>
              {selectedSource && availableFields.length > 0 ? (
                <select
                  value={config.field ?? ""}
                  onChange={(e) => updateConfig({ field: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
                >
                  <option value="">— 선택 —</option>
                  {availableFields.map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  특정 소스를 선택하면 그 소스의 필드 중 분포를 볼 수 있어요. "전체 소스"에선 사용 불가.
                </p>
              )}
            </div>
          )}

          {type === "recent_feed" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">표시 개수</label>
              <select
                value={config.limit ?? 10}
                onChange={(e) => updateConfig({ limit: parseInt(e.target.value) })}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400"
              >
                {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}건</option>)}
              </select>
            </div>
          )}

          {/* 너비 */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">너비</label>
            <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-background w-fit">
              {(["third", "half", "full"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  className={`px-3 py-1 rounded-md text-xs font-medium ${
                    width === w ? "bg-violet-500 text-white" : "text-muted-foreground"
                  }`}
                >
                  {w === "third" ? "1/3" : w === "half" ? "1/2" : "전체"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-secondary/30">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {mode === "create" ? "추가" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
