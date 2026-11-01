'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { groupNotices, needsAction } from '@/lib/notification-kinds';
import { useRealtime, useRealtimeStatus } from '@/lib/realtime';
import { useUser } from '@/lib/user-context';
import { LiveToasts, type LiveToast } from './LiveToasts';
import { NoticeRow, type Notice } from './NoticeRow';

const POLL_MS = 120_000;
const PANEL_TAKE = 30;

type Filter = 'all' | 'unread' | 'action';

function canNotifyDesktop() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Aviso del sistema con la pestaña en segundo plano; misma etiqueta que el push, así no salen dos. */
function systemNotice(title: string, body: string | null | undefined, tag: string, onClick: () => void) {
  if (!canNotifyDesktop() || window.Notification.permission !== 'granted') return;
  try {
    const shown = new window.Notification(title, {
      body: body ?? undefined,
      tag,
      icon: '/icons/icon-192.png',
      lang: 'es-MX',
    });
    shown.onclick = () => {
      window.focus();
      shown.close();
      onClick();
    };
  } catch {
    // Algunos navegadores móviles solo permiten avisos desde un service worker.
  }
}

/** «(3) Tareas · ARTA» en la pestaña y el globo del ícono si el panel está instalado. */
function useUnreadSignals(count: number) {
  useEffect(() => {
    const strip = (title: string) => title.replace(/^\(\d+\+?\)\s/, '');
    const paint = () => {
      const clean = strip(document.title);
      const next = count ? `(${count > 99 ? '99+' : count}) ${clean}` : clean;
      if (document.title !== next) document.title = next;
    };
    paint();
    // Next cambia el título al navegar: se le vuelve a poner el contador.
    const node = document.querySelector('title');
    const watcher = node ? new MutationObserver(paint) : null;
    if (node) watcher?.observe(node, { childList: true });
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (count && nav.setAppBadge) void nav.setAppBadge(count).catch(() => undefined);
    else if (!count && nav.clearAppBadge) void nav.clearAppBadge().catch(() => undefined);
    return () => {
      watcher?.disconnect();
      document.title = strip(document.title);
    };
  }, [count]);
}

/**
 * Avisos dentro de la plataforma: campana, tarjeta en vivo y aviso del sistema.
 *
 * Junta 2026-08-28: «la persona a quien se le asigne una tarea deberá recibir
 * una notificación dentro de la plataforma, para que quede enterada».
 *
 * Llegan en vivo por socket (`notification:new` / `notification:read`). Con la
 * pestaña a la vista sale una tarjeta arriba a la derecha (`LiveToasts`) y la
 * campana da un toque; con la pestaña en segundo plano, un aviso del sistema, si
 * la persona lo permitió. Tocar un aviso del sistema o del push trae `?notif=<id>`
 * y aquí se marca leído al llegar.
 *
 * Campana y contador son de la entidad activa (Arta o Auditorio) más los avisos
 * sin entidad (docs/entidades-arta-auditorio.md). El `unread` que traen los
 * eventos del socket suma las dos entidades, así que se vuelve a pedir el contador.
 */
export function NotificationBell() {
  const router = useRouter();
  const pathname = usePathname();
  const { entity } = useUser();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [ringing, setRinging] = useState(false);
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useUnreadSignals(count);

  const loadCount = useCallback(async () => {
    try {
      const res = await api<{ count: number }>(`/notifications/unread-count?entity=${entity}`);
      setCount(res.count);
    } catch {
      // Sesión caída o API en despliegue: el badge simplemente no se actualiza.
    }
  }, [entity]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<Notice[]>(`/notifications?take=${PANEL_TAKE}&entity=${entity}`));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  const pushToast = useCallback((toast: LiveToast) => {
    setToasts((prev) => [toast, ...prev.filter((t) => t.key !== toast.key)].slice(0, 3));
    setRinging(true);
  }, []);

  useEffect(() => {
    if (!ringing) return;
    const id = window.setTimeout(() => setRinging(false), 900);
    return () => window.clearTimeout(id);
  }, [ringing]);

  const markRead = useCallback(
    async (n: Notice) => {
      if (n.readAt) return;
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
      setCount((c) => Math.max(0, c - 1));
      await api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => null);
    },
    [],
  );

  useRealtime<{ notification?: Notice; unread?: number }>('notification:new', (p) => {
    const n = p?.notification;
    void loadCount();
    if (!n) return;
    const mine = !n.entity || n.entity === entity;
    // Lo de la otra entidad no entra a esta campana (sí al aviso del sistema, abajo).
    // Una ráfaga llega con el mismo id: la tarjeta se actualiza y sube.
    if (mine) setItems((prev) => [n, ...prev.filter((i) => i.id !== n.id)].slice(0, PANEL_TAKE));
    if (document.hidden) {
      systemNotice(n.title, n.body, `arta-${n.id}`, () => {
        void markRead(n);
        if (n.linkUrl) router.push(n.linkUrl);
      });
    } else if (mine && !(pathname === '/chat' && n.type.startsWith('chat.'))) {
      pushToast({
        key: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        onOpen: () => {
          void markRead(n);
          if (n.linkUrl) router.push(n.linkUrl);
        },
      });
    }
  });

  // Mensajes de chat (directos y canales sin silenciar): no van a la campana; dentro del
  // chat ya se ven, fuera de él salen como tarjeta o como aviso del sistema.
  useRealtime<{
    channelId: string;
    messageId: string;
    preview?: string;
    senderName?: string | null;
    channelName?: string | null;
    notify?: boolean;
  }>('chat:channel-activity', (p) => {
    if (!p?.notify) return;
    if (!document.hidden && pathname === '/chat') return;
    const who = p.senderName || 'Nuevo mensaje';
    // Canal de evento: «Artista · Evento» se lee por el evento; un grupo («Ana, Beto») va sin «#».
    const name = p.channelName?.trim() || '';
    const dot = name.indexOf(' · ');
    const place = !name ? '' : dot > 0 ? name.slice(dot + 3) : name.includes(', ') ? name : `#${name}`;
    const title = place ? `${who} en ${place}` : who;
    const go = () => router.push(`/chat?channel=${encodeURIComponent(p.channelId)}&msg=${encodeURIComponent(p.messageId)}`);
    if (document.hidden) systemNotice(title, p.preview, `chat-${p.channelId}`, go);
    else pushToast({ key: `chat-${p.channelId}`, type: 'chat.message', title, body: p.preview, onOpen: go });
  });

  useRealtime<{ notificationId?: string; unread?: number }>('notification:read', (p) => {
    void loadCount();
    const at = new Date().toISOString();
    if (p?.notificationId) {
      setItems((prev) => prev.map((i) => (i.id === p.notificationId ? { ...i, readAt: i.readAt || at } : i)));
    } else {
      setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt || at })));
    }
  });

  useRealtimeStatus(loadCount);

  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, POLL_MS);
    return () => clearInterval(id);
  }, [loadCount]);

  // Se llegó tocando un aviso del sistema o del push: queda leído y la dirección limpia.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const id = query.get('notif');
    if (!id) return;
    query.delete('notif');
    const rest = query.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    void api(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' })
      .catch(() => null)
      .then(loadCount);
  }, [loadCount]);

  useEffect(() => {
    if (open) loadItems();
  }, [open, loadItems]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  function toggle() {
    setOpen((v) => !v);
    // El permiso solo se puede pedir desde un clic.
    if (canNotifyDesktop() && window.Notification.permission === 'default') {
      void window.Notification.requestPermission().catch(() => undefined);
    }
  }

  function openNotification(n: Notice) {
    setOpen(false);
    void markRead(n);
    if (n.linkUrl) router.push(n.linkUrl);
  }

  async function markAll() {
    setCount(0);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })));
    await api(`/notifications/read-all?entity=${entity}`, { method: 'POST' }).catch(() => null);
  }

  const unreadItems = items.filter((i) => !i.readAt);
  const actionItems = items.filter((i) => !i.readAt && needsAction(i.type));
  const shown = filter === 'unread' ? unreadItems : filter === 'action' ? actionItems : items;
  const empty =
    filter === 'action'
      ? 'Nada espera tu decisión.'
      : filter === 'unread'
        ? 'Ya leíste todo.'
        : 'Aquí llegará lo que necesite tu atención.';

  return (
    <div className="notif" ref={wrapRef}>
      <button
        type="button"
        className={`notif-btn ${count ? 'notif-btn--unread' : ''} ${ringing ? 'is-ringing' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count ? `Avisos (${count} sin leer)` : 'Avisos'}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
          <path
            d="M12 3a5.5 5.5 0 0 0-5.5 5.5v3.2L5 15.2h14l-1.5-3.5V8.5A5.5 5.5 0 0 0 12 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M10 18a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {count ? <span className="notif-badge">{count > 9 ? '9+' : count}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Avisos">
          <div className="notif-panel__head">
            <strong className="notif-panel__title">Avisos</strong>
            {count ? (
              <button type="button" className="btn-quiet" onClick={markAll}>
                Marcar todo leído
              </button>
            ) : null}
          </div>
          <div className="seg notif-panel__seg" role="tablist" aria-label="Filtrar avisos">
            {(
              [
                ['all', 'Todos', null],
                ['unread', 'Sin leer', unreadItems.length],
                ['action', 'Por atender', actionItems.length],
              ] as const
            ).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={`seg__btn ${filter === key ? 'is-on' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
                {n ? <span className="seg__count">{n}</span> : null}
              </button>
            ))}
          </div>
          <div className="notif-panel__body">
            {loading && !items.length ? (
              <div className="nt-skeleton" aria-label="Cargando avisos">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton skeleton--row" />
                ))}
              </div>
            ) : null}
            {!loading && !shown.length ? (
              <div className="nt-empty">
                <strong>{filter === 'all' ? 'Sin avisos por ahora' : 'Todo al día'}</strong>
                <span>{empty}</span>
              </div>
            ) : null}
            {groupNotices(shown).map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="nt-group">{group.label}</h3>
                {group.items.map((n) => (
                  <NoticeRow key={n.id} notice={n} onOpen={openNotification} onMarkRead={markRead} />
                ))}
              </section>
            ))}
          </div>
          <div className="notif-panel__foot">
            <Link href="/notifications" className="btn-quiet" onClick={() => setOpen(false)}>
              Ver todos los avisos
            </Link>
            <Link href="/settings#avisos" className="btn-quiet" onClick={() => setOpen(false)}>
              Preferencias
            </Link>
          </div>
        </div>
      ) : null}

      <LiveToasts toasts={toasts} onDismiss={(key) => setToasts((prev) => prev.filter((t) => t.key !== key))} />
    </div>
  );
}
