'use client';

import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';

type Props = {
  url: string;
  fileName: string;
  kind?: string | null;
  /** Bust browser/CDN cache when the same URL is overwritten (e.g. pdfGeneratedAt). */
  cacheKey?: string | null;
};

export function FileViewer({ url, fileName, kind, cacheKey }: Props) {
  const [sheetHtml, setSheetHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfSrc, setPdfSrc] = useState('');
  const [pdfFailed, setPdfFailed] = useState(false);

  const isPdf = kind === 'pdf' || /\.pdf$/i.test(fileName) || url.toLowerCase().includes('.pdf');
  const isExcel =
    kind === 'excel' || /\.(xlsx?|csv)$/i.test(fileName) || kind === 'sheet';
  const isImage = kind === 'image' || /\.(png|jpe?g|gif|webp)$/i.test(fileName);

  const fetchUrl = cacheKey
    ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}`
    : url;

  useEffect(() => {
    if (!isPdf) {
      setPdfSrc('');
      return;
    }
    let cancelled = false;
    let objectUrl = '';
    setPdfFailed(false);
    setPdfSrc('');
    setLoading(true);
    setError('');
    fetch(fetchUrl, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo cargar el PDF (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        const pdfBlob =
          blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
        const next = URL.createObjectURL(pdfBlob);
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setPdfSrc(next);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Error al cargar PDF');
          setPdfFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fetchUrl, isPdf]);

  useEffect(() => {
    if (!isExcel) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSheetHtml('');
    fetch(url, { credentials: 'same-origin' })
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
      <div className="stack" style={{ gap: 8 }}>
        {loading ? <p className="muted">Cargando PDF…</p> : null}
        {error ? <p style={{ color: 'var(--danger)' }}>{error}</p> : null}
        {!pdfFailed && pdfSrc ? (
          <iframe
            title={fileName}
            src={`${pdfSrc}#toolbar=1&navpanes=0`}
            style={{
              width: '100%',
              height: 560,
              border: '1px solid var(--border, rgba(232,220,196,.12))',
              borderRadius: 8,
              background: 'rgba(0,0,0,.2)',
            }}
            onError={() => setPdfFailed(true)}
          />
        ) : null}
        {pdfFailed && !loading ? (
          <p className="muted">
            El navegador no pudo incrustar el PDF. Ábrelo en una pestaña nueva.
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn ghost" href={url} target="_blank" rel="noreferrer">
            Abrir PDF
          </a>
          <a className="btn ghost" href={url} download={fileName}>
            Descargar
          </a>
        </div>
      </div>
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
