'use client';

import dynamic from 'next/dynamic';

/**
 * Los editores, cargados cuando de verdad se abren.
 *
 * `FileViewer` y `SheetEditor` importan `xlsx` de forma estática, y los cuatro
 * paneles del evento los importaban a su vez: resultado, **todo el que abría un
 * evento se bajaba la librería de Excel completa aunque no tocara una hoja en
 * toda la sesión**. Se veía en el build: `/events/[id]` pesaba 317 kB de First
 * Load contra ~117 kB de cualquier otra pantalla, y `/campaigns` y `/folders`
 * arrastraban lo mismo por el mismo motivo.
 *
 * Aquí se cargan bajo demanda. Quien abre una hoja paga la espera una vez;
 * quien solo entra a ver el avance del show, no paga nada.
 *
 * `ssr: false` porque los tres leen el archivo en el navegador (ArrayBuffer,
 * canvas, `pdfjs`): en el servidor no hay nada que pintar.
 */
function Cargando({ que }: { que: string }) {
  return (
    <p className="muted kpi-sub" role="status">
      Abriendo {que}…
    </p>
  );
}

export const FileViewer = dynamic(() => import('./FileViewer').then((m) => m.FileViewer), {
  ssr: false,
  loading: () => <Cargando que="el archivo" />,
});

export const SheetEditor = dynamic(() => import('./SheetEditor').then((m) => m.SheetEditor), {
  ssr: false,
  loading: () => <Cargando que="la hoja" />,
});

export const PdfEditor = dynamic(() => import('./PdfEditor').then((m) => m.PdfEditor), {
  ssr: false,
  loading: () => <Cargando que="el PDF" />,
});

export const DocEditor = dynamic(() => import('./DocEditor').then((m) => m.DocEditor), {
  ssr: false,
  loading: () => <Cargando que="el documento" />,
});

export const ChecklistPdfEditor = dynamic(
  () => import('./ChecklistPdfEditor').then((m) => m.ChecklistPdfEditor),
  { ssr: false, loading: () => <Cargando que="el formato" /> },
);
