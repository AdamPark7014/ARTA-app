'use client';

import { useEffect } from 'react';
import Link from 'next/link';
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
    <div className="error-page">
      <div className="panel error-page__card">
        <div className="panel-body">
          <h2>Algo salió mal</h2>
          <p className="muted">No pudimos cargar esta vista. El resto de la app sigue disponible.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: '1.25rem' }}>
            <button className="btn" type="button" onClick={reset}>
              Reintentar
            </button>
            <Link className="btn ghost" href="/dashboard">
              Ir al inicio
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
