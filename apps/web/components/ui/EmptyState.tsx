'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  description?: string;
  steps?: string[];
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
};

export function EmptyState({ title, description, steps, actionHref, actionLabel, children }: Props) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {description ? <p className="muted">{description}</p> : null}
      {steps?.length ? (
        <ol>
          {steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
      {actionHref && actionLabel ? (
        <Link className="btn" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
      {children}
    </div>
  );
}

/**
 * Pantalla sin acceso, igual en todo el panel: candado, «No tienes acceso a …»,
 * a quién pedirlo y la salida a Inicio. Nada de nombres escritos a mano.
 *
 *   if (!can('finance.read')) return <NoAccess what="Finanzas" />;
 */
export function NoAccess({
  what,
  ask = 'Si la necesitas, pídela a dirección.',
  backHref = '/dashboard',
  backLabel = 'Volver a Inicio',
}: {
  what: string;
  ask?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="empty-lite noaccess" role="status">
      <span className="empty-lite__icon" aria-hidden>
        <svg viewBox="0 0 24 24" width="20" height="20" focusable="false">
          <path
            d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM12 15v2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="empty-lite__title">No tienes acceso a {what}</p>
      <p>{ask}</p>
      <div className="empty-lite__actions">
        <Link className="btn ghost" href={backHref}>
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
