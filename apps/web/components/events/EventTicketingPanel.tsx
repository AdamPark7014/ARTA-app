'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TicketingSetup } from '@/components/events/event-detail.types';
import { BoleteraFields, resolveBoleteraName } from '@/components/ticketing/BoleteraFields';
import { TicketZonesEditor } from '@/components/ticketing/TicketZonesEditor';
import { boleteraChoiceOf } from '@/lib/boletera';
import {
  DEFAULT_TICKET_ZONES,
  cloneTicketZones,
  ticketZonesReady,
  ticketZonesSummary,
  type TicketZone,
} from '@/lib/ticket-zones';
import { EmptyState } from '@/components/ui/EmptyState';
import { FlashMessage, FormGrid, PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';

type TicketForm = {
  boletera: string;
  logoUrl: string;
  holdUntil: string;
  artist: string;
  promoter: string;
  notes: string;
};

type EventTicketingPanelProps = {
  closed: boolean;
  saving: boolean;
  canTicketing: boolean;
  eventId: string;
  ticketingSetups: TicketingSetup[];
  ticketForm: TicketForm;
  setTicketForm: (form: TicketForm) => void;
  ticketZones: TicketZone[];
  setTicketZones: (zones: TicketZone[]) => void;
  editingTicketId: string | null;
  setEditingTicketId: (id: string | null) => void;
  onSaveTicketing: () => Promise<void>;
  onEditTicketing: (t: TicketingSetup) => void;
  onDeleteTicketing: (id: string) => Promise<void>;
  onSynced?: () => Promise<void>;
};

function syncFlashVariant(message: string): 'error' | 'success' | 'info' {
  if (/error|escribe|dejes|zona/i.test(message)) return 'error';
  if (/sync ·/i.test(message)) return 'success';
  return 'info';
}

function money(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

export function EventTicketingPanel({
  closed,
  saving,
  canTicketing,
  eventId,
  ticketingSetups,
  ticketForm,
  setTicketForm,
  ticketZones,
  setTicketZones,
  editingTicketId,
  setEditingTicketId,
  onSaveTicketing,
  onEditTicketing,
  onDeleteTicketing,
  onSynced,
}: EventTicketingPanelProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  async function syncSold() {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await api<{ updated: number; total: number }>('/ticketing/sync', { method: 'POST' });
      setSyncMsg(`Sync · ${res.updated}/${res.total} setups`);
      if (onSynced) await onSynced();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Error sync');
    } finally {
      setSyncing(false);
    }
  }

  async function handleSave() {
    if (boleteraChoiceOf(ticketForm.boletera) === 'Otra' && !resolveBoleteraName('Otra', ticketForm.boletera)) {
      setSyncMsg('Escribe el nombre de la boletera (no dejes solo “Otra”).');
      return;
    }
    if (!ticketZonesReady(ticketZones)) {
      setSyncMsg('Nombra al menos una zona del venue.');
      return;
    }
    await onSaveTicketing();
  }

  function cancelEdit() {
    setEditingTicketId(null);
    setTicketZones(cloneTicketZones(DEFAULT_TICKET_ZONES));
  }

  return (
    <div className="stack">
      <PageHeader description="Configura la boletera del show: proveedor, hold y zonas del venue (cada auditorio es distinto).">
        {canTicketing && !closed ? (
          <button className="btn ghost" type="button" disabled={syncing} onClick={() => syncSold()}>
            {syncing ? 'Sincronizando…' : 'Sync boletera'}
          </button>
        ) : null}
      </PageHeader>
      {(process.env.NEXT_PUBLIC_TICKETING_SYNC_MODE || 'stub') === 'stub' ? (
        <FlashMessage variant="warn">
          Sync en modo demo. En producción conecta TICKETING_SYNC_MODE=live y TICKETING_SYNC_URL.
        </FlashMessage>
      ) : null}
      {syncMsg ? <FlashMessage variant={syncFlashVariant(syncMsg)}>{syncMsg}</FlashMessage> : null}

      {canTicketing && !closed ? (
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>{editingTicketId ? 'Editar boletera' : 'Nueva boletera'}</h2>
              <p className="muted kpi-sub" style={{ margin: '0.25rem 0 0' }}>
                Elige proveedor, fechas y el mapa de zonas del recinto.
              </p>
            </div>
            {editingTicketId ? (
              <button className="btn ghost" type="button" onClick={cancelEdit}>
                Cancelar edición
              </button>
            ) : null}
          </div>
          <div className="panel-body">
            <div className="form ticket-create-form">
              <section className="ticket-form-section">
                <h3 className="ticket-form-section__title">Proveedor y hold</h3>
                <FormGrid>
                  <BoleteraFields
                    eventId={eventId}
                    boletera={ticketForm.boletera}
                    logoUrl={ticketForm.logoUrl || null}
                    onBoleteraChange={(boletera) => setTicketForm({ ...ticketForm, boletera })}
                    onLogoUrlChange={(logoUrl) =>
                      setTicketForm({ ...ticketForm, logoUrl: logoUrl || '' })
                    }
                  />
                </FormGrid>
                <FormGrid cols={3}>
                  <label>
                    Hold hasta
                    <input
                      className="field"
                      type="date"
                      value={ticketForm.holdUntil}
                      onChange={(e) => setTicketForm({ ...ticketForm, holdUntil: e.target.value })}
                    />
                  </label>
                  <label>
                    Artista
                    <input
                      className="field"
                      value={ticketForm.artist}
                      onChange={(e) => setTicketForm({ ...ticketForm, artist: e.target.value })}
                      placeholder="Nombre artístico en cartel"
                    />
                  </label>
                  <label>
                    Promotor
                    <input
                      className="field"
                      value={ticketForm.promoter}
                      onChange={(e) => setTicketForm({ ...ticketForm, promoter: e.target.value })}
                      placeholder="Quién promueve el show"
                    />
                  </label>
                </FormGrid>
                <label>
                  Notas
                  <input
                    className="field"
                    value={ticketForm.notes}
                    onChange={(e) => setTicketForm({ ...ticketForm, notes: e.target.value })}
                    placeholder="Cortesías, cortes de hold, observaciones…"
                  />
                </label>
              </section>

              <section className="ticket-form-section">
                <TicketZonesEditor zones={ticketZones} onChange={setTicketZones} />
              </section>

              <button className="btn" type="button" disabled={saving} onClick={handleSave}>
                {saving
                  ? 'Guardando…'
                  : editingTicketId
                    ? 'Actualizar boletera'
                    : 'Crear boletera'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="panel-head">
          <h2>Configuraciones · {ticketingSetups?.length || 0}</h2>
          <Link className="btn ghost" href="/ticketing">
            Vista portfolio
          </Link>
        </div>
        <div className="panel-body stack">
          {(ticketingSetups || []).map((t) => {
            const zones = (t.zonesJson || []) as TicketZone[];
            const s = ticketZonesSummary(zones);
            return (
              <article key={t.id} className="ticket-card">
                <div className="ticket-card__head">
                  <div className="row row--tight" style={{ alignItems: 'center' }}>
                    {t.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoUrl} alt="" className="ticket-card__logo" />
                    ) : null}
                    <div>
                      <strong>{t.boletera}</strong>
                      <div className="muted kpi-sub">
                        Hold:{' '}
                        {t.holdUntil ? new Date(t.holdUntil).toLocaleDateString('es-MX') : '—'}
                        {t.artist ? ` · ${t.artist}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="panel-head-actions">
                    {canTicketing && !closed ? (
                      <>
                        <button
                          className="btn ghost btn-sm"
                          type="button"
                          onClick={() => onEditTicketing(t)}
                        >
                          Editar
                        </button>
                        <button
                          className="btn ghost btn-sm btn-danger"
                          type="button"
                          onClick={() => onDeleteTicketing(t.id)}
                        >
                          Eliminar
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="ticket-card__stats">
                  <div className="kpi kpi--inline">
                    <span className="label">Sell-through</span>
                    <strong>{s.pct}%</strong>
                    <span className="muted kpi-sub">
                      {s.sold.toLocaleString('es-MX')} / {s.aforo.toLocaleString('es-MX')} boletos
                      · {money(s.realized)} de {money(s.potential)}
                    </span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
                <p className="muted kpi-sub ticket-card__zones">
                  {zones.map((z) => `${z.zona}: ${z.sold ?? 0}/${z.aforo}`).join(' · ') ||
                    'Sin zonas'}
                </p>
              </article>
            );
          })}
          {!ticketingSetups?.length ? (
            <EmptyState
              title="Sin boletera aún"
              description="Arma las zonas del venue (pueden ser distintas en cada auditorio), captura aforo y precios."
              steps={[
                'Elige boletera (o escribe otra)',
                'Aplica un preset o nombra tus zonas',
                'Captura aforo / precio y guarda',
              ]}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
