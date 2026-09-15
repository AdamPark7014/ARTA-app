'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChecklistPicker } from '@/components/events/ChecklistPicker';
import { EventVendorPins } from '@/components/events/EventVendorPins';
import {
  EventFields,
  eventFormFromDetail,
  eventFormProblem,
  eventPayload,
} from '@/components/events/EventFields';
import { eventDateLabel } from '@/components/ui/EventHero';
import { EmptyLite, Tile } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import { mxn } from '@/lib/price-list';
import { REVIEW_LABELS, reviewStep } from '@/lib/review-flow';
import type { Checklist, EventPanelProps, Tab } from './event-detail.types';

type Props = EventPanelProps & {
  editing: boolean;
  setEditing: (v: boolean) => void;
  canVendorPin: boolean;
  onOpenChecklist: (c: Checklist) => Promise<void>;
  onGoModule: (tab: Tab) => void;
  /** Pestañas que este usuario puede abrir (para que los mosaicos no lleven a la nada). */
  visibleTabs: Set<Tab>;
};

/**
 * Resumen del evento: cuatro cifras que llevan a su pestaña, los datos del
 * show, las notas y los formatos más atrasados. Nada más.
 */
export function EventOverviewPanel({
  event,
  closed,
  onChanged,
  flash,
  editing,
  setEditing,
  canVendorPin,
  onOpenChecklist,
  onGoModule,
  visibleTabs,
}: Props) {
  const [form, setForm] = useState(() => eventFormFromDetail(event));
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState(event.notes || '');

  useEffect(() => {
    if (editing) setForm(eventFormFromDetail(event));
    // Solo al abrir el modo edición: recargar el evento no debe borrar lo tecleado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    setNotes(event.notes || '');
  }, [event.notes]);

  const checklists = event.checklists || [];
  const avg = checklists.length
    ? Math.round(checklists.reduce((s, c) => s + (c.progressPct || 0), 0) / checklists.length)
    : 0;
  const behind = checklists.filter((c) => c.progressPct < 100).length;

  const po = useMemo(() => {
    const list = event.purchaseOrders || [];
    const pending = list.filter((p) => p.status === 'PENDING_AUTH' || p.status === 'DRAFT');
    const toPay = list.filter((p) => p.status === 'AUTHORIZED');
    return {
      pending: pending.length,
      toPayAmount: toPay.reduce((s, p) => s + Number(p.amount || 0), 0),
      total: list.length,
    };
  }, [event.purchaseOrders]);

  const campaignStep = reviewStep(event.campaign?.status, event.campaign?.authorized);
  const hasCampaign = !!event.campaign?.dataJson?.concepts?.length;
  const boletera = event.ticketingSetups?.[0];
  const problem = eventFormProblem(form);

  async function save() {
    if (problem) {
      flash(problem, 'error');
      return;
    }
    setSaving(true);
    try {
      await api(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify(eventPayload(form)) });
      setEditing(false);
      flash('Datos del evento actualizados');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudo guardar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveNotes() {
    try {
      await api(`/events/${event.id}`, { method: 'PATCH', body: JSON.stringify({ notes }) });
      flash('Notas guardadas');
      await onChanged();
    } catch (e) {
      flash(e instanceof Error ? e.message : 'No se pudieron guardar las notas', 'error');
    }
  }

  const go = (tab: Tab) => (visibleTabs.has(tab) ? () => onGoModule(tab) : undefined);

  return (
    <div className="sx-stack">
      <div className="tiles">
        <Tile label="Formatos" value={`${avg}%`} sub={behind ? `${behind} por completar` : 'Todo completo'} onClick={go('checklists')} />
        {visibleTabs.has('ocs') ? (
          <Tile
            label="Órdenes de compra"
            value={po.pending}
            tone={po.pending ? 'warn' : undefined}
            sub={po.toPayAmount ? `por autorizar · ${mxn(po.toPayAmount)} por pagar` : 'por autorizar'}
            onClick={go('ocs')}
          />
        ) : null}
        {visibleTabs.has('campaign') ? (
          <Tile
            label="Campaña"
            value={hasCampaign || event.campaign ? REVIEW_LABELS[campaignStep] : 'Sin armar'}
            tone={campaignStep === 'PAID' ? 'accent' : campaignStep === 'AUTHORIZED' ? 'ok' : undefined}
            sub={`${event.campaign?.dataJson?.concepts?.length || 0} conceptos`}
            onClick={go('campaign')}
          />
        ) : null}
        {visibleTabs.has('ticketing') ? (
          <Tile
            label="Boletera"
            value={boletera ? boletera.boletera : 'Sin crear'}
            sub={
              boletera
                ? `${(boletera.zonesJson || []).reduce((s, z) => s + Number(z.aforo || 0), 0).toLocaleString('es-MX')} de capacidad`
                : 'Creación de boletera'
            }
            onClick={go('ticketing')}
          />
        ) : null}
      </div>

      <div className="split-2">
        <section className="surface">
          <div className="surface__head">
            <h3 className="surface__title">Datos del evento</h3>
            {!closed ? (
              editing ? (
                <div className="sx-actions">
                  <button className="btn ghost btn-sm" type="button" onClick={() => setEditing(false)}>
                    Cancelar
                  </button>
                  <button className="btn btn-sm" type="button" disabled={saving || !!problem} onClick={save}>
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              ) : (
                <button className="btn-quiet" type="button" onClick={() => setEditing(true)}>
                  Editar
                </button>
              )
            ) : null}
          </div>
          <div className="surface__body">
            {editing && !closed ? (
              <EventFields value={form} onChange={setForm} autoFocus />
            ) : (
              <div className="sx-stack">
                <dl className="ev-facts">
                  <div>
                    <dt>Fecha del evento</dt>
                    <dd>{eventDateLabel(event.startsAt, event.endsAt)}</dd>
                  </div>
                  <div>
                    <dt>Horario</dt>
                    <dd>{event.schedule || '—'}</dd>
                  </div>
                  <div>
                    <dt>Funciones</dt>
                    <dd>{event.functions || '—'}</dd>
                  </div>
                  <div>
                    <dt>Venue</dt>
                    <dd>{[event.venue, event.city].filter(Boolean).join(', ') || '—'}</dd>
                  </div>
                  <div>
                    <dt>Promotor</dt>
                    <dd>{event.promoter || '—'}</dd>
                  </div>
                </dl>
                {event.description ? (
                  <p className="ev-description">{event.description}</p>
                ) : !closed ? (
                  <button className="btn-quiet btn-quiet--accent" type="button" onClick={() => setEditing(true)}>
                    + Agregar descripción
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <div className="sx-stack">
          <section className="surface">
            <div className="surface__head">
              <h3 className="surface__title">Notas</h3>
              {!closed && notes !== (event.notes || '') ? (
                <button className="btn btn-sm" type="button" onClick={saveNotes}>
                  Guardar
                </button>
              ) : null}
            </div>
            <div className="surface__body">
              <textarea
                className="notes-area"
                rows={4}
                disabled={closed}
                aria-label="Notas del evento"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Acuerdos y pendientes del equipo…"
              />
            </div>
          </section>

          <section className="surface">
            <div className="surface__head">
              <h3 className="surface__title">Formatos más atrasados</h3>
              {checklists.length ? (
                <button className="btn-quiet" type="button" onClick={() => onGoModule('checklists')}>
                  Ver todos
                </button>
              ) : null}
            </div>
            <div className="surface__body">
              {checklists.length ? (
                <ChecklistPicker
                  checklists={checklists
                    .slice()
                    .sort((a, b) => a.progressPct - b.progressPct)
                    .slice(0, 4)}
                  onSelect={(c) => onOpenChecklist(c)}
                  compact
                />
              ) : (
                <EmptyLite icon="✓" title="Sin formatos" />
              )}
            </div>
          </section>
        </div>
      </div>

      {canVendorPin ? (
        <details className="disclose">
          <summary>Acceso de proveedores (PIN)</summary>
          <EventVendorPins eventId={event.id} closed={closed} flash={flash} />
        </details>
      ) : null}
    </div>
  );
}
