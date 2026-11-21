import type { ReactNode } from 'react';
import Link from 'next/link';

export type Figure = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Solo para avisar: pérdida, vencidos. Nunca de adorno. */
  tone?: 'danger' | 'warn';
  href?: string;
  onClick?: () => void;
  /** Cuando la cifra es un filtro que se prende y apaga. */
  pressed?: boolean;
};

/**
 * Franja de cifras (diseño por módulo, 21-11-2026): una sola tarjeta, la
 * primera cifra es la que manda y va más grande. Estilos en `_acabado.scss`.
 */
export function FigureStrip({ items, label }: { items: Figure[]; label: string }) {
  return (
    <section className="fstrip" aria-label={label} data-count={items.length}>
      {items.map((it) => {
        const body = (
          <>
            <span className="fstrip__label">{it.label}</span>
            <span className={`fstrip__value ${it.tone ? `is-${it.tone}` : ''}`}>{it.value}</span>
            {it.sub ? <span className="fstrip__sub">{it.sub}</span> : null}
          </>
        );
        if (it.href) {
          return (
            <Link key={it.label} className="fstrip__item is-action" href={it.href}>
              {body}
            </Link>
          );
        }
        if (it.onClick) {
          return (
            <button
              key={it.label}
              type="button"
              className={`fstrip__item is-action ${it.pressed ? 'is-on' : ''}`}
              aria-pressed={it.pressed}
              onClick={it.onClick}
            >
              {body}
            </button>
          );
        }
        return (
          <div key={it.label} className="fstrip__item">
            {body}
          </div>
        );
      })}
    </section>
  );
}
