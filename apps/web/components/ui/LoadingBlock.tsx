'use client';

type Props = {
  rows?: number;
  label?: string;
};

/** Lightweight loading placeholder — no chart libs. */
export function LoadingBlock({ rows = 4, label = 'Cargando…' }: Props) {
  return (
    <div className="loading-block" aria-busy="true" aria-label={label}>
      <p className="muted loading-block__label">{label}</p>
      <div className="skeleton-stack">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton skeleton--row" style={{ width: `${88 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}

export function LoadingKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid-cards kpi-grid-dense" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kpi">
          <div className="skeleton skeleton--label" />
          <div className="skeleton skeleton--value" />
        </div>
      ))}
    </div>
  );
}
