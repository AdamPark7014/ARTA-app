'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { DistBar } from '@/components/charts/SparkBars';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock, LoadingKpis } from '@/components/ui/LoadingBlock';
import {
  ActionLink,
  FieldCheck,
  FieldSearch,
  FieldSelect,
  FilterBar,
  PageHeader,
} from '@/components/ui/PageChrome';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

type ChecklistData = {
  sections?: Array<{
    id: string;
    items: Array<{ id: string; label: string; value?: string | number | null; done?: boolean }>;
  }>;
};

type OpsRow = {
  checklistId: string;
  title: string;
  progressPct: number;
  templateKey: string;
  deliveredAt?: string | null;
  authorizedAt?: string | null;
  lastEditedAt?: string | null;
  lastEditedBy?: string | null;
  dataJson?: ChecklistData;
  risk: 'critical' | 'watch' | 'healthy';
  daysToShow: number | null;
  event: {
    id: string;
    name: string;
    artist?: string | null;
    status: string;
    startsAt?: string | null;
  };
};

type OpsResponse = {
  kpis: {
    total: number;
    avgProgress: number;
    incomplete: number;
    pendingAuth: number;
    critical: number;
    authorized: number;
  };
  byRisk: { critical: number; watch: number; healthy: number };
  rows: OpsRow[];
};

type FieldSpec = { id: string; label: string; sectionId?: string };

type Props = {
  title: string;
  description: string;
  templateKeys: string[];
  titleMatch?: RegExp;
  fields?: FieldSpec[];
};

function pickValue(data: ChecklistData | undefined, field: FieldSpec) {
  for (const s of data?.sections || []) {
    if (field.sectionId && s.id !== field.sectionId) continue;
    const it = s.items.find((i) => i.id === field.id);
    if (it) return it.value ?? (it.done ? 'Sí' : '—');
  }
  return '—';
}

export function ModuleChecklistIndex({ title, description, templateKeys, fields = [] }: Props) {
  const { entity } = useUser();
  const [data, setData] = useState<OpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'critical' | 'watch' | 'healthy'>('all');
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  const keysParam = templateKeys.join(',');

  useEffect(() => {
    setLoading(true);
    api<OpsResponse>(`/analytics/ops?entity=${entity}&keys=${encodeURIComponent(keysParam)}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [entity, keysParam]);

  const rows = useMemo(() => {
    let list = data?.rows || [];
    if (riskFilter !== 'all') list = list.filter((r) => r.risk === riskFilter);
    if (onlyIncomplete) list = list.filter((r) => r.progressPct < 100);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.event.name.toLowerCase().includes(needle) ||
          (r.event.artist || '').toLowerCase().includes(needle) ||
          r.title.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [data, q, riskFilter, onlyIncomplete]);

  const entityName = entity === 'ARTA' ? 'Arta' : 'Auditorio';
  const k = data?.kpis;
  const filterActive = riskFilter !== 'all' || onlyIncomplete || !!q.trim();

  return (
    <AppShell title={title}>
      <div className="page-workspace stack">
        <PageHeader
          description={description}
          hint={`Workspace de disciplina: prioriza riesgo, firmas y avance. Los registros nacen al crear el evento; aquí operas el backlog de ${entityName}.`}
        >
          <ActionLink href="/events" variant="ghost">
            Eventos
          </ActionLink>
          <ActionLink href="/events/new">Nuevo evento</ActionLink>
        </PageHeader>

        {loading ? (
          <>
            <LoadingKpis count={6} />
            <LoadingBlock rows={5} label={`Cargando ${title.toLowerCase()}…`} />
          </>
        ) : (
          <>
            {k ? (
              <div className="grid-cards kpi-grid-dense">
                <div className="kpi">
                  <div className="label">Instancias</div>
                  <div className="value">{k.total}</div>
                </div>
                <div className="kpi">
                  <div className="label">Avance medio</div>
                  <div className="value">{k.avgProgress}%</div>
                </div>
                <div className={`kpi ${k.critical ? 'kpi--danger' : ''}`}>
                  <div className="label">Críticos</div>
                  <div className="value">{k.critical}</div>
                </div>
                <div className="kpi">
                  <div className="label">Pend. autorización</div>
                  <div className="value">{k.pendingAuth}</div>
                </div>
                <div className="kpi">
                  <div className="label">Incompletos</div>
                  <div className="value">{k.incomplete}</div>
                </div>
                <div className="kpi">
                  <div className="label">Autorizados</div>
                  <div className="value">{k.authorized}</div>
                </div>
              </div>
            ) : null}

            {data ? (
              <div className="panel">
                <div className="panel-body">
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                    Distribución de riesgo
                  </div>
                  <DistBar
                    segments={[
                      { label: 'critical', value: data.byRisk.critical, tone: 'danger' },
                      { label: 'watch', value: data.byRisk.watch, tone: 'warn' },
                      { label: 'healthy', value: data.byRisk.healthy, tone: 'ok' },
                    ]}
                  />
                </div>
              </div>
            ) : null}

            <FilterBar
              meta={`${rows.length} registro${rows.length === 1 ? '' : 's'} · ${entityName}`}
            >
              <FieldSearch
                value={q}
                onChange={setQ}
                placeholder={`Buscar en ${title.toLowerCase()}…`}
              />
              <FieldSelect
                value={riskFilter}
                onChange={(v) => setRiskFilter(v as typeof riskFilter)}
                label="Filtrar por riesgo"
                options={[
                  { value: 'all', label: 'Todo riesgo' },
                  { value: 'critical', label: 'Crítico' },
                  { value: 'watch', label: 'Atención' },
                  { value: 'healthy', label: 'Saludable' },
                ]}
              />
              <FieldCheck
                checked={onlyIncomplete}
                onChange={setOnlyIncomplete}
                label="Solo incompletos"
              />
            </FilterBar>

            <div className="panel">
              <div className="panel-head">
                <h2>
                  {title} · {entityName}
                </h2>
              </div>
              <div className="panel-body">
                {!rows.length ? (
                  <EmptyState
                    title={
                      (data?.rows.length || 0) === 0
                        ? 'Sin instancias de esta disciplina'
                        : 'Sin registros en este filtro'
                    }
                    description={
                      (data?.rows.length || 0) === 0
                        ? `Crea un evento para instanciar plantillas ${templateKeys.join(', ')}.`
                        : 'Ajusta riesgo, búsqueda o “solo incompletos”.'
                    }
                    actionHref="/events/new"
                    actionLabel="Crear evento"
                  >
                    {filterActive && (data?.rows.length || 0) > 0 ? (
                      <button
                        className="btn ghost"
                        type="button"
                        onClick={() => {
                          setRiskFilter('all');
                          setOnlyIncomplete(false);
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
                          <th>Evento</th>
                          <th>Riesgo</th>
                          {fields.map((f) => (
                            <th key={f.id}>{f.label}</th>
                          ))}
                          <th>Avance</th>
                          <th>Firmas</th>
                          <th>Última edición</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.checklistId}>
                            <td>
                              <strong>{r.event.name}</strong>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {r.event.artist || '—'} · {r.event.status}
                                {r.daysToShow != null
                                  ? ` · ${r.daysToShow < 0 ? 'pasado' : `${r.daysToShow}d`}`
                                  : ''}
                              </div>
                            </td>
                            <td>
                              <StatusBadge value={r.risk} kind="risk" />
                            </td>
                            {fields.map((f) => (
                              <td key={f.id}>{String(pickValue(r.dataJson, f))}</td>
                            ))}
                            <td>
                              <div className="progress" style={{ minWidth: 80 }}>
                                <span style={{ width: `${r.progressPct}%` }} />
                              </div>
                              <span className="muted" style={{ fontSize: 11 }}>
                                {r.progressPct}%
                              </span>
                            </td>
                            <td className="muted" style={{ fontSize: 12 }}>
                              {r.authorizedAt
                                ? 'Autorizado'
                                : r.deliveredAt
                                  ? 'Entregado'
                                  : 'Sin firma'}
                            </td>
                            <td className="muted" style={{ fontSize: 12 }}>
                              {r.lastEditedBy || '—'}
                              {r.lastEditedAt ? (
                                <div>{new Date(r.lastEditedAt).toLocaleDateString('es-MX')}</div>
                              ) : null}
                            </td>
                            <td>
                              <Link
                                className="btn ghost"
                                href={`/events/${r.event.id}?tab=checklists&checklist=${r.checklistId}`}
                              >
                                Abrir
                              </Link>
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
