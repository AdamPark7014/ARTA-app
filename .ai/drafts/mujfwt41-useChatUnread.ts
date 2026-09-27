'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRealtime, useRealtimeStatus } from '@/lib/realtime';

/**
 * Mensajes sin leer para el punto del menú.
 *
 * En vivo por socket (`chat:unread` trae el total; `chat:channel-activity`
 * avisa de un mensaje nuevo). El sondeo cada 60 s y al volver a la pestaña
 * queda de red de seguridad; la página del chat también avisa con
 * `arta:chat-read` cuando marca una conversación.
 */
export function useChatUnread(enabled: boolean): number {
  const [total, setTotal] = useState(0);

  const refresh = useCallback(() => {
    if (document.hidden) return;
    api<{ total: number }>('/chat/unread')
      .then((r) => setTotal(Number(r?.total) || 0))
      .catch(() => undefined);
  }, []);

  useRealtime<{ total?: number }>(
    'chat:unread',
    (p) => {
      if (typeof p?.total === 'number') setTotal(p.total);
      else refresh();
    },
    enabled,
  );
  useRealtime('chat:channel-activity', refresh, enabled);
  useRealtimeStatus(refresh, enabled);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('arta:chat-read', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('arta:chat-read', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, refresh]);

  return total;
}
