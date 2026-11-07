'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { canEditEventInfo } from '@arta/rbac';
import { AppShell } from '@/components/app-shell/AppShell';
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
import { useStickyState } from '@/lib/use-sticky-state';
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

type SortKey = 'risk' | 'progress' | 'show';

type RiskFilter = 'all' | 'critical' | 'watch' | 'healthy';

/** Firmas: todo, solo lo que falta por autorizar, o solo lo ya autorizado. */
type SignFilter = 'all' | 'pending' | 'authorized';

type Props = {
  title: string;
  description: string;
  hint?: string;
  templateKeys: string[];
  titleMatch?: RegExp;
  fields?: FieldSpec[];
};

function signatureLabel(row: OpsRow) {
  if (row.authorizedAt) return { text: 'Autorizado', tone: 'ok' as const };
  if (row.deliveredAt) return { text: 'Entregado', tone: 'warn' as const };
  return { text: 'Sin firma', tone: 'muted' as const };
}

function pickValue(data: ChecklistData | undefined, field: FieldSpec) {
  for (const s of data?.sections || []) {
    if (field.sectionId && s.id !== field.sectionId) continue;
    const it = s.items.find((i) => i.id === field.id);
    if (!it) continue;
    const value = it.value === null || it.value === undefined || String(it.value).trim() === '' ? null : it.value;
    if (value !== null) return value;
    return it.done ? 'Sí' : '—';
  }
  return '—';
}

/** `?riesgo=critical|warning`: quien llega desde Riesgo ve el módulo ya filtrado. */
function riskFromParam(value: string | null): RiskFilter | null {
  if (value === 'critical') return 'critical';
  if (value === 'warning' || value === 'watch') return 'watch';
  if (value === 'healthy') return 'healthy';
  return null;
}

/** `?estado=incompletos|firma|autorizados`: el mismo filtro que los KPI, pero desde la liga. */
function stateFromParam(value: string | null): { incomplete: boolean; sign: SignFilter } | null {
  if (value === 'incompletos') return { incomplete: true, sign: 'all' };
  if (value === 'firma') return { incomplete: false, sign: 'pending' };
  if (value === 'autorizados') return { incomplete: false, sign: 'authorized' };
  return null;
}

const RISK_SEGMENTS: Array<{ key: Exclude<RiskFilter, 'all'>; label: string; tone: 'danger' | 'warn' | 'ok' }> = [
  { key: 'critical', label: 'Crítico', tone: 'danger' },
  { key: 'watch', label: 'Atención', tone: 'warn' },
  { key: 'healthy', label: 'Saludable', tone: 'ok' },
];

/**
 * Reparto de riesgo del módulo. Cada tramo de la barra (y su leyenda) filtra la
 * tabla; tocarlo otra vez quita el filtro. Sin `DistBar`: ahí los tramos no se tocan.
 */
function RiskDistBar({
  byRisk,
  value,
  onChange,
}: {
  byRisk: OpsResponse['byRisk'] | null | undefined;
  value: RiskFilter;
  onChange: (next: RiskFilter) => void;
}) {
  const count = (key: Exclude<RiskFilter, 'all'>) => byRisk?.[key] ?? 0;
  const total = RISK_SEGMENTS.reduce((sum, seg) => sum + count(seg.key), 0) || 1;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="dist-bar" role="group" aria-label="Distribución de riesgo">
        {RISK_SEGMENTS.filter((seg) => count(seg.key) > 0).map((seg) => {
          const on = value === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              className={`dist-bar__seg dist-bar__seg--btn dist-bar__seg--${seg.tone} ${value === 'all' || on ? '' : 'dist-bar__seg--dim'}`}
              style={{ width: `${(count(seg.key) / total) * 100}%` }}
              title={`${seg.label}: ${count(seg.key)}`}
              aria-label={`${seg.label}: ${count(seg.key)}`}
              aria-pressed={on}
              onClick={() => onChange(on ? 'all' : seg.key)}
            />
          );
        })}
      </div>
      <div className="seg" role="group" aria-label="Filtrar por riesgo desde el reparto">
        {RISK_SEGMENTS.map((seg) => {
          const on = value === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              className={`seg__btn ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => onChange(on ? 'all' : seg.key)}
            >
              {seg.label}
              <span className="seg__count">{count(seg.key)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** `useSearchParams` (el filtro con el que se llega desde Riesgo) pide Suspense en el build. */
export function ModuleChecklistIndex(props: Props) {
  return (
    <Suspense
      fallback={
        <AppShell title={props.title}>
          <LoadingBlock rows={6} label={`Cargando ${props.title.toLowerCase()}…`} />
        </AppShell>
      }
    >
      <ModuleChecklistIndexInner {...props} />
    </Suspense>
  );
}

function ModuleChecklistIndexInner({
  title,
  description,
  hint,
  templateKeys,
  fields = [],
}: Props) {
  const { entity, user } = useUser();
  const params = useSearchParams();
  const riesgoParam = params?.get('riesgo') ?? null;
  const estadoParam = params?.get('estado') ?? null;
  const [data, setData] = useState<OpsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>(() => riskFromParam(riesgoParam) ?? 'all');
  const [onlyIncomplete, setOnlyIncomplete] = useState(() => stateFromParam(estadoParam)?.incomplete ?? false);
  const [signFilter, setSignFilter] = useState<SignFilter>(() => stateFromParam(estadoParam)?.sign ?? 'all');
  const [sort, setSort] = useStickyState<SortKey>('ops.sort', 'risk');

  // La liga manda sobre el filtro local: otra fila de Riesgo (otro `?riesgo=`) cambia la tabla
  // sin recargar, y volver al módulo sin parámetros la deja completa.
  useEffect(() => {
    setRiskFilter(riskFromParam(riesgoParam) ?? 'all');
  }, [riesgoParam]);
  useEffect(() => {
    const state = stateFromParam(estadoParam);
    setOnlyIncomplete(state?.incomplete ?? false);
    setSignFilter(state?.sign ?? 'all');
  }, [estadoParam]);

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
    if (signFilter === 'pending') list = list.filter((r) => !r.authorizedAt);
    if (signFilter === 'authorized') list = list.filter((r) => !!r.authorizedAt);
    if (q.trim()) {
      const needle = q.toLowerCase();
      list = list.filter(
        (r) =>
          r.event.name.toLowerCase().includes(needle) ||
          (r.event.artist || '').toLowerCase().includes(needle) ||
          r.title.toLowerCase().includes(needle),
      );
    }
    // Ordenar del lado del cliente: la lista cabe entera y así el orden se
    // recuerda entre visitas sin pedirle nada más al servidor.
    return [...list].sort((a, b) => {
      if (sort === 'progress') return a.progressPct - b.progressPct;
      if (sort === 'show') {
        const av = a.daysToShow ?? 9999;
        const bv = b.daysToShow ?? 9999;
        return av - bv;
      }
      const rank = { critical: 0, watch: 1, healthy: 2 } as const;
      return rank[a.risk] - rank[b.risk] || a.progressPct - b.progressPct;
    });
  }, [data, q, riskFilter, onlyIncomplete, signFilter, sort]);

  const entityName = entity === 'ARTA' ? 'Arta' : 'Auditorio';
  const k = data?.kpis;
  const filterActive = riskFilter !== 'all' || onlyIncomplete || signFilter !== 'all' || !!q.trim();
  const noData = (data?.rows?.length ?? 0) === 0;
  // «Crear evento» solo a quien puede crearlo (mismo candado que el menú y Eventos → Nuevo).
  const canCreate = !!user && canEditEventInfo(user, entity);

  function clearFilters() {
    setRiskFilter('all');
    setOnlyIncomplete(false);
    setSignFilter('all');
    setQ('');
  }

  return (
    <AppShell title={title}>
      <div className="page-workspace stack">
        <PageHeader
          title={title}
          description={description}
          hint={
            hint ??
            `Prioriza riesgo, firmas y avance. Cada registro se crea con el evento; aquí gestionas el backlog de ${entityName}.`
          }
        >
          <ActionLink href="/events" variant="ghost">
            Eventos
          </ActionLink>
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
                <button
                  type="button"
                  className={`kpi kpi--action ${!filterActive ? 'kpi--on' : ''}`}
                  aria-pressed={!filterActive}
                  onClick={clearFilters}
                >
                  <div className="label">Instancias</div>
                  <div className="value">{k.total}</div>
                  <div className="kpi-sub muted">Ver todas</div>
                </button>
                <div className="kpi">
                  <div className="label">Avance medio</div>
                  <div className="value">{k.avgProgress}%</div>
                  <div className="kpi-sub muted">Del backlog visible</div>
                </div>
                <button
                  type="button"
                  className={`kpi kpi--action ${k.critical ? 'kpi--danger' : ''} ${riskFilter === 'critical' ? 'kpi--on' : ''}`}
                  aria-pressed={riskFilter === 'critical'}
                  onClick={() => setRiskFilter(riskFilter === 'critical' ? 'all' : 'critical')}
                >
                  <div className="label">Críticos</div>
                  <div className="value">{k.critical}</div>
                  <div className="kpi-sub muted">Atender primero</div>
                </button>
                <button
                  type="button"
                  className={`kpi kpi--action ${signFilter === 'pending' ? 'kpi--on' : ''}`}
                  aria-pressed={signFilter === 'pending'}
                  onClick={() => setSignFilter(signFilter === 'pending' ? 'all' : 'pending')}
                >
                  <div className="label">Pend. autorización</div>
                  <div className="value">{k.pendingAuth}</div>
                  <div className="kpi-sub muted">Falta firma</div>
                </button>
                <button
                  type="button"
                  className={`kpi kpi--action ${onlyIncomplete ? 'kpi--on' : ''}`}
                  aria-pressed={onlyIncomplete}
                  onClick={() => setOnlyIncomplete((v) => !v)}
                >
                  <div className="label">Incompletos</div>
                  <div className="value">{k.incomplete}</div>
                  <div className="kpi-sub muted">Bajo 100%</div>
                </button>
                <button
                  type="button"
                  className={`kpi kpi--action ${signFilter === 'authorized' ? 'kpi--on' : ''}`}
                  aria-pressed={signFilter === 'authorized'}
                  onClick={() => setSignFilter(signFilter === 'authorized' ? 'all' : 'authorized')}
                >
                  <div className="label">Autorizados</div>
                  <div className="value">{k.authorized}</div>
                  <div className="kpi-sub muted">Cerrados y firmados</div>
                </button>
              </div>
            ) : null}

            {data ? (
              <div className="panel panel--strip">
                <div className="panel-body">
                  <div className="kpi-sub muted">Distribución de riesgo · toca un tramo para filtrar</div>
                  <RiskDistBar byRisk={data.byRisk} value={riskFilter} onChange={setRiskFilter} />
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
                onChange={(v) => setRiskFilter(v as RiskFilter)}
                label="Filtrar por riesgo"
                options={[
                  { value: 'all', label: 'Todo riesgo' },
                  { value: 'critical', label: 'Crítico' },
                  { value: 'watch', label: 'Atención' },
                  { value: 'healthy', label: 'Saludable' },
                ]}
              />
              <FieldSelect
                value={signFilter}
                onChange={(v) => setSignFilter(v as SignFilter)}
                label="Filtrar por firmas"
                options={[
                  { value: 'all', label: 'Todas las firmas' },
                  { value: 'pending', label: 'Pendientes de autorizar' },
                  { value: 'authorized', label: 'Autorizados' },
                ]}
              />
              <FieldSelect
                value={sort}
                onChange={(v) => setSort(v as SortKey)}
                label="Ordenar registros"
                options={[
                  { value: 'risk', label: 'Riesgo primero' },
                  { value: 'progress', label: 'Menor avance' },
                  { value: 'show', label: 'Show más cercano' },
                ]}
              />
              <FieldCheck
                checked={onlyIncomplete}
                onChange={setOnlyIncomplete}
                label="Solo incompletos"
              />
              {filterActive ? (
                <button className="btn ghost btn-sm" type="button" onClick={clearFilters}>
                  Limpiar
                </button>
              ) : null}
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
                      noData
                        ? `Aún no hay formatos de ${title.toLowerCase()} en esta entidad`
                        : 'Sin registros en este filtro'
                    }
                    description={
                      noData
                        ? canCreate
                          ? `Cuando crees un evento se generan los formatos ${templateKeys.join(', ')}. Empieza en Eventos → Nuevo evento y ábrelos desde el hub del show.`
                          : `Los formatos ${templateKeys.join(', ')} se generan al crear cada evento; aquí aparecerán en cuanto haya uno en ${entityName}.`
                        : 'Prueba otro término o quita los filtros de riesgo, firmas e incompletos.'
                    }
                    actionHref={noData && canCreate ? '/events/new' : undefined}
                    actionLabel={noData && canCreate ? 'Crear evento' : undefined}
                  >
                    {!noData && filterActive ? (
                      <button className="btn ghost" type="button" onClick={clearFilters}>
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
                              <div className="kpi-sub muted">
                                {r.event.artist || '—'} ·{' '}
                                <StatusBadge value={r.event.status} kind="event" />
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
                              <div className="progress-cell">
                                <div className="progress">
                                  <span style={{ width: `${r.progressPct}%` }} />
                                </div>
                                <span className="kpi-sub muted">{r.progressPct}%</span>
                              </div>
                            </td>
                            <td>
                              {(() => {
                                const sig = signatureLabel(r);
                                return sig.tone === 'muted' ? (
                                  <span className="kpi-sub muted">{sig.text}</span>
                                ) : (
                                  <span className={`badge ${sig.tone}`}>{sig.text}</span>
                                );
                              })()}
                            </td>
                            <td className="kpi-sub muted">
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
