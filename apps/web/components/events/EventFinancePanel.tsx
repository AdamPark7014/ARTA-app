'use client';

import { useMemo, useState } from 'react';
import { FileViewer, SheetEditor } from '@/components/files/lazy';
import { EmptyLite, FileRow, SectionHead } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import { patchEventFileCells, replaceEventFile } from '@/lib/file-save';
import { FINANCE_FILE_MODULE, type EventFile, type EventPanelProps } from './event-detail.types';

/**
 * Corrida financiera.
 *
 * Junta 11-09-2026: «solo debe haber 1 corrida»; aquí no se genera ninguna
 * hoja: el Excel se sube una vez y se reemplaza con versión. Adam (24-09): «a
 * los Excel les falta accesibilidad a la edición», así que la corrida se abre
 * **en el editor de hoja**, en sitio, para quien puede editar; el PDF sale
 * desde ahí. Ver solo lectura para el resto.
 */

function isSheet(f: EventFile) {
  return f.kind === 'excel' || /\.(xlsx?|csv)$/i.test(f.fileName);
}

function stamp(f: EventFile) {
  return new Date(f.updatedAt || f.createdAt || 0).getTime();
}

function when(iso?: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function EventFinancePanel({
  event,
  closed,
  canEdit,
  onChanged,
  flash,
}: EventPanelProps & { canEdit: boolean }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  const files = useMemo(
    () => event.files.filter((f) => f.module === FINANCE_FILE_MODULE).sort((a, b) => stamp(b) - stamp(a)),
    [event.files],
  );
  // La corrida es el Excel más reciente; si solo hay PDF, ese.
  const corrida = files.find(isSheet) || files[0] || null;
  const older = files.filter((f) => f.id !== corrida?.id);
  const editable = canEdit && !closed;

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    try {
      await fn();
      flash(ok);
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo completar', 'error');
    } finally {
      setBusy(false);
    }
  }

  function upload(file: File) {
    return run(async () => {
      const fd = new FormData();
      fd.append('file', file);
      if (corrida) {
        // Una sola corrida: reemplazar conserva el historial de versiones.
        await api(`/uploads/${corrida.id}/content`, { method: 'PUT', body: fd });
      } else {
        fd.append('eventId', event.id);
        fd.append('module', FINANCE_FILE_MODULE);
        await api('/uploads', { method: 'POST', body: fd });
      }
    }, corrida ? 'Corrida actualizada' : 'Corrida cargada');
  }

  function remove(f: EventFile) {
    if (!confirm(`¿Eliminar «${f.fileName}»?`)) return;
    void run(() => api(`/uploads/${f.id}`, { method: 'DELETE' }).then(() => undefined), 'Archivo eliminado');
  }

  const uploadButton = (label: string, primary: boolean) => (
    <label className={`btn btn-sm module-upload ${primary ? '' : 'ghost'}`} aria-disabled={busy}>
      {busy ? 'Subiendo…' : label}
      <input
        type="file"
        hidden
        disabled={busy}
        accept=".xlsx,.xls,.csv,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void upload(f);
        }}
      />
    </label>
  );

  return (
    <div className="sx-stack">
      <SectionHead
        title="Corrida"
        sub={editable ? 'Una sola corrida por evento. Se edita aquí, como Excel, y sale en PDF.' : 'Una sola corrida por evento.'}
      />

      {!corrida ? (
        <div className="surface">
          <EmptyLite
            icon="≡"
            title="Sin corrida"
            text={editable ? 'Sube el Excel de la corrida del show.' : 'Cuando finanzas la suba, aparecerá aquí.'}
          >
            {editable ? uploadButton('Subir corrida', true) : null}
          </EmptyLite>
        </div>
      ) : (
        <>
          <FileRow
            kind={isSheet(corrida) ? 'xlsx' : 'pdf'}
            name={corrida.fileName}
            meta={`Actualizada ${when(corrida.updatedAt || corrida.createdAt)}${
              corrida.version && corrida.version > 1 ? ` · versión ${corrida.version}` : ''
            }`}
          >
            <button className="btn-quiet" type="button" onClick={() => setOpen((v) => !v)}>
              {open ? 'Ocultar' : 'Ver'}
            </button>
            <a className="btn-quiet" href={corrida.url} download={corrida.fileName}>
              Descargar
            </a>
            {editable ? uploadButton('Reemplazar', false) : null}
          </FileRow>

          {open ? (
            <div className="surface finance-viewer">
              {editable && isSheet(corrida) ? (
                <SheetEditor
                  key={`${corrida.id}-${corrida.version ?? 1}`}
                  url={corrida.url}
                  fileName={corrida.fileName}
                  fileId={corrida.id}
                  canEdit
                  variant="finance"
                  onSave={replaceEventFile(corrida.id)}
                  onSaveCells={patchEventFileCells(corrida.id)}
                  panelEditable={corrida.panelEditable !== false}
                  blockReason={corrida.panelBlockReason}
                  onSaved={onChanged}
                />
              ) : (
                <FileViewer
                  url={corrida.url}
                  fileName={corrida.fileName}
                  kind={corrida.kind}
                  cacheKey={corrida.updatedAt || corrida.createdAt}
                />
              )}
            </div>
          ) : null}
        </>
      )}

      {older.length ? (
        <details className="disclose">
          <summary>Archivos anteriores ({older.length})</summary>
          <div className="sx-stack">
            {older.map((f) => (
              <FileRow key={f.id} kind={isSheet(f) ? 'xlsx' : 'pdf'} name={f.fileName} meta={when(f.createdAt)}>
                <a className="btn-quiet" href={f.url} download={f.fileName}>
                  Descargar
                </a>
                {editable ? (
                  <button className="icon-btn icon-btn--danger" type="button" aria-label="Eliminar" onClick={() => remove(f)}>
                    ×
                  </button>
                ) : null}
              </FileRow>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
