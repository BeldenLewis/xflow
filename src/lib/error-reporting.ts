// 중앙 에러 리포팅 — Sentry 연결.
// dev 환경에서는 콘솔에만 찍고, production에서만 Sentry로 전송.
//
// 환경변수: SENTRY_DSN (서버) / NEXT_PUBLIC_SENTRY_DSN (클라이언트)
// 설정 파일: instrumentation.ts, sentry.server.config.ts, sentry.edge.config.ts, instrumentation-client.ts

import * as Sentry from "@sentry/nextjs";

export function reportError(error: unknown, context?: Record<string, unknown>) {
  console.error("[error]", error, context ?? {});
  if (process.env.NODE_ENV === "production") {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}

export function reportMessage(message: string, context?: Record<string, unknown>) {
  console.warn("[warn]", message, context ?? {});
  if (process.env.NODE_ENV === "production") {
    Sentry.captureMessage(message, { level: "warning", extra: context });
  }
}
