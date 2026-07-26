/**
 * Client error reporting. When NEXT_PUBLIC_SENTRY_DSN is set, posts a minimal
 * Sentry envelope store event. Otherwise logs to console (dev).
 */
export function reportClientError(error: unknown, extras?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // eslint-disable-next-line no-console
  console.error('[arta]', message, extras || {}, stack);

  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || typeof window === 'undefined') return;

  try {
    const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)/);
    if (!match) return;
    const [, key, host, project] = match;
    const url = `https://${host}/api/${project}/store/?sentry_key=${key}&sentry_version=7`;
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        level: 'error',
        platform: 'javascript',
        extra: extras,
        exception: stack
          ? {
              values: [
                {
                  type: error instanceof Error ? error.name : 'Error',
                  value: message,
                  stacktrace: { frames: [{ filename: 'app', function: 'reportClientError' }] },
                },
              ],
            }
          : undefined,
        tags: { app: 'arta-web' },
        timestamp: Date.now() / 1000,
      }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* never break UI for telemetry */
  }
}
