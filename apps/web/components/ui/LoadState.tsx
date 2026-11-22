'use client';

import { useCallback, useEffect, useRef, useState, type DependencyList, type ReactNode } from 'react';
import { userMessage } from '@/lib/api';

/**
 * Los tres estados de una carga, iguales en todo el panel: cargando (con la forma
 * de lo que llega), falló (mensaje humano y «Reintentar») y listo. La falla nunca
 * se pinta como vacío ni como 0.
 *
 *   const orders = useLoad(() => api<Po[]>(`/purchase-orders?entity=${entity}`), [entity]);
 *
 *   <LoadState
 *     load={orders}
 *     skeleton="list"                              // 'list' · 'grid' · 'figs' · 'table' · 'text'
 *     errorTitle="No pudimos cargar las órdenes"
 *   >
 *     {(rows) => (rows.length ? <Lista rows={rows} /> : <EmptyLite … />)}
 *   </LoadState>
 *
 * Piezas sueltas, para pantallas que ya llevan su propio estado:
 *   <ErrorState title="No pudimos cargar tus tareas" error={error} onRetry={load} />
 *   <ErrorState compact title="No pudimos leer el historial" onRetry={…} />   // falla parcial, en una línea
 *   <Skeleton shape="grid" count={6} label="Cargando eventos" />
 */

export type LoadStatus = 'loading' | 'ok' | 'empty' | 'error';

export type Load<T> = {
  status: LoadStatus;
  data: T | undefined;
  /** Mensaje ya humano (pasa por `userMessage`). */
  error: string | null;
  /** Vuelve a pedir; devuelve la promesa para que «Reintentar» espere. */
  reload: () => Promise<void>;
  /** true mientras recarga con datos ya en pantalla. */
  refreshing: boolean;
};

/**
 * Hook de carga: nunca convierte una falla en lista vacía, ignora respuestas viejas
 * (cambio de entidad a media carga) y limpia el error al reintentar. Con
 * `enabled: false` espera (p. ej. a conocer la sesión) y queda en 'loading'.
 */
export function useLoad<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  { enabled = true }: { enabled?: boolean } = {},
): Load<T> {
  const [state, setState] = useState<{ status: LoadStatus; data: T | undefined; error: string | null; refreshing: boolean }>({
    status: 'loading',
    data: undefined,
    error: null,
    refreshing: false,
  });
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const run = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => (s.data === undefined ? { ...s, status: 'loading', error: null } : { ...s, error: null, refreshing: true }));
    try {
      const data = await fetchRef.current();
      if (mine !== seq.current) return;
      const empty = Array.isArray(data) ? data.length === 0 : data == null;
      setState({ status: empty ? 'empty' : 'ok', data, error: null, refreshing: false });
    } catch (e) {
      if (mine !== seq.current) return;
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setState((s) => ({ ...s, status: 'error', error: userMessage(e), refreshing: false }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void run();
    return () => {
      seq.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, run, ...deps]);

  return { ...state, reload: run };
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden focusable="false">
      <path
        d="M12 8v5M12 16.5v.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Falla de carga en el lugar del contenido: mosaico blanco, título «No pudimos
 * cargar …», una línea de qué hacer y «Reintentar» en contorno. `compact` es la
 * versión de una línea para un bloque secundario dentro de una pantalla que sí cargó.
 */
export function ErrorState({
  title = 'No pudimos cargar esto',
  error,
  detail,
  onRetry,
  compact = false,
  children,
}: {
  title?: string;
  /** El error atrapado: se traduce con `userMessage`. */
  error?: unknown;
  /** Una línea de qué hacer; por defecto sale del error o «Revisa tu conexión…». */
  detail?: ReactNode;
  onRetry?: () => unknown;
  compact?: boolean;
  /** Otra acción además de reintentar («Ir a Inicio»). */
  children?: ReactNode;
}) {
  const [retrying, setRetrying] = useState(false);
  const line = detail ?? (error != null ? humanLine(error) : 'Revisa tu conexión y vuelve a intentar.');

  async function retry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  const button = onRetry ? (
    <button
      type="button"
      className={compact ? 'btn-quiet errstate__retry' : 'btn ghost errstate__retry'}
      onClick={() => void retry()}
      disabled={retrying}
      aria-busy={retrying || undefined}
    >
      {retrying ? 'Reintentando…' : 'Reintentar'}
    </button>
  ) : null;

  if (compact) {
    return (
      <div className="errstate errstate--compact" role="alert">
        <span className="errstate__icon" aria-hidden>
          <AlertIcon />
        </span>
        <p className="errstate__line">
          <strong>{title}.</strong> {line}
        </p>
        {button}
      </div>
    );
  }

  return (
    <div className="errstate" role="alert">
      <span className="errstate__icon" aria-hidden>
        <AlertIcon />
      </span>
      <p className="errstate__title">{title}</p>
      <p className="errstate__line">{line}</p>
      {button || children ? (
        <div className="errstate__actions">
          {button}
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** Para la línea de abajo: los genéricos de servidor dicen qué hacer, no repiten «no pudimos cargar». */
function humanLine(error: unknown): string {
  const text = userMessage(error);
  if (/^No pudimos cargar esto|^No se pudo guardar/.test(text)) return 'Intenta de nuevo en un momento.';
  return text;
}

export type SkeletonShape = 'list' | 'grid' | 'figs' | 'table' | 'text';

/**
 * Esqueleto con la forma de lo que va a llegar, dentro de su mosaico. Aparece a los
 * 300 ms (una carga rápida no parpadea) y no muestra «Cargando…» a la vista: el
 * texto va para el lector de pantalla.
 *
 * - list: renglones de 64 px con círculo y dos líneas.
 * - grid: tarjetas del tamaño de una tarjeta de evento.
 * - figs: franja de cifras con la primera en tinta (igual que `FigureStrip`).
 * - table: cabecera y renglones de 48 px.
 * - text: párrafo corto.
 */
export function Skeleton({
  shape = 'list',
  count,
  label = 'Cargando',
}: {
  shape?: SkeletonShape;
  count?: number;
  label?: string;
}) {
  const n = count ?? { list: 5, grid: 6, figs: 4, table: 6, text: 3 }[shape];
  const items = Array.from({ length: n });
  const sr = <span className="sr-only">{label.replace(/…$/, '')}…</span>;

  if (shape === 'figs') {
    return (
      <section className="fstrip skel-figs" aria-busy="true" data-count={n}>
        {items.map((_, i) => (
          <div key={i} className="fstrip__item skel-fig" aria-hidden>
            <span className="skel skel--label" />
            <span className="skel skel--figure" />
            <span className="skel skel--note" />
          </div>
        ))}
        {/* Al final: la primera cifra va en tinta por :first-child. */}
        {sr}
      </section>
    );
  }

  if (shape === 'grid') {
    return (
      <div className="skel-grid" aria-busy="true">
        {sr}
        {items.map((_, i) => (
          <div key={i} className="skel-card" aria-hidden>
            <span className="skel skel--chip" />
            <span className="skel skel--title" style={{ width: `${78 - (i % 3) * 12}%` }} />
            <span className="skel skel--line" style={{ width: `${54 - (i % 2) * 10}%` }} />
            <span className="skel skel--bar" />
          </div>
        ))}
      </div>
    );
  }

  if (shape === 'table') {
    return (
      <div className="skel-tile skel-table" aria-busy="true">
        {sr}
        <div className="skel-table__head" aria-hidden>
          {[28, 18, 14, 16].map((w, i) => (
            <span key={i} className="skel skel--label" style={{ width: `${w}%` }} />
          ))}
        </div>
        {items.map((_, i) => (
          <div key={i} className="skel-table__row" aria-hidden>
            <span className="skel skel--line" style={{ width: `${34 - (i % 3) * 5}%` }} />
            <span className="skel skel--line" style={{ width: '16%' }} />
            <span className="skel skel--line" style={{ width: '10%' }} />
            <span className="skel skel--line" style={{ width: '12%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (shape === 'text') {
    return (
      <div className="skel-tile skel-text" aria-busy="true">
        {sr}
        {items.map((_, i) => (
          <span key={i} className="skel skel--line" style={{ width: `${92 - i * 14}%` }} aria-hidden />
        ))}
      </div>
    );
  }

  return (
    <div className="skel-tile skel-list" aria-busy="true">
      {sr}
      {items.map((_, i) => (
        <div key={i} className="skel-row" aria-hidden>
          <span className="skel skel--avatar" />
          <span className="skel-row__copy">
            <span className="skel skel--title" style={{ width: `${62 - (i % 3) * 9}%` }} />
            <span className="skel skel--note" style={{ width: `${38 - (i % 2) * 8}%` }} />
          </span>
          <span className="skel skel--pill" />
        </div>
      ))}
    </div>
  );
}

/**
 * Envoltura de los tres estados para una carga de `useLoad`. `children` recibe el
 * dato ya cargado (también cuando viene vacío: la pantalla pinta su propio vacío).
 */
export function LoadState<T>({
  load,
  skeleton = 'list',
  skeletonCount,
  loadingLabel,
  errorTitle,
  children,
}: {
  load: Pick<Load<T>, 'status' | 'data' | 'error' | 'reload'>;
  skeleton?: SkeletonShape;
  skeletonCount?: number;
  loadingLabel?: string;
  errorTitle?: string;
  children: (data: T) => ReactNode;
}) {
  if (load.status === 'error' && load.data === undefined) {
    return <ErrorState title={errorTitle} detail={humanDetail(load.error)} onRetry={load.reload} />;
  }
  if (load.data === undefined) return <Skeleton shape={skeleton} count={skeletonCount} label={loadingLabel} />;
  return (
    <>
      {load.status === 'error' ? <ErrorState compact title="No se pudo actualizar" detail={humanDetail(load.error)} onRetry={load.reload} /> : null}
      {children(load.data)}
    </>
  );
}

function humanDetail(error: string | null): string | undefined {
  if (!error) return undefined;
  if (/^No pudimos cargar esto|^No se pudo guardar/.test(error)) return 'Intenta de nuevo en un momento.';
  return error;
}

/** Cifra sin dato: «—» en el mismo tamaño. Úsalo cuando la carga sigue o falló, nunca 0 ni $0. */
export const NO_DATA = '—';

/** `value` cuando hay dato; «—» si es null/undefined (cargando o falló). */
export function figure<T>(value: T | null | undefined, format: (v: T) => ReactNode = (v) => v as ReactNode): ReactNode {
  return value === null || value === undefined ? NO_DATA : format(value);
}
