'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

type Props = {
  url: string;
  fileName: string;
  kind?: string | null;
};

export function FileViewer({ url, fileName, kind }: Props) {
  const [sheetHtml, setSheetHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isPdf = kind === 'pdf' || /\.pdf$/i.test(fileName) || url.toLowerCase().includes('.pdf');
  const isExcel =
    kind === 'excel' || /\.(xlsx?|csv)$/i.test(fileName) || kind === 'sheet';
  const isImage = kind === 'image' || /\.(png|jpe?g|gif|webp)$/i.test(fileName);

  useEffect(() => {
    if (!isExcel) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSheetHtml('');
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        const wb = XLSX.read(buf, { type: 'array' });
        const first = wb.SheetNames[0];
        if (!first) throw new Error('Excel vacío');
        const html = XLSX.utils.sheet_to_html(wb.Sheets[first], { id: 'arta-sheet' });
        setSheetHtml(html);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al leer Excel');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, isExcel]);

  if (isPdf) {
    return (
      <iframe
        title={fileName}
        src={url}
        style={{ width: '100%', height: 520, border: '1px solid var(--border)', borderRadius: 8 }}
      />
    );
  }

  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={fileName}
        style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 8, border: '1px solid var(--border)' }}
      />
    );
  }

  if (isExcel) {
    return (
      <div className="stack">
        {loading ? <p className="muted">Cargando hoja…</p> : null}
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        {sheetHtml ? (
          <div
            className="excel-embed"
            style={{ overflow: 'auto', maxHeight: 480, border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}
            dangerouslySetInnerHTML={{ __html: sheetHtml }}
          />
        ) : null}
        <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
          Descargar {fileName}
        </a>
      </div>
    );
  }

  return (
    <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
      Abrir {fileName}
    </a>
  );
}
