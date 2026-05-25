import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  // 빌드시 Sentry 옵션
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // 광고차단 우회용 터널 라우트 (선택)
  tunnelRoute: "/monitoring",
  // 클라이언트 파일 업로드 범위 확장
  widenClientFileUpload: true,
  // React 컴포넌트 에러를 소스맵과 연결
  reactComponentAnnotation: { enabled: true },
  // SDK 로거 비활성 (번들 사이즈 절약)
  disableLogger: true,
});
