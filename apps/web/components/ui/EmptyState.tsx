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
