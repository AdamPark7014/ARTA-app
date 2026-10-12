'use client';

import type { ReactNode } from 'react';
import { Pill } from './Lite';

type HeroEvent = {
  entity: string;
  status: string;
  name: string;
  startsAt?: string | null;
  endsAt?: string | null;
  schedule?: string | null;
  functions?: number | null;
  venue?: string | null;
  city?: string | null;
};

export type HeroMenuItem = { label: string; onClick: () => void; danger?: boolean };

const STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Borrador', tone: 'draft' },
  ACTIVE: { label: 'Activo', tone: 'ok' },
  CLOSED: { label: 'Cerrado', tone: 'review' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
};

function day(iso?: string | null, withYear = true) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** «sáb 19 sep 2026» o «jue 29 oct al lun 2 nov 2026». */
export function eventDateLabel(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt) return 'Sin fecha';
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  if (end && end.toDateString() !== start.toDateString()) {
    return `${day(startsAt, false)} al ${day(endsAt)}`;
  }
  return day(startsAt);
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  date: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  time: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  place: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  shows: 'M4 7h16M4 12h16M4 17h10',
};

/** «Hoy», «Mañana», «En 3 días», «Hace 2 días»: cuánto falta, en una ficha pequeña. */
function whenLabel(days: number) {
  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days > 1) return `En ${days} días`;
  if (days === -1) return 'Ayer';
  return `Hace ${-days} días`;
}

/**
 * Cabecera del evento: compacta (pulido 12-10-2026). Antes ocupaba casi la mitad
 * de la ventana en cada pestaña: título de 34 px en dos renglones, la cuenta
 * regresiva enorme y las acciones en su propio renglón. Ahora: entidad, estado y
 * cuánto falta en un renglón; el título (26 px, dos renglones como mucho); los
 * datos en uno; las acciones a la derecha. Lo peligroso sigue en «Más».
 */
export function EventHero({
  event,
  actions,
  menu,
}: {
  event: HeroEvent;
  actions?: ReactNode;
  menu?: HeroMenuItem[];
}) {
  const status = STATUS[event.status] || { label: event.status, tone: 'draft' };
  const place = [event.venue, event.city].filter(Boolean).join(', ');
  const date = eventDateLabel(event.startsAt, event.endsAt);

  let days: number | null = null;
  if (event.startsAt) {
    const start = new Date(event.startsAt);
    start.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    days = Math.round((start.getTime() - today.getTime()) / 86400000);
  }
  const showWhen = days !== null && event.status !== 'CANCELLED' && event.status !== 'CLOSED';

  return (
    <section className="ev-hero ev-hero--compact">
      <div className="ev-hero__copy">
        <p className="ev-hero__eyebrow">
          <span>{event.entity === 'ARTA' ? 'Arta' : 'Auditorio'}</span>
          <Pill tone={status.tone}>{status.label}</Pill>
          {showWhen && days !== null ? (
            <span className={`ev-when ${days === 0 ? 'is-today' : days < 0 ? 'is-past' : ''}`}>{whenLabel(days)}</span>
          ) : null}
        </p>
        <h2 className="ev-hero__title" data-trunc>
          {event.name}
        </h2>
        <ul className="ev-hero__meta">
          <li>
            <Icon d={ICONS.date} />
            {date}
          </li>
          {event.schedule ? (
            <li>
              <Icon d={ICONS.time} />
              {event.schedule}
            </li>
          ) : null}
          {event.functions && event.functions > 1 ? (
            <li>
              <Icon d={ICONS.shows} />
              {event.functions} funciones
            </li>
          ) : null}
          {place ? (
            <li className="ev-hero__place" title={place}>
              <Icon d={ICONS.place} />
              <span className="ev-hero__place-text">{place}</span>
            </li>
          ) : null}
        </ul>
      </div>

      {actions || menu?.length ? (
        <div className="ev-hero__actions">
          {actions}
          {menu?.length ? (
            <details className="ev-more">
              <summary className="btn ghost btn-sm" aria-label="Más acciones">
                Más
              </summary>
              <div className="ev-more__menu" role="menu">
                {menu.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    role="menuitem"
                    className={m.danger ? 'is-danger' : ''}
                    onClick={(e) => {
                      (e.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                      m.onClick();
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
