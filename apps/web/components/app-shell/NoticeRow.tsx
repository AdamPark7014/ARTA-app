'use client';

import { CHANNEL_ICONS, CHANNEL_LABELS, channelOf, needsAction, noticeAction, noticeAge } from '@/lib/notification-kinds';

export type Notice = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
  actor?: { id: string; fullName: string } | null;
  /** ARTA o EXPLANADA; null = de la cuenta o de un directo, se ve en las dos. Falta en API viejo. */
  entity?: 'ARTA' | 'EXPLANADA' | null;
  /** De qué trata: sobre eso actúa su botón. Falta en API viejo. */
  targetKind?: string | null;
  targetId?: string | null;
};

/** Ícono de la categoría: lleno si el aviso espera algo de quien lo lee, contorno si es para enterarse. */
export function NoticeIcon({ type }: { type: string }) {
  const channel = channelOf(type);
  return (
    <span className={`nt-ico ${needsAction(type) ? 'is-action' : ''}`} aria-hidden>
      <svg viewBox="0 0 24 24" width="15" height="15" focusable="false">
        <path d={CHANNEL_ICONS[channel]} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** Un aviso en la campana y en la pantalla de Avisos. */
export function NoticeRow({
  notice,
  onOpen,
  onMarkRead,
}: {
  notice: Notice;
  onOpen: (notice: Notice) => void;
  onMarkRead?: (notice: Notice) => void;
}) {
  const unread = !notice.readAt;
  const action = unread ? noticeAction(notice) : null;
  return (
    <div className={`nt-row ${unread ? 'is-unread' : ''}`}>
      <button type="button" className="nt-row__open" onClick={() => onOpen(notice)}>
        <NoticeIcon type={notice.type} />
        <span className="nt-row__copy">
          <span className="nt-row__title">{notice.title}</span>
          {notice.body ? <span className="nt-row__body">{notice.body}</span> : null}
          <span className="nt-row__meta">
            {CHANNEL_LABELS[channelOf(notice.type)]} · {noticeAge(notice.createdAt)}
          </span>
        </span>
      </button>
      {action ? (
        <button type="button" className="nt-row__act" onClick={() => onOpen({ ...notice, linkUrl: action.href })}>
          {action.label}
        </button>
      ) : null}
      {unread ? (
        onMarkRead ? (
          <button
            type="button"
            className="nt-row__dot"
            aria-label={`Marcar como leído: ${notice.title}`}
            title="Marcar como leído"
            onClick={() => onMarkRead(notice)}
          />
        ) : (
          <span className="nt-row__dot nt-row__dot--still" aria-hidden />
        )
      ) : null}
    </div>
  );
}
