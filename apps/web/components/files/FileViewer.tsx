'use client';

import { useEffect, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { PdfPages } from './PdfPages';
import { SheetEditor } from './SheetEditor';
import { ExpandBox } from '@/components/ui/ExpandBox';
import { isMobileBrowser } from '@/lib/platform';
import { fixMojibake } from '@/lib/text';

type Props = {
  url: string;
  fileName: string;
  kind?: string | null;
  /** Bust browser/CDN cache when the same URL is overwritten (e.g. pdfGeneratedAt). */
  cacheKey?: string | null;
  /** Prefer in-app inline endpoint for originals (.xlsx/.docx) */
  fileId?: string;
};

export function FileViewer({ url, fileName, kind, cacheKey, fileId }: Props) {
  const displayName = fixMojibake(fileName);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pdfSrc, setPdfSrc] = useState('');
  const [pdfFailed, setPdfFailed] = useState(false);
  // En teléfono y tableta el iframe enseña solo la primera página, o nada.
  const [pdfOnCanvas, setPdfOnCanvas] = useState(false);
  useEffect(() => setPdfOnCanvas(isMobileBrowser()), []);

  const isPdf = kind === 'pdf' || /\.pdf$/i.test(fileName) || url.toLowerCase().includes('.pdf');
  const isExcel =
    kind === 'excel' || /\.(xlsx?|csv)$/i.test(fileName) || kind === 'sheet';
  const isDocx = kind === 'doc' || /\.docx$/i.test(fileName) || kind === 'word';
  const isImage = kind === 'image' || /\.(png|jpe?g|gif|webp)$/i.test(fileName);

  const fetchUrl = cacheKey
    ? `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheKey)}`
    : url;
  const inlineUrl = fileId ? `/api/files/${fileId}/inline` : url;

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

  // DOCX render (in-app)
  const [docxHtmlId] = useState(() => `docx-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    if (!isDocx) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const r = await fetch(inlineUrl, { credentials: 'same-origin', cache: 'no-store' });
        if (!r.ok) throw new Error(`No se pudo cargar (${r.status})`);
        const blob = await r.blob();
        if (cancelled) return;
        const container = document.getElementById(docxHtmlId);
        if (!container) return;
        container.innerHTML = '';
        await renderAsync(blob, container, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          className: 'docx-view',
          ignoreFonts: false,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error al leer .docx');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inlineUrl, isDocx, docxHtmlId]);

  if (isPdf) {
    return (
      <ExpandBox title={displayName}>
      <div className="stack">
        {loading ? <p className="muted">Cargando PDF…</p> : null}
        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}
        {!pdfFailed && pdfSrc ? (
          <div className="docview">
            {pdfOnCanvas ? (
              <PdfPages src={pdfSrc} title={displayName} onFail={() => setPdfFailed(true)} />
            ) : (
              <iframe
                title={displayName}
                src={`${pdfSrc}#toolbar=1&navpanes=0`}
                className="docview__frame"
                onError={() => setPdfFailed(true)}
              />
            )}
          </div>
        ) : null}
        {pdfFailed && !loading ? (
          <p className="muted">El navegador no pudo incrustar el PDF. Ábrelo en una pestaña nueva.</p>
        ) : null}
        <div className="row">
          <a className="btn ghost btn-sm" href={url} target="_blank" rel="noreferrer">
            Abrir PDF
          </a>
          <a className="btn ghost btn-sm" href={url} download={displayName}>
            Descargar
          </a>
        </div>
      </div>
      </ExpandBox>
    );
  }

  if (isDocx) {
    return (
      <ExpandBox title={displayName}>
        <div className="stack">
          {loading ? <p className="muted">Cargando documento…</p> : null}
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="docview panel-body">
            <div id={docxHtmlId} />
          </div>
          <a className="btn ghost btn-sm" href={url} target="_blank" rel="noreferrer">
            Descargar {displayName}
          </a>
        </div>
      </ExpandBox>
    );
  }

  if (isImage) {
    return (
      <ExpandBox title={displayName}>
        <div className="docview docview--image panel-body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={displayName} />
        </div>
      </ExpandBox>
    );
  }

  if (isExcel) {
    // Usa el mismo renderizador que el editor, en modo solo lectura.
    return <SheetEditor url={inlineUrl} fileName={displayName} canEdit={false} onSave={async () => undefined} />;
  }

  return (
    <a className="btn ghost btn-sm" href={url} target="_blank" rel="noreferrer">
      Abrir {displayName}
    </a>
  );
}
