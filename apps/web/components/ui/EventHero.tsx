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

/** Cabecera del evento: lo esencial a la vista, lo peligroso en «Más». */
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

  let days: number | null = null;
  if (event.startsAt) {
    const start = new Date(event.startsAt);
    start.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    days = Math.round((start.getTime() - today.getTime()) / 86400000);
  }

  return (
    <section className="ev-hero">
      <div className="ev-hero__top">
        <div>
          <p className="ev-hero__eyebrow">
            <span>{event.entity === 'ARTA' ? 'Arta' : 'Auditorio'}</span>
            <Pill tone={status.tone}>{status.label}</Pill>
          </p>
          <h2 className="ev-hero__title">{event.name}</h2>
          <ul className="ev-hero__meta">
            <li>
              <Icon d={ICONS.date} />
              {eventDateLabel(event.startsAt, event.endsAt)}
            </li>
            {event.schedule ? (
              <li>
                <Icon d={ICONS.time} />
                {event.schedule}
              </li>
            ) : null}
            {place ? (
              <li>
                <Icon d={ICONS.place} />
                {place}
              </li>
            ) : null}
            {event.functions && event.functions > 1 ? (
              <li>
                <Icon d={ICONS.shows} />
                {event.functions} funciones
              </li>
            ) : null}
          </ul>
        </div>

        {days !== null && event.status !== 'CANCELLED' ? (
          <div className="ev-hero__countdown">
            {days > 1 ? (
              <>
                <span className="ev-hero__days">{days}</span>
                <span className="ev-hero__days-label">días para el show</span>
              </>
            ) : (
              <span className="ev-hero__days" style={{ fontSize: '1.35rem' }}>
                {days === 1 ? 'Mañana' : days === 0 ? 'Hoy' : 'Ya pasó'}
              </span>
            )}
          </div>
        ) : null}
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
