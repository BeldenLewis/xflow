// Sentry — Node.js (server) runtime.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // 10% of transactions traced; bumps to 100% for errors automatically.
  tracesSampleRate: 0.1,
  // Only enable in production to avoid noise from dev.
  enabled: process.env.NODE_ENV === "production",
  // Don't send PII by default.
  sendDefaultPii: false,
});
