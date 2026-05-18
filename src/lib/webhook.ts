// 새 레코드 수집 시 웹훅 fire-and-forget 발송.
// 응답을 기다리지 않음 — 외부 서비스 장애가 수집을 지연시키지 않게.

export function fireWebhook(url: string, payload: Record<string, unknown>) {
  if (!url || !/^https?:\/\//.test(url)) return;
  try {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // 타임아웃 짧게
      signal: AbortSignal.timeout(5000),
    }).catch((e) => console.warn("[webhook] post failed:", e?.message ?? e));
  } catch (e) {
    console.warn("[webhook] schedule failed:", e);
  }
}
