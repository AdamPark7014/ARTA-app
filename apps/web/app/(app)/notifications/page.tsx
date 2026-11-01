'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell/AppShell';
import { NoticeRow, reportSeen, type Notice } from '@/components/app-shell/NoticeRow';
import { SentNotices } from '@/components/app-shell/SentNotices';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageChrome';
import { api } from '@/lib/api';
import { CHANNEL_LABELS, channelOf, groupNotices, needsAction, type NoticeChannel } from '@/lib/notification-kinds';
import { useRealtime } from '@/lib/realtime';
import { useUser } from '@/lib/user-context';

const PAGE = 50;

type Filter = 'all' | 'unread' | 'action' | 'sent' | NoticeChannel;

/**
 * Todos los avisos de la entidad activa: la campana enseña los últimos, aquí está
 * el historial. También es a donde lleva un aviso del navegador que no trae liga.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const { entity } = useUser();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const seenSent = useRef(new Set<string>());

  // `?tab=enviados`: el acuse de varios avisos lleva aquí.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'enviados') setFilter('sent');
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const rows = await api<Notice[]>(`/notifications?take=${PAGE}&entity=${entity}`);
      setItems(rows);
      setMore(rows.length === PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los avisos');
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtime<{ notification?: Notice }>('notification:new', (p) => {
    const n = p?.notification;
    if (n && (!n.entity || n.entity === entity)) setItems((prev) => [n, ...prev.filter((i) => i.id !== n.id)]);
  });

  useRealtime<{ notificationId?: string }>('notification:read', (p) => {
    const at = new Date().toISOString();
    setItems((prev) =>
      prev.map((i) => (!p?.notificationId || i.id === p.notificationId ? { ...i, readAt: i.readAt || at } : i)),
    );
  });

  async function loadMore() {
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await api<Notice[]>(
        `/notifications?take=${PAGE}&entity=${entity}&before=${encodeURIComponent(last.createdAt)}`,
      );
      setItems((prev) => [...prev, ...rows.filter((r) => !prev.some((i) => i.id === r.id))]);
      setMore(rows.length === PAGE);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar más avisos');
    } finally {
      setLoadingMore(false);
    }
  }

  function markRead(n: Notice) {
    if (n.readAt) return;
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
    void api(`/notifications/${n.id}/read`, { method: 'PATCH' }).catch(() => null);
  }

  function open(n: Notice) {
    markRead(n);
    if (n.linkUrl) router.push(n.linkUrl);
  }

  async function markAll() {
    setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })));
    await api(`/notifications/read-all?entity=${entity}`, { method: 'POST' }).catch(() => null);
  }

  const channels = useMemo(() => {
    const seen = new Set(items.map((i) => channelOf(i.type)));
    return (Object.keys(CHANNEL_LABELS) as NoticeChannel[]).filter((c) => seen.has(c));
  }, [items]);

  const unread = items.filter((i) => !i.readAt).length;
  const shown = items.filter((i) => {
    if (filter === 'sent') return false;
    if (filter === 'all') return true;
    if (filter === 'unread') return !i.readAt;
    if (filter === 'action') return !i.readAt && needsAction(i.type);
    return channelOf(i.type) === filter;
  });

  // Lo que está en pantalla ya se vio: a quien lo mandó le llega el acuse.
  useEffect(() => {
    if (!loading && filter !== 'sent') reportSeen(shown, seenSent.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filter, items]);

  const tabs: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: 'Todos' },
    { key: 'unread', label: unread ? `Sin leer · ${unread}` : 'Sin leer' },
    { key: 'action', label: 'Por atender' },
    { key: 'sent', label: 'Enviados' },
    ...channels.map((c) => ({ key: c as Filter, label: CHANNEL_LABELS[c] })),
  ];

  return (
    <AppShell title="Avisos">
      <div className="stack page-workspace nt-page">
        <PageHeader
          title="Avisos"
          description="Lo que ha pasado en tus eventos y lo que espera tu decisión."
          below={
            <div className="chips nt-page__tabs" role="tablist" aria-label="Filtrar avisos">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === tab.key}
                  className={`nt-chip ${filter === tab.key ? 'is-on' : ''}`}
                  onClick={() => setFilter(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          }
        >
          {unread && filter !== 'sent' ? (
            <button type="button" className="btn ghost btn-sm" onClick={markAll}>
              Marcar todo leído
            </button>
          ) : null}
          <Link href="/settings#avisos" className="btn ghost btn-sm">
            Preferencias
          </Link>
        </PageHeader>

        {error ? (
          <p className="hub-error" role="alert">
            {error}
          </p>
        ) : null}

        {filter === 'sent' ? (
          <SentNotices entity={entity} />
        ) : loading ? (
          <LoadingBlock rows={6} label="Cargando avisos…" />
        ) : !shown.length ? (
          <div className="surface nt-empty nt-empty--page">
            <strong>{filter === 'all' ? 'Sin avisos por ahora' : 'Todo al día'}</strong>
            <span>
              {filter === 'all' ? 'Aquí llegará lo que necesite tu atención.' : 'No hay avisos con este filtro.'}
            </span>
          </div>
        ) : (
          <div className="surface nt-page__list">
            {groupNotices(shown).map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="nt-group">{group.label}</h3>
                {group.items.map((n) => (
                  <NoticeRow key={n.id} notice={n} onOpen={open} onMarkRead={markRead} />
                ))}
              </section>
            ))}
          </div>
        )}

        {more && filter !== 'sent' ? (
          <div className="nt-page__more">
            <button type="button" className="btn ghost" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? 'Cargando…' : 'Ver avisos anteriores'}
            </button>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
