'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TicketingSetup } from '@/components/events/event-detail.types';
import { BoleteraFields, resolveBoleteraName } from '@/components/ticketing/BoleteraFields';
import { boleteraChoiceOf } from '@/lib/boletera';
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

type TicketZone = { zona: string; aforo: number; precio: number; sold: number };

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

function zoneSummary(zones: Array<{ aforo: number; sold?: number }>) {
  const aforo = zones.reduce((s, z) => s + Number(z.aforo || 0), 0);
  const sold = zones.reduce((s, z) => s + Number(z.sold || 0), 0);
  const pct = aforo > 0 ? Math.round((sold / aforo) * 100) : 0;
  return { aforo, sold, pct };
}

function syncFlashVariant(message: string): 'error' | 'success' | 'info' {
  if (/error|escribe|dejes/i.test(message)) return 'error';
  if (/sync ·/i.test(message)) return 'success';
  return 'info';
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
    await onSaveTicketing();
  }

  return (
    <div className="stack">
      <PageHeader description="Aforo, vendidos y sell-through por zona. Sync rellena vendidos desde el provider (stub o TICKETING_SYNC_URL).">
        {canTicketing && !closed ? (
          <button className="btn ghost" type="button" disabled={syncing} onClick={() => syncSold()}>
            {syncing ? 'Sincronizando…' : 'Sync boletera'}
          </button>
        ) : null}
      </PageHeader>
      {(process.env.NEXT_PUBLIC_TICKETING_SYNC_MODE || 'stub') === 'stub' ? (
        <FlashMessage variant="warn">
          Sync boletera en modo demo (stub). Configura TICKETING_SYNC_MODE=live y TICKETING_SYNC_URL
          para conectar Arema en producción.
        </FlashMessage>
      ) : null}
      {syncMsg ? <FlashMessage variant={syncFlashVariant(syncMsg)}>{syncMsg}</FlashMessage> : null}

      {canTicketing && !closed ? (
        <div className="panel">
          <div className="panel-head">
            <h2>{editingTicketId ? 'Editar boletera' : 'Nueva boletera'}</h2>
            {editingTicketId ? (
              <button className="btn ghost" type="button" onClick={() => setEditingTicketId(null)}>
                Cancelar edición
              </button>
            ) : null}
          </div>
          <div className="panel-body">
            <div className="form">
              <FormGrid>
                <BoleteraFields
                  eventId={eventId}
                  boletera={ticketForm.boletera}
                  logoUrl={ticketForm.logoUrl || null}
                  onBoleteraChange={(boletera) => setTicketForm({ ...ticketForm, boletera })}
                  onLogoUrlChange={(logoUrl) => setTicketForm({ ...ticketForm, logoUrl: logoUrl || '' })}
                />
              </FormGrid>
              <FormGrid cols={3}>
                <label>
                  Hold hasta
                  <input
                    type="date"
                    value={ticketForm.holdUntil}
                    onChange={(e) => setTicketForm({ ...ticketForm, holdUntil: e.target.value })}
                  />
                </label>
                <label>
                  Artista
                  <input
                    value={ticketForm.artist}
                    onChange={(e) => setTicketForm({ ...ticketForm, artist: e.target.value })}
                  />
                </label>
              </FormGrid>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Zona</th>
                      <th className="num">Aforo</th>
                      <th className="num">Vendidos</th>
                      <th className="num">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketZones.map((z, i) => (
                      <tr key={z.zona}>
                        <td>{z.zona}</td>
                        <td className="num">
                          <input
                            type="number"
                            value={z.aforo}
                            onChange={(e) => {
                              const next = [...ticketZones];
                              next[i] = { ...z, aforo: Number(e.target.value) };
                              setTicketZones(next);
                            }}
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            value={z.sold}
                            onChange={(e) => {
                              const next = [...ticketZones];
                              next[i] = { ...z, sold: Number(e.target.value) };
                              setTicketZones(next);
                            }}
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            value={z.precio}
                            onChange={(e) => {
                              const next = [...ticketZones];
                              next[i] = { ...z, precio: Number(e.target.value) };
                              setTicketZones(next);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label>
                Notas
                <input
                  value={ticketForm.notes}
                  onChange={(e) => setTicketForm({ ...ticketForm, notes: e.target.value })}
                />
              </label>
              <button className="btn" type="button" disabled={saving} onClick={handleSave}>
                {saving ? 'Guardando…' : editingTicketId ? 'Actualizar' : 'Crear boletera'}
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
            const s = zoneSummary(zones);
            return (
              <article key={t.id} className="ticket-card">
                <div className="ticket-card__head">
                  <div className="row row--tight" style={{ alignItems: 'center' }}>
                    {t.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={t.logoUrl}
                        alt=""
                        className="ticket-card__logo"
                      />
                    ) : null}
                    <div>
                      <strong>{t.boletera}</strong>
                      <div className="muted kpi-sub">
                        Hold: {t.holdUntil ? new Date(t.holdUntil).toLocaleDateString('es-MX') : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="panel-head-actions">
                    {canTicketing && !closed ? (
                      <>
                        <button className="btn ghost btn-sm" type="button" onClick={() => onEditTicketing(t)}>
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
                    </span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
                <p className="muted kpi-sub ticket-card__zones">
                  {zones.map((z) => `${z.zona}: ${z.sold ?? 0}/${z.aforo}`).join(' · ')}
                </p>
              </article>
            );
          })}
          {!ticketingSetups?.length ? (
            <EmptyState
              title="Sin boletera aún"
              description="Configura zonas y aforo para medir sell-through del show."
              steps={['Elige boletera', 'Captura aforo y precios', 'Registra vendidos o corre Sync']}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
