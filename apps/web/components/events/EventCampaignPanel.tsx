'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileViewer, SheetEditor } from '@/components/files/lazy';
import { EmptyLite, FileRow, ReviewFlow, SectionHead, Seg } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import {
  campaignExpensesFileName,
  campaignRowsFrom,
  campaignTotals,
  cleanCampaignRows,
  conceptLineTotal,
} from '@/lib/campaign-concepts';
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

/**
 * Campaña publicitaria (junta 11-09-2026).
 *
 * Se arma con conceptos de la lista de precios —cantidad, fechas, precio
 * interno y externo—, se ve en tabla o en calendario, se envía a revisión, se
 * autoriza y se marca pagada. De la tabla salen el archivo de campaña (Excel,
 * que es donde Arta la trabaja) y dos PDFs independientes: interna y externa.
 */

type Props = EventPanelProps & { canEdit: boolean; canApprove: boolean; canMarkPaid: boolean };

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

export function EventCampaignPanel({ event, closed, canEdit, canApprove, canMarkPaid, onChanged, flash }: Props) {
  const saved = useMemo(() => campaignRowsFrom(event.campaign?.dataJson?.concepts), [event.campaign?.dataJson]);
  const [rows, setRows] = useState<CampaignConceptRow[]>(saved);
  const [dirty, setDirty] = useState(false);
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
    if (!filled.length) {
      flash('Agrega al menos un concepto', 'warn');
      return;
    }
    if (sheet && !confirm('El archivo de campaña se actualiza con la tabla. La versión anterior queda en el historial.')) return;
    if (dirty && !(await save(true))) return;
    setBusy(true);
    try {
      const { buildCampaignWorkbook, workbookToXlsxBlob } = await import('@/lib/campaign-sheet-template');
      const wb = buildCampaignWorkbook(
        {
          eventName: event.name,
          venue: event.venue,
          city: event.city,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          schedule: event.schedule,
          promoter: event.promoter || 'ARTA PRODUCCIONES',
        },
        cleanCampaignRows(rows),
      );
      const blob = workbookToXlsxBlob(wb);
      const name = campaignExpensesFileName(event.name);
      const fd = new FormData();
      fd.append('file', blob, name);
      if (sheet) {
        await api(`/uploads/${sheet.id}/content`, { method: 'PUT', body: fd });
      } else {
        fd.append('eventId', event.id);
        fd.append('module', CAMPAIGN_FILE_MODULE);
        await api('/uploads', { method: 'POST', body: fd });
      }
      flash(sheet ? 'Archivo de campaña actualizado' : 'Archivo de campaña generado');
      setSheetMode('view');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
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
      <SectionHead title="Campaña" sub={<ReviewFlow step={step} />}>
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
          <button className="btn ghost btn-sm" type="button" disabled={!filled.length} onClick={() => pdf('interna')}>
            PDF interna
          </button>
          <button className="btn ghost btn-sm" type="button" disabled={!filled.length} onClick={() => pdf('externa')}>
            PDF externa
          </button>
          {canEdit && !closed ? (
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
                <FileViewer url={sheet.url} fileName={sheet.fileName} kind={sheet.kind} cacheKey={sheet.updatedAt || sheet.createdAt} />
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {others.length ? (
        <details className="disclose">
          <summary>Otros archivos de campaña ({others.length})</summary>
          <div className="sx-stack">
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
