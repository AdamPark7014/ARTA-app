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
  /** Avance de 0 a 100: pinta una barra bajo la cifra. Solo cuando la cifra es parte de un total. */
  meter?: number;
};

/**
 * Franja de cifras (diseño por módulo, 21-11-2026): mosaicos sueltos; la
 * primera cifra es la que manda y va en tinta. Estilos en `_modulos.scss` y `_mosaico.scss`.
 */
export function FigureStrip({ items, label }: { items: Figure[]; label: string }) {
  return (
    <section className="fstrip" aria-label={label} data-count={items.length}>
      {items.map((it) => {
        const body = (
          <>
            <span className="fstrip__label">{it.label}</span>
            <span className="fstrip__foot">
              <span className={`fstrip__value ${it.tone ? `is-${it.tone}` : ''}`}>{it.value}</span>
              {it.meter != null ? (
                <span className="fstrip__meter" aria-hidden>
                  <i style={{ width: `${Math.max(0, Math.min(100, it.meter))}%` }} />
                </span>
              ) : null}
              {it.sub ? <span className="fstrip__sub">{it.sub}</span> : null}
            </span>
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
