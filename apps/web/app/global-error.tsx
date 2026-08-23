'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/report-error';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest, surface: 'app-error' });
  }, [error]);

  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#09090b',
          color: '#fafafa',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            textAlign: 'center',
            padding: '1.75rem',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 14,
            background: '#111113',
          }}
        >
          <h1 style={{ margin: '0 0 0.5rem', fontFamily: 'Fraunces, Georgia, serif', fontSize: '1.5rem' }}>
            Algo falló
          </h1>
          <p style={{ margin: '0 0 1.25rem', color: '#a1a1aa', lineHeight: 1.5 }}>
            Puedes reintentar. Si persiste, contacta a dirección.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '0.65rem 1rem',
              border: 0,
              borderRadius: 8,
              background: '#c9a962',
              color: '#0a0a0a',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
