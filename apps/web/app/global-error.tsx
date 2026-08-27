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

        <link rel="stylesheet" href="/error-fallback.css" />

      </head>

      <body>

        <div className="error-page">

          <p className="eyebrow">arta · error crítico</p>

          <h1>Algo falló</h1>

          <p>

            No pudimos cargar la aplicación. Puedes reintentar o volver al sitio público de Arta.

          </p>

          {error.digest ? (

            <p className="error-page__digest">Referencia: {error.digest}</p>

          ) : null}

          <div className="error-actions">

            <button type="button" className="btn" onClick={reset}>

              Reintentar

            </button>

            <a className="btn ghost" href="/p/arta">

              Sitio Arta

            </a>

            <a className="btn ghost btn-sm" href="/login">

              Login

            </a>

          </div>

        </div>

      </body>

    </html>

  );

}


