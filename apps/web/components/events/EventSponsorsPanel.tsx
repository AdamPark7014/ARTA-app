'use client';

import { useEffect, useMemo, useState } from 'react';
import { EmptyLite, FileRow, Pill, ReviewFlow, SectionHead } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import {
  CONVENIO_CATALOG,
  cleanConvenioRows,
  convenioLineTotal,
  convenioZones,
  conveniosFileName,
  conveniosTotal,
} from '@/lib/campaign-concepts';
import { clearDraft, readDraft, writeDraft } from '@/lib/draft-store';
import { downloadBlob } from '@/lib/pdf-kit';
import { mxn, normalizeConcept, numOrNull } from '@/lib/price-list';
import { reviewEditable, reviewStep, type ReviewStep } from '@/lib/review-flow';
import {
  SPONSOR_CONTRIBUTION_TYPES,
  SPONSOR_STATUSES,
  SPONSOR_STATUS_LABELS,
  SPONSOR_TIERS,
  emptySponsorForm,
  sponsorStatusLabel,
  sponsorStatusTone,
  type SponsorFormState,
} from '@/lib/sponsor-constants';
import { ReviewActions } from './ReviewActions';
import {
  SPONSORS_FILE_MODULE,
  type ConvenioRow,
  type EventFile,
  type EventPanelProps,
  type Sponsor,
} from './event-detail.types';

/**
 * Convenios (junta 11-09-2026).
 *
 * «No hay precio interno ni externo: va zona, cantidad, precio y total». Los
 * medios se pagan en especie —cortesías de una zona—, así que la zona sugiere
 * las de la boletera y trae su precio. De la tabla sale la campaña de
 * convenios (Excel + PDF) y tiene su propia revisión.
 *
 * Los patrocinadores de siempre quedan abajo, plegados.
 */

type Props = EventPanelProps & {
  /** Patrocinadores: permiso de edición operativa. */
  canEdit: boolean;
  /** Campaña de convenios: se guarda en la campaña, pide `campaign.edit`. */
  canCampaignEdit: boolean;
  canApprove: boolean;
  canMarkPaid: boolean;
};

const STEP_OK: Record<ReviewStep, string> = {
  DRAFT: 'Convenios de vuelta en borrador',
  REVIEW: 'Convenios enviados a revisión',
  AUTHORIZED: 'Convenios autorizados',
  PAID: 'Convenios marcados como pagados',
};

function blank(): ConvenioRow {
  return { concept: '', description: '', zona: '', qty: null, price: null };
}

function pillTone(tone: string) {
  return tone === 'ok' ? 'ok' : tone === 'warn' ? 'review' : tone === 'danger' ? 'danger' : 'draft';
}

function isoDate(v?: string | null) {
  return v ? String(v).slice(0, 10) : '';
}

export function EventSponsorsPanel({
  event,
  closed,
  canEdit,
  canCampaignEdit,
  canApprove,
  canMarkPaid,
  onChanged,
  flash,
}: Props) {
  const saved = useMemo<ConvenioRow[]>(
    () =>
      (event.campaign?.dataJson?.convenios || []).map((r) => ({
        concept: r.concept || '',
        description: r.description || '',
        zona: r.zona || '',
        qty: r.qty ?? null,
        price: r.price ?? null,
      })),
    [event.campaign?.dataJson],
  );
  const draftKey = `arta.draft.convenios.${event.id}`;
  const [rows, setRows] = useState<ConvenioRow[]>(() => readDraft<ConvenioRow[]>(draftKey) ?? saved);
  const [dirty, setDirty] = useState(() => readDraft(draftKey) !== null);
  const [busy, setBusy] = useState(false);

  // Lo tecleado sin guardar sobrevive a cambiar de pestaña.
  useEffect(() => {
    if (dirty) writeDraft(draftKey, rows);
    else clearDraft(draftKey);
  }, [draftKey, dirty, rows]);

  useEffect(() => {
    if (!dirty) setRows(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  const step = reviewStep(event.campaign?.convenioStatus);
  const editable = canCampaignEdit && !closed && reviewEditable(step);
  const filled = rows.filter((r) => r.concept.trim());
  const total = conveniosTotal(filled);
  const zones = useMemo(
    () => (event.ticketingSetups?.[0]?.zonesJson || []).filter((z) => z.zona?.trim()),
    [event.ticketingSetups],
  );
  const byZone = convenioZones(filled);
  const conveniosFile = event.files
    .filter((f) => f.module === SPONSORS_FILE_MODULE && /^CONVENIOS-/i.test(f.fileName))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0];

  function patch(i: number, next: Partial<ConvenioRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));
    setDirty(true);
  }

  function setConcept(i: number, value: string) {
    const match = CONVENIO_CATALOG.find((c) => normalizeConcept(c.concept) === normalizeConcept(value));
    patch(i, { concept: value, ...(match && !rows[i].description ? { description: match.description } : {}) });
  }

  function setZona(i: number, value: string) {
    const zone = zones.find((z) => z.zona.trim().toUpperCase() === value.trim().toUpperCase());
    patch(i, { zona: value, ...(zone && rows[i].price == null ? { price: Number(zone.precio) || null } : {}) });
  }

  async function save(quiet = false) {
    setBusy(true);
    try {
      await api(`/campaigns/event/${event.id}`, {
        method: 'POST',
        body: JSON.stringify({ dataJson: { convenios: cleanConvenioRows(rows) } }),
      });
      setDirty(false);
      if (!quiet) flash('Convenios guardados');
      await onChanged();
      return true;
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudieron guardar los convenios', 'error');
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
        body: JSON.stringify({ status: next, scope: 'convenios' }),
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
    if (!filled.length) return;
    if (dirty && !(await save(true))) return;
    setBusy(true);
    try {
      const { buildConveniosWorkbook, workbookToXlsxBlob } = await import('@/lib/campaign-sheet-template');
      const wb = buildConveniosWorkbook(
        {
          eventName: event.name,
          venue: event.venue,
          city: event.city,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          schedule: event.schedule,
          promoter: event.promoter || 'ARTA PRODUCCIONES',
        },
        cleanConvenioRows(rows),
      );
      const fd = new FormData();
      fd.append('file', workbookToXlsxBlob(wb), conveniosFileName(event.name));
      if (conveniosFile) {
        await api(`/uploads/${conveniosFile.id}/content`, { method: 'PUT', body: fd });
      } else {
        fd.append('eventId', event.id);
        fd.append('module', SPONSORS_FILE_MODULE);
        await api('/uploads', { method: 'POST', body: fd });
      }
      flash('Campaña de convenios generada');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo generar el archivo', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function pdf() {
    try {
      const { buildConveniosPdf, conveniosPdfName } = await import('@/lib/campaign-pdf');
      downloadBlob(await buildConveniosPdf({ event, rows }), conveniosPdfName(event.name));
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo generar el PDF', 'error');
    }
  }

  return (
    <div className="sx-stack convenios">
      <SectionHead title="Convenios" sub={<ReviewFlow step={step} />}>
        <ReviewActions
          step={step}
          closed={closed}
          canEdit={canCampaignEdit}
          canApprove={canApprove}
          canMarkPaid={canMarkPaid}
          canSubmit={filled.length > 0}
          busy={busy}
          onMove={move}
        />
      </SectionHead>

      <div className="toolbar-row">
        <div className="zone-chips" aria-label="Cortesías por zona">
          {byZone.length ? (
            byZone.map((z) => (
              <span key={z.zona} className="zone-chip">
                <strong>{z.zona}</strong> {z.qty.toLocaleString('es-MX')} · {mxn(z.total)}
              </span>
            ))
          ) : (
            <span className="inline-note">Se pagan en cortesías: zona, cantidad y precio.</span>
          )}
        </div>
        <div className="sx-actions">
          <button className="btn ghost btn-sm" type="button" disabled={!filled.length} onClick={pdf}>
            PDF
          </button>
          {canCampaignEdit && !closed ? (
            <button className="btn btn-sm" type="button" disabled={busy || !filled.length} onClick={generate}>
              Generar campaña de convenios
            </button>
          ) : null}
        </div>
      </div>

      {!rows.length ? (
        <div className="surface">
          <EmptyLite icon="⇄" title="Sin convenios" text={editable ? 'Agrega los medios con los que se hace convenio.' : undefined}>
            {editable ? (
              <button
                className="btn btn-sm"
                type="button"
                onClick={() => {
                  setRows([blank()]);
                  setDirty(true);
                }}
              >
                + Convenio
              </button>
            ) : null}
          </EmptyLite>
        </div>
      ) : (
        <div className="dtable-wrap">
          <datalist id="convenio-catalog">
            {CONVENIO_CATALOG.map((c) => (
              <option key={c.concept} value={c.concept} />
            ))}
          </datalist>
          <datalist id="convenio-zones">
            {zones.map((z) => (
              <option key={z.zona} value={z.zona} />
            ))}
          </datalist>
          <table className="dtable convenios-table">
            <thead>
              <tr>
                <th>Convenio</th>
                <th>Descripción</th>
                <th>Zona</th>
                <th className="num">Cant.</th>
                <th className="num">Precio</th>
                <th className="num">Total</th>
                {editable ? <th className="col-act" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const t = convenioLineTotal(r);
                return (
                  <tr key={i}>
                    <td className="c-name">
                      {editable ? (
                        <input
                          className="cell"
                          list="convenio-catalog"
                          value={r.concept}
                          placeholder="Medio"
                          aria-label={`Convenio ${i + 1}`}
                          onChange={(e) => setConcept(i, e.target.value)}
                        />
                      ) : (
                        <strong>{r.concept}</strong>
                      )}
                    </td>
                    <td className="c-desc">
                      {editable ? (
                        <input
                          className="cell"
                          value={r.description || ''}
                          placeholder="Qué entrega"
                          aria-label="Descripción"
                          onChange={(e) => patch(i, { description: e.target.value })}
                        />
                      ) : (
                        <span className="is-muted">{r.description}</span>
                      )}
                    </td>
                    <td className="c-zone">
                      {editable ? (
                        <input
                          className="cell"
                          list="convenio-zones"
                          value={r.zona || ''}
                          placeholder="Zona"
                          aria-label="Zona"
                          onChange={(e) => setZona(i, e.target.value)}
                        />
                      ) : (
                        r.zona
                      )}
                    </td>
                    <td className="num c-qty">
                      {editable ? (
                        <input
                          className="cell num"
                          type="number"
                          min={0}
                          step={1}
                          value={r.qty ?? ''}
                          placeholder="—"
                          aria-label="Cantidad"
                          onChange={(e) => patch(i, { qty: numOrNull(e.target.value) })}
                        />
                      ) : (
                        r.qty ?? '—'
                      )}
                    </td>
                    <td className="num c-price">
                      {editable ? (
                        <input
                          className="cell num"
                          type="number"
                          min={0}
                          step="any"
                          value={r.price ?? ''}
                          placeholder="—"
                          aria-label="Precio"
                          onChange={(e) => patch(i, { price: numOrNull(e.target.value) })}
                        />
                      ) : r.price == null ? (
                        '—'
                      ) : (
                        mxn(r.price)
                      )}
                    </td>
                    <td className="num">{t == null ? <span className="is-muted">—</span> : mxn(t)}</td>
                    {editable ? (
                      <td className="col-act">
                        <button
                          className="icon-btn icon-btn--danger"
                          type="button"
                          aria-label={`Quitar ${r.concept || 'convenio'}`}
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
                <td colSpan={5}>
                  {editable ? (
                    <button
                      className="btn-quiet btn-quiet--accent"
                      type="button"
                      onClick={() => {
                        setRows((prev) => [...prev, blank()]);
                        setDirty(true);
                      }}
                    >
                      + Convenio
                    </button>
                  ) : (
                    <span className="is-muted t-small">Total</span>
                  )}
                </td>
                <td className="num t-money">{mxn(total)}</td>
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

      {conveniosFile ? (
        <FileRow kind="xlsx" name={conveniosFile.fileName} meta="Campaña de convenios">
          <a className="btn-quiet" href={conveniosFile.url} download={conveniosFile.fileName}>
            Descargar
          </a>
        </FileRow>
      ) : null}

      <Sponsors event={event} closed={closed} canEdit={canEdit} onChanged={onChanged} flash={flash} />
    </div>
  );
}

/* ── Patrocinadores (lo de siempre, plegado) ─────────────────────────────── */

function toForm(s: Sponsor): SponsorFormState {
  return {
    name: s.name,
    tier: s.tier || 'Plata',
    status: s.status || 'PROPOSED',
    contactName: s.contactName || '',
    contactEmail: s.contactEmail || '',
    contactPhone: s.contactPhone || '',
    contact: s.contact || '',
    contribution: s.contribution || 'Efectivo',
    amount: s.amount != null ? String(s.amount) : '',
    benefits: s.benefits || '',
    deliverables: s.deliverables || '',
    paymentTerms: s.paymentTerms || '',
    validFrom: isoDate(s.validFrom),
    validUntil: isoDate(s.validUntil),
    notes: s.notes || '',
  };
}

function payload(f: SponsorFormState) {
  return {
    name: f.name.trim(),
    tier: f.tier || undefined,
    status: f.status || undefined,
    contactName: f.contactName || undefined,
    contactEmail: f.contactEmail || undefined,
    contactPhone: f.contactPhone || undefined,
    contact: f.contactPhone || f.contactEmail || f.contactName || undefined,
    contribution: f.contribution || undefined,
    amount: f.amount ? Number(f.amount) : undefined,
    benefits: f.benefits || undefined,
    deliverables: f.deliverables || undefined,
    paymentTerms: f.paymentTerms || undefined,
    validFrom: f.validFrom || undefined,
    validUntil: f.validUntil || undefined,
    notes: f.notes || undefined,
  };
}

function SponsorForm({
  value,
  onChange,
  onCancel,
  onSave,
  busy,
}: {
  value: SponsorFormState;
  onChange: (v: SponsorFormState) => void;
  onCancel: () => void;
  onSave: () => void;
  busy: boolean;
}) {
  const set = (p: Partial<SponsorFormState>) => onChange({ ...value, ...p });
  return (
    <div className="surface surface--pad">
      <div className="fx">
        <div className="fx-grid">
          <label>
            Marca
            <input value={value.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </label>
          <label>
            Nivel
            <select value={value.tier} onChange={(e) => set({ tier: e.target.value })}>
              {SPONSOR_TIERS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Estatus
            <select value={value.status} onChange={(e) => set({ status: e.target.value })}>
              {SPONSOR_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SPONSOR_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Aportación
            <select value={value.contribution} onChange={(e) => set({ contribution: e.target.value })}>
              {SPONSOR_CONTRIBUTION_TYPES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Monto
            <input type="number" min={0} value={value.amount} onChange={(e) => set({ amount: e.target.value })} />
          </label>
          <label>
            Contacto
            <input value={value.contactName} onChange={(e) => set({ contactName: e.target.value })} />
          </label>
          <label>
            Correo
            <input type="email" value={value.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
          </label>
          <label>
            Teléfono
            <input value={value.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
          </label>
        </div>
        <div className="fx-grid">
          <label>
            Beneficios para la marca
            <textarea rows={2} value={value.benefits} onChange={(e) => set({ benefits: e.target.value })} />
          </label>
          <label>
            Entregables
            <textarea rows={2} value={value.deliverables} onChange={(e) => set({ deliverables: e.target.value })} />
          </label>
        </div>
        <div className="fx-actions">
          <button className="btn ghost btn-sm" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="btn btn-sm" type="button" disabled={busy || !value.name.trim()} onClick={onSave}>
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Sponsors({
  event,
  closed,
  canEdit,
  onChanged,
  flash,
}: Pick<Props, 'event' | 'closed' | 'canEdit' | 'onChanged' | 'flash'>) {
  const sponsors = event.sponsors || [];
  const files = event.files.filter((f: EventFile) => f.module === SPONSORS_FILE_MODULE && !/^CONVENIOS-/i.test(f.fileName));
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<SponsorFormState>(emptySponsorForm());
  const [busy, setBusy] = useState(false);
  const editable = canEdit && !closed;

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      flash(ok);
      setEditing(null);
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo completar', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function pdf(s: Sponsor) {
    const { buildSponsorConvenioPdfBlob, sponsorConvenioPdfFileName } = await import('@/lib/sponsor-convenio-template');
    const blob = await buildSponsorConvenioPdfBlob({
      eventName: event.name,
      venue: event.venue,
      city: event.city,
      startsAt: event.startsAt,
      promoter: event.promoter,
      sponsor: { ...payload(toForm(s)), amount: s.amount ?? null },
    });
    downloadBlob(blob, sponsorConvenioPdfFileName(s.name, event.name));
  }

  function upload(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('eventId', event.id);
    fd.append('module', SPONSORS_FILE_MODULE);
    void run(() => api('/uploads', { method: 'POST', body: fd }), `${file.name} guardado`);
  }

  return (
    <details className="disclose" open={sponsors.length > 0 && editing !== null ? true : undefined}>
      <summary>Patrocinadores ({sponsors.length})</summary>
      <div className="sx-stack">
        {editing === 'new' ? (
          <SponsorForm
            value={form}
            onChange={setForm}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSave={() =>
              run(
                () => api('/sponsors', { method: 'POST', body: JSON.stringify({ eventId: event.id, ...payload(form) }) }),
                'Patrocinador agregado',
              )
            }
          />
        ) : null}

        {sponsors.length ? (
          <div className="dtable-wrap">
            <table className="dtable">
              <tbody>
                {sponsors.map((s) =>
                  editing === s.id ? (
                    <tr key={s.id}>
                      <td colSpan={4} className="dtable__detail">
                        <SponsorForm
                          value={form}
                          onChange={setForm}
                          busy={busy}
                          onCancel={() => setEditing(null)}
                          onSave={() =>
                            run(
                              () => api(`/sponsors/${s.id}`, { method: 'PATCH', body: JSON.stringify(payload(form)) }),
                              'Patrocinador actualizado',
                            )
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.name}</strong>
                        <div className="is-muted t-small">{[s.tier, s.contribution].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="num">{s.amount != null ? mxn(Number(s.amount)) : <span className="is-muted">—</span>}</td>
                      <td>
                        <Pill tone={pillTone(sponsorStatusTone(s.status))}>{sponsorStatusLabel(s.status)}</Pill>
                      </td>
                      <td className="col-act">
                        <button className="btn-quiet" type="button" onClick={() => void pdf(s)}>
                          PDF
                        </button>
                        {editable ? (
                          <>
                            <button
                              className="btn-quiet"
                              type="button"
                              onClick={() => {
                                setForm(toForm(s));
                                setEditing(s.id);
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className="icon-btn icon-btn--danger"
                              type="button"
                              aria-label={`Quitar ${s.name}`}
                              onClick={() => {
                                if (confirm(`¿Quitar a ${s.name}?`)) {
                                  void run(() => api(`/sponsors/${s.id}`, { method: 'DELETE' }), 'Patrocinador quitado');
                                }
                              }}
                            >
                              ×
                            </button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {files.map((f) => (
          <FileRow key={f.id} kind={/\.pdf$/i.test(f.fileName) ? 'pdf' : /\.xlsx?$/i.test(f.fileName) ? 'xlsx' : 'file'} name={f.fileName}>
            <a className="btn-quiet" href={f.url} target="_blank" rel="noreferrer">
              Abrir
            </a>
          </FileRow>
        ))}

        {editable ? (
          <div className="sx-actions">
            {editing !== 'new' ? (
              <button
                className="btn-quiet btn-quiet--accent"
                type="button"
                onClick={() => {
                  setForm(emptySponsorForm());
                  setEditing('new');
                }}
              >
                + Patrocinador
              </button>
            ) : null}
            <label className="btn-quiet module-upload">
              Subir convenio firmado
              <input
                type="file"
                hidden
                accept=".pdf,.xlsx,.xls,.docx,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) upload(f);
                }}
              />
            </label>
          </div>
        ) : null}
      </div>
    </details>
  );
}
