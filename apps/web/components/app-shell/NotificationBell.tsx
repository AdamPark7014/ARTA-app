'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  readAt?: string | null;
  createdAt: string;
  actor?: { id: string; fullName: string } | null;
};

const POLL_MS = 45_000;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString('es-MX');
}

/**
 * Avisos dentro de la plataforma.
 *
 * Junta 2026-08-28: «la persona a quien se le asigne una tarea deberá recibir
 * una notificación dentro de la plataforma, para que quede enterada».
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const loadCount = useCallback(async () => {
    try {
      const res = await api<{ count: number }>('/notifications/unread-count');
      setCount(res.count);
    } catch {
      // Sesión caída o API en despliegue: el badge simplemente no se actualiza.
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api<Notification[]>('/notifications?take=20'));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCount();
    const id = setInterval(loadCount, POLL_MS);
    return () => clearInterval(id);
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

  async function openNotification(n: Notification) {
    setOpen(false);
    if (!n.readAt) {
      setItems((prev) =>
        prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)),
      );
      setCount((c) => Math.max(0, c - 1));
      await api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => null);
    }
    if (n.linkUrl) router.push(n.linkUrl);
  }

  async function markAll() {
    setCount(0);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })));
    await api('/notifications/read-all', { method: 'POST' }).catch(() => null);
  }

  return (
    <div className="notif" ref={wrapRef}>
      <button
        type="button"
        className={`notif-btn ${count ? 'notif-btn--unread' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={count ? `Avisos (${count} sin leer)` : 'Avisos'}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
          <path
            d="M12 3a5.5 5.5 0 0 0-5.5 5.5v3.2L5 15.2h14l-1.5-3.5V8.5A5.5 5.5 0 0 0 12 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M10 18a2 2 0 0 0 4 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        {count ? <span className="notif-badge">{count > 9 ? '9+' : count}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Avisos">
          <div className="notif-panel__head">
            <strong>Avisos</strong>
            {count ? (
              <button type="button" className="btn ghost btn-sm" onClick={markAll}>
                Marcar todo leído
              </button>
            ) : null}
          </div>
          <div className="notif-panel__body">
            {loading ? <p className="muted kpi-sub">Cargando…</p> : null}
            {!loading && !items.length ? (
              <p className="muted kpi-sub">Sin avisos por ahora.</p>
            ) : null}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`notif-item ${n.readAt ? '' : 'notif-item--unread'}`}
                onClick={() => openNotification(n)}
              >
                <span className="notif-item__title">{n.title}</span>
                {n.body ? <span className="notif-item__body">{n.body}</span> : null}
                <span className="notif-item__meta muted">{timeAgo(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
