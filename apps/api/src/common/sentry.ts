import * as Sentry from '@sentry/node';

let initialized = false;

/** Optional Sentry — no-op unless SENTRY_DSN is set. */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || initialized) return false;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.05),
    enabled: true,
  });
  initialized = true;
  return true;
}

export function captureException(err: unknown, extras?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (extras) {
      for (const [k, v] of Object.entries(extras)) scope.setExtra(k, v);
    }
    Sentry.captureException(err);
  });
}

export { Sentry };
