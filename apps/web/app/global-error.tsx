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
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 480 }}>
        <h1 style={{ fontSize: '1.25rem' }}>Algo falló</h1>
        <p style={{ color: '#555' }}>Puedes reintentar. Si persiste, contacta a dirección.</p>
        <button type="button" onClick={reset} style={{ marginTop: 12, padding: '8px 14px' }}>
          Reintentar
        </button>
      </body>
    </html>
  );
}
