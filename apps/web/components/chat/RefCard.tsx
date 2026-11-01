'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Icon } from './ChatAttachment';
import { plainText } from './chat-model';
import { REF_GROUPS, REF_ICON, type ChatRef, type RefAction } from './chat-refs';
import { Avatar } from './chat-ui';

const stop = (e: MouseEvent) => e.stopPropagation();

const ACTION_LABEL: Record<RefAction, string> = {
  deliver: 'Entregar',
  complete: 'Marcar hecha',
  approve: 'Aprobar',
};

const KIND_WORD = Object.fromEntries(REF_GROUPS.map((g) => [g.kind, g.title])) as Record<ChatRef['kind'], string>;

/** La arroba dentro del texto. Sin acceso se queda como etiqueta, sin liga ni detalle. */
export function RefChip({ r }: { r: ChatRef }) {
  if (r.missing) {
    return (
      <span className="chat-ref is-missing" title="Esto ya no existe">
        <Icon d={REF_ICON[r.kind]} size={12} />
        {r.label}
      </span>
    );
  }
  if (r.href && r.canOpen !== false) {
    const tip = [r.statusLabel, r.subtitle, r.amount].filter(Boolean).join(' · ');
    return (
      <Link href={r.href} className="chat-ref" title={tip || undefined} onClick={stop}>
        <Icon d={REF_ICON[r.kind]} size={12} />
        {r.label}
      </Link>
    );
  }
  return (
    <span className="chat-ref is-locked" title={r.resolved === false ? undefined : 'No tienes acceso a esto'}>
      <Icon d={REF_ICON[r.kind]} size={12} />
      {r.label}
    </span>
  );
}

/** Tarjeta en vivo: qué es, cómo va y lo que te toca hacer ahí mismo. */
export function RefCard({
  r,
  onAction,
  busy,
  extra,
}: {
  r: ChatRef;
  onAction?: (r: ChatRef, action: RefAction) => void;
  busy?: boolean;
  extra?: React.ReactNode;
}) {
  const actions = onAction ? (r.actions ?? []) : [];
  return (
    <div className={`ref-card ref-card--${r.kind} is-${r.tone ?? 'info'}`} onClick={stop}>
      <span className="ref-card__ico" aria-hidden>
        <Icon d={REF_ICON[r.kind]} size={16} />
      </span>
      <div className="ref-card__main">
        {r.href ? (
          <Link href={r.href} className="ref-card__title">
            {r.title || r.label}
          </Link>
        ) : (
          <span className="ref-card__title">{r.title || r.label}</span>
        )}
        <div className="ref-card__meta">
          {r.statusLabel ? <span className={`ref-pill is-${r.tone ?? 'info'}`}>{r.statusLabel}</span> : null}
          {r.amount ? <span className="ref-card__amount">{r.amount}</span> : null}
          {r.subtitle ? <span className="ref-card__sub">{r.subtitle}</span> : null}
        </div>
        {r.progress != null ? (
          <div className="ref-card__bar" role="progressbar" aria-valuenow={r.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Avance">
            <span style={{ width: `${Math.min(100, Math.max(0, r.progress))}%` }} />
          </div>
        ) : null}
      </div>
      {r.people?.length ? (
        <span className="ref-card__people" title={r.people.map((p) => p.fullName).join(', ')}>
          {r.people.slice(0, 3).map((p) => (
            <Avatar key={p.id} id={p.id} name={p.fullName} size="sm" />
          ))}
          {r.people.length > 3 ? <span className="ref-card__more">+{r.people.length - 3}</span> : null}
        </span>
      ) : null}
      {actions.length || extra ? (
        <div className="ref-card__actions">
          {actions.map((a) => (
            <button key={a} type="button" className="ref-card__do" disabled={busy} onClick={() => onAction?.(r, a)}>
              {ACTION_LABEL[a]}
            </button>
          ))}
          {extra}
        </div>
      ) : null}
    </div>
  );
}

/** Debajo del mensaje: hasta tres; lo demás con «ver más». Sin acceso no hay tarjeta, solo el chip. */
export function RefCards({
  refs,
  onAction,
  busyKey,
}: {
  refs: ChatRef[];
  onAction?: (r: ChatRef, action: RefAction) => void;
  busyKey?: string | null;
}) {
  const [all, setAll] = useState(false);
  const cards = refs.filter((r) => r.canOpen && !r.missing);
  if (!cards.length) return null;
  const shown = all ? cards : cards.slice(0, 3);
  return (
    <div className="ref-cards">
      {shown.map((r) => (
        <RefCard key={`${r.kind}:${r.id}`} r={r} onAction={onAction} busy={busyKey === `${r.kind}:${r.id}`} />
      ))}
      {cards.length > shown.length ? (
        <button type="button" className="ref-cards__more" onClick={(e) => { e.stopPropagation(); setAll(true); }}>
          Ver {cards.length - shown.length} más
        </button>
      ) : null}
    </div>
  );
}

type Backlink = {
  messageId: string;
  channelId: string;
  channelName: string;
  author: { id: string; fullName: string };
  excerpt: string;
  at: string;
  href: string;
};

/** «Mencionado en»: dónde se ha hablado de esto. No ocupa lugar si nadie lo ha mencionado. */
export function RefBacklinks({ kind, id }: { kind: ChatRef['kind']; id: string }) {
  const [links, setLinks] = useState<Backlink[]>([]);
  useEffect(() => {
    let alive = true;
    api<{ links: Backlink[] }>(`/chat/refs/backlinks?kind=${kind}&id=${encodeURIComponent(id)}`)
      .then((res) => {
        if (alive) setLinks(res.links ?? []);
      })
      .catch(() => {
        if (alive) setLinks([]);
      });
    return () => {
      alive = false;
    };
  }, [kind, id]);
  if (!links.length) return null;
  return (
    <section className="ref-links" aria-label="Mencionado en el chat">
      <h4 className="ref-links__title">Mencionado en el chat</h4>
      <ul>
        {links.map((l) => (
          <li key={l.messageId}>
            <Link href={l.href} className="ref-links__row">
              <span className="ref-links__where">{l.channelName}</span>
              <span className="ref-links__text">
                <strong>{l.author.fullName.split(/\s+/)[0]}:</strong> {plainText(l.excerpt)}
              </span>
              <time className="ref-links__time" dateTime={l.at}>
                {new Date(l.at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
              </time>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export { KIND_WORD };
