'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRealtime, useRealtimeStatus } from '@/lib/realtime';
import { useUser } from '@/lib/user-context';

/**
 * Mensajes sin leer para el punto del menú, solo de la entidad activa (Arta o Auditorio)
 * más los directos, que son personales (docs/entidades-arta-auditorio.md).
 *
 * En vivo por socket (`chat:unread` avisa de un cambio; `chat:channel-activity`
 * de un mensaje nuevo). El total que trae `chat:unread` suma las dos entidades,
 * así que se vuelve a pedir el de la activa en vez de usarlo. El sondeo cada 60 s
 * y al volver a la pestaña queda de red de seguridad; la página del chat también
 * avisa con `arta:chat-read` cuando marca una conversación.
 */
export function useChatUnread(enabled: boolean): number {
  const { entity } = useUser();
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    if (document.hidden) return;
    api<{ total: number }>(`/chat/unread?entity=${entity}`)
      .then((r) => setTotal(Number(r?.total) || 0))
      .catch(() => undefined);
  }, [entity]);

  useRealtime('chat:unread', load, enabled);
  useRealtime('chat:channel-activity', load, enabled);
  useRealtimeStatus(load, enabled);

  useEffect(() => {
    if (!enabled) return;
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener('arta:chat-read', load);
    document.addEventListener('visibilitychange', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('arta:chat-read', load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [enabled, load]);

  return total;
}
