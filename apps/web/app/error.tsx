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

    <div className="error-page error-page--segment">

      <div className="auth-card error-page__card">

        <p className="eyebrow">arta ops · error</p>

        <h1>Algo salió mal</h1>

        <p className="lead">

          No pudimos cargar esta vista. Puedes reintentar o volver al panel — el resto de la app

          sigue disponible.

        </p>

        {error.digest ? (

          <p className="error-page__digest">Referencia: {error.digest}</p>

        ) : null}

        <div className="error-actions">

          <button className="btn" type="button" onClick={reset}>

            Reintentar

          </button>

          <Link className="btn ghost" href="/dashboard">

            Ir al panel

          </Link>

          <Link className="btn ghost btn-sm" href="/p/arta">

            Sitio Arta

          </Link>

        </div>

      </div>

    </div>

  );

}


