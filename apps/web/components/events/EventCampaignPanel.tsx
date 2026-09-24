'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileViewer, SheetEditor } from '@/components/files/lazy';
import { EmptyLite, FileRow, Pill, ReviewFlow, SectionHead, Seg } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import {
  campaignExpensesFileName,
  campaignRowsFrom,
  campaignTotals,
  cleanCampaignRows,
  conceptLineTotal,
} from '@/lib/campaign-concepts';
import { clearDraft, poHandoffKey, readDraft, writeDraft } from '@/lib/draft-store';
import { patchEventFileCells, replaceEventFile } from '@/lib/file-save';
import { downloadBlob } from '@/lib/pdf-kit';
import { PRICE_LIST, findPrice, mxn, numOrNull } from '@/lib/price-list';
import { reviewEditable, reviewStep, type ReviewStep } from '@/lib/review-flow';
import { CampaignTimeline } from './CampaignTimeline';
import { ReviewActions } from './ReviewActions';
import {
  CAMPAIGN_FILE_MODULE,
  type CampaignConceptRow,
  type EventFile,
  type EventPanelProps,
} from './event-detail.types';
import { userHasPermission } from '@/lib/access-matrix';

/**
 * Campaña publicitaria (junta 11-09-2026).
 *
 * Se arma con conceptos de la lista de precios —cantidad, fechas, precio
 * interno y externo—, se ve en tabla o en calendario, se envía a revisión, se
 * autoriza y se marca pagada. De la tabla salen el archivo de campaña (Excel,
 * que es donde Arta la trabaja) y dos PDFs independientes: interna y externa.
 */

type Props = EventPanelProps & {
  canEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
  /** Lleva a Órdenes de compra con las partidas de la campaña ya puestas. */
  onCreatePo?: () => void;
};

const STEP_OK: Record<ReviewStep, string> = {
  DRAFT: 'Campaña de vuelta en borrador',
  REVIEW: 'Campaña enviada a revisión',
  AUTHORIZED: 'Campaña autorizada',
  PAID: 'Campaña marcada como pagada',
};

function isSheet(f: EventFile) {
  return f.kind === 'excel' || /\.(xlsx?|csv)$/i.test(f.fileName);
}

function stamp(f: EventFile) {
  return new Date(f.updatedAt || f.createdAt || 0).getTime();
}

function blankRow(): CampaignConceptRow {
  return { concept: '', qty: 1, from: null, to: null, precioInterno: null, precioExterno: null };
}

export function EventCampaignPanel({
  event,
  closed,
  canEdit,
  canApprove,
  canMarkPaid,
  onCreatePo,
  onChanged,
  flash,
}: Props) {
  const slot = useMemo(() => (event.slots || []).find((s) => s.kind === 'CAMPAIGN') || null, [event.slots]);
  const replaced = slot?.status === 'REPLACED';
  const saved = useMemo(() => campaignRowsFrom(event.campaign?.dataJson?.concepts), [event.campaign?.dataJson]);
  const draftKey = `arta.draft.campaign.${event.id}`;
  const [rows, setRows] = useState<CampaignConceptRow[]>(() => readDraft<CampaignConceptRow[]>(draftKey) ?? saved);
  const [dirty, setDirty] = useState(() => readDraft(draftKey) !== null);

  // Lo tecleado sin guardar sobrevive a cambiar de pestaña.
  useEffect(() => {
    if (dirty) writeDraft(draftKey, rows);
    else clearDraft(draftKey);
  }, [draftKey, dirty, rows]);
  const [view, setView] = useState<'conceptos' | 'calendario'>('conceptos');
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sheetMode, setSheetMode] = useState<'view' | 'edit' | null>(null);

  useEffect(() => {
    if (!dirty) setRows(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const step = reviewStep(event.campaign?.status, event.campaign?.authorized);
  const editable = canEdit && !closed && reviewEditable(step);
  const filled = rows.filter((r) => r.concept.trim());
  const totals = campaignTotals(filled);

  const campaignFiles = useMemo(
    () => event.files.filter((f) => f.module === CAMPAIGN_FILE_MODULE).sort((a, b) => stamp(b) - stamp(a)),
    [event.files],
  );
  const sheet = campaignFiles.find(isSheet) || null;

  // El Excel de campaña abre ya en el editor (Adam, 24-09: «les falta
  // accesibilidad a la edición»); antes había que pedir «Ver / Editar».
  useEffect(() => {
    if (sheet && sheetMode === null) setSheetMode(canEdit && !closed ? 'edit' : 'view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id]);
  const others = campaignFiles.filter((f) => f.id !== sheet?.id);

  function patch(i: number, next: Partial<CampaignConceptRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));
    setDirty(true);
  }

  function setConcept(i: number, value: string) {
    const row = rows[i];
    const price = findPrice(value);
    patch(i, {
      concept: value,
      ...(price && row.precioInterno == null && row.precioExterno == null
        ? { precioInterno: price.interno, precioExterno: price.externo }
        : {}),
    });
  }

  function addRows(list: CampaignConceptRow[]) {
    setRows((prev) => [...prev.filter((r) => r.concept.trim()), ...list]);
    setDirty(true);
  }

  function addFromList() {
    const add = PRICE_LIST.filter((p) => picked.has(p.concept)).map((p) => ({
      ...blankRow(),
      concept: p.concept,
      precioInterno: p.interno,
      precioExterno: p.externo,
    }));
    if (add.length) addRows(add);
    setPicked(new Set());
    setPicker(false);
  }

  async function save(quiet = false): Promise<boolean> {
    setBusy(true);
    try {
      await api(`/campaigns/event/${event.id}`, {
        method: 'POST',
        body: JSON.stringify({ dataJson: { concepts: cleanCampaignRows(rows) } }),
      });
      setDirty(false);
      if (!quiet) flash('Campaña guardada');
      await onChanged();
      return true;
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo guardar la campaña', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function move(next: ReviewStep) {
    if (dirty && !(await save(true))) return;
    setBusy(true);
    try {
      await api(`/campaigns/event/${event.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: next, scope: 'campaign' }),
      });
      flash(STEP_OK[next]);
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo cambiar el estado', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (replaced) {
      flash('La campaña fue reemplazada por un documento externo', 'error');
      return;
    }
    if (!filled.length) {
      flash('Agrega al menos un concepto', 'warn');
      return;
    }
    if (dirty && !(await save(true))) return;
    setBusy(true);
    try {
      await api(`/campaigns/event/${event.id}/export`, {
        method: 'POST',
        body: JSON.stringify({ rows: cleanCampaignRows(rows) }),
      });
      flash('Archivo de campaña generado');
      setSheetMode('view');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
    } finally {
      setBusy(false);
    }
  }
  async function replaceExternal(file: File) {
    // Subir archivo y marcar el slot como REPLACED
    const note = window.prompt('Motivo del reemplazo por documento externo') || '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('eventId', event.id);
      fd.append('module', CAMPAIGN_FILE_MODULE);
      const uploaded = await api<EventFile>('/uploads', { method: 'POST', body: fd });
      await api(`/slots/event/${event.id}/replace`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'CAMPAIGN', fileId: uploaded.id, note }),
      });
      flash('Campaña reemplazada por documento externo', 'success');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo reemplazar', 'error');
    }
  }
  async function restoreInternal() {
    const note = window.prompt('Motivo para reactivar la campaña interna (dirección)') || '';
    try {
      await api(`/slots/event/${event.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ kind: 'CAMPAIGN', note }),
      });
      flash('Campaña interna reactivada', 'success');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo reactivar', 'error');
    }
  }

  /** Orden de compra con los conceptos a precio interno (lo que Arta paga). */
  function createPo() {
    const lines = filled
      .filter((r) => r.precioInterno != null && r.precioInterno > 0)
      .map((r) => ({ concept: r.concept, qty: r.qty ?? 1, unitPrice: r.precioInterno ?? null }));
    if (!lines.length) {
      flash('Ningún concepto tiene precio interno', 'warn');
      return;
    }
    writeDraft(poHandoffKey(event.id), {
      rubro: 'publicidad',
      description: `Campaña publicitaria · ${event.name}`,
      lines,
    });
    onCreatePo?.();
  }

  /**
   * Las campañas se trabajan en Excel: esto trae a la tabla lo que cambió en
   * el archivo, para que los PDFs y el calendario no se queden atrás.
   */
  async function importFromSheet() {
    if (!sheet) return;
    if (filled.length && !confirm('Los conceptos de la tabla se reemplazan con los del Excel. Revisa y guarda.')) return;
    setBusy(true);
    try {
      const { parseCampaignWorkbook } = await import('@/lib/campaign-sheet-template');
      const buffer = await fetch(sheet.url, { credentials: 'include', cache: 'no-store' }).then((r) => {
        if (!r.ok) throw new Error('No se pudo leer el Excel');
        return r.arrayBuffer();
      });
      const parsed = parseCampaignWorkbook(buffer);
      if (!parsed.length) {
        flash('El Excel no tiene conceptos con el formato de campaña', 'warn');
        return;
      }
      setRows(parsed);
      setDirty(true);
      setView('conceptos');
      flash(`${parsed.length} conceptos traídos del Excel · revisa y guarda`, 'info');
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo leer el Excel', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function pdf(kind: 'interna' | 'externa') {
    try {
      const { buildCampaignPdf, campaignPdfName } = await import('@/lib/campaign-pdf');
      const blob = await buildCampaignPdf({ event, rows, kind });
      downloadBlob(blob, campaignPdfName(event.name, kind));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error');
    }
  }

  const priceCell = (i: number, field: 'precioInterno' | 'precioExterno') => {
    const value = rows[i][field];
    return editable ? (
      <input
        className="cell num"
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={value ?? ''}
        placeholder="—"
        aria-label={field === 'precioInterno' ? 'Precio interno' : 'Precio externo'}
        onChange={(e) => patch(i, { [field]: numOrNull(e.target.value) })}
      />
    ) : value == null ? (
      <span className="is-muted">—</span>
    ) : (
      mxn(value)
    );
  };

  return (
    <div className="sx-stack campaign">
      <SectionHead
        title="Campaña"
        sub={
          <>
            <ReviewFlow step={step} />{' '}
            {slot ? <Pill tone={replaced ? 'warn' : 'ok'}>{replaced ? 'Reemplazado por externo' : 'Interno'}</Pill> : null}
          </>
        }
      >
        <ReviewActions
          step={step}
          closed={closed}
          canEdit={canEdit}
          canApprove={canApprove}
          canMarkPaid={canMarkPaid}
          canSubmit={filled.length > 0}
          busy={busy}
          onMove={move}
        />
        <div className="sx-actions">
          {!closed && !replaced ? (
            <label className="btn ghost btn-sm hub-upload">
              Reemplazar por externo
              <input
                type="file"
                hidden
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void replaceExternal(f);
                }}
              />
            </label>
          ) : null}
          {!closed && replaced ? (
            <button className="btn ghost btn-sm" type="button" onClick={restoreInternal}>
              Revertir a interno
            </button>
          ) : null}
        </div>
      </SectionHead>

      <div className="toolbar-row">
        <Seg
          label="Vista de la campaña"
          value={view}
          onChange={setView}
          options={[
            { key: 'conceptos', label: 'Conceptos', count: filled.length },
            { key: 'calendario', label: 'Calendario' },
          ]}
        />
        <div className="sx-actions">
          {onCreatePo && !closed && (step === 'AUTHORIZED' || step === 'PAID') ? (
            <button className="btn ghost btn-sm" type="button" disabled={!filled.length} onClick={createPo}>
              Crear OC
            </button>
          ) : null}
          <button className="btn ghost btn-sm" type="button" disabled={!filled.length} onClick={() => pdf('interna')}>
            PDF interna
          </button>
          <button className="btn ghost btn-sm" type="button" disabled={!filled.length} onClick={() => pdf('externa')}>
            PDF externa
          </button>
          {canEdit && !closed && !replaced ? (
            <button className="btn btn-sm" type="button" disabled={busy || !filled.length} onClick={generate}>
              Generar campaña
            </button>
          ) : null}
        </div>
      </div>

      {picker && editable ? (
        <div className="surface price-picker">
          <div className="surface__head">
            <h3 className="surface__title">Lista de precios</h3>
            <div className="sx-actions">
              <button className="btn ghost btn-sm" type="button" onClick={() => setPicker(false)}>
                Cerrar
              </button>
              <button className="btn btn-sm" type="button" disabled={!picked.size} onClick={addFromList}>
                Agregar{picked.size ? ` (${picked.size})` : ''}
              </button>
            </div>
          </div>
          <div className="price-picker__grid">
            {PRICE_LIST.map((p) => {
              const on = picked.has(p.concept);
              return (
                <button
                  key={p.concept}
                  type="button"
                  className={`price-picker__item ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.concept)) next.delete(p.concept);
                      else next.add(p.concept);
                      return next;
                    })
                  }
                >
                  <span className="price-picker__name">{p.concept}</span>
                  <span className="price-picker__prices">
                    {p.interno == null ? '—' : mxn(p.interno)} · {p.externo == null ? '—' : mxn(p.externo)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === 'calendario' ? (
        <CampaignTimeline
          rows={filled.map((r, i) => ({
            key: `${i}-${r.concept}`,
            label: r.concept,
            sub: r.qty && r.qty > 1 ? `${r.qty} piezas` : undefined,
            from: r.from,
            to: r.to,
          }))}
          showDate={event.startsAt}
        />
      ) : !rows.length ? (
        <div className="surface">
          <EmptyLite
            icon="✦"
            title="Arma la campaña"
            text={editable ? 'Elige conceptos de la lista de precios o agrégalos a mano.' : 'Aún no hay conceptos.'}
          >
            {editable ? (
              <>
                <button className="btn btn-sm" type="button" onClick={() => setPicker(true)}>
                  Desde lista de precios
                </button>
                <button className="btn ghost btn-sm" type="button" onClick={() => addRows([blankRow()])}>
                  Concepto a mano
                </button>
              </>
            ) : null}
          </EmptyLite>
        </div>
      ) : (
        <div className="dtable-wrap">
          <datalist id="campaign-price-list">
            {PRICE_LIST.map((p) => (
              <option key={p.concept} value={p.concept} />
            ))}
          </datalist>
          <table className="dtable campaign-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="num">Cant.</th>
                <th>Desde</th>
                <th>Hasta</th>
                <th className="num">P. interno</th>
                <th className="num">P. externo</th>
                <th className="num">Total interno</th>
                <th className="num">Total externo</th>
                {editable ? <th className="col-act" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ti = conceptLineTotal(r, 'interno');
                const te = conceptLineTotal(r, 'externo');
                return (
                  <tr key={i}>
                    <td className="c-concept">
                      {editable ? (
                        <input
                          className="cell"
                          list="campaign-price-list"
                          value={r.concept}
                          placeholder="Concepto"
                          aria-label={`Concepto ${i + 1}`}
                          onChange={(e) => setConcept(i, e.target.value)}
                        />
                      ) : (
                        <strong>{r.concept}</strong>
                      )}
                    </td>
                    <td className="num c-qty">
                      {editable ? (
                        <input
                          className="cell num"
                          type="number"
                          min={0}
                          step="any"
                          value={r.qty ?? ''}
                          aria-label="Cantidad"
                          onChange={(e) => patch(i, { qty: numOrNull(e.target.value) })}
                        />
                      ) : (
                        r.qty ?? 1
                      )}
                    </td>
                    <td className="c-date">
                      {editable ? (
                        <input
                          className="cell"
                          type="date"
                          value={r.from || ''}
                          aria-label="Desde"
                          onChange={(e) => patch(i, { from: e.target.value || null })}
                        />
                      ) : (
                        r.from || <span className="is-muted">—</span>
                      )}
                    </td>
                    <td className="c-date">
                      {editable ? (
                        <input
                          className="cell"
                          type="date"
                          min={r.from || undefined}
                          value={r.to || ''}
                          aria-label="Hasta"
                          onChange={(e) => patch(i, { to: e.target.value || null })}
                        />
                      ) : (
                        r.to || <span className="is-muted">—</span>
                      )}
                    </td>
                    <td className="num c-price">{priceCell(i, 'precioInterno')}</td>
                    <td className="num c-price">{priceCell(i, 'precioExterno')}</td>
                    <td className="num">{ti == null ? <span className="is-muted">—</span> : mxn(ti)}</td>
                    <td className="num">{te == null ? <span className="is-muted">—</span> : mxn(te)}</td>
                    {editable ? (
                      <td className="col-act">
                        <button
                          className="icon-btn icon-btn--danger"
                          type="button"
                          aria-label={`Quitar ${r.concept || 'concepto'}`}
                          onClick={() => {
                            setRows((prev) => prev.filter((_, idx) => idx !== i));
                            setDirty(true);
                          }}
                        >
                          ×
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>
                  {editable ? (
                    <div className="sx-actions">
                      <button className="btn-quiet btn-quiet--accent" type="button" onClick={() => addRows([blankRow()])}>
                        + Concepto
                      </button>
                      <button className="btn-quiet" type="button" onClick={() => setPicker(true)}>
                        Desde lista de precios
                      </button>
                    </div>
                  ) : (
                    <span className="is-muted t-small">Total</span>
                  )}
                </td>
                <td className="num t-money">{mxn(totals.interno)}</td>
                <td className="num t-money">{mxn(totals.externo)}</td>
                {editable ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {dirty ? (
        <div className="savebar" role="status">
          <span className="savebar__text">Cambios sin guardar</span>
          <div className="sx-actions">
            <button
              className="btn-quiet"
              type="button"
              onClick={() => {
                setRows(saved);
                setDirty(false);
              }}
            >
              Descartar
            </button>
            <button className="btn btn-sm" type="button" disabled={busy} onClick={() => save()}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : null}

      {sheet ? (
        <div className="sx-stack">
          <FileRow
            kind="xlsx"
            name={sheet.fileName}
            meta={`Archivo de campaña · ${new Date(sheet.updatedAt || sheet.createdAt || Date.now()).toLocaleDateString('es-MX', {
              day: 'numeric',
              month: 'short',
            })}`}
          >
            <button
              className="btn-quiet"
              type="button"
              onClick={() => setSheetMode(sheetMode ? null : canEdit && !closed ? 'edit' : 'view')}
            >
              {sheetMode ? 'Cerrar' : canEdit && !closed ? 'Ver / Editar' : 'Ver'}
            </button>
            <a className="btn-quiet" href={sheet.url} download={sheet.fileName}>
              Descargar
            </a>
            {editable ? (
              <button className="btn-quiet btn-quiet--accent" type="button" disabled={busy} onClick={importFromSheet}>
                Actualizar tabla desde Excel
              </button>
            ) : null}
          </FileRow>
          {sheetMode ? (
            <div className="surface finance-viewer">
              {sheetMode === 'edit' ? (
                <SheetEditor
                  key={sheet.id}
                  url={sheet.url}
                  fileName={sheet.fileName}
                  fileId={sheet.id}
                  canEdit
                  variant="campaign"
                  onSave={replaceEventFile(sheet.id)}
                  onSaveCells={patchEventFileCells(sheet.id)}
                  panelEditable={sheet.panelEditable !== false}
                  blockReason={sheet.panelBlockReason}
                  onSaved={onChanged}
                />
              ) : (
                <FileViewer
                  url={sheet.url}
                  fileName={sheet.fileName}
                  kind={sheet.kind}
                  cacheKey={sheet.updatedAt || sheet.createdAt}
                  fileId={sheet.id}
                />
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {others.length ? (
        <details className="disclose">
          <summary>Otros archivos de campaña ({others.length})</summary>
          <div className="sx-stack">
            <AuditBlock eventId={event.id} />
            {others.map((f) => (
              <FileRow key={f.id} kind={isSheet(f) ? 'xlsx' : /\.pdf$/i.test(f.fileName) ? 'pdf' : 'file'} name={f.fileName}>
                <a className="btn-quiet" href={f.url} target="_blank" rel="noreferrer">
                  Abrir
                </a>
              </FileRow>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function AuditBlock({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<
    Array<{ id: string; action: string; createdAt: string; user?: { fullName?: string | null } | null; metaJson?: unknown }>
  >([]);
  useEffect(() => {
    let alive = true;
    api(`/audit?resource=Event&resourceId=${encodeURIComponent(eventId)}&take=50`)
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
      <h4 className="surface__title">Historial</h4>
      <div className="dtable-wrap">
        <table className="dtable">
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="is-muted t-small">{new Date(a.createdAt).toLocaleString('es-MX')}</td>
                <td>{a.user?.fullName || '—'}</td>
                <td className="is-muted">{a.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
