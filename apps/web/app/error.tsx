'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/report-error';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, { digest: error.digest, surface: 'segment-error' });
  }, [error]);

  return (
    <div className="panel" style={{ margin: '2rem auto', maxWidth: 480, padding: '1.25rem' }}>
      <h2 style={{ marginTop: 0 }}>Error en esta vista</h2>
      <p className="muted">El resto de la app sigue disponible.</p>
      <button className="btn" type="button" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}
