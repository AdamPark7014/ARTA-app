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
import {
  auditActionLabel,
  auditResourceLabel,
  hasAuditActionLabel,
  isNotableAction,
} from '@/lib/audit-labels';

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
          auditActionLabel(r.action).toLowerCase().includes(n) ||
          (r.user?.fullName || '').toLowerCase().includes(n) ||
          r.resource.toLowerCase().includes(n) ||
          auditResourceLabel(r.resource).toLowerCase().includes(n),
      );
    }
    return list;
  }, [data, resource, q]);

  const k = data?.kpis;
  const filterActive = !!resource || !!q.trim();

  return (
    <AppShell title="Auditoría">
      <div className="stack page-workspace">
        <PageHeader
          description="Quién tocó qué en los últimos 30 días: cada movimiento con su autor, su fecha y el documento al que le pasó."
          hint="Las acciones marcadas en ámbar deshacen, borran o esquivan un control — no son errores, son las que conviene poder explicar."
        />

        {loading && !data ? (
          <>
            <LoadingKpis count={4} />
            <LoadingBlock rows={6} label="Cargando movimientos…" />
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
                    <h2>Lo que más se hace</h2>
                  </div>
                  <div className="panel-body">
                    <DistBar
                      segments={(data.topActions ?? []).slice(0, 6).map((a, i) => ({
                        label: auditActionLabel(a.action),
                        value: a.count,
                        tone: (['ok', 'warn', 'muted', 'danger'] as const)[i % 4],
                      }))}
                    />
                    <ul className="compact-list" style={{ marginTop: 12 }}>
                      {(data.topActions ?? []).map((a) => (
                        <li key={a.action}>
                          <span>{auditActionLabel(a.action)}</span>
                          <span className="muted">{a.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head">
                    <h2>Para revisar</h2>
                  </div>
                  <div className="panel-body">
                    {!(data.anomalies ?? []).length ? (
                      <EmptyState
                        title="Nada que revisar"
                        description="Nadie borró ni deshizo nada en los últimos 30 días."
                      />
                    ) : (
                      <ul className="compact-list">
                        {(data.anomalies ?? []).map((a) => (
                          <li key={a.id}>
                            <span>
                              <strong>{auditActionLabel(a.action)}</strong>
                              <div className="muted" style={{ fontSize: 11 }}>
                                {a.user} · {auditResourceLabel(a.resource)}
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

            <FilterBar meta={`${rows.length} de ${data?.logs?.length ?? 0} eventos`}>
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder="Buscar persona, acción o documento…"
                label="Buscar acción o usuario"
                maxWidth={260}
              />
              <FieldSelect
                value={resource}
                onChange={setResource}
                label="Filtrar por recurso"
                options={[
                  { value: '', label: 'Todo' },
                  { value: 'Event', label: 'Eventos' },
                  { value: 'ChecklistInstance', label: 'Formatos' },
                  { value: 'PurchaseOrder', label: 'Órdenes de compra' },
                  { value: 'FinanceRun', label: 'Corridas' },
                  { value: 'EventFile', label: 'Archivos' },
                  { value: 'User', label: 'Personas' },
                  { value: 'PageContent', label: 'Sitio público' },
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
                <h2>Movimientos · {rows.length}</h2>
              </div>
              <div className="panel-body">
                {!rows.length ? (
                  <EmptyState
                    title={
                      (data?.logs?.length ?? 0) === 0
                        ? 'Sin eventos de auditoría'
                        : 'Sin coincidencias en el filtro'
                    }
                    description={
                      (data?.logs?.length ?? 0) === 0
                        ? 'Cada movimiento del equipo se irá anotando aquí conforme trabajen.'
                        : 'Cambia recurso o limpia la búsqueda.'
                    }
                  >
                    {filterActive && (data?.logs?.length ?? 0) > 0 ? (
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
                          <th>Cuándo</th>
                          <th>Quién</th>
                          <th>Qué hizo</th>
                          <th>Dónde</th>
                          <th>Referencia</th>
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
                              <span className={isNotableAction(r.action) ? 'audit-notable' : ''}>
                                {auditActionLabel(r.action)}
                              </span>
                              {/*
                                El identificador crudo se queda a la vista, en
                                pequeño: cuando algo se discute en serio hace
                                falta el dato exacto, no la traducción.
                              */}
                              {hasAuditActionLabel(r.action) ? (
                                <div className="muted audit-raw">{r.action}</div>
                              ) : null}
                            </td>
                            <td>{auditResourceLabel(r.resource)}</td>
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
