'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { isDirectionRole } from '@arta/rbac';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { ActionLink, FlashMessage, PageHeader } from '@/components/ui/PageChrome';
import { SaveStatus } from '@/components/ui/SaveStatus';
import { ApiError, api } from '@/lib/api';
import { openGeneratedTab } from '@/lib/open-tab';
import { useAutosave } from '@/lib/use-autosave';
import { useDirtyGuard } from '@/lib/use-dirty-guard';
import { useUser } from '@/lib/user-context';

/**
 * Inventario de limpieza semanal del Auditorio (junta con el cliente,
 * 23-10-2026). No cuelga de un evento: una hoja por semana (de lunes a
 * domingo) con los insumos, su existencia inicial, entradas, consumo,
 * existencia final y faltantes. La semana nueva arranca con la existencia
 * final de la anterior. Sale en PDF con la marca del Auditorio.
 *
 * API: `apps/api/src/cleaning-inventory`. Cuentas: existencia final =
 * inicial + entradas − consumo y faltantes = mínimo − final, salvo que se
 * escriba el conteo físico o la cifra.
 */

type Person = { id: string; fullName: string } | null;

type ApiItem = {
  id: string;
  insumo: string;
  unidad?: string | null;
  inicial?: number | null;
  entradas?: number | null;
  consumo?: number | null;
  final?: number | null;
  minimo?: number | null;
  faltantes?: number | null;
  observaciones?: string | null;
};

type Stats = { items: number; faltantes: number; capturados: number };

type WeekSummary = {
  id: string;
  weekStart: string;
  label: string;
  responsible?: string | null;
  revision: number;
  stats: Stats;
  pdfUrl?: string | null;
  updatedAt: string;
  updatedBy?: Person;
};

type Week = WeekSummary & {
  notes?: string | null;
  items: ApiItem[];
  canEdit: boolean;
  created?: boolean;
};

type ListResponse = { canEdit: boolean; currentWeek: string; weeks: WeekSummary[] };

/** Lo que se escribe: las cantidades como texto (se acepta coma decimal; el API las convierte). */
type Row = {
  id: string;
  insumo: string;
  unidad: string;
  inicial: string;
  entradas: string;
  consumo: string;
  final: string;
  minimo: string;
  faltantes: string;
  observaciones: string;
};

type Draft = { responsible: string; notes: string; items: Row[] };

const NUMERIC: Array<keyof Row> = ['inicial', 'entradas', 'consumo', 'final', 'minimo', 'faltantes'];

const COLUMNS: Array<{ key: keyof Row; label: string; numeric?: boolean; wide?: boolean }> = [
  { key: 'insumo', label: 'Insumo', wide: true },
  { key: 'unidad', label: 'Unidad' },
  { key: 'inicial', label: 'Existencia inicial', numeric: true },
  { key: 'entradas', label: 'Entradas', numeric: true },
  { key: 'consumo', label: 'Consumo', numeric: true },
  { key: 'final', label: 'Existencia final', numeric: true },
  { key: 'minimo', label: 'Mínimo', numeric: true },
  { key: 'faltantes', label: 'Faltantes', numeric: true },
  { key: 'observaciones', label: 'Observaciones', wide: true },
];

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

function qty(value: string): number | null {
  const t = value.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number | null) => (n === null ? '' : n.toLocaleString('es-MX', { maximumFractionDigits: 2 }));

/** Las cuentas del renglón (mismas que `resolveItem` del API). */
function computed(row: Row): { final: number | null; faltantes: number | null } {
  const ini = qty(row.inicial);
  const ent = qty(row.entradas);
  const con = qty(row.consumo);
  const calc = ini !== null || ent !== null || con !== null ? round((ini ?? 0) + (ent ?? 0) - (con ?? 0)) : null;
  const final = qty(row.final) ?? calc;
  const min = qty(row.minimo);
  const falta = min !== null && final !== null ? round(Math.max(0, min - final)) : null;
  return { final, faltantes: qty(row.faltantes) ?? falta };
}

function toRow(item: ApiItem): Row {
  return {
    id: item.id,
    insumo: item.insumo ?? '',
    unidad: item.unidad ?? '',
    inicial: str(item.inicial),
    entradas: str(item.entradas),
    consumo: str(item.consumo),
    final: str(item.final),
    minimo: str(item.minimo),
    faltantes: str(item.faltantes),
    observaciones: item.observaciones ?? '',
  };
}

function toDraft(week: Week): Draft {
  return { responsible: week.responsible ?? '', notes: week.notes ?? '', items: week.items.map(toRow) };
}

function newRow(): Row {
  return {
    id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    insumo: '',
    unidad: '',
    inicial: '',
    entradas: '',
    consumo: '',
    final: '',
    minimo: '',
    faltantes: '',
    observaciones: '',
  };
}

function fmtUpdated(w: WeekSummary) {
  const d = new Date(w.updatedAt);
  const when = Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  return [w.updatedBy?.fullName, when].filter(Boolean).join(' · ');
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CleaningInventoryPage() {
  const { entity, setEntity, user } = useUser();
  const [list, setList] = useState<ListResponse | null>(null);
  const [week, setWeek] = useState<Week | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [pickDate, setPickDate] = useState(todayLocal);
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [conflict, setConflict] = useState('');

  const canEdit = !!week?.canEdit && !conflict;
  const isDirection = isDirectionRole(user?.roleKey ?? '');

  // El inventario es del Auditorio: la pantalla se pone en su entidad (como Mantenimiento).
  useEffect(() => {
    if (entity !== 'EXPLANADA') setEntity('EXPLANADA');
  }, [entity, setEntity]);

  const loadList = useCallback(async () => {
    const data = await api<ListResponse>('/cleaning-inventory?entity=EXPLANADA');
    setList(data);
    return data;
  }, []);

  const autosave = useAutosave<Draft | null>({
    value: draft,
    enabled: canEdit && !!draft,
    save: async (value) => {
      if (!value || !week) return;
      try {
        const saved = await api<Week>(`/cleaning-inventory/${week.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...value, baseRevision: week.revision }),
        });
        // Lo escrito se queda como está (comas, renglones a medias); solo avanza la revisión.
        setWeek((prev) => (prev && prev.id === saved.id ? { ...prev, revision: saved.revision, stats: saved.stats, updatedAt: saved.updatedAt, updatedBy: saved.updatedBy } : prev));
        setList((prev) =>
          prev ? { ...prev, weeks: prev.weeks.map((w) => (w.id === saved.id ? { ...w, ...saved } : w)) } : prev,
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) setConflict(e.message);
        throw e;
      }
    },
  });

  const show = useCallback(
    (w: Week) => {
      setWeek(w);
      const d = toDraft(w);
      setDraft(d);
      setConflict('');
      autosave.reset(d);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const openWeek = useCallback(
    async (id: string) => {
      if (autosave.dirty) await autosave.flush();
      setOpening(true);
      try {
        show(await api<Week>(`/cleaning-inventory/${id}`));
      } catch (e) {
        setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo abrir la semana' });
      } finally {
        setOpening(false);
      }
    },
    [autosave, show],
  );

  /** Abre (o crea) la semana de una fecha. */
  const openDate = useCallback(
    async (date?: string) => {
      if (autosave.dirty) await autosave.flush();
      setOpening(true);
      setMsg(null);
      try {
        const w = await api<Week>('/cleaning-inventory', {
          method: 'POST',
          body: JSON.stringify({ entity: 'EXPLANADA', date: date || undefined }),
        });
        show(w);
        if (w.created) {
          setMsg({
            tone: 'info',
            text: 'Semana nueva: los insumos, unidades y mínimos vienen de la semana anterior y su existencia final quedó como inicial.',
          });
        }
        await loadList();
      } catch (e) {
        setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo abrir la semana' });
      } finally {
        setOpening(false);
      }
    },
    [autosave, loadList, show],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadList()
      .then(async (data) => {
        if (!alive) return;
        // Abre la semana actual si ya existe; si no, la más reciente.
        const current = data.weeks.find((w) => w.weekStart === data.currentWeek) ?? data.weeks[0];
        if (current) show(await api<Week>(`/cleaning-inventory/${current.id}`));
      })
      .catch((e) => alive && setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo cargar el inventario' }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [loadList, show]);

  // Cambiar de semana guarda antes; salir de la pantalla con cambios pendientes avisa.
  useDirtyGuard(autosave.dirty, 'El inventario tiene cambios sin guardar. ¿Salir de todas formas?');

  const totals = useMemo(() => {
    const rows = draft?.items ?? [];
    const withName = rows.filter((r) => r.insumo.trim());
    const falt = withName.filter((r) => (computed(r).faltantes ?? 0) > 0);
    return { items: withName.length, faltantes: falt.length };
  }, [draft]);

  function patchRow(index: number, key: keyof Row, value: string) {
    setDraft((prev) => (prev ? { ...prev, items: prev.items.map((r, i) => (i === index ? { ...r, [key]: value } : r)) } : prev));
  }

  function removeRow(index: number) {
    const row = draft?.items[index];
    if (row?.insumo.trim() && !window.confirm(`¿Quitar «${row.insumo}» de esta semana?`)) return;
    setDraft((prev) => (prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : prev));
  }

  function addRow() {
    setDraft((prev) => (prev ? { ...prev, items: [...prev.items, newRow()] } : prev));
  }

  function downloadPdf() {
    if (!week) return;
    const id = week.id;
    void openGeneratedTab(async () => {
      if (canEdit) await autosave.flush();
      const res = await api<{ url: string }>(`/cleaning-inventory/${id}/pdf`, { method: 'POST' });
      return res.url;
    }, 'Generando el PDF del inventario…').catch((e) =>
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo generar el PDF' }),
    );
  }

  async function removeWeek() {
    if (!week || !window.confirm(`¿Borrar ${week.label.toLowerCase()}? No se puede deshacer.`)) return;
    try {
      await api(`/cleaning-inventory/${week.id}`, { method: 'DELETE' });
      setWeek(null);
      setDraft(null);
      autosave.reset(null);
      const data = await loadList();
      if (data.weeks[0]) await openWeek(data.weeks[0].id);
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof Error ? e.message : 'No se pudo borrar' });
    }
  }

  const currentWeek = list?.currentWeek;
  const hasCurrent = !!list?.weeks.some((w) => w.weekStart === currentWeek);

  return (
    <AppShell title="Inventario de limpieza">
      <div className="stack page-workspace inv-page">
        <PageHeader
          title="Inventario de limpieza"
          description="Insumos del Auditorio por semana: existencia inicial, entradas, consumo, existencia final y faltantes."
          hint="La semana nueva arranca con la existencia final de la anterior. Existencia final y faltantes se calculan solos si no escribes el conteo."
        >
          <ActionLink href="/maintenance" variant="ghost">
            Mantenimiento
          </ActionLink>
          {list?.canEdit && !hasCurrent ? (
            <button type="button" className="btn" disabled={opening} onClick={() => void openDate()}>
              Abrir semana actual
            </button>
          ) : null}
        </PageHeader>

        {msg ? (
          <FlashMessage variant={msg.tone === 'error' ? 'error' : 'info'} onDismiss={() => setMsg(null)}>
            {msg.text}
          </FlashMessage>
        ) : null}

        {loading ? (
          <LoadingBlock rows={6} label="Cargando inventario…" />
        ) : !list?.weeks.length && !week ? (
          <EmptyState
            title="Todavía no hay semanas"
            description={
              list?.canEdit
                ? 'Abre la semana actual: nace con la lista de insumos de limpieza y se ajusta a lo que usa el Auditorio.'
                : 'Cuando el equipo del Auditorio abra la primera semana aparecerá aquí.'
            }
          >
            {list?.canEdit ? (
              <button type="button" className="btn" disabled={opening} onClick={() => void openDate()}>
                Abrir semana actual
              </button>
            ) : null}
          </EmptyState>
        ) : (
          <div className="inv-layout">
            <aside className="inv-weeks card" aria-label="Semanas">
              <div className="inv-weeks__head">
                <strong>Semanas</strong>
                <span className="muted">{list?.weeks.length ?? 0}</span>
              </div>
              {list?.canEdit ? (
                <form
                  className="inv-weeks__open"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void openDate(pickDate);
                  }}
                >
                  <label className="inv-weeks__date">
                    <span>Abrir la semana del día</span>
                    <input type="date" value={pickDate} onChange={(e) => setPickDate(e.target.value)} required />
                  </label>
                  <button type="submit" className="btn ghost" disabled={opening || !pickDate}>
                    Abrir
                  </button>
                </form>
              ) : null}
              <ul className="inv-weeks__list">
                {(list?.weeks ?? []).map((w) => (
                  <li key={w.id}>
                    <button
                      type="button"
                      className={`inv-week ${week?.id === w.id ? 'is-active' : ''}`}
                      aria-current={week?.id === w.id ? 'true' : undefined}
                      onClick={() => {
                        if (week?.id !== w.id) void openWeek(w.id);
                      }}
                    >
                      <span className="inv-week__label">
                        {w.label}
                        {w.weekStart === currentWeek ? <span className="inv-week__now">esta semana</span> : null}
                      </span>
                      <span className="inv-week__meta">
                        {w.stats.faltantes ? <span className="inv-dot" aria-hidden /> : null}
                        {w.stats.faltantes
                          ? `${w.stats.faltantes} con faltantes`
                          : `${w.stats.items} insumos`}
                        {w.responsible ? ` · ${w.responsible}` : ''}
                      </span>
                      <span className="inv-week__who">{fmtUpdated(w)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {week && draft ? (
              <section className="inv-sheet card" aria-label={week.label}>
                <div className="inv-sheet__head">
                  <div className="inv-sheet__title">
                    <h3>{week.label}</h3>
                    <p className="muted">
                      {totals.items} insumos
                      {totals.faltantes ? (
                        <>
                          {' · '}
                          <span className="inv-dot" aria-hidden /> {totals.faltantes} con faltantes
                        </>
                      ) : ' · sin faltantes'}
                    </p>
                  </div>
                  <div className="inv-sheet__actions">
                    {canEdit ? <SaveStatus status={autosave.status} savedAt={autosave.savedAt} error={autosave.error} /> : null}
                    {canEdit ? (
                      <button type="button" className="btn ghost" disabled={!autosave.dirty} onClick={() => void autosave.flush()}>
                        Guardar
                      </button>
                    ) : null}
                    <button type="button" className="btn" onClick={downloadPdf}>
                      PDF
                    </button>
                    {isDirection ? (
                      <button type="button" className="btn-quiet inv-sheet__delete" onClick={() => void removeWeek()}>
                        Borrar semana
                      </button>
                    ) : null}
                  </div>
                </div>

                {conflict ? (
                  <FlashMessage variant="error">
                    {conflict}{' '}
                    <button type="button" className="btn-quiet" onClick={() => void openWeek(week.id)}>
                      Recargar la semana
                    </button>
                  </FlashMessage>
                ) : null}
                {!week.canEdit ? <p className="muted">Solo lectura: lo captura el equipo del Auditorio.</p> : null}

                <div className="inv-fields">
                  <label className="inv-field">
                    <span>Responsable del conteo</span>
                    <input
                      type="text"
                      value={draft.responsible}
                      disabled={!canEdit}
                      placeholder="Nombre"
                      maxLength={120}
                      onChange={(e) => setDraft({ ...draft, responsible: e.target.value })}
                    />
                  </label>
                </div>

                <div className="dtable-wrap inv-table-wrap">
                  <table className="dtable inv-table">
                    <thead>
                      <tr>
                        {COLUMNS.map((c) => (
                          <th key={c.key} className={c.numeric ? 'num' : c.wide ? 'inv-col-wide' : undefined}>
                            {c.label}
                          </th>
                        ))}
                        {canEdit ? <th className="col-act" aria-label="Acciones" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {draft.items.map((row, r) => {
                        const calc = computed(row);
                        const short = (calc.faltantes ?? 0) > 0;
                        return (
                          <tr key={row.id} className={short ? 'is-short' : undefined}>
                            {COLUMNS.map((c) => {
                              const value = row[c.key];
                              const placeholder =
                                c.key === 'final' ? fmt(calc.final) : c.key === 'faltantes' ? fmt(calc.faltantes) : undefined;
                              if (!canEdit) {
                                const shown = value || placeholder || '';
                                return (
                                  <td key={c.key} className={c.numeric ? 'num' : undefined}>
                                    {c.key === 'insumo' && short ? <span className="inv-dot" aria-label="Con faltantes" /> : null}
                                    {shown}
                                  </td>
                                );
                              }
                              return (
                                <td key={c.key} className={c.numeric ? 'num' : undefined}>
                                  <div className={c.key === 'insumo' ? 'inv-cell-name' : undefined}>
                                    {c.key === 'insumo' && short ? <span className="inv-dot" aria-label="Con faltantes" /> : null}
                                    <input
                                      className={`cell ${c.numeric ? 'num' : ''} ${placeholder && !value ? 'is-calc' : ''}`}
                                      type="text"
                                      inputMode={c.numeric ? 'decimal' : undefined}
                                      value={value}
                                      placeholder={placeholder || (r === draft.items.length - 1 && !c.numeric ? c.label : undefined)}
                                      aria-label={`${c.label}, ${row.insumo || `renglón ${r + 1}`}`}
                                      maxLength={c.key === 'observaciones' ? 300 : c.key === 'insumo' ? 120 : 30}
                                      onChange={(e) =>
                                        patchRow(
                                          r,
                                          c.key,
                                          NUMERIC.includes(c.key) ? e.target.value.replace(/[^\d.,-]/g, '') : e.target.value,
                                        )
                                      }
                                    />
                                  </div>
                                </td>
                              );
                            })}
                            {canEdit ? (
                              <td className="col-act">
                                <button
                                  type="button"
                                  className="icon-btn"
                                  aria-label={`Quitar ${row.insumo || `renglón ${r + 1}`}`}
                                  onClick={() => removeRow(r)}
                                >
                                  ×
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {canEdit ? (
                  <div className="row">
                    <button type="button" className="btn ghost" onClick={addRow}>
                      Agregar insumo
                    </button>
                    <span className="muted inv-hint">
                      Existencia final y faltantes en gris son la cuenta; escribe encima si el conteo físico es otro.
                    </span>
                  </div>
                ) : null}

                <label className="inv-field">
                  <span>Observaciones de la semana</span>
                  <textarea
                    rows={3}
                    value={draft.notes}
                    disabled={!canEdit}
                    maxLength={2000}
                    placeholder={canEdit ? 'Pedidos al proveedor, insumos dañados, cambios de marca…' : ''}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                  />
                </label>
              </section>
            ) : (
              <section className="inv-sheet card">
                <p className="muted">{opening ? 'Abriendo semana…' : 'Elige una semana de la lista.'}</p>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
