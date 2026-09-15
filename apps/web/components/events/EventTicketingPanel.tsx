'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type {
  EventDetail,
  EventPanelProps,
  TicketingSetup,
} from '@/components/events/event-detail.types';
import { BoleteraFields } from '@/components/ticketing/BoleteraFields';
import { TicketZonesEditor } from '@/components/ticketing/TicketZonesEditor';
import { EmptyLite, SectionHead } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import {
  boleteraChoiceOf,
  boleteraDateLabel,
  normalizeArtsUrl,
  resolveBoleteraName,
} from '@/lib/boletera';
import { boleteraSheet, downloadBoleteraPdf } from '@/lib/boletera-pdf';
import {
  DEFAULT_TICKET_ZONES,
  cloneTicketZones,
  normalizeTicketZones,
  parseTicketZones,
  type TicketZone,
} from '@/lib/ticket-zones';

type Props = EventPanelProps & { canEdit: boolean };

type Form = {
  boletera: string;
  artsUrl: string;
  dateLabel: string;
  schedule: string;
  functions: string;
  venue: string;
  description: string;
  holdArtist: string;
  holdPromoter: string;
  holdVenue: string;
};

type HoldKey = 'holdArtist' | 'holdPromoter' | 'holdVenue';

const HOLD_FIELDS: Array<[HoldKey, string]> = [
  ['holdArtist', 'Artista'],
  ['holdPromoter', 'Promotor'],
  ['holdVenue', 'Venue'],
];

const numText = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : '');

function intOrNull(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  const n = Math.floor(Number(t));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const textOrNull = (value: string) => value.trim() || null;

function formFromEvent(event: EventDetail): Form {
  return {
    boletera: 'Arema',
    artsUrl: '',
    dateLabel: boleteraDateLabel(event.startsAt, event.endsAt),
    schedule: event.schedule || '',
    functions: numText(event.functions),
    venue: event.venue || '',
    description: event.description || '',
    holdArtist: '',
    holdPromoter: '',
    holdVenue: '',
  };
}

function formFromSetup(setup: TicketingSetup, event: EventDetail): Form {
  const sheet = boleteraSheet(setup, event);
  return {
    boletera: setup.boletera || 'Arema',
    artsUrl: setup.artsUrl || '',
    dateLabel: sheet.dateLabel,
    schedule: sheet.schedule,
    functions: numText(sheet.functions),
    venue: sheet.venue,
    description: sheet.description,
    holdArtist: numText(setup.holdArtist),
    holdPromoter: numText(setup.holdPromoter),
    holdVenue: numText(setup.holdVenue),
  };
}

const money = (n: number) =>
  n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function TicketIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9a2 2 0 0 0 0 6v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a2 2 0 0 1 0-6V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2Z" />
      <path d="M14 5v2M14 11v2M14 17v2" />
    </svg>
  );
}

/** Resumen que refleja el PDF: lo que la boletera va a recibir. */
function BoleteraSummary({
  setup,
  event,
  actions,
}: {
  setup: TicketingSetup;
  event: EventDetail;
  actions: ReactNode;
}) {
  const sheet = boleteraSheet(setup, event);
  const facts: Array<[string, string]> = [
    ['Fecha', sheet.dateLabel],
    ['Horario', sheet.schedule],
    ['Funciones', sheet.functions ? String(sheet.functions) : ''],
    ['Venue', sheet.venue],
  ];
  const holds: Array<[string, number | null]> = [
    ['Artista', sheet.hold.artist],
    ['Promotor', sheet.hold.promoter],
    ['Venue', sheet.hold.venue],
  ];

  return (
    <article className="surface bol-sheet">
      <header className="bol-sheet__head">
        <div>
          <span className="bol-sheet__eyebrow">Boletera</span>
          <h3 className="bol-sheet__name">{sheet.boletera}</h3>
          <p className="bol-sheet__event">{sheet.eventName}</p>
        </div>
        <div className="sx-actions">{actions}</div>
      </header>

      <div className="bol-sheet__body">
        <div className="bol-sheet__col">
          <dl className="ev-facts bol-sheet__facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={value ? undefined : 't-muted'}>{value || '—'}</dd>
              </div>
            ))}
          </dl>

          {sheet.zones.length ? (
            <div className="dtable-wrap">
              <table className="dtable bol-sheet__zones">
                <thead>
                  <tr>
                    <th>Zona</th>
                    <th className="num">Aforo</th>
                    <th className="num">Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {sheet.zones.map((z, i) => (
                    <tr key={`${z.zona}-${i}`}>
                      <td>{z.zona}</td>
                      <td className="num">{z.aforo.toLocaleString('es-MX')}</td>
                      <td className="num">{money(z.precio)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Capacidad</td>
                    <td className="num bol-sheet__capacity">{sheet.capacity.toLocaleString('es-MX')}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="t-muted t-small">Sin zonas capturadas.</p>
          )}
        </div>

        <div className="bol-sheet__col">
          <div>
            <p className="bol-sheet__label">Hold</p>
            <dl className="bol-sheet__hold">
              {holds.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className={value === null ? 't-muted' : undefined}>
                    {value === null ? '—' : value.toLocaleString('es-MX')}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {sheet.artsUrl ? (
            <div>
              <p className="bol-sheet__label">Artes del evento</p>
              {sheet.artsHref ? (
                <a className="bol-sheet__link" href={sheet.artsHref} target="_blank" rel="noopener noreferrer">
                  Abrir carpeta
                  <span className="bol-sheet__host">{hostOf(sheet.artsHref)} ↗</span>
                </a>
              ) : (
                <span className="t-muted t-small">{sheet.artsUrl}</span>
              )}
            </div>
          ) : null}

          {sheet.description ? (
            <div>
              <p className="bol-sheet__label">Descripción del evento</p>
              <p className="ev-description bol-sheet__desc">{sheet.description}</p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function EventTicketingPanel({ event, closed, canEdit, onChanged, flash }: Props) {
  const setups = useMemo(
    () =>
      [...(event.ticketingSetups || [])].sort((a, b) =>
        (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      ),
    [event.ticketingSetups],
  );
  const editable = canEdit && !closed;
  const creating = editable && setups.length === 0;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => formFromEvent(event));
  const [zones, setZones] = useState<TicketZone[]>(() => cloneTicketZones(DEFAULT_TICKET_ZONES));
  const [busy, setBusy] = useState(false);
  const [pdfId, setPdfId] = useState<string | null>(null);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(setup: TicketingSetup) {
    setForm(formFromSetup(setup, event));
    const current = parseTicketZones(setup.zonesJson);
    setZones(current.length ? current : cloneTicketZones(DEFAULT_TICKET_ZONES));
    setEditingId(setup.id);
  }

  async function submit() {
    if (busy) return;
    const boletera = resolveBoleteraName(boleteraChoiceOf(form.boletera), form.boletera);
    if (!boletera) {
      flash('Escribe el nombre de la boletera.', 'error');
      return;
    }
    const cleanZones = normalizeTicketZones(zones);
    if (!cleanZones.length) {
      flash('Agrega al menos una zona.', 'error');
      return;
    }
    const artsRaw = form.artsUrl.trim();
    const artsUrl = normalizeArtsUrl(artsRaw);
    if (artsRaw && !artsUrl) {
      flash('El link de artes no parece válido.', 'error');
      return;
    }

    const payload = {
      boletera,
      artsUrl: artsUrl || null,
      dateLabel: textOrNull(form.dateLabel),
      schedule: textOrNull(form.schedule),
      functions: intOrNull(form.functions),
      venue: textOrNull(form.venue),
      description: textOrNull(form.description),
      holdArtist: intOrNull(form.holdArtist),
      holdPromoter: intOrNull(form.holdPromoter),
      holdVenue: intOrNull(form.holdVenue),
      // `sold` viaja intacto: lo llena la integración, no este formulario.
      zonesJson: cleanZones,
    };

    const wasEditing = editingId !== null;
    setBusy(true);
    let saved: TicketingSetup;
    try {
      saved = wasEditing
        ? await api<TicketingSetup>(`/ticketing/${editingId}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await api<TicketingSetup>(`/ticketing/event/${event.id}`, {
            method: 'POST',
            body: JSON.stringify(payload),
          });
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo guardar la boletera', 'error');
      setBusy(false);
      return;
    }

    setEditingId(null);
    const done = wasEditing ? 'Boletera actualizada' : 'Boletera creada';
    try {
      await downloadBoleteraPdf({ setup: saved, event });
      flash(`${done} · PDF descargado`, 'success');
    } catch {
      flash(`${done}, pero el PDF no se generó. Usa «Descargar PDF».`, 'warn');
    }
    try {
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(setup: TicketingSetup) {
    if (!window.confirm('¿Eliminar la boletera de este evento?')) return;
    setBusy(true);
    try {
      await api(`/ticketing/${setup.id}`, { method: 'DELETE' });
      if (editingId === setup.id) setEditingId(null);
      setForm(formFromEvent(event));
      setZones(cloneTicketZones(DEFAULT_TICKET_ZONES));
      flash('Boletera eliminada', 'success');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo eliminar la boletera', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function download(setup: TicketingSetup) {
    setPdfId(setup.id);
    try {
      await downloadBoleteraPdf({ setup, event });
    } catch {
      flash('No se pudo generar el PDF', 'error');
    } finally {
      setPdfId(null);
    }
  }

  const artsHref = normalizeArtsUrl(form.artsUrl);

  function renderForm() {
    return (
      <section className="surface bol-form" aria-label={editingId ? 'Editar boletera' : 'Nueva boletera'}>
        <div className="surface__body fx">
          <BoleteraFields
            boletera={form.boletera}
            onBoleteraChange={(v) => set('boletera', v)}
            disabled={busy}
          />

          <div className="fx-grid">
            <label className="fx-span">
              Artes del evento
              <span className="bol-url">
                <input
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  placeholder="Link de la carpeta de artes"
                  value={form.artsUrl}
                  disabled={busy}
                  onChange={(e) => set('artsUrl', e.target.value)}
                />
                {artsHref ? (
                  <a className="btn ghost btn-sm" href={artsHref} target="_blank" rel="noopener noreferrer">
                    Abrir
                  </a>
                ) : null}
              </span>
            </label>
            <label>
              Fecha
              <input
                value={form.dateLabel}
                placeholder="19 de septiembre de 2026"
                disabled={busy}
                onChange={(e) => set('dateLabel', e.target.value)}
              />
            </label>
            <label>
              Horario
              <input
                value={form.schedule}
                placeholder="14:00 a 23:00"
                disabled={busy}
                onChange={(e) => set('schedule', e.target.value)}
              />
            </label>
            <label>
              Funciones
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={form.functions}
                placeholder="1"
                disabled={busy}
                onChange={(e) => set('functions', e.target.value)}
              />
            </label>
            <label>
              Venue
              <input
                value={form.venue}
                placeholder="Recinto"
                disabled={busy}
                onChange={(e) => set('venue', e.target.value)}
              />
            </label>
            <label className="fx-span">
              Descripción del evento
              <textarea
                rows={4}
                value={form.description}
                placeholder="Lo que la boletera publica del show"
                disabled={busy}
                onChange={(e) => set('description', e.target.value)}
              />
            </label>
          </div>

          <div className="fx-divider" />

          <div className="bol-block">
            <p className="fx-legend">Zonas</p>
            <TicketZonesEditor zones={zones} onChange={setZones} disabled={busy} />
          </div>

          <div className="fx-divider" />

          <div className="bol-block">
            <p className="fx-legend">Hold</p>
            <div className="bol-hold-fields">
              {HOLD_FIELDS.map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={form[key]}
                    disabled={busy}
                    onChange={(e) => set(key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="fx-actions">
            {editingId ? (
              <button className="btn ghost" type="button" disabled={busy} onClick={() => setEditingId(null)}>
                Cancelar
              </button>
            ) : null}
            <button className="btn" type="button" disabled={busy} onClick={() => void submit()}>
              {busy ? 'Guardando…' : editingId ? 'Guardar y PDF' : 'Crear boletera y PDF'}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="sx-stack bol">
      <SectionHead
        title="Creación de boletera"
        sub={creating ? 'Captura los datos y descarga el PDF para la boletera.' : undefined}
      />

      {creating ? renderForm() : null}

      {setups.map((setup) =>
        editable && editingId === setup.id ? (
          <div key={setup.id}>{renderForm()}</div>
        ) : (
          <BoleteraSummary
            key={setup.id}
            setup={setup}
            event={event}
            actions={
              <>
                <button
                  className="btn btn-sm"
                  type="button"
                  disabled={pdfId === setup.id}
                  onClick={() => void download(setup)}
                >
                  {pdfId === setup.id ? 'Generando…' : 'Descargar PDF'}
                </button>
                {editable ? (
                  <>
                    <button
                      className="btn ghost btn-sm"
                      type="button"
                      disabled={busy || editingId !== null}
                      onClick={() => startEdit(setup)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn-quiet btn-danger"
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(setup)}
                    >
                      Eliminar
                    </button>
                  </>
                ) : null}
              </>
            }
          />
        ),
      )}

      {!setups.length && !editable ? (
        <div className="surface">
          <EmptyLite
            icon={<TicketIcon />}
            title="Sin boletera"
            text={closed ? 'El evento está cerrado.' : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
