'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/**
 * Mensajes sin leer para el punto del menú.
 *
 * Cada 30 s y al volver a la pestaña; la página del chat avisa con el evento
 * `arta:chat-read` cuando marca una conversación, así el número baja al instante.
 */
export function useChatUnread(enabled: boolean): number {
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      api<{ total: number }>('/chat/unread')
        .then((r) => {
          if (alive) setTotal(Number(r?.total) || 0);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    window.addEventListener('arta:chat-read', load);
    document.addEventListener('visibilitychange', load);

    const handleCustomEvent = () => {
      load();
    };

    window.addEventListener('arta:chat-unread', handleCustomEvent);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('arta:chat-read', load);
      document.removeEventListener('visibilitychange', load);
      window.removeEventListener('arta:chat-unread', handleCustomEvent);
    };
  }, [enabled]);

  return total;
}