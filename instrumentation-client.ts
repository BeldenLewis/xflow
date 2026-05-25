// Sentry — Browser (client) runtime.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Replay: 10% of regular sessions, 100% of sessions with errors.
  replaysSessionSampleRate: 0.05,
  replaysOnErrorSampleRate: 1.0,
  enabled: process.env.NODE_ENV === "production",
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});

// Capture navigation transitions in App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
