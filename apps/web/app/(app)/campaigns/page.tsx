'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FieldSearch,
  FilterBar,
  FlashMessage,
  FormGrid,
  PageHeader,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';

type CampaignData = {
  channels?: string;
  budget?: number;
  mediaPlan?: string;
  creatives?: string;
  timeline?: string;
};

type CampaignRow = {
  id: string;
  type: string;
  authorized: boolean;
  notes?: string | null;
  dataJson?: CampaignData | null;
  event: { id: string; name: string; entity: string; artist?: string | null; status: string };
};

export default function CampaignsPage() {
  const { user, entity } = useUser();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CampaignRow | null>(null);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    type: 'INTERNAL',
    notes: '',
    channels: '',
    budget: '',
    mediaPlan: '',
    creatives: '',
    timeline: '',
  });
  const [msg, setMsg] = useState('');
  const canEdit = user
    ? userHasPermission(user.roleKey, user.permissions, ['campaign.edit', 'everything'])
    : false;

  async function load() {
    setLoading(true);
    try {
      const data = await api<CampaignRow[]>('/campaigns');
      const filtered = data.filter((r) => r.event.entity === entity);
      setRows(filtered);
      if (selected) {
        const refreshed = filtered.find((r) => r.id === selected.id);
        if (refreshed) openEditor(refreshed);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const n = q.toLowerCase();
    return rows.filter(
      (r) =>
        r.event.name.toLowerCase().includes(n) ||
        (r.event.artist || '').toLowerCase().includes(n) ||
        r.type.toLowerCase().includes(n),
    );
  }, [rows, q]);

  function openEditor(r: CampaignRow) {
    setSelected(r);
    const dj = r.dataJson || {};
    setForm({
      type: r.type,
      notes: r.notes || '',
      channels: dj.channels || '',
      budget: dj.budget != null ? String(dj.budget) : '',
      mediaPlan: dj.mediaPlan || '',
      creatives: dj.creatives || '',
      timeline: dj.timeline || '',
    });
  }

  async function save() {
    if (!selected || !canEdit) return;
    setMsg('');
    try {
      await api(`/campaigns/event/${selected.event.id}`, {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          notes: form.notes || undefined,
          dataJson: {
            channels: form.channels,
            budget: form.budget ? Number(form.budget) : 0,
            mediaPlan: form.mediaPlan,
            creatives: form.creatives,
            timeline: form.timeline,
          },
        }),
      });
      setMsg('Campaña guardada');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  async function toggleAuth(eventId: string, authorized: boolean) {
    await api(`/campaigns/event/${eventId}`, {
      method: 'POST',
      body: JSON.stringify({ authorized }),
    });
    await load();
  }

  const pendingAuth = rows.filter((r) => !r.authorized).length;
  const msgVariant =
    msg === 'Campaña guardada' ? 'success' : msg.toLowerCase().includes('error') ? 'error' : 'info';

  return (
    <AppShell title="Campañas · Media control">
      <div className="stack page-workspace">
        <PageHeader
          description={`Control de campañas: autorización, presupuesto y backlog. ${pendingAuth} pendientes de auth. Entidad: ${entity}.`}
        >
          <ActionLink href="/events" variant="ghost">Ir a eventos</ActionLink>
        </PageHeader>

        {msg ? (
          <FlashMessage variant={msgVariant} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {loading ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={5} label="Cargando campañas…" />
          </>
        ) : (
          <>
            <div className="grid-cards kpi-grid-dense">
              <div className="kpi">
                <div className="label">Campañas</div>
                <div className="value">{rows.length}</div>
              </div>
              <div className="kpi">
                <div className="label">Autorizadas</div>
                <div className="value">{rows.filter((r) => r.authorized).length}</div>
              </div>
              <div className={`kpi ${pendingAuth ? 'kpi--danger' : ''}`}>
                <div className="label">Pend. auth</div>
                <div className="value">{pendingAuth}</div>
              </div>
              <div className="kpi">
                <div className="label">Budget total</div>
                <div className="value" style={{ fontSize: '1.15rem' }}>
                  $
                  {Math.round(
                    rows.reduce((s, r) => s + Number(r.dataJson?.budget || 0), 0),
                  ).toLocaleString('es-MX')}
                </div>
              </div>
            </div>

            <FilterBar meta={`${filtered.length} campañas`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar evento, artista, tipo…"
                label="Buscar campaña"
                maxWidth={300}
              />
            </FilterBar>

            <div
              style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.1fr' : '1fr', gap: 16 }}
            >
              <div className="panel">
                <div className="panel-head">
                  <h2>Campañas · {entity === 'ARTA' ? 'Arta' : 'Auditorio'}</h2>
                </div>
                <div className="panel-body">
                  <div className="table-wrap">
                    <table className="table table-sticky">
                      <thead>
                        <tr>
                          <th>Evento</th>
                          <th>Tipo</th>
                          <th>Status</th>
                          <th>Auth</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <button className="btn ghost" type="button" onClick={() => openEditor(r)}>
                                <strong>{r.event.name}</strong>
                              </button>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {r.event.artist || '—'}
                              </div>
                            </td>
                            <td className="muted">{r.type}</td>
                            <td>
                              <StatusBadge value={r.event.status} kind="event" />
                            </td>
                            <td>
                              <StatusBadge
                                value={r.authorized ? 'healthy' : 'watch'}
                                kind="risk"
                              />
                            </td>
                            <td>
                              <div className="row" style={{ gap: 4 }}>
                                <Link className="btn ghost" href={`/events/${r.event.id}`}>
                                  Evento
                                </Link>
                                {canEdit && !r.authorized ? (
                                  <button
                                    className="btn ghost"
                                    type="button"
                                    onClick={() => toggleAuth(r.event.id, true)}
                                  >
                                    Autorizar
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!filtered.length ? (
                          <tr>
                            <td colSpan={5}>
                              <EmptyState
                                title={
                                  rows.length === 0
                                    ? 'Sin campañas en esta entidad'
                                    : 'Sin campañas en este filtro'
                                }
                                description={
                                  rows.length === 0
                                    ? 'Las campañas nacen al crear un evento con tipo interna/externa. Abre un evento para editar media plan y presupuesto.'
                                    : 'Limpia la búsqueda para ver todas las campañas.'
                                }
                                steps={
                                  rows.length === 0
                                    ? [
                                        'Crea o abre un evento',
                                        'Configura campaña en el panel del evento',
                                        'Autoriza desde aquí cuando el plan esté listo',
                                      ]
                                    : undefined
                                }
                                actionHref={rows.length === 0 ? '/events' : undefined}
                                actionLabel={rows.length === 0 ? 'Ir a eventos' : undefined}
                              >
                                {rows.length && q.trim() ? (
                                  <button className="btn ghost" type="button" onClick={() => setQ('')}>
                                    Limpiar búsqueda
                                  </button>
                                ) : null}
                              </EmptyState>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {selected ? (
                <div className="panel">
                  <div className="panel-head">
                    <h2>{selected.event.name}</h2>
                    <button className="btn ghost" type="button" onClick={() => setSelected(null)}>
                      Cerrar
                    </button>
                  </div>
                  <div className="panel-body">
                    <div className="form">
                      <FormGrid cols={2}>
                        <label>
                          Tipo
                          <select
                            disabled={!canEdit}
                            value={form.type}
                            onChange={(e) => setForm({ ...form, type: e.target.value })}
                          >
                            <option value="INTERNAL">Interna</option>
                            <option value="EXTERNAL">Externa</option>
                            <option value="NONE">Ninguna</option>
                          </select>
                        </label>
                        <label>
                          Presupuesto
                          <input
                            type="number"
                            disabled={!canEdit}
                            value={form.budget}
                            onChange={(e) => setForm({ ...form, budget: e.target.value })}
                          />
                        </label>
                      </FormGrid>
                      <label>
                        Canales
                        <input
                          disabled={!canEdit}
                          value={form.channels}
                          onChange={(e) => setForm({ ...form, channels: e.target.value })}
                        />
                      </label>
                      <label>
                        Plan de medios
                        <textarea
                          rows={3}
                          disabled={!canEdit}
                          value={form.mediaPlan}
                          onChange={(e) => setForm({ ...form, mediaPlan: e.target.value })}
                        />
                      </label>
                      <label>
                        Creatividades
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={form.creatives}
                          onChange={(e) => setForm({ ...form, creatives: e.target.value })}
                        />
                      </label>
                      <label>
                        Timeline
                        <input
                          disabled={!canEdit}
                          value={form.timeline}
                          onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                        />
                      </label>
                      <label>
                        Notas
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        />
                      </label>
                      {canEdit ? (
                        <button className="btn" type="button" onClick={save}>
                          Guardar campaña
                        </button>
                      ) : (
                        <p className="muted">Solo lectura — Melissa y Williams editan campañas.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
