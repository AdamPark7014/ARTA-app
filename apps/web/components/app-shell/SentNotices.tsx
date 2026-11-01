'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { api } from '@/lib/api';
import { noticeAge } from '@/lib/notification-kinds';
import { useRealtime } from '@/lib/realtime';

type Recipient = { id: string; fullName: string; seenAt?: string | null; readAt?: string | null };

type SentNotice = {
  key: string;
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  createdAt: string;
  recipients: Recipient[];
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

/** Lo que manda el resumen de la fila: «Visto por 2 de 3», o que nadie lo ha visto. */
function summary(recipients: Recipient[]) {
  const seen = recipients.filter((r) => r.seenAt || r.readAt).length;
  if (recipients.length === 1) return seen ? 'Visto' : 'Sin ver';
  if (seen === recipients.length) return 'Visto por todos';
  return seen ? `Visto por ${seen} de ${recipients.length}` : 'Nadie lo ha visto';
}

/**
 * «Enviados»: lo que mandaste y quién ya lo vio, para no quedarse con la duda. Visto quiere decir
 * que abrió la campana con ese aviso a la vista, no que ya lo resolvió.
 */
export function SentNotices({ entity }: { entity: string }) {
  const [rows, setRows] = useState<SentNotice[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<SentNotice[]>(`/notifications/sent?entity=${entity}`)
      .then((res) => {
        setRows(Array.isArray(res) ? res : []);
        setError('');
      })
      .catch((e) => {
        setRows([]);
        setError(e instanceof Error ? e.message : 'No se pudo cargar lo enviado');
      });
  }, [entity]);

  useEffect(load, [load]);
  // Alguien acaba de abrir su campana: la fila cambia sin recargar.
  useRealtime('notification:seen', load);

  if (!rows) return <LoadingBlock rows={5} label="Cargando lo enviado…" />;
  if (error) {
    return (
      <p className="hub-error" role="alert">
        {error}
      </p>
    );
  }
  if (!rows.length) {
    return (
      <div className="surface nt-empty nt-empty--page">
        <strong>Todavía no mandas nada</strong>
        <span>Cuando asignes una tarea, arrobes a alguien o pidas una autorización, aquí verás si ya lo vio.</span>
      </div>
    );
  }
  return (
    <div className="surface nt-page__list sent-list">
      <p className="sent-list__help">
        Así les llegó. Visto: abrió su campana con ese aviso a la vista; no quiere decir que ya lo resolvió.
      </p>
      {rows.map((row) => {
        const pending = row.recipients.filter((r) => !r.seenAt && !r.readAt).length;
        return (
          <article key={row.key} className={`sent-row ${pending ? 'is-pending' : ''}`}>
            <div className="sent-row__head">
              {row.linkUrl ? (
                <Link href={row.linkUrl} className="sent-row__title">
                  {row.title}
                </Link>
              ) : (
                <span className="sent-row__title">{row.title}</span>
              )}
              <span className={`sent-row__state ${pending ? 'is-pending' : 'is-seen'}`}>{summary(row.recipients)}</span>
            </div>
            <ul className="sent-row__people">
              {row.recipients.map((r) => {
                const at = r.seenAt || r.readAt;
                return (
                  <li key={r.id} className={at ? 'is-seen' : ''}>
                    <span className="sent-row__face" aria-hidden>
                      {initials(r.fullName)}
                    </span>
                    <span className="sent-row__name">{r.fullName}</span>
                    <span className="sent-row__when">{at ? `Visto ${noticeAge(at)}` : 'Sin ver'}</span>
                  </li>
                );
              })}
            </ul>
            <time className="sent-row__time" dateTime={row.createdAt}>
              Mandado {noticeAge(row.createdAt)}
            </time>
          </article>
        );
      })}
    </div>
  );
}
