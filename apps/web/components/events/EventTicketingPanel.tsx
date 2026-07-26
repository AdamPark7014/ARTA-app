'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { TicketingSetup } from '@/components/events/event-detail.types';
import { EmptyState } from '@/components/ui/EmptyState';
import { api } from '@/lib/api';

type TicketForm = {
  boletera: string;
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

export function EventTicketingPanel({
  closed,
  saving,
  canTicketing,
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

  return (
    <div className="stack">
      <div className="page-intro">
        <p className="muted">
          Aforo, vendidos y sell-through por zona. Sync rellena vendidos desde el provider (stub o{' '}
          <code>TICKETING_SYNC_URL</code>).
        </p>
        {canTicketing && !closed ? (
          <button className="btn ghost" type="button" disabled={syncing} onClick={() => syncSold()}>
            {syncing ? 'Sincronizando…' : 'Sync boletera'}
          </button>
        ) : null}
      </div>
      {syncMsg ? <div className="muted">{syncMsg}</div> : null}

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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <label>
                  Boletera
                  <select
                    value={ticketForm.boletera}
                    onChange={(e) => setTicketForm({ ...ticketForm, boletera: e.target.value })}
                  >
                    <option>Arema</option>
                    <option>eTicket</option>
                    <option>Otra</option>
                  </select>
                </label>
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
              </div>
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
              <button className="btn" type="button" disabled={saving} onClick={onSaveTicketing}>
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
        <div className="panel-body">
          {(ticketingSetups || []).map((t) => {
            const zones = (t.zonesJson || []) as TicketZone[];
            const s = zoneSummary(zones);
            return (
              <div key={t.id} className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <strong>{t.boletera}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Hold: {t.holdUntil ? new Date(t.holdUntil).toLocaleDateString('es-MX') : '—'} · Sell-through{' '}
                    {s.pct}% ({s.sold.toLocaleString('es-MX')}/{s.aforo.toLocaleString('es-MX')})
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {zones.map((z) => `${z.zona}:${z.sold ?? 0}/${z.aforo}`).join(' · ')}
                  </div>
                </div>
                <div className="row">
                  {canTicketing && !closed ? (
                    <>
                      <button className="btn ghost" type="button" onClick={() => onEditTicketing(t)}>
                        Editar
                      </button>
                      <button className="btn ghost" type="button" onClick={() => onDeleteTicketing(t.id)}>
                        Eliminar
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
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
