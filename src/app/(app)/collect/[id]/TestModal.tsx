"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Check, AlertCircle, ExternalLink, RefreshCw, Globe, Activity } from "lucide-react";
import { toast } from "sonner";
import { formatKstDateTime } from "@/lib/datetime";
import ModalShell from "./ModalShell";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface FieldMapping {
  id: string;
  key: string;
  label: string;
}

interface SiteCheck {
  siteUrl: string | null;
  siteReachable: boolean;
  statusCode: number | null;
  scriptDetected: "yes" | "no" | "unknown";
  loaderDetected: boolean;
  apiKeyDetected: boolean;
  collectUrlDetected: boolean;
  formPagePatterns: string[];
  patternsConfigured: boolean;
  siteUrlMatchesPattern: boolean | null;
  hint: string;
}

interface LatestRecord {
  id: string;
  data: Record<string, string>;
  utmSource: string | null;
  utmMedium: string | null;
  createdAt: string;
}

interface Props {
  sourceId: string;
  siteUrl: string | null;
  fieldMappings: FieldMapping[];
  onClose: () => void;
  onRecordReceived: () => void;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 120_000;

export default function TestModal({ sourceId, siteUrl, fieldMappings, onClose, onRecordReceived }: Props) {
  const [step1, setStep1] = useState<"idle" | "checking" | "done">("idle");
  const [check, setCheck] = useState<SiteCheck | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollSince, setPollSince] = useState<string | null>(null);
  const [received, setReceived] = useState<LatestRecord | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const pollTimer = useRef<number | null>(null);
  const elapsedTimer = useRef<number | null>(null);
  const startTime = useRef<number>(0);

  const runSiteCheck = useCallback(async () => {
    setStep1("checking");
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/test`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "검증 실패"); return; }
      setCheck(data);
    } finally {
      setStep1("done");
    }
  }, [sourceId]);

  useEffect(() => { runSiteCheck(); }, [runSiteCheck]);

  const stopPolling = useCallback(() => {
    setPolling(false);
    if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }
    if (elapsedTimer.current) { clearInterval(elapsedTimer.current); elapsedTimer.current = null; }
  }, []);

  const pollOnce = useCallback(async (sinceIso: string) => {
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/test?since=${encodeURIComponent(sinceIso)}`);
      const data = await res.json();
      if (data.latest) {
        setReceived(data.latest as LatestRecord);
        stopPolling();
        onRecordReceived();
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, [sourceId, stopPolling, onRecordReceived]);

  const startPolling = useCallback(() => {
    const sinceIso = new Date().toISOString();
    setPollSince(sinceIso);
    setReceived(null);
    setPolling(true);
    setElapsedMs(0);
    startTime.current = Date.now();

    elapsedTimer.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime.current;
      setElapsedMs(elapsed);
      if (elapsed >= POLL_TIMEOUT_MS) stopPolling();
    }, 250);

    const tick = async () => {
      const found = await pollOnce(sinceIso);
      if (!found && Date.now() - startTime.current < POLL_TIMEOUT_MS) {
        pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
  }, [pollOnce, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const remainingSec = Math.max(0, Math.ceil((POLL_TIMEOUT_MS - elapsedMs) / 1000));
  const timedOut = !polling && pollSince !== null && !received;

  return (
    <ModalShell open onClose={onClose} title="스크립트 설치 테스트" size="md">
      <div className="space-y-5">

          {/* Step 1: 사이트 검증 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">1단계 · 사이트 검증</h3>
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.95 }}
                transition={spring}
                onClick={runSiteCheck}
                disabled={step1 === "checking"}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3 h-3 ${step1 === "checking" ? "animate-spin" : ""}`} />다시 확인
              </motion.button>
            </div>

            {step1 === "checking" || !check ? (
              <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-secondary/30">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">사이트 분석 중...</span>
              </div>
            ) : (
              <div className="space-y-2">
                <CheckRow
                  ok={!!check.siteUrl}
                  warn={!check.siteUrl}
                  label="사이트 URL 등록됨"
                  detail={check.siteUrl ?? "필드 설정에서 사이트 URL을 입력하세요"}
                />
                {check.siteUrl && (
                  <CheckRow
                    ok={check.siteReachable}
                    warn={false}
                    label="사이트 응답 OK"
                    detail={check.statusCode ? `HTTP ${check.statusCode}` : "응답 없음"}
                  />
                )}
                {check.siteReachable && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">스크립트 설치 방식</p>
                    {check.loaderDetected ? (
                      <CheckRow
                        ok
                        warn={false}
                        label="1줄 loader 설치됨 (권장 방식)"
                        detail={`/s/${sourceId.slice(0, 8)}… 가 HTML에서 발견됨`}
                      />
                    ) : check.apiKeyDetected ? (
                      <CheckRow
                        ok
                        warn={false}
                        label="인라인 스크립트 설치됨"
                        detail="1줄 loader 사용을 권장합니다"
                      />
                    ) : check.collectUrlDetected ? (
                      <CheckRow
                        ok={false}
                        warn
                        label="다른 소스의 스크립트로 보입니다"
                        detail="collect URL은 있지만 이 소스의 식별자는 없어요"
                      />
                    ) : (
                      <CheckRow
                        ok={false}
                        warn={false}
                        label="스크립트 흔적 없음"
                        detail="외부 .js 로드 시 탐지가 안 될 수 있어요"
                      />
                    )}
                  </div>
                )}

                <div className="space-y-2 pt-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">페이지 패턴</p>
                  {check.patternsConfigured ? (
                    <>
                      <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
                        <p className="text-[11px] text-muted-foreground mb-1">등록된 패턴 ({check.formPagePatterns.length}개)</p>
                        <div className="flex flex-wrap gap-1">
                          {check.formPagePatterns.map((p) => (
                            <code key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border font-mono">{p}</code>
                          ))}
                        </div>
                      </div>
                      {check.siteUrl && (
                        <CheckRow
                          ok={check.siteUrlMatchesPattern === true}
                          warn={check.siteUrlMatchesPattern === false}
                          label={check.siteUrlMatchesPattern === true
                            ? "현재 사이트 URL이 패턴과 매칭됨"
                            : "현재 사이트 URL이 패턴과 매칭되지 않음"}
                          detail={check.siteUrlMatchesPattern === true
                            ? "이 페이지에서 폼 감지가 활성화돼요"
                            : "이 페이지에선 스크립트가 폼 감지를 건너뛰어요. 패턴 설정을 확인하세요."}
                        />
                      )}
                    </>
                  ) : (
                    <div className="p-2.5 rounded-lg border border-border bg-secondary/30">
                      <p className="text-xs font-medium">패턴 미설정</p>
                      <p className="text-[11px] text-muted-foreground">모든 페이지에서 폼 감지가 동작합니다.</p>
                    </div>
                  )}
                </div>

                {check.hint && (
                  <p className="text-[11px] text-muted-foreground bg-secondary/30 border border-border rounded-lg px-3 py-2 mt-2 leading-relaxed">
                    {check.hint}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Step 2: 실시간 제출 테스트 */}
          <section className="border-t border-border pt-5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">2단계 · 실제 폼 제출 테스트</h3>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              "테스트 시작"을 누르고 새 탭에서 사이트의 폼을 제출하세요. 데이터가 도착하면 자동으로 감지합니다 (최대 2분 대기).
            </p>

            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {!polling && !received && !timedOut && (
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={spring}
                  onClick={startPolling}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors"
                >
                  <Activity className="w-3.5 h-3.5" />테스트 시작
                </motion.button>
              )}
              {siteUrl && (
                <motion.a
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={spring}
                  href={siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors"
                >
                  <Globe className="w-3.5 h-3.5" />사이트 열기
                  <ExternalLink className="w-2.5 h-2.5" />
                </motion.a>
              )}
              {polling && (
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={spring}
                  onClick={stopPolling}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors"
                >
                  중지
                </motion.button>
              )}
              {(received || timedOut) && (
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={spring}
                  onClick={() => { setReceived(null); setPollSince(null); setElapsedMs(0); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />다시 테스트
                </motion.button>
              )}
            </div>

            {polling && (
              <div className="p-3 rounded-xl border border-violet-400/30 bg-violet-500/5 space-y-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                  <span className="text-xs text-violet-700 dark:text-violet-300">새 제출 대기 중... {remainingSec}초 남음</span>
                </div>
                <div className="h-1 rounded-full bg-violet-500/10 overflow-hidden">
                  <div
                    className="h-full bg-violet-500 transition-all"
                    style={{ width: `${Math.min(100, (elapsedMs / POLL_TIMEOUT_MS) * 100)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  대기 시작: {pollSince ? formatKstDateTime(pollSince) : "-"} KST
                </p>
              </div>
            )}

            {received && (
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">데이터 수신 성공!</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{formatKstDateTime(received.createdAt)} KST · {received.id}</p>
                <div className="space-y-1 pt-1 border-t border-emerald-500/20">
                  {fieldMappings.map((f) => (
                    <div key={f.id} className="flex gap-2 text-xs">
                      <span className="w-20 text-muted-foreground shrink-0">{f.label}</span>
                      <span className="flex-1 break-words">{received.data?.[f.key] || <span className="text-muted-foreground italic">-</span>}</span>
                    </div>
                  ))}
                  {(received.utmSource || received.utmMedium) && (
                    <div className="flex gap-2 text-xs pt-1 border-t border-emerald-500/20 mt-1">
                      <span className="w-20 text-muted-foreground shrink-0">UTM</span>
                      <span className="flex-1 text-muted-foreground">{received.utmSource ?? "-"} / {received.utmMedium ?? "-"}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {timedOut && (
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400">2분 안에 데이터가 도착하지 않았어요</span>
                </div>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside leading-relaxed">
                  <li>스크립트가 정확한 위치(공통 헤더 또는 &lt;/body&gt; 앞)에 붙어있는지 확인</li>
                  {check?.patternsConfigured ? (
                    <li>패턴 설정됨 — 폼이 있는 페이지 URL이 등록된 패턴과 매칭되는지 확인 (스크립트 탭)</li>
                  ) : (
                    <li>패턴 미설정 (모든 페이지에서 동작) — 정상이라면 다른 원인을 확인하세요</li>
                  )}
                  <li>"성공 트리거 텍스트"가 폼 제출 후 실제로 나타나는 문구와 일치하는지 확인 (필드 설정 탭)</li>
                  <li>허용 Origin이 설정돼있다면 사이트 도메인이 등록돼있는지 확인 (보안/알림 탭)</li>
                  <li>소스가 "활성" 상태인지 확인</li>
                  <li>브라우저 콘솔에서 네트워크 탭으로 /api/collect 요청이 가는지 확인</li>
                </ul>
              </div>
            )}
          </section>
      </div>
    </ModalShell>
  );
}

function CheckRow({ ok, warn, label, detail }: { ok: boolean; warn: boolean; label: string; detail: string }) {
  const color = ok ? "text-emerald-500" : warn ? "text-amber-500" : "text-red-500";
  const bg = ok ? "border-emerald-500/30 bg-emerald-500/5" : warn ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5";
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${bg}`}>
      {ok ? <Check className={`w-3.5 h-3.5 ${color} mt-0.5 shrink-0`} /> : <AlertCircle className={`w-3.5 h-3.5 ${color} mt-0.5 shrink-0`} />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{detail}</p>
      </div>
    </div>
  );
}
