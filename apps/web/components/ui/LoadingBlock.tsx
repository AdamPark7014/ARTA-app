'use client';

import { Skeleton, type SkeletonShape } from './LoadState';

type Props = {
  /** Renglones (o tarjetas) que se dibujan. */
  rows?: number;
  /** Para el lector de pantalla; no se muestra. */
  label?: string;
  /** Forma de lo que llega: 'list' (por defecto) · 'grid' · 'table' · 'text' · 'figs'. */
  shape?: SkeletonShape;
};

/**
 * Carga con la forma del contenido (ver `Skeleton` en LoadState). Ya no pinta
 * «Cargando…» a la vista ni rayas sueltas: renglones dentro de su mosaico que
 * aparecen a los 300 ms. Si la carga falla, la pantalla pinta `ErrorState`.
 *
 *   {loading ? <LoadingBlock rows={5} label="Cargando órdenes…" /> : …}
 *   {loading ? <LoadingBlock shape="grid" rows={6} label="Cargando eventos…" /> : …}
 */
export function LoadingBlock({ rows = 4, label = 'Cargando…', shape = 'list' }: Props) {
  return (
    <div className="loading-block" role="status" aria-label={label.replace(/…$/, '')}>
      <Skeleton shape={shape} count={rows} label={label} />
    </div>
  );
}

/** Franja de cifras mientras llegan: misma caja que `FigureStrip` (primera en tinta, 132 px de alto). */
export function LoadingKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="loading-block" role="status" aria-label="Cargando cifras">
      <Skeleton shape="figs" count={Math.min(count, 4)} label="Cargando cifras" />
    </div>
  );
}
