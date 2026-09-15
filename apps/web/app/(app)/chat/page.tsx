'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import { useUser } from '@/lib/user-context';

/* Chat interno (junta 11-09-2026): «General» para todo el equipo + mensajes personales. */

type ChatThread = {
  key: string;
  kind: 'general' | 'dm';
  title: string;
  subtitle: string | null;
  userId: string | null;
  lastMessage: { body: string; at: string; senderId: string; senderName: string } | null;
  unread: number;
};

type ChatMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string };
  /** Solo en cliente: mensaje optimista. */
  status?: 'sending' | 'failed';
};

type Block =
  | { kind: 'day'; key: string; label: string }
  | {
      kind: 'group';
      key: string;
      mine: boolean;
      senderId: string;
      senderName: string;
      items: ChatMessage[];
    };

const GENERAL = 'general';
const THREADS_EVERY = 10_000;
const MESSAGES_EVERY = 4_000;
const GROUP_GAP = 5 * 60_000;
/** El sondeo pide un poco hacia atrás y deduplica: no se pierde un mensaje que llegó tarde. */
const POLL_OVERLAP = 5_000;
const MAX_LEN = 4000;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const HUES = [42, 24, 158, 188, 212, 252, 298, 346];

/* ── utilidades ─────────────────────────────────────────────────────────── */

function normalizeKey(raw: string | null): string {
  if (raw && raw.startsWith('dm:') && raw.length > 3) return raw;
  return GENERAL;
}

function threadHref(key: string) {
  return `/chat?with=${encodeURIComponent(key).replace('%3A', ':')}`;
}

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

function hueOf(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return HUES[Math.abs(h) % HUES.length];
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayDiff(d: Date, now: Date) {
  return Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
}

function clock(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function listTime(iso: string, now: Date) {
  const d = new Date(iso);
  const diff = dayDiff(d, now);
  if (diff <= 0) return clock(d);
  if (diff === 1) return 'ayer';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

function dayLabel(d: Date, now: Date) {
  const diff = dayDiff(d, now);
  if (diff <= 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  const label = d.toLocaleDateString('es-MX', opts).replace(',', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function fullStamp(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function byTime(a: ChatMessage, b: ChatMessage) {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Une lo que hay en pantalla con lo que respondió el servidor.
 * Los optimistas van al final; con `echo`, un mensaje nuevo del servidor
 * idéntico a uno «enviando» lo reemplaza (el sondeo llegó antes que el POST).
 */
function mergeMessages(
  current: ChatMessage[] | undefined,
  incoming: ChatMessage[],
  echo: boolean,
): ChatMessage[] {
  const confirmed = new Map<string, ChatMessage>();
  const local: ChatMessage[] = [];
  for (const m of current ?? []) {
    if (m.status) local.push(m);
    else confirmed.set(m.id, m);
  }
  const fresh = incoming.filter((m) => !confirmed.has(m.id));
  for (const m of incoming) confirmed.set(m.id, m);
  if (echo) {
    for (const m of fresh) {
      const i = local.findIndex(
        (p) => p.status === 'sending' && p.sender.id === m.sender.id && p.body === m.body,
      );
      if (i >= 0) local.splice(i, 1);
    }
  }
  return [...Array.from(confirmed.values()).sort(byTime), ...local];
}

function lastServerAt(list: ChatMessage[]) {
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].status) return list[i].createdAt;
  return null;
}

function buildBlocks(list: ChatMessage[], meId: string | null, now: Date): Block[] {
  const blocks: Block[] = [];
  let lastDay = -1;
  let group: Extract<Block, { kind: 'group' }> | null = null;
  for (const m of list) {
    const d = new Date(m.createdAt);
    const day = startOfDay(d);
    if (day !== lastDay) {
      blocks.push({ kind: 'day', key: `d-${day}`, label: dayLabel(d, now) });
      lastDay = day;
      group = null;
    }
    const prev = group ? group.items[group.items.length - 1] : null;
    if (
      group &&
      prev &&
      group.senderId === m.sender.id &&
      d.getTime() - new Date(prev.createdAt).getTime() <= GROUP_GAP
    ) {
      group.items.push(m);
    } else {
      group = {
        kind: 'group',
        key: `g-${m.id}`,
        mine: m.sender.id === meId,
        senderId: m.sender.id,
        senderName: m.sender.fullName,
        items: [m],
      };
      blocks.push(group);
    }
  }
  return blocks;
}

function useNarrow(query = '(max-width: 759px)') {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return narrow;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ── piezas ─────────────────────────────────────────────────────────────── */

function Avatar({ id, name, size = 'md' }: { id: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const h = hueOf(id);
  const style = {
    '--chat-tint': `hsl(${h} 30% 56% / 0.15)`,
    '--chat-ink': `hsl(${h} 42% 76%)`,
    '--chat-ring': `hsl(${h} 34% 62% / 0.22)`,
  } as CSSProperties;
  return (
    <span className={`chat-avatar chat-avatar--${size}`} style={style} aria-hidden>
      {initials(name)}
    </span>
  );
}

function GeneralGlyph({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`chat-avatar chat-avatar--general chat-avatar--${size}`} aria-hidden>
      #
    </span>
  );
}

function Icon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const ICON_SEARCH = 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm9 2-4.35-4.35';
const ICON_SEND = 'M12 19V5m-6 6 6-6 6 6';
const ICON_BACK = 'M15 18l-6-6 6-6';
const ICON_DOWN = 'M6 9l6 6 6-6';
const ICON_BUBBLE = 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z';

function ThreadRow({
  thread,
  active,
  meId,
  now,
  onSelect,
}: {
  thread: ChatThread;
  active: boolean;
  meId: string | null;
  now: Date;
  onSelect: (key: string) => void;
}) {
  const last = thread.lastMessage;
  let preview = thread.subtitle ?? '';
  if (last) {
    if (last.senderId === meId) preview = `Tú: ${last.body}`;
    else if (thread.kind === 'general') preview = `${last.senderName.split(/\s+/)[0]}: ${last.body}`;
    else preview = last.body;
  }
  return (
    <button
      type="button"
      className={`chat-row${thread.kind === 'general' ? ' chat-row--general' : ''}${
        active ? ' is-active' : ''
      }${thread.unread > 0 ? ' has-unread' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(thread.key)}
    >
      {thread.kind === 'general' ? (
        <GeneralGlyph />
      ) : (
        <Avatar id={thread.userId ?? thread.key} name={thread.title} />
      )}
      <span className="chat-row__main">
        <span className="chat-row__top">
          <span className="chat-row__name">{thread.title}</span>
          {last ? <span className="chat-row__time">{listTime(last.at, now)}</span> : null}
        </span>
        <span className="chat-row__bottom">
          <span className="chat-row__preview">{preview}</span>
          {thread.unread > 0 ? (
            <span className="chat-row__badge" aria-label={`${thread.unread} sin leer`}>
              {thread.unread > 99 ? '99+' : thread.unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/* ── página ─────────────────────────────────────────────────────────────── */

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Chat">
          <div className="chat" aria-busy="true" />
        </AppShell>
      }
    >
      <ChatInner />
    </Suspense>
  );
}

function ChatInner() {
  const { user } = useUser();
  const meId = user?.id ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const withParam = searchParams.get('with');
  const narrow = useNarrow();

  const [activeKey, setActiveKey] = useState(() => normalizeKey(withParam));
  const [view, setView] = useState<'list' | 'thread'>(withParam ? 'thread' : 'list');
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [threadsError, setThreadsError] = useState(false);
  const [store, setStore] = useState<Record<string, ChatMessage[]>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(false);

  const storeRef = useRef(store);
  storeRef.current = store;
  const threadsBusy = useRef(false);
  const tmpSeq = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const shownKeyRef = useRef<string | null>(null);
  const shownLastIdRef = useRef<string | null>(null);

  /** En móvil la conversación solo cuenta como «abierta» si está en pantalla. */
  const open = !narrow || view === 'thread';

  // Enlaces externos (/chat?with=dm:…) mientras la página ya está montada.
  useEffect(() => {
    if (!withParam) return;
    setActiveKey(normalizeKey(withParam));
    setView('thread');
  }, [withParam]);

  const selectThread = useCallback(
    (key: string) => {
      setActiveKey(key);
      setView('thread');
      router.replace(threadHref(key), { scroll: false });
    },
    [router],
  );

  /* conversaciones */

  const loadThreads = useCallback(async () => {
    if (threadsBusy.current) return;
    threadsBusy.current = true;
    try {
      const res = await api<{ threads: ChatThread[] }>('/chat/threads');
      setThreads(res.threads);
      setThreadsError(false);
    } catch {
      setThreadsError(true);
    } finally {
      threadsBusy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!meId) return;
    void loadThreads();
    const id = window.setInterval(() => {
      if (!document.hidden) void loadThreads();
    }, THREADS_EVERY);
    const onVisible = () => {
      if (!document.hidden) void loadThreads();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [meId, loadThreads]);

  // Persona inexistente o dada de baja en ?with= → General.
  useEffect(() => {
    if (!threads || activeKey === GENERAL) return;
    if (!threads.some((t) => t.key === activeKey)) {
      setActiveKey(GENERAL);
      router.replace('/chat', { scroll: false });
    }
  }, [threads, activeKey, router]);

  const markRead = useCallback((key: string) => {
    setThreads((ts) =>
      ts && ts.some((t) => t.key === key && t.unread > 0)
        ? ts.map((t) => (t.key === key ? { ...t, unread: 0 } : t))
        : ts,
    );
    api('/chat/read', { method: 'POST', body: JSON.stringify({ thread: key }) })
      .then(() => window.dispatchEvent(new Event('arta:chat-read')))
      .catch(() => {
        /* se reintenta con el siguiente mensaje */
      });
  }, []);

  /* mensajes de la conversación abierta */

  useEffect(() => {
    if (!meId || !open) return;
    const key = activeKey;
    let cancelled = false;
    let busy = false;
    const path = (after?: string | null) =>
      `/chat/messages?thread=${encodeURIComponent(key)}${
        after ? `&after=${encodeURIComponent(after)}` : ''
      }`;

    const initial = async () => {
      busy = true;
      try {
        const list = await api<ChatMessage[]>(path());
        if (cancelled) return;
        setStore((s) => ({ ...s, [key]: mergeMessages(s[key], list, true) }));
        setLoadError(null);
        markRead(key);
      } catch {
        if (!cancelled) setLoadError(key);
      } finally {
        busy = false;
      }
    };

    const poll = async () => {
      if (busy || cancelled || document.hidden) return;
      const current = storeRef.current[key];
      if (!current) {
        await initial();
        return;
      }
      const last = lastServerAt(current);
      busy = true;
      try {
        const after = last ? new Date(new Date(last).getTime() - POLL_OVERLAP).toISOString() : null;
        const list = await api<ChatMessage[]>(path(after));
        if (cancelled) return;
        const known = new Set(current.map((m) => m.id));
        const fresh = list.filter((m) => !known.has(m.id));
        if (!fresh.length) return;
        setStore((s) => ({ ...s, [key]: mergeMessages(s[key], fresh, true) }));
        if (fresh.some((m) => m.sender.id !== meId)) markRead(key);
      } catch {
        /* siguiente vuelta */
      } finally {
        busy = false;
      }
    };

    void initial();
    const id = window.setInterval(() => void poll(), MESSAGES_EVERY);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeKey, open, meId, markRead]);

  /* lista derivada: último mensaje local y no leídos al día */

  const threadsView = useMemo(() => {
    if (!threads) return null;
    const merged = threads.map((t) => {
      const list = store[t.key];
      const newest = list && list.length ? list[list.length - 1] : null;
      let lastMessage = t.lastMessage;
      if (newest && (!lastMessage || newest.createdAt > lastMessage.at)) {
        lastMessage = {
          body: newest.body.replace(/\s+/g, ' ').trim(),
          at: newest.createdAt,
          senderId: newest.sender.id,
          senderName: newest.sender.fullName,
        };
      }
      return { ...t, lastMessage, unread: open && t.key === activeKey ? 0 : t.unread };
    });
    const general = merged.filter((t) => t.kind === 'general');
    const people = merged
      .filter((t) => t.kind === 'dm')
      .sort((a, b) => {
        const at = a.lastMessage?.at ?? '';
        const bt = b.lastMessage?.at ?? '';
        if (at !== bt) return at > bt ? -1 : 1;
        return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
      });
    return [...general, ...people];
  }, [threads, store, open, activeKey]);

  const q = fold(query.trim());
  const visibleThreads = threadsView?.filter((t) => !q || fold(t.title).includes(q)) ?? null;
  const active = threadsView?.find((t) => t.key === activeKey) ?? null;
  const isGeneral = activeKey === GENERAL;
  const messages = store[activeKey];
  const now = new Date();
  const blocks = useMemo(
    () => (messages ? buildBlocks(messages, meId, new Date()) : []),
    [messages, meId],
  );

  /* scroll: pegado abajo salvo que la persona haya subido */

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    stickRef.current = near;
    setAtBottom(near);
    if (near) setNewBelow(false);
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !messages) return;
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    if (shownKeyRef.current !== activeKey) {
      shownKeyRef.current = activeKey;
      shownLastIdRef.current = lastId;
      stickRef.current = true;
      setAtBottom(true);
      setNewBelow(false);
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (lastId === shownLastIdRef.current) return;
    shownLastIdRef.current = lastId;
    if (stickRef.current || last?.status === 'sending') {
      stickRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } else if (last && last.sender.id !== meId) {
      setNewBelow(true);
    }
  }, [messages, activeKey, meId]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setNewBelow(false);
  };

  /* redactar */

  const draft = drafts[activeKey] ?? '';
  const canSend = draft.trim().length > 0;

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, activeKey, view]);

  useEffect(() => {
    if (!narrow && meId) inputRef.current?.focus({ preventScroll: true });
  }, [activeKey, narrow, meId]);

  const deliver = useCallback(async (key: string, tmp: ChatMessage) => {
    try {
      const saved = await api<ChatMessage>('/chat/messages', {
        method: 'POST',
        body: JSON.stringify({ thread: key, body: tmp.body }),
      });
      setStore((s) => ({
        ...s,
        [key]: mergeMessages(
          (s[key] ?? []).filter((m) => m.id !== tmp.id),
          [saved],
          false,
        ),
      }));
    } catch {
      setStore((s) => ({
        ...s,
        [key]: (s[key] ?? []).map((m) => (m.id === tmp.id ? { ...m, status: 'failed' } : m)),
      }));
    }
  }, []);

  const send = () => {
    if (!user) return;
    const key = activeKey;
    const body = draft.trim().slice(0, MAX_LEN);
    if (!body) return;
    tmpSeq.current += 1;
    const tmp: ChatMessage = {
      id: `tmp-${Date.now()}-${tmpSeq.current}`,
      body,
      createdAt: new Date().toISOString(),
      sender: { id: user.id, fullName: user.fullName },
      status: 'sending',
    };
    stickRef.current = true;
    setDrafts((d) => ({ ...d, [key]: '' }));
    setStore((s) => ({ ...s, [key]: [...(s[key] ?? []), tmp] }));
    void deliver(key, tmp);
  };

  const retry = (items: ChatMessage[]) => {
    const key = activeKey;
    const failed = items.filter((m) => m.status === 'failed');
    if (!failed.length) return;
    const ids = new Set(failed.map((m) => m.id));
    setStore((s) => ({
      ...s,
      [key]: (s[key] ?? []).map((m) => (ids.has(m.id) ? { ...m, status: 'sending' } : m)),
    }));
    for (const m of failed) void deliver(key, { ...m, status: 'sending' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  /* render */

  return (
    <AppShell title="Chat">
      <div className={`chat ${view === 'thread' ? 'chat--thread' : 'chat--list'}`}>
        <aside className="chat__side" aria-label="Conversaciones">
          <div className="chat-search">
            <span className="chat-search__icon">
              <Icon d={ICON_SEARCH} size={15} />
            </span>
            <input
              className="chat-search__input"
              type="text"
              value={query}
              placeholder="Buscar"
              aria-label="Buscar persona"
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('');
              }}
            />
          </div>

          <div className="chat-list">
            {visibleThreads === null ? (
              threadsError ? (
                <EmptyLite icon="!" title="No se pudo cargar">
                  <button type="button" className="btn ghost btn-sm" onClick={() => void loadThreads()}>
                    Reintentar
                  </button>
                </EmptyLite>
              ) : (
                <div className="chat-list__skeleton" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="chat-list__ghost">
                      <span className="skeleton chat-list__ghost-avatar" />
                      <span className="chat-list__ghost-lines">
                        <span className="skeleton skeleton--row" style={{ width: `${62 - (i % 3) * 12}%` }} />
                        <span className="skeleton skeleton--row" style={{ width: `${84 - (i % 2) * 20}%`, height: 10 }} />
                      </span>
                    </div>
                  ))}
                </div>
              )
            ) : visibleThreads.length === 0 ? (
              <p className="chat-list__none">Sin resultados</p>
            ) : (
              visibleThreads.map((t) => (
                <ThreadRow
                  key={t.key}
                  thread={t}
                  active={t.key === activeKey}
                  meId={meId}
                  now={now}
                  onSelect={selectThread}
                />
              ))
            )}
          </div>
        </aside>

        <section className="chat__main" aria-label={active?.title ?? 'Conversación'}>
          <header className="chat-head">
            <button
              type="button"
              className="chat-back"
              aria-label="Conversaciones"
              onClick={() => setView('list')}
            >
              <Icon d={ICON_BACK} size={20} />
            </button>
            {isGeneral ? (
              <GeneralGlyph size="lg" />
            ) : active ? (
              <Avatar id={active.userId ?? active.key} name={active.title} size="lg" />
            ) : (
              <span className="chat-avatar chat-avatar--lg skeleton" aria-hidden />
            )}
            <div className="chat-head__copy">
              <h2 className="chat-head__title">{active?.title ?? (isGeneral ? 'General' : '')}</h2>
              {active?.subtitle ? <p className="chat-head__sub">{active.subtitle}</p> : null}
            </div>
          </header>

          <div className="chat-viewport">
            <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
              {messages === undefined ? (
                loadError === activeKey ? (
                  <div className="chat-empty">
                    <EmptyLite icon="!" title="No se pudo cargar la conversación" />
                  </div>
                ) : (
                  <div className="chat-stream chat-stream--ghost" aria-busy="true">
                    {[48, 32, 56, 40].map((w, i) => (
                      <span
                        key={i}
                        className={`skeleton chat-ghost${i % 2 ? ' chat-ghost--mine' : ''}`}
                        style={{ width: `${w}%` }}
                      />
                    ))}
                  </div>
                )
              ) : messages.length === 0 ? (
                <div className="chat-empty">
                  <EmptyLite icon={<Icon d={ICON_BUBBLE} size={20} />} title="Empieza la conversación" />
                </div>
              ) : (
                <div className="chat-stream">
                  {blocks.map((b) => {
                    if (b.kind === 'day') {
                      return (
                        <div key={b.key} className="chat-day" role="separator">
                          <span>{b.label}</span>
                        </div>
                      );
                    }
                    const last = b.items[b.items.length - 1];
                    const failed = b.items.some((m) => m.status === 'failed');
                    const showPeer = isGeneral && !b.mine;
                    return (
                      <div
                        key={b.key}
                        className={`chat-group ${b.mine ? 'chat-group--mine' : 'chat-group--theirs'}${
                          showPeer ? ' chat-group--named' : ''
                        }`}
                      >
                        {showPeer ? <Avatar id={b.senderId} name={b.senderName} size="sm" /> : null}
                        <div className="chat-group__body">
                          {showPeer ? <div className="chat-group__name">{b.senderName}</div> : null}
                          <div className="chat-group__stack">
                            {b.items.map((m) => (
                              <div
                                key={m.id}
                                className={`chat-bubble${m.status ? ` chat-bubble--${m.status}` : ''}`}
                                title={m.status ? undefined : fullStamp(m.createdAt)}
                              >
                                {m.body}
                              </div>
                            ))}
                          </div>
                          <div className="chat-group__meta">
                            {failed ? (
                              <button type="button" className="chat-retry" onClick={() => retry(b.items)}>
                                No se envió · Reintentar
                              </button>
                            ) : last.status === 'sending' ? (
                              <span className="chat-group__sending" aria-label="Enviando">
                                •••
                              </span>
                            ) : (
                              <time dateTime={last.createdAt}>{clock(new Date(last.createdAt))}</time>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {!atBottom && messages && messages.length > 0 ? (
              <button
                type="button"
                className={`chat-jump${newBelow ? ' has-new' : ''}`}
                aria-label="Ir al último mensaje"
                onClick={jumpToBottom}
              >
                <Icon d={ICON_DOWN} size={18} />
              </button>
            ) : null}
          </div>

          <form
            className="chat-composer"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="chat-composer__inner">
              <div className="chat-composer__field">
                <textarea
                  ref={inputRef}
                  className="chat-composer__input"
                  rows={1}
                  value={draft}
                  maxLength={MAX_LEN}
                  placeholder="Escribe un mensaje…"
                  aria-label="Mensaje"
                  onChange={(e) => {
                    const value = e.target.value;
                    setDrafts((d) => ({ ...d, [activeKey]: value }));
                  }}
                  onKeyDown={onKeyDown}
                />
              </div>
              <button type="submit" className="chat-send" disabled={!canSend} aria-label="Enviar">
                <Icon d={ICON_SEND} size={18} />
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
