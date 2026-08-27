'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  FieldSearch,
  FieldSelect,
  FilterBar,
  FlashMessage,
  PageHeader,
} from '@/components/ui/PageChrome';
import { api } from '@/lib/api';

type AuditIntel = {
  kpis: {
    events30d: number;
    uniqueActors: number;
    uniqueActions: number;
    destructive: number;
  };
  topActions: Array<{ action: string; count: number }>;
  topUsers: Array<{ user: string; count: number }>;
  byResource: Record<string, number>;
  anomalies: Array<{ id: string; action: string; resource: string; at: string; user: string }>;
  logs: Array<{
    id: string;
    action: string;
    resource: string;
    resourceId?: string | null;
    createdAt: string;
    user?: { fullName: string; email: string } | null;
  }>;
};

export default function AuditPage() {
  const [data, setData] = useState<AuditIntel | null>(null);
  const [loading, setLoading] = useState(true);
  const [resource, setResource] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setError('');
    setLoading(true);
    try {
      const intel = await api<AuditIntel>('/analytics/audit?take=250');
      setData(intel);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  const rows = useMemo(() => {
    let list = data?.logs || [];
    if (resource) list = list.filter((r) => r.resource === resource);
    if (q.trim()) {
      const n = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.action.toLowerCase().includes(n) ||
          (r.user?.fullName || '').toLowerCase().includes(n) ||
          r.resource.toLowerCase().includes(n),
      );
    }
    return list;
  }, [data, resource, q]);

  const k = data?.kpis;
  const filterActive = !!resource || !!q.trim();

  return (
    <AppShell title="Compliance · Audit">
      <div className="stack page-workspace">
        <PageHeader
          description="Inteligencia de auditoría: volumen, actores, acciones destructivas y anomalías (30 días)."
        />

        {loading && !data ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={6} label="Cargando timeline de auditoría…" />
          </>
        ) : (
          <>
            {k ? (
              <div className="grid-cards kpi-grid-dense">
                <div className="kpi">
                  <div className="label">Eventos 30d</div>
                  <div className="value">{k.events30d}</div>
                </div>
                <div className="kpi">
                  <div className="label">Actores</div>
                  <div className="value">{k.uniqueActors}</div>
                </div>
                <div className="kpi">
                  <div className="label">Acciones distintas</div>
                  <div className="value">{k.uniqueActions}</div>
                </div>
                <div className={`kpi ${k.destructive ? 'kpi--danger' : ''}`}>
                  <div className="label">Destructivas</div>
                  <div className="value">{k.destructive}</div>
                </div>
              </div>
            ) : null}

            {data ? (
              <div className="dash-split">
                <div className="panel">
                  <div className="panel-head">
                    <h2>Top acciones</h2>
                  </div>
                  <div className="panel-body">
                    <DistBar
                      segments={data.topActions.slice(0, 6).map((a, i) => ({
                        label: a.action,
                        value: a.count,
                        tone: (['ok', 'warn', 'muted', 'danger'] as const)[i % 4],
                      }))}
                    />
                    <ul className="compact-list" style={{ marginTop: 12 }}>
                      {data.topActions.map((a) => (
                        <li key={a.action}>
                          <code style={{ fontSize: 12 }}>{a.action}</code>
                          <span className="muted">{a.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <h2>Anomalías / riesgo</h2>
                  </div>
                  <div className="panel-body">
                    {!data.anomalies.length ? (
                      <EmptyState
                        title="Sin señales destructivas"
                        description="No hay acciones de alto riesgo en la ventana reciente."
                      />
                    ) : (
                      <ul className="compact-list">
                        {data.anomalies.map((a) => (
                          <li key={a.id}>
                            <span>
                              <strong>{a.action}</strong>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {a.user} · {a.resource}
                              </div>
                            </span>
                            <span className="muted">{new Date(a.at).toLocaleDateString('es-MX')}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <FilterBar meta={`${rows.length} de ${data?.logs.length ?? 0} eventos`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar acción o usuario…"
                label="Buscar acción o usuario"
                maxWidth={260}
              />
              <FieldSelect
                value={resource}
                onChange={setResource}
                label="Filtrar por recurso"
                options={[
                  { value: '', label: 'Todos los recursos' },
                  { value: 'Event', label: 'Evento' },
                  { value: 'ChecklistInstance', label: 'Checklist' },
                  { value: 'PageContent', label: 'Studio' },
                  { value: 'System', label: 'Sistema' },
                ]}
              />
              <button className="btn ghost" type="button" disabled={loading} onClick={() => load()}>
                {loading ? 'Refrescando…' : 'Refrescar'}
              </button>
            </FilterBar>
            {error ? (
              <FlashMessage variant="error" onDismiss={() => setError('')}>
                {error}
              </FlashMessage>
            ) : null}
            <div className="panel">
              <div className="panel-head">
                <h2>Timeline · {rows.length}</h2>
              </div>
              <div className="panel-body">
                {!rows.length ? (
                  <EmptyState
                    title={
                      (data?.logs.length || 0) === 0
                        ? 'Sin eventos de auditoría'
                        : 'Sin coincidencias en el filtro'
                    }
                    description={
                      (data?.logs.length || 0) === 0
                        ? 'Las acciones de usuarios aparecerán aquí conforme operen el sistema.'
                        : 'Cambia recurso o limpia la búsqueda.'
                    }
                  >
                    {filterActive && (data?.logs.length || 0) > 0 ? (
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => {
                          setResource('');
                          setQ('');
                        }}
                      >
                        Limpiar filtros
                      </button>
                    ) : null}
                  </EmptyState>
                ) : (
                  <div className="table-wrap">
                    <table className="table table-sticky">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Usuario</th>
                          <th>Acción</th>
                          <th>Recurso</th>
                          <th>ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id}>
                            <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                              {new Date(r.createdAt).toLocaleString('es-MX')}
                            </td>
                            <td>
                              {r.user?.fullName || '—'}
                              <div className="muted" style={{ fontSize: 11 }}>
                                {r.user?.email || ''}
                              </div>
                            </td>
                            <td>
                              <code>{r.action}</code>
                            </td>
                            <td>{r.resource}</td>
                            <td className="muted" style={{ fontSize: 11 }}>
                              {r.resourceId || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
