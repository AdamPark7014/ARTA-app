'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileViewer, SheetEditor } from '@/components/files/lazy';
import { EmptyLite, FileRow, Pill, SectionHead } from '@/components/ui/Lite';
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
  const slot = (event.slots || []).find((s) => s.kind === 'CORRIDA') || null;
  const replaced = slot?.status === 'REPLACED';

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
      if (replaced) throw new Error('La corrida fue reemplazada por documento externo');
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
        sub={
          <>
            {editable ? 'Una sola corrida por evento. Se edita aquí, como Excel, y sale en PDF.' : 'Una sola corrida por evento.'}{' '}
            {slot ? <Pill tone={replaced ? 'warn' : 'ok'}>{replaced ? 'Reemplazada por externo' : 'Interna'}</Pill> : null}
          </>
        }
      >
        {!closed && !replaced ? (
          <label className="btn ghost btn-sm module-upload" aria-disabled={busy}>
            Reemplazar por externo
            <input
              type="file"
              hidden
              disabled={busy}
              accept=".xlsx,.xls"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                const note = window.prompt('Motivo del reemplazo por documento externo') || '';
                try {
                  const fd = new FormData();
                  fd.append('file', f);
                  fd.append('eventId', event.id);
                  fd.append('module', FINANCE_FILE_MODULE);
                  const uploaded = await api<EventFile>('/uploads', { method: 'POST', body: fd });
                  await api(`/slots/event/${event.id}/replace`, {
                    method: 'POST',
                    body: JSON.stringify({ kind: 'CORRIDA', fileId: uploaded.id, note }),
                  });
                  flash('Corrida reemplazada por documento externo', 'success');
                  await onChanged();
                } catch (e) {
                  flash(e instanceof Error ? e.message : 'No se pudo reemplazar', 'error');
                }
              }}
            />
          </label>
        ) : null}
        {!closed && replaced ? (
          <button
            className="btn ghost btn-sm"
            type="button"
            onClick={async () => {
              const note = window.prompt('Motivo para reactivar la corrida interna (dirección)') || '';
              try {
                await api(`/slots/event/${event.id}/restore`, {
                  method: 'POST',
                  body: JSON.stringify({ kind: 'CORRIDA', note }),
                });
                flash('Corrida interna reactivada', 'success');
                await onChanged();
              } catch (e) {
                flash(e instanceof Error ? e.message : 'No se pudo reactivar', 'error');
              }
            }}
          >
            Revertir a interno
          </button>
        ) : null}
      </SectionHead>

      {!corrida ? (
        <div className="surface">
          <EmptyLite
            icon="≡"
            title="Sin corrida"
            text={
              editable && !replaced
                ? 'Genera una corrida desde el machote estándar o sube el Excel existente.'
                : 'Cuando finanzas la suba, aparecerá aquí.'
            }
          >
            {editable && !replaced ? (
              <>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => api(`/finance/event/${event.id}/generate`, { method: 'POST', body: '{}' }).then(() => undefined),
                      'Corrida generada',
                    )
                  }
                >
                  Generar corrida
                </button>
                <span className="sx-gap" />
                {uploadButton('Subir corrida', false)}
              </>
            ) : null}
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
            {editable && !replaced ? uploadButton('Reemplazar', false) : null}
          </FileRow>

          {open ? (
            <div className="surface finance-viewer">
              {editable && isSheet(corrida) && !replaced ? (
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
                  fileId={corrida.id}
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
            <TrashBlock eventId={event.id} />
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

function TrashBlock({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; fileName: string; deletedAt?: string | null }>>([]);
  const [busy, setBusy] = useState<string>('');
  useEffect(() => {
    let alive = true;
    api(`/uploads/event/${eventId}/deleted`)
      .then((r) => {
        if (alive) setRows(Array.isArray(r) ? r : []);
      })
      .catch(() => setRows([]));
    return () => {
      alive = false;
    };
  }, [eventId]);
  if (!rows.length) return null;
  return (
    <div className="surface">
      <h4 className="surface__title">Papelera</h4>
      <div className="dtable-wrap">
        <table className="dtable">
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td>{f.fileName}</td>
                <td className="is-muted t-small">
                  {f.deletedAt ? new Date(f.deletedAt).toLocaleString('es-MX') : ''}
                </td>
                <td className="col-act">
                  <button
                    className="btn-quiet"
                    type="button"
                    disabled={busy === f.id}
                    onClick={async () => {
                      setBusy(f.id);
                      try {
                        await api(`/uploads/${f.id}/restore`, { method: 'POST' });
                        const next = await api(`/uploads/event/${eventId}/deleted`);
                        setRows(Array.isArray(next) ? next : []);
                      } finally {
                        setBusy('');
                      }
                    }}
                  >
                    {busy === f.id ? 'Restaurando…' : 'Restaurar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
