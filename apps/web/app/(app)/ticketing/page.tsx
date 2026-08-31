'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { money } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FieldSearch,
  FieldSelect,
  FlashMessage,
  FormGrid,
  PageHeader,
  FilterBar,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';
import { userHasPermission } from '@/lib/access-matrix';
import { BoleteraFields, resolveBoleteraName } from '@/components/ticketing/BoleteraFields';
import { boleteraChoiceOf } from '@/lib/boletera';

type Zone = { zona: string; aforo: number; precio: number; sold?: number };
type Setup = {
  id: string;
  boletera: string;
  logoUrl?: string | null;
  holdUntil?: string | null;
  artist?: string | null;
  promoter?: string | null;
  notes?: string | null;
  zonesJson: Zone[];
  event: { id: string; name: string; entity: string };
};

type EventOpt = { id: string; name: string; entity: string };

const DEFAULT_ZONES: Zone[] = [
  { zona: 'Diamante', aforo: 0, precio: 0, sold: 0 },
  { zona: 'Oro', aforo: 0, precio: 0, sold: 0 },
  { zona: 'Plata', aforo: 0, precio: 0, sold: 0 },
  { zona: 'Bronce', aforo: 0, precio: 0, sold: 0 },
];

function flashVariant(msg: string): 'info' | 'success' | 'error' | 'warn' {
  if (/error|inválid/i.test(msg)) return 'error';
  if (/cread|actualiz|copiad|sync/i.test(msg)) return 'success';
  return 'info';
}

export default function TicketingPage() {
  const { entity, user } = useUser();
  const canEdit = userHasPermission(user?.roleKey || '', user?.permissions || [], [
    'ticketing.edit',
    'everything',
  ]);
  const [rows, setRows] = useState<Setup[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [kpis, setKpis] = useState<{
    setups: number;
    capacityTotal: number;
    soldTotal?: number;
    sellThroughPct?: number;
    potentialRevenue: number;
    realizedRevenue?: number;
    avgTicket: number;
    holdRisk: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    eventId: '',
    boletera: 'Arema',
    logoUrl: '',
    holdUntil: '',
    artist: '',
    promoter: '',
    notes: '',
  });
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [t, e, analytics] = await Promise.all([
        api<Setup[]>('/ticketing'),
        api<EventOpt[]>(`/events?entity=${entity}`),
        api<{
          kpis: {
            setups: number;
            capacityTotal: number;
            soldTotal?: number;
            sellThroughPct?: number;
            potentialRevenue: number;
            realizedRevenue?: number;
            avgTicket: number;
            holdRisk: number;
          };
        }>(`/analytics/ticketing?entity=${entity}`).catch(() => null),
      ]);
      setRows(t.filter((r) => r.event.entity === entity));
      setEvents(e);
      if (analytics) setKpis(analytics.kpis);
      if (!form.eventId && e[0]) setForm((f) => ({ ...f, eventId: e[0].id }));
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
        r.boletera.toLowerCase().includes(n) ||
        (r.artist || '').toLowerCase().includes(n),
    );
  }, [rows, q]);

  const eventOptions = useMemo(
    () => [
      { value: '', label: 'Selecciona…' },
      ...events.map((ev) => ({ value: ev.id, label: ev.name })),
    ],
    [events],
  );

  function startEdit(r: Setup) {
    setEditingId(r.id);
    setForm({
      eventId: r.event.id,
      boletera: r.boletera,
      logoUrl: r.logoUrl || '',
      holdUntil: r.holdUntil ? r.holdUntil.slice(0, 10) : '',
      artist: r.artist || '',
      promoter: r.promoter || '',
      notes: r.notes || '',
    });
    setZones(
      (r.zonesJson || []).map((z) => ({
        zona: z.zona,
        aforo: Number(z.aforo || 0),
        precio: Number(z.precio || 0),
        sold: Number(z.sold || 0),
      })),
    );
  }

  function resetForm() {
    setEditingId(null);
    setZones(DEFAULT_ZONES.map((z) => ({ ...z })));
    setForm((f) => ({
      ...f,
      boletera: 'Arema',
      logoUrl: '',
      holdUntil: '',
      artist: '',
      promoter: '',
      notes: '',
    }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    if (boleteraChoiceOf(form.boletera) === 'Otra' && !resolveBoleteraName('Otra', form.boletera)) {
      setMsg('Escribe el nombre de la boletera (no dejes solo “Otra”).');
      return;
    }
    const payload = {
      boletera: form.boletera,
      logoUrl: form.logoUrl || '',
      holdUntil: form.holdUntil || undefined,
      artist: form.artist || undefined,
      promoter: form.promoter || undefined,
      notes: form.notes || undefined,
      zonesJson: zones,
    };
    try {
      if (editingId) {
        await api(`/ticketing/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setMsg('Boletera actualizada');
      } else {
        await api(`/ticketing/event/${form.eventId}`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg('Boletera creada');
      }
      resetForm();
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Error');
    }
  }

  async function remove(id: string) {
    await api(`/ticketing/${id}`, { method: 'DELETE' });
    if (editingId === id) resetForm();
    await load();
  }

  return (
    <AppShell title="Boletera">
      <div className="stack page-workspace">
        <PageHeader
          description="Performance de boletera: aforo, vendidos, sell-through y revenue potencial vs realizado."
          hint="Sync rellena vendidos vía integración (Arema). Revisa holds vencidos — aparecen marcados en la tabla."
        >
          {canEdit ? (
            <button
              className="btn ghost"
              type="button"
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                try {
                  const res = await api<{ updated: number; total: number }>('/ticketing/sync', {
                    method: 'POST',
                  });
                  setMsg(`Sync boletera · actualizados ${res.updated}/${res.total}`);
                  await load();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : 'Error sync');
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? 'Sincronizando…' : 'Sync boletera ahora'}
            </button>
          ) : null}
        </PageHeader>

        {msg ? (
          <FlashMessage variant={flashVariant(msg)} onDismiss={() => setMsg('')}>
            {msg}
          </FlashMessage>
        ) : null}

        {loading && !kpis ? (
          <>
            <LoadingKpis count={5} />
            <LoadingBlock rows={4} label="Cargando boletera…" />
          </>
        ) : null}

        {!loading && kpis ? (
          <div className="grid-cards kpi-grid-dense">
            <div className="kpi">
              <div className="label">Setups</div>
              <div className="value">{kpis.setups}</div>
            </div>
            <div className="kpi">
              <div className="label">Aforo</div>
              <div className="value">{kpis.capacityTotal.toLocaleString('es-MX')}</div>
            </div>
            <div className="kpi">
              <div className="label">Vendidos</div>
              <div className="value">{(kpis.soldTotal ?? 0).toLocaleString('es-MX')}</div>
            </div>
            <div className="kpi">
              <div className="label">Sell-through</div>
              <div className="value">{kpis.sellThroughPct ?? 0}%</div>
            </div>
            <div className="kpi">
              <div className="label">Revenue potencial</div>
              <div className="value value--money">{money(kpis.potentialRevenue)}</div>
            </div>
            <div className="kpi">
              <div className="label">Revenue realizado</div>
              <div className="value value--money">{money(kpis.realizedRevenue ?? 0)}</div>
            </div>
            <div className={`kpi ${kpis.holdRisk ? 'kpi--danger' : ''}`}>
              <div className="label">Hold en riesgo</div>
              <div className="value">
                {kpis.holdRisk ? <StatusBadge value="critical" kind="risk" /> : '0'}
              </div>
            </div>
          </div>
        ) : null}

        {canEdit ? (
        <div className="panel">
          <div className="panel-head">
            <h2>{editingId ? 'Editar configuración' : 'Nueva configuración'}</h2>
            {editingId ? (
              <button className="btn ghost" type="button" onClick={resetForm}>
                Cancelar
              </button>
            ) : null}
          </div>
          <div className="panel-body">
            <form className="form" onSubmit={onSubmit}>
              <label>
                Evento
                {editingId ? (
                  <select disabled value={form.eventId} aria-label="Evento">
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <FieldSelect
                    label="Evento"
                    value={form.eventId}
                    onChange={(eventId) => setForm({ ...form, eventId })}
                    options={eventOptions}
                  />
                )}
              </label>
              <FormGrid cols={2}>
                <BoleteraFields
                  eventId={form.eventId || undefined}
                  boletera={form.boletera}
                  logoUrl={form.logoUrl || null}
                  onBoleteraChange={(boletera) => setForm({ ...form, boletera })}
                  onLogoUrlChange={(logoUrl) => setForm({ ...form, logoUrl: logoUrl || '' })}
                />
              </FormGrid>
              <FormGrid cols={3}>
                <label>
                  Hold hasta
                  <input
                    type="date"
                    value={form.holdUntil}
                    onChange={(e) => setForm({ ...form, holdUntil: e.target.value })}
                  />
                </label>
                <label>
                  Artista
                  <input
                    value={form.artist}
                    onChange={(e) => setForm({ ...form, artist: e.target.value })}
                  />
                </label>
                <label>
                  Promotor
                  <input
                    value={form.promoter}
                    onChange={(e) => setForm({ ...form, promoter: e.target.value })}
                  />
                </label>
              </FormGrid>

              <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Zona</th>
                    <th>Aforo</th>
                    <th>Vendidos</th>
                    <th>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z, i) => (
                    <tr key={z.zona}>
                      <td>{z.zona}</td>
                      <td>
                        <input
                          type="number"
                          value={z.aforo}
                          onChange={(e) => {
                            const next = [...zones];
                            next[i] = { ...z, aforo: Number(e.target.value) };
                            setZones(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={z.sold ?? 0}
                          onChange={(e) => {
                            const next = [...zones];
                            next[i] = { ...z, sold: Number(e.target.value) };
                            setZones(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={z.precio}
                          onChange={(e) => {
                            const next = [...zones];
                            next[i] = { ...z, precio: Number(e.target.value) };
                            setZones(next);
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
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </label>

              <button className="btn" type="submit" disabled={!editingId && !form.eventId}>
                {editingId ? 'Actualizar boletera' : 'Guardar boletera'}
              </button>
            </form>
          </div>
        </div>
        ) : null}

        <div className="panel">
          <div className="panel-head">
            <h2>Configuraciones · {entity}</h2>
          </div>
          <div className="panel-body">
            <FilterBar meta={`${filtered.length} de ${rows.length} setups`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar evento o boletera…"
                label="Buscar configuraciones"
              />
            </FilterBar>

            {loading ? (
              <LoadingBlock rows={3} label="Cargando setups…" />
            ) : !rows.length ? (
              <EmptyState
                title="Sin boleteras en esta entidad"
                description="Crea un setup con zonas/aforo o sincroniza vendidos cuando exista la integración."
                actionHref="/events"
                actionLabel="Ir a eventos"
              />
            ) : !filtered.length ? (
              <EmptyState
                title="Sin coincidencias"
                description="Prueba otro término de búsqueda."
              />
            ) : (
              <div className="table-wrap">
              <table className="table table-sticky">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Boletera</th>
                    <th>Hold</th>
                    <th>Zonas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const holdExpired =
                      r.holdUntil && new Date(r.holdUntil).getTime() < Date.now();
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/events/${r.event.id}`}>{r.event.name}</Link>
                        </td>
                        <td>
                          <div className="row">
                            {r.logoUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.logoUrl} alt="" className="ticket-card__logo" />
                            ) : null}
                            <span>{r.boletera}</span>
                          </div>
                        </td>
                        <td>
                          {r.holdUntil ? (
                            <span className="row">
                              {new Date(r.holdUntil).toLocaleDateString('es-MX')}
                              {holdExpired ? <StatusBadge value="watch" kind="risk" /> : null}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="kpi-sub muted">
                          {(r.zonesJson || []).map((z) => `${z.zona}:${z.aforo}`).join(' · ')}
                        </td>
                        <td className="row">
                          {canEdit ? (
                            <>
                              <button className="btn ghost" type="button" onClick={() => startEdit(r)}>
                                Editar
                              </button>
                              <button className="btn ghost" type="button" onClick={() => remove(r.id)}>
                                Eliminar
                              </button>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
