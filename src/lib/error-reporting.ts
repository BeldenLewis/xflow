// 중앙 에러 리포팅 — 현재는 콘솔만, Sentry DSN 준비되면 1곳에서 교체.
//
// 향후 Sentry 연결 예시:
//   import * as Sentry from "@sentry/nextjs";
//   if (process.env.NODE_ENV === "production") {
//     Sentry.captureException(error, { extra: context });
//   }
//
// 환경변수 권장: NEXT_PUBLIC_SENTRY_DSN, SENTRY_DSN
// 추가 시 sentry.client.config.ts / sentry.server.config.ts 동시 생성 필요.

export function reportError(error: unknown, context?: Record<string, unknown>) {
  console.error("[error]", error, context ?? {});
  // TODO: Sentry DSN 발급 후 captureException 연결
}
