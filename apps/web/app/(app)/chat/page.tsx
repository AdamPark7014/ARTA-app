'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import { joinChannel, leaveChannel, sendTyping, useRealtime, useRealtimeStatus } from '@/lib/realtime';
import { useUser } from '@/lib/user-context';
import { Icon, ICONS, MediaViewer } from '@/components/chat/ChatAttachment';
import {
  ACCEPT,
  EDIT_WINDOW_MS,
  encodeMentions,
  fold,
  fullStamp,
  isDeleted,
  kindOf,
  listTime,
  loadDrafts,
  MAX_LEN,
  mmss,
  plainText,
  prepareFile,
  replyExcerpt,
  saveDrafts,
  uploadFile,
  upsertMessages,
  VOICE_MAX_MS,
  VoiceRecorder,
  type ChannelDetail,
  type ChannelSummary,
  type ChatAttachment,
  type ChatMessage,
  type Colleague,
  type MessagePage,
  type PreparedUpload,
  type SavedItem,
} from '@/components/chat/chat-model';
import {
  ChannelGlyph,
  errorText,
  ICON_EVENT,
  isDirectLike,
  isEvent,
  Menu,
  PanelHead,
  prefersReducedMotion,
  untilLabel,
  useNarrow,
  type MenuItem,
} from '@/components/chat/chat-ui';
import { Composer, type MentionPerson } from '@/components/chat/Composer';
import { MessageStream, type MessageActions } from '@/components/chat/MessageList';
import { ChannelInfo, MessageResult, PinsList, SavedList } from '@/components/chat/ChatPanels';
import { NewConversation, QuickSwitcher } from '@/components/chat/ChatDialogs';

/*
 * Chat en canales, el mismo que las apps de Android e iPhone: #general, #anuncios,
 * canales de evento, privados, directos y directos de grupo; hilos, citas,
 * reacciones, fijados, guardados, fotos, video, notas de voz y documentos;
 * todo en vivo por socket. Contrato: docs/CHAT-V2-CONTRATO.md.
 */

type Thread = { root: ChatMessage; replies: ChatMessage[] };
type Panel = { kind: 'thread'; rootId: string } | { kind: 'pins' } | { kind: 'saved' } | { kind: 'info' } | null;
type Store = Record<string, { list: ChatMessage[]; hasMore: boolean }>;
type TypingMap = Record<string, Record<string, { name: string; at: number }>>;
type UploadItem = {
  make: () => Promise<PreparedUpload>;
  label: string;
  caption: string;
  channelId: string;
  parentId: string | null;
};
type UploadState = { label: string; index: number; total: number; fraction: number | null };
type FailedUpload = { id: string; item: UploadItem; error: string };
type Prefs = { dndUntil: string | null };
type MenuState = { kind: 'dnd' | 'mute'; anchor: DOMRect } | null;

const PAGE = 50;
const TYPING_TTL = 5_000;
const TYPING_EVERY = 2_500;
const HOUR = 3_600_000;

/* ── piezas ─────────────────────────────────────────────────────────────── */

function ChannelRow({
  c,
  active,
  now,
  online,
  onSelect,
}: {
  c: ChannelSummary;
  active: boolean;
  now: Date;
  online?: boolean;
  onSelect: (id: string) => void;
}) {
  const unread = active ? 0 : c.unreadCount;
  const preview = plainText(c.lastMessagePreview) || c.topic || '';
  return (
    <button
      type="button"
      className={`chat-row${active ? ' is-active' : ''}${unread > 0 ? ' has-unread' : ''}${c.muted ? ' is-muted' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(c.id)}
    >
      <ChannelGlyph c={c} online={online} />
      <span className="chat-row__main">
        <span className="chat-row__top">
          <span className="chat-row__name">{c.name}</span>
          {c.lastMessageAt ? <span className="chat-row__time">{listTime(c.lastMessageAt, now)}</span> : null}
        </span>
        <span className="chat-row__bottom">
          <span className="chat-row__preview">{preview}</span>
          {c.muted ? (
            <span className="chat-row__muted" aria-label="Silenciado">
              <Icon d={ICONS.bellOff} size={13} />
            </span>
          ) : null}
          {unread > 0 ? (
            <span className="chat-row__badge" aria-label={`${unread} sin leer`}>
              {unread > 99 ? '99+' : unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="chat-section">
      <div className="chat-section__title">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function StreamGhost() {
  return (
    <div className="chat-stream chat-stream--ghost" aria-busy="true" aria-label="Cargando mensajes">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="chat-ghost-row">
          <span className="skeleton chat-ghost-row__avatar" />
          <span className="chat-ghost-row__lines">
            <span className="skeleton skeleton--row" style={{ width: `${18 + ((i * 7) % 16)}%` }} />
            <span className="skeleton skeleton--row" style={{ width: `${44 + ((i * 17) % 40)}%` }} />
          </span>
        </div>
      ))}
    </div>
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
  const channelParam = searchParams.get('channel');
  const msgParam = searchParams.get('msg');
  const withParam = searchParams.get('with');
  const eventParam = searchParams.get('event');
  const narrow = useNarrow();

  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);
  const [channelsError, setChannelsError] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(channelParam);
  const [view, setView] = useState<'list' | 'convo'>(channelParam || withParam || eventParam ? 'convo' : 'list');
  const [detail, setDetail] = useState<ChannelDetail | null>(null);
  const [store, setStore] = useState<Store>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, ChatMessage>>({});
  const [panel, setPanel] = useState<Panel>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadDraft, setThreadDraft] = useState('');
  const [threadReply, setThreadReply] = useState<ChatMessage | null>(null);
  const [pins, setPins] = useState<ChatMessage[] | null>(null);
  const [saved, setSaved] = useState<SavedItem[] | null>(null);
  const [savedError, setSavedError] = useState(false);
  const [typing, setTyping] = useState<TypingMap>({});
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [viewer, setViewer] = useState<{ items: ChatAttachment[]; index: number } | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | 'dm' | 'channel'>(null);
  const [switcher, setSwitcher] = useState(false);
  const [menu, setMenu] = useState<MenuState>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [touched, setTouched] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [dividerAbove, setDividerAbove] = useState(false);
  const [unreadMark, setUnreadMark] = useState<{ channelId: string; messageId: string } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [online, setOnline] = useState<Set<string>>(() => new Set());
  const [prefs, setPrefs] = useState<Prefs | null>(null);

  const storeRef = useRef(store);
  storeRef.current = store;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadInputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<'main' | 'thread'>('main');
  const stickRef = useRef(true);
  const shownKeyRef = useRef<string | null>(null);
  const shownLastIdRef = useRef<string | null>(null);
  const prependRef = useRef<{ height: number; top: number } | null>(null);
  const jumpRef = useRef<string | null>(null);
  const markTaken = useRef<string | null>(null);
  const seq = useRef(0);
  const readTimer = useRef<number>();
  const channelsTimer = useRef<number>();
  const typingSent = useRef(0);
  const queue = useRef<UploadItem[]>([]);
  const draining = useRef(false);
  const recorder = useRef<VoiceRecorder | null>(null);
  const toastTimer = useRef<number>();
  const highlightTimer = useRef<number>();
  const draftsReady = useRef(false);
  const presenceReady = useRef(false);
  const picked = useRef(new Map<string, MentionPerson>());

  /** En móvil la conversación solo cuenta como «abierta» si está en pantalla. */
  const open = !narrow || view === 'convo';

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4_500);
  }, []);

  const flash = useCallback((id: string) => {
    setHighlight(id);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 2_600);
  }, []);

  /* borradores por canal: sobreviven a recargar la página */

  useEffect(() => {
    setDrafts((cur) => ({ ...loadDrafts(), ...cur }));
    draftsReady.current = true;
  }, []);

  useEffect(() => {
    if (!draftsReady.current) return;
    const id = window.setTimeout(() => saveDrafts(drafts), 400);
    return () => window.clearTimeout(id);
  }, [drafts]);

  /* canales */

  const loadChannels = useCallback(async () => {
    try {
      setChannels(await api<ChannelSummary[]>('/chat/channels'));
      setChannelsError(false);
    } catch {
      setChannelsError(true);
    }
  }, []);

  const scheduleChannels = useCallback(() => {
    window.clearTimeout(channelsTimer.current);
    channelsTimer.current = window.setTimeout(() => void loadChannels(), 400);
  }, [loadChannels]);

  useEffect(() => {
    if (meId) void loadChannels();
  }, [meId, loadChannels]);

  /* presencia y «No molestar» (chat v2; con el API viejo simplemente no aparecen) */

  const loadPresence = useCallback(() => {
    api<{ online?: string[] }>('/chat/presence')
      .then((r) => {
        presenceReady.current = true;
        setOnline(new Set(r?.online ?? []));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!meId) return;
    loadPresence();
    api<Prefs>('/chat/prefs')
      .then((p) => setPrefs({ dndUntil: p?.dndUntil ?? null }))
      .catch(() => setPrefs({ dndUntil: null }));
  }, [meId, loadPresence]);

  useRealtime<{ userId?: string; online?: boolean }>('chat:presence', (p) => {
    if (!p?.userId || !presenceReady.current) return;
    const on = p.online !== false;
    setOnline((s) => {
      if (s.has(p.userId!) === on) return s;
      const next = new Set(s);
      if (on) next.add(p.userId!);
      else next.delete(p.userId!);
      return next;
    });
  });

  const isOnline = useCallback((id: string) => online.has(id), [online]);

  const selectChannel = useCallback(
    (id: string, opts: { msg?: string } = {}) => {
      setActiveId(id);
      setView('convo');
      setPanel((p) => (p?.kind === 'saved' && !narrow ? p : null));
      setTouched(null);
      router.replace(`/chat?channel=${encodeURIComponent(id)}${opts.msg ? `&msg=${encodeURIComponent(opts.msg)}` : ''}`, {
        scroll: false,
      });
    },
    [router, narrow],
  );

  const openDm = useCallback(
    (userId: string) => {
      if (userId === meId) return;
      api<ChannelDetail>('/chat/dm', { method: 'POST', body: JSON.stringify({ userId }) })
        .then((c) => {
          selectChannel(c.id);
          scheduleChannels();
        })
        .catch((e) => showToast(errorText(e, 'No se pudo abrir la conversación')));
    },
    [meId, selectChannel, scheduleChannels, showToast],
  );

  // Enlaces externos: aviso (?channel=&msg=), persona (?with=dm:<id>) o evento (?event=<id>).
  useEffect(() => {
    if (!meId) return;
    if (channelParam) {
      setActiveId(channelParam);
      setView('convo');
      return;
    }
    const dmUser = withParam?.startsWith('dm:') ? withParam.slice(3) : null;
    const target = dmUser
      ? api<ChannelDetail>('/chat/dm', { method: 'POST', body: JSON.stringify({ userId: dmUser }) })
      : eventParam
        ? api<ChannelDetail>(`/chat/event/${encodeURIComponent(eventParam)}`, { method: 'POST' })
        : null;
    if (!target) return;
    target
      .then((c) => {
        selectChannel(c.id);
        scheduleChannels();
      })
      .catch((e) => showToast(errorText(e, 'No se pudo abrir la conversación')));
  }, [meId, channelParam, withParam, eventParam, selectChannel, scheduleChannels, showToast]);

  // Sin selección en escritorio → #general.
  useEffect(() => {
    if (activeId || narrow || !channels?.length || withParam || eventParam) return;
    const general = channels.find((c) => c.slug === 'general') ?? channels[0];
    setActiveId(general.id);
  }, [activeId, narrow, channels, withParam, eventParam]);

  const markRead = useCallback((channelId: string) => {
    window.clearTimeout(readTimer.current);
    readTimer.current = window.setTimeout(() => {
      setChannels((cs) => (cs && cs.some((c) => c.id === channelId && c.unreadCount > 0) ? cs.map((c) => (c.id === channelId ? { ...c, unreadCount: 0 } : c)) : cs));
      api(`/chat/channels/${channelId}/read`, { method: 'POST' })
        .then(() => window.dispatchEvent(new Event('arta:chat-read')))
        .catch(() => undefined);
    }, 500);
  }, []);

  /* conversación abierta */

  const loadLatest = useCallback(async (channelId: string, around?: string | null) => {
    const qs = around ? `around=${encodeURIComponent(around)}&limit=${PAGE}` : `limit=${PAGE}`;
    const page = await api<MessagePage>(`/chat/channels/${channelId}/messages?${qs}`);
    setStore((s) => {
      const cur = s[channelId];
      const list = around || !cur ? page.messages : upsertMessages(cur.list, page.messages);
      return { ...s, [channelId]: { list, hasMore: around || !cur ? page.hasMore : cur.hasMore } };
    });
  }, []);

  useEffect(() => {
    markTaken.current = null;
    setUnreadMark(null);
    setNewCount(0);
    setDividerAbove(false);
    setEditing(null);
  }, [activeId]);

  useEffect(() => {
    if (!meId || !activeId) return;
    const channelId = activeId;
    let cancelled = false;
    joinChannel(channelId);
    setDetail((d) => (d?.id === channelId ? d : null));
    api<ChannelDetail>(`/chat/channels/${channelId}`)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(channelId);
        showToast(errorText(e, 'No se pudo abrir la conversación'));
      });
    const around = msgParam;
    if (around) {
      jumpRef.current = around;
      flash(around);
    }
    loadLatest(channelId, around)
      .then(() => {
        if (!cancelled) setLoadError(null);
      })
      .catch(() => {
        if (!cancelled) setLoadError(channelId);
      });
    return () => {
      cancelled = true;
      leaveChannel(channelId);
    };
  }, [meId, activeId, msgParam, loadLatest, showToast, flash, reloadKey]);

  const head = detail?.id === activeId ? detail : null;
  const entry = activeId ? store[activeId] : undefined;
  const messages = entry?.list;

  // «Mensajes nuevos»: se fija una vez al abrir, con el lastReadAt de antes de marcar leído.
  useEffect(() => {
    if (!activeId || markTaken.current === activeId || !head || !messages) return;
    markTaken.current = activeId;
    const since = head.lastReadAt;
    const first = since
      ? messages.find((m) => !m.pending && m.kind !== 'SYSTEM' && m.author.id !== meId && m.createdAt > since)
      : undefined;
    setUnreadMark(first ? { channelId: activeId, messageId: first.id } : null);
  }, [activeId, head, messages, meId]);

  const unreadFrom = unreadMark && unreadMark.channelId === activeId ? unreadMark.messageId : null;

  useEffect(() => {
    if (activeId && open && store[activeId] && head) markRead(activeId);
    // Solo al abrir o al cargar la conversación (después de fijar «Mensajes nuevos»).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, open, Boolean(activeId && store[activeId]), Boolean(head)]);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && activeId && open) markRead(activeId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [activeId, open, markRead]);

  const loadOlder = useCallback(async () => {
    if (!activeId || loadingOlder) return;
    const cur = storeRef.current[activeId];
    const oldest = cur?.list.find((m) => !m.pending && !m.failed);
    if (!cur?.hasMore || !oldest) return;
    setLoadingOlder(true);
    try {
      const page = await api<MessagePage>(`/chat/channels/${activeId}/messages?before=${encodeURIComponent(oldest.id)}&limit=${PAGE}`);
      const el = scrollRef.current;
      if (el) prependRef.current = { height: el.scrollHeight, top: el.scrollTop };
      setStore((s) => ({
        ...s,
        [activeId]: { list: upsertMessages(s[activeId]?.list ?? [], page.messages), hasMore: page.hasMore },
      }));
    } catch {
      /* siguiente scroll */
    } finally {
      setLoadingOlder(false);
    }
  }, [activeId, loadingOlder]);

  /* hilo, fijados, guardados */

  const openThread = useCallback(
    (m: ChatMessage) => {
      const rootId = m.parentId || m.id;
      setPanel({ kind: 'thread', rootId });
      setThread((t) => (t?.root.id === rootId ? t : null));
      setThreadDraft('');
      setThreadReply(null);
      api<Thread>(`/chat/messages/${rootId}/thread`)
        .then((t) => setThread(t))
        .catch((e) => {
          showToast(errorText(e, 'No se pudo abrir el hilo'));
          setPanel(null);
        });
    },
    [showToast],
  );

  const openPins = useCallback(() => {
    if (!activeId) return;
    setPanel({ kind: 'pins' });
    setPins(null);
    api<{ messages: ChatMessage[] }>(`/chat/channels/${activeId}/pins`)
      .then((r) => setPins(r.messages))
      .catch(() => setPins([]));
  }, [activeId]);

  const loadSaved = useCallback(() => {
    setSavedError(false);
    api<{ items: SavedItem[] }>('/chat/saved?limit=50')
      .then((r) => setSaved(r?.items ?? []))
      .catch(() => setSavedError(true));
  }, []);

  const openSaved = useCallback(() => {
    setPanel({ kind: 'saved' });
    setSaved(null);
    loadSaved();
  }, [loadSaved]);

  /* aplicar cambios de mensajes en lista, hilo, fijados y guardados */

  const applyMessage = useCallback((m: ChatMessage) => {
    if (m.parentId) {
      setThread((t) => (t && t.root.id === m.parentId ? { ...t, replies: upsertMessages(t.replies, [m]) } : t));
      return;
    }
    setStore((s) => {
      const cur = s[m.channelId];
      if (!cur) return s;
      return { ...s, [m.channelId]: { ...cur, list: upsertMessages(cur.list, [m]) } };
    });
  }, []);

  /** `saved` es por persona: un evento del socket no lo pisa. */
  const applyUpdate = useCallback((m: ChatMessage, fromSocket = false) => {
    const merge = (prev: ChatMessage): ChatMessage => ({
      ...m,
      saved: fromSocket || m.saved === undefined ? prev.saved : m.saved,
      clientId: prev.clientId ?? m.clientId,
    });
    const patch = (list: ChatMessage[]) => (list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? merge(x) : x)) : list);
    setStore((s) => {
      const cur = s[m.channelId];
      if (!cur) return s;
      return { ...s, [m.channelId]: { ...cur, list: patch(cur.list) } };
    });
    setThread((t) => {
      if (!t) return t;
      if (t.root.id === m.id) return { ...t, root: merge(t.root) };
      return { ...t, replies: patch(t.replies) };
    });
    setPins((p) => {
      if (!p) return p;
      if (!m.pinnedAt) return p.filter((x) => x.id !== m.id);
      return p.some((x) => x.id === m.id) ? patch(p) : [m, ...p];
    });
  }, []);

  const patchLocal = useCallback((channelId: string, id: string, fields: Partial<ChatMessage>) => {
    const patch = (list: ChatMessage[]) => (list.some((x) => x.id === id) ? list.map((x) => (x.id === id ? { ...x, ...fields } : x)) : list);
    setStore((s) => {
      const cur = s[channelId];
      if (!cur) return s;
      return { ...s, [channelId]: { ...cur, list: patch(cur.list) } };
    });
    setThread((t) => (t ? { root: t.root.id === id ? { ...t.root, ...fields } : t.root, replies: patch(t.replies) } : t));
    setPins((p) => (p ? patch(p) : p));
  }, []);

  /** Con hilo queda «Mensaje eliminado»; sin hilo desaparece. Las citas a él también se apagan. */
  const applyDelete = useCallback((channelId: string, messageId: string) => {
    const tomb = (m: ChatMessage): ChatMessage => ({ ...m, body: '', attachment: null, deleted: true, reactions: [], pinnedAt: null, saved: false });
    const quotes = (list: ChatMessage[]) =>
      list.map((m) => (m.replyTo?.id === messageId ? { ...m, replyTo: { ...m.replyTo, deleted: true, excerpt: '' } } : m));
    setStore((s) => {
      const cur = s[channelId];
      if (!cur) return s;
      const list = cur.list.flatMap((m) => (m.id !== messageId ? [m] : m.replyCount > 0 ? [tomb(m)] : []));
      return { ...s, [channelId]: { ...cur, list: quotes(list) } };
    });
    setThread((t) => (t ? { root: t.root.id === messageId ? tomb(t.root) : t.root, replies: quotes(t.replies.filter((m) => m.id !== messageId)) } : t));
    setPins((p) => (p ? p.filter((m) => m.id !== messageId) : p));
    setSaved((s) => (s ? s.filter((x) => x.message.id !== messageId) : s));
  }, []);

  /* socket */

  useRealtime<ChatMessage>('chat:message', (m) => {
    applyMessage(m);
    if (m.channelId === activeId && open && !document.hidden && m.author.id !== meId) markRead(m.channelId);
    if (typing[m.channelId]?.[m.author.id]) {
      setTyping((t) => {
        const next = { ...(t[m.channelId] ?? {}) };
        delete next[m.author.id];
        return { ...t, [m.channelId]: next };
      });
    }
  });
  useRealtime<ChatMessage>('chat:thread-reply', applyMessage);
  useRealtime<ChatMessage>('chat:message-updated', (m) => (m.deleted ? applyDelete(m.channelId, m.id) : applyUpdate(m, true)));
  useRealtime<{ channelId: string; messageId: string }>('chat:message-deleted', (p) => applyDelete(p.channelId, p.messageId));
  useRealtime<{ channelId: string; userId: string; fullName: string; at: number }>('chat:typing', (p) => {
    if (!p?.channelId || p.userId === meId) return;
    setTyping((t) => ({ ...t, [p.channelId]: { ...(t[p.channelId] ?? {}), [p.userId]: { name: p.fullName, at: Date.now() } } }));
  });
  useRealtime<{ channelId: string; userId: string; at: string }>('chat:read', (p) => {
    setDetail((d) =>
      d && d.id === p.channelId ? { ...d, members: d.members.map((mm) => (mm.id === p.userId ? { ...mm, lastReadAt: p.at } : mm)) } : d,
    );
  });
  useRealtime('chat:channel-activity', scheduleChannels);
  useRealtime<{ channelId?: string; removed?: boolean; archived?: boolean }>('chat:channel-updated', (p) => {
    scheduleChannels();
    if (p?.channelId && p.channelId === activeId) {
      if (p.archived) setActiveId(null);
      else api<ChannelDetail>(`/chat/channels/${p.channelId}`).then(setDetail).catch(() => undefined);
    }
  });
  useRealtime<{ channelId?: string; removed?: boolean }>('chat:members-changed', (p) => {
    scheduleChannels();
    if (p?.channelId && p.channelId === activeId) {
      if (p.removed) setActiveId(null);
      else api<ChannelDetail>(`/chat/channels/${p.channelId}`).then(setDetail).catch(() => undefined);
    }
  });

  const connected = useRealtimeStatus(() => {
    void loadChannels();
    loadPresence();
    if (activeId) void loadLatest(activeId).catch(() => undefined);
  });

  // Red de seguridad si el socket no conecta (proxy corporativo, etc.).
  useEffect(() => {
    if (connected || !meId) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void loadChannels();
      if (!activeId) return;
      void loadLatest(activeId).catch(() => undefined);
      api<ChannelDetail>(`/chat/channels/${activeId}`).then(setDetail).catch(() => undefined);
    }, 8_000);
    return () => window.clearInterval(id);
  }, [connected, meId, activeId, loadChannels, loadLatest]);

  // «Escribiendo…» caduca solo.
  const typingNames = useMemo(() => {
    const now = Date.now();
    return Object.values(typing[activeId ?? ''] ?? {})
      .filter((t) => now - t.at < TYPING_TTL)
      .map((t) => t.name.split(/\s+/)[0]);
  }, [typing, activeId]);
  const recording = recordingSince !== null;
  useEffect(() => {
    if (!typingNames.length && !recording) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1_000);
    return () => window.clearInterval(id);
  }, [typingNames.length, recording]);

  /* menciones: miembros del canal + quien se eligió del directorio */

  const people = useMemo<MentionPerson[]>(
    () => (head?.members ?? []).filter((m) => m.id !== meId).map((m) => ({ id: m.id, fullName: m.fullName, title: m.title })),
    [head, meId],
  );
  const searchPeople = useCallback(
    (q: string) => api<Colleague[]>(`/chat/colleagues${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`),
    [],
  );
  const onPicked = useCallback((p: MentionPerson) => picked.current.set(p.id, p), []);
  const encode = (text: string) => encodeMentions(text, [...(head?.members ?? []), ...picked.current.values()]);

  /* enviar */

  const localMessage = useCallback(
    (channelId: string, body: string, parentId: string | null, quoted: ChatMessage | null): ChatMessage => {
      seq.current += 1;
      const clientId = `c-${Date.now()}-${seq.current}`;
      return {
        id: clientId,
        clientId,
        channelId,
        parentId,
        kind: 'TEXT',
        body,
        attachment: null,
        createdAt: new Date().toISOString(),
        author: { id: user?.id ?? '', fullName: user?.fullName ?? '' },
        replyCount: 0,
        reactions: [],
        replyToId: quoted?.id ?? null,
        replyTo: quoted ? replyExcerpt(quoted) : null,
        pending: true,
      };
    },
    [user],
  );

  const deliver = useCallback(
    async (tmp: ChatMessage) => {
      applyMessage(tmp);
      try {
        const res = await api<ChatMessage>(`/chat/channels/${tmp.channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            body: tmp.body,
            parentId: tmp.parentId ?? undefined,
            clientId: tmp.clientId,
            replyToId: tmp.replyToId ?? undefined,
          }),
        });
        applyMessage({ ...res, clientId: tmp.clientId });
      } catch (e) {
        applyMessage({ ...tmp, pending: false, failed: true });
        showToast(errorText(e, 'No se envió el mensaje'));
      }
    },
    [applyMessage, showToast],
  );

  const tooLong = (body: string) => {
    if (body.length <= MAX_LEN) return false;
    showToast(`El mensaje pasa de ${MAX_LEN.toLocaleString('es-MX')} caracteres`);
    return true;
  };

  const sendMain = () => {
    if (!activeId || !user) return;
    const text = (drafts[activeId] ?? '').trim();
    if (!text) return;
    const body = encode(text);
    if (tooLong(body)) return;
    const quoted = replyTo[activeId] ?? null;
    stickRef.current = true;
    setDrafts((d) => ({ ...d, [activeId]: '' }));
    setReplyTo((r) => {
      const next = { ...r };
      delete next[activeId];
      return next;
    });
    void deliver(localMessage(activeId, body, null, quoted));
  };

  const sendThread = () => {
    if (!thread || !user) return;
    const text = threadDraft.trim();
    if (!text) return;
    const body = encode(text);
    if (tooLong(body)) return;
    setThreadDraft('');
    const quoted = threadReply;
    setThreadReply(null);
    void deliver(localMessage(thread.root.channelId, body, thread.root.id, quoted));
  };

  const onDraft = (value: string) => {
    if (!activeId) return;
    setDrafts((d) => ({ ...d, [activeId]: value }));
    const now = Date.now();
    if (value && now - typingSent.current > TYPING_EVERY) {
      typingSent.current = now;
      sendTyping(activeId);
    }
  };

  /* adjuntos: cola con avance, un mensaje por archivo; los fallidos se reintentan */

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    let index = 0;
    while (queue.current.length) {
      const item = queue.current.shift()!;
      index += 1;
      const total = index + queue.current.length;
      setUpload({ label: item.label, index, total, fraction: null });
      try {
        const prepared = await item.make();
        let shown = -1;
        setUpload({ label: prepared.name, index, total, fraction: 0 });
        const res = await uploadFile(prepared, (f) => {
          const pct = Math.floor(f * 100);
          if (pct === shown) return;
          shown = pct;
          setUpload({ label: prepared.name, index, total, fraction: f });
        });
        const msg = await api<ChatMessage>(`/chat/channels/${item.channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({
            body: item.caption || undefined,
            parentId: item.parentId ?? undefined,
            attachmentUrl: res.url,
            attachmentName: res.name ?? prepared.name,
            attachmentMime: res.mime ?? prepared.mime,
            attachmentSize: res.size ?? prepared.blob.size,
          }),
        });
        stickRef.current = true;
        applyMessage(msg);
      } catch (e) {
        const error = errorText(e, 'No se pudo enviar el archivo');
        seq.current += 1;
        setFailedUploads((f) => [...f, { id: `u-${Date.now()}-${seq.current}`, item, error }]);
        showToast(error);
      }
    }
    draining.current = false;
    setUpload(null);
  }, [applyMessage, showToast]);

  const retryUpload = (f: FailedUpload) => {
    setFailedUploads((all) => all.filter((x) => x.id !== f.id));
    queue.current.push(f.item);
    void drain();
  };

  const enqueueFiles = useCallback(
    (files: File[], target: 'main' | 'thread') => {
      if (!files.length) return;
      const channelId = target === 'thread' ? thread?.root.channelId : activeId;
      if (!channelId) return;
      const parentId = target === 'thread' ? (thread?.root.id ?? null) : null;
      const raw = (target === 'thread' ? threadDraft : (drafts[channelId] ?? '')).trim();
      const caption = raw ? encodeMentions(raw, [...(head?.members ?? []), ...picked.current.values()]).slice(0, MAX_LEN) : '';
      if (caption) {
        if (target === 'thread') setThreadDraft('');
        else setDrafts((d) => ({ ...d, [channelId]: '' }));
      }
      const items: UploadItem[] = files.slice(0, 20).map((f, i) => ({
        make: () => prepareFile(f),
        label: f.name || 'Archivo',
        caption: i === 0 ? caption : '',
        channelId,
        parentId,
      }));
      if (files.length > 20) showToast('Se envían los primeros 20 archivos');
      queue.current.push(...items);
      void drain();
    },
    [activeId, thread, threadDraft, drafts, drain, showToast, head],
  );

  const pickFiles = (target: 'main' | 'thread') => {
    fileTarget.current = target;
    fileRef.current?.click();
  };

  const onPaste = (target: 'main' | 'thread') => (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    enqueueFiles(files, target);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragOver(false);
    enqueueFiles(Array.from(e.dataTransfer?.files ?? []), panel?.kind === 'thread' && narrow ? 'thread' : 'main');
  };

  /* nota de voz */

  const startRecording = async () => {
    if (!VoiceRecorder.supported()) {
      showToast('Este navegador no permite grabar audio');
      return;
    }
    const rec = new VoiceRecorder();
    try {
      await rec.start();
      recorder.current = rec;
      setRecordingSince(Date.now());
    } catch {
      showToast('Permite el micrófono para grabar notas de voz');
    }
  };

  const cancelRecording = useCallback(() => {
    recorder.current?.cancel();
    recorder.current = null;
    setRecordingSince(null);
  }, []);

  const finishRecording = useCallback(async () => {
    const rec = recorder.current;
    recorder.current = null;
    setRecordingSince(null);
    if (!rec || !activeId) return;
    const channelId = activeId;
    const prepared = await rec.stop().catch(() => null);
    if (!prepared) {
      showToast('La nota de voz fue muy corta');
      return;
    }
    queue.current.push({ make: async () => prepared, label: 'Nota de voz', caption: '', channelId, parentId: null });
    void drain();
  }, [activeId, drain, showToast]);

  useEffect(() => {
    if (recordingSince === null) return;
    const id = window.setTimeout(() => void finishRecording(), VOICE_MAX_MS);
    return () => window.clearTimeout(id);
  }, [recordingSince, finishRecording]);

  useEffect(() => cancelRecording, [activeId, cancelRecording]);

  /* acciones sobre mensajes */

  const saveEdit = async () => {
    if (!editing) return;
    const body = encode(editing.body.trim());
    const { id } = editing;
    if (!body || tooLong(body)) return;
    setEditing(null);
    try {
      applyUpdate(await api<ChatMessage>(`/chat/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }));
    } catch (e) {
      showToast(errorText(e, 'No se pudo editar'));
    }
  };

  /** ↑ con el redactor vacío: editar tu último mensaje si sigue en la ventana de edición. */
  const editLast = () => {
    const list = messages ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.author.id !== meId) continue;
      if (m.pending || m.failed || isDeleted(m) || m.kind !== 'TEXT' || !m.body) return;
      if (Date.now() - new Date(m.createdAt).getTime() >= EDIT_WINDOW_MS) return;
      setEditing({ id: m.id, body: plainText(m.body) });
      document.getElementById(`m-${m.id}`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
  };

  const openImage = (a: ChatAttachment) => {
    const collect = (list: ChatMessage[]) => {
      const seen = new Set<string>();
      const out: ChatAttachment[] = [];
      for (const m of list) {
        if (!m.attachment || isDeleted(m) || kindOf(m.attachment) !== 'image' || seen.has(m.attachment.url)) continue;
        seen.add(m.attachment.url);
        out.push(m.attachment);
      }
      return out;
    };
    for (const pool of [messages ?? [], thread ? [thread.root, ...thread.replies] : []]) {
      const items = collect(pool);
      const index = items.findIndex((x) => x.url === a.url);
      if (index >= 0) {
        setViewer({ items, index });
        return;
      }
    }
    setViewer({ items: [a], index: 0 });
  };

  const jumpTo = (id: string) => {
    const el = document.getElementById(`m-${id}`);
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      flash(id);
      return;
    }
    if (activeId) selectChannel(activeId, { msg: id });
  };

  const actions: MessageActions = {
    meId,
    canManage: Boolean(head?.canManage),
    canPost: head?.canPost ?? true,
    inThread: false,
    editing,
    setEditing,
    saveEdit: () => void saveEdit(),
    react: (m, emoji) => {
      api<ChatMessage>(`/chat/messages/${m.id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) })
        .then((r) => applyUpdate(r))
        .catch((e) => showToast(errorText(e)));
    },
    openThread,
    reply: (m) => {
      setReplyTo((r) => ({ ...r, [m.channelId]: m }));
      window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    save: (m) => {
      const was = Boolean(m.saved);
      patchLocal(m.channelId, m.id, { saved: !was });
      api<{ saved: boolean }>(`/chat/messages/${m.id}/save`, { method: 'POST' })
        .then((r) => {
          const now = Boolean(r?.saved);
          patchLocal(m.channelId, m.id, { saved: now });
          if (!now) setSaved((s) => (s ? s.filter((x) => x.message.id !== m.id) : s));
          else if (panel?.kind === 'saved') loadSaved();
          if (now) showToast('Guardado · encuéntralo en «Guardados»');
        })
        .catch((e) => {
          patchLocal(m.channelId, m.id, { saved: was });
          showToast(errorText(e, 'No se pudo guardar'));
        });
    },
    pin: (m) => {
      api<ChatMessage>(`/chat/messages/${m.id}/pin`, { method: 'POST' })
        .then((r) => applyUpdate(r))
        .catch((e) => showToast(errorText(e)));
    },
    remove: (m) => {
      if (!window.confirm('¿Eliminar este mensaje para todos?')) return;
      api(`/chat/messages/${m.id}`, { method: 'DELETE' })
        .then(() => applyDelete(m.channelId, m.id))
        .catch((e) => showToast(errorText(e)));
    },
    retry: (m) => {
      applyDelete(m.channelId, m.id);
      void deliver({ ...m, failed: false, pending: true });
    },
    discard: (m) => applyDelete(m.channelId, m.id),
    copyLink: (m) => {
      const url = `${window.location.origin}/chat?channel=${encodeURIComponent(m.channelId)}&msg=${encodeURIComponent(m.parentId ?? m.id)}`;
      void navigator.clipboard
        ?.writeText(url)
        .then(() => showToast('Enlace copiado'))
        .catch(() => showToast('No se pudo copiar'));
    },
    copied: showToast,
    onImage: openImage,
    jumpTo,
    onMention: openDm,
    isOnline,
    highlight,
    touched,
    setTouched,
  };
  const threadActions: MessageActions = {
    ...actions,
    inThread: true,
    reply: (m) => {
      setThreadReply(m);
      window.requestAnimationFrame(() => threadInputRef.current?.focus());
    },
  };

  /* canal: avisos, edición, miembros */

  const refreshDetail = useCallback(
    (id: string) =>
      api<ChannelDetail>(`/chat/channels/${id}`)
        .then(setDetail)
        .catch(() => undefined),
    [],
  );

  const setMute = async (hours: number | null | false) => {
    if (!head) return;
    const muted = hours !== false;
    try {
      await api(`/chat/channels/${head.id}/mute`, { method: 'PATCH', body: JSON.stringify(muted && hours ? { muted, hours } : { muted }) });
      const mutedUntil = muted && hours ? new Date(Date.now() + hours * HOUR).toISOString() : null;
      setDetail((d) => (d ? { ...d, muted, mutedUntil } : d));
      setChannels((cs) => cs?.map((c) => (c.id === head.id ? { ...c, muted, mutedUntil } : c)) ?? cs);
      showToast(muted ? (mutedUntil ? `Silenciado ${untilLabel(mutedUntil)}` : 'Silenciado') : 'Avisos activados');
    } catch (e) {
      showToast(errorText(e));
    }
  };

  const closeChannel = () => {
    setActiveId(null);
    setPanel(null);
    setView('list');
    router.replace('/chat', { scroll: false });
    scheduleChannels();
  };

  const channelInfo = head ? (
    <ChannelInfo
      detail={head}
      meId={meId}
      isOnline={isOnline}
      onSave={async (patch) => {
        await api(`/chat/channels/${head.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
        await refreshDetail(head.id);
        scheduleChannels();
      }}
      onMute={(h) => void setMute(h)}
      onLeave={() => {
        if (!window.confirm(`¿Salir de ${head.isGroupDm ? head.name : `#${head.name}`}?`)) return;
        api(`/chat/channels/${head.id}/leave`, { method: 'POST' })
          .then(closeChannel)
          .catch((e) => showToast(errorText(e)));
      }}
      onArchive={() => {
        if (!window.confirm(`¿Archivar #${head.name}? Nadie podrá escribir en él.`)) return;
        api(`/chat/channels/${head.id}/archive`, { method: 'POST' })
          .then(closeChannel)
          .catch((e) => showToast(errorText(e)));
      }}
      onAdd={async (ids) => {
        await api(`/chat/channels/${head.id}/members`, { method: 'POST', body: JSON.stringify({ userIds: ids }) });
        await refreshDetail(head.id);
      }}
      onRemove={(userId) => {
        const who = head.members.find((m) => m.id === userId)?.fullName ?? 'esta persona';
        if (!window.confirm(`¿Quitar a ${who} del canal?`)) return;
        api(`/chat/channels/${head.id}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' })
          .then(() => refreshDetail(head.id))
          .catch((e) => showToast(errorText(e)));
      }}
      onOpenPins={openPins}
      onOpenDm={openDm}
      onError={showToast}
    />
  ) : null;

  /* No molestar */

  const dndActive = Boolean(prefs?.dndUntil && new Date(prefs.dndUntil).getTime() > Date.now());
  const setDnd = async (until: Date | null) => {
    const dndUntil = until ? until.toISOString() : null;
    const prev = prefs;
    setPrefs({ dndUntil });
    try {
      const r = await api<Prefs>('/chat/prefs', { method: 'PATCH', body: JSON.stringify({ dndUntil }) });
      const value = r && 'dndUntil' in r ? r.dndUntil : dndUntil;
      setPrefs({ dndUntil: value });
      showToast(value ? `No molestar ${untilLabel(value)}` : 'No molestar desactivado');
    } catch (e) {
      setPrefs(prev);
      showToast(errorText(e, 'No se pudo cambiar «No molestar»'));
    }
  };
  const dndItems: (MenuItem | null)[] = [
    { label: 'Por 1 hora', onSelect: () => void setDnd(new Date(Date.now() + HOUR)) },
    { label: 'Por 8 horas', onSelect: () => void setDnd(new Date(Date.now() + 8 * HOUR)) },
    {
      label: 'Hasta mañana',
      hint: '08:00',
      onSelect: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(8, 0, 0, 0);
        void setDnd(d);
      },
    },
    dndActive ? { label: 'Desactivar', icon: ICONS.bell, onSelect: () => void setDnd(null) } : null,
  ];
  const muteItems: (MenuItem | null)[] = [
    { label: 'Silenciar 8 horas', icon: ICONS.bellOff, onSelect: () => void setMute(8) },
    { label: 'Silenciar 1 semana', icon: ICONS.bellOff, onSelect: () => void setMute(168) },
    { label: 'Silenciar siempre', icon: ICONS.bellOff, onSelect: () => void setMute(null) },
    head?.muted ? { label: 'Activar avisos', icon: ICONS.bell, onSelect: () => void setMute(false) } : null,
  ];

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      setResults((await api<{ messages: ChatMessage[] }>(`/chat/search?q=${encodeURIComponent(q)}`)).messages);
    } catch (e) {
      showToast(errorText(e, 'No se pudo buscar'));
    } finally {
      setSearching(false);
    }
  };

  /* atajos: Ctrl/Cmd+K cambia de conversación, Esc cierra el panel */

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSwitcher(true);
        return;
      }
      if (e.key !== 'Escape' || e.defaultPrevented || viewer || editing) return;
      if (panel) {
        e.preventDefault();
        setPanel(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewer, editing, panel]);

  /* lista derivada */

  const now = new Date();
  const q = fold(query.trim());
  const visible = channels?.filter((c) => !q || fold(c.name).includes(q)) ?? null;
  const sections = useMemo(() => {
    if (!visible) return null;
    const order = (c: ChannelSummary) => (c.slug === 'general' ? 0 : c.slug === 'anuncios' ? 1 : 2);
    const teams = visible.filter((c) => !isDirectLike(c) && !isEvent(c)).sort((a, b) => order(a) - order(b));
    const events = visible.filter((c) => !isDirectLike(c) && isEvent(c));
    const directs = visible.filter((c) => isDirectLike(c));
    return { teams, events, directs };
  }, [visible]);

  const summary = channels?.find((c) => c.id === activeId) ?? null;
  const title = head?.name ?? summary?.name ?? '';
  const kind = head?.kind ?? summary?.kind;
  const isDirect = kind === 'DIRECT';
  const isGroup = Boolean(head?.isGroupDm ?? summary?.isGroupDm);
  const directLike = isDirect || isGroup;
  const canPost = head?.canPost ?? summary?.canPost ?? true;
  const draft = activeId ? (drafts[activeId] ?? '') : '';
  const peerId = head?.peer?.id ?? summary?.peer?.id ?? null;
  const peerOnline = isDirect && peerId ? online.has(peerId) : false;
  const muted = head?.muted ?? summary?.muted ?? false;

  const subtitle = typingNames.length
    ? `${typingNames.slice(0, 2).join(' y ')}${typingNames.length > 2 ? ' y más' : ''} ${typingNames.length > 1 ? 'están' : 'está'} escribiendo…`
    : isDirect
      ? peerOnline
        ? 'En línea'
        : (head?.peer?.title ?? summary?.peer?.title ?? 'Mensaje directo')
      : head?.topic || summary?.topic || (head ? `${head.memberCount} ${head.memberCount === 1 ? 'miembro' : 'miembros'}` : '');

  const receipt = useCallback(
    (last: ChatMessage) => {
      if (!head) return null;
      const readers = head.members.filter((mm) => mm.id !== meId && mm.lastReadAt && mm.lastReadAt >= last.createdAt);
      if (head.kind === 'DIRECT') return readers.length ? { text: 'Visto', title: fullStamp(readers[0].lastReadAt!) } : { text: 'Enviado', title: '' };
      if (!readers.length) return null;
      return { text: `Visto por ${readers.length}`, title: readers.map((r) => r.fullName).join(', ') };
    },
    [head, meId],
  );

  /* scroll: pegado abajo salvo que la persona haya subido */

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    stickRef.current = near;
    setAtBottom(near);
    if (near) setNewCount(0);
    const divider = el.querySelector<HTMLElement>('[data-unread]');
    setDividerAbove(Boolean(divider && divider.offsetTop < el.scrollTop));
    if (el.scrollTop < 120) void loadOlder();
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !messages) return;
    const last = messages[messages.length - 1];
    const lastId = last?.id ?? null;
    if (prependRef.current) {
      const { height, top } = prependRef.current;
      prependRef.current = null;
      el.scrollTop = top + (el.scrollHeight - height);
      return;
    }
    if (jumpRef.current) {
      const target = document.getElementById(`m-${jumpRef.current}`);
      if (target) {
        jumpRef.current = null;
        shownKeyRef.current = activeId;
        shownLastIdRef.current = lastId;
        stickRef.current = false;
        target.scrollIntoView({ block: 'center' });
        return;
      }
    }
    if (shownKeyRef.current !== activeId) {
      shownKeyRef.current = activeId;
      shownLastIdRef.current = lastId;
      stickRef.current = true;
      setAtBottom(true);
      setNewCount(0);
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (lastId === shownLastIdRef.current) return;
    shownLastIdRef.current = lastId;
    if (stickRef.current || last?.pending) {
      stickRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } else if (last && last.author.id !== meId) {
      setNewCount((n) => n + 1);
    }
  }, [messages, activeId, meId]);

  // Al fijar «Mensajes nuevos», si quedó arriba de la vista, se abre ahí (como Slack).
  useLayoutEffect(() => {
    if (!unreadFrom || msgParam) return;
    const el = scrollRef.current;
    const divider = el?.querySelector<HTMLElement>('[data-unread]');
    if (!el || !divider) return;
    if (divider.offsetTop < el.scrollTop) {
      stickRef.current = false;
      setAtBottom(false);
      el.scrollTop = Math.max(0, divider.offsetTop - 48);
    }
  }, [unreadFrom, msgParam]);

  // Fotos y videos cargan después del primer pintado: si estaba abajo, sigue abajo.
  const hasStream = Boolean(messages?.length);
  useLayoutEffect(() => {
    const stream = scrollRef.current?.firstElementChild;
    if (!stream || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const el = scrollRef.current;
      if (el && stickRef.current && !prependRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(stream);
    return () => ro.disconnect();
    // El contenedor aparece cuando AppShell termina de cargar, no al montar la página.
  }, [activeId, hasStream]);

  const jumpToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    setNewCount(0);
  };

  const jumpToUnread = () => {
    const el = scrollRef.current;
    const divider = el?.querySelector<HTMLElement>('[data-unread]');
    if (!el || !divider) return;
    el.scrollTo({ top: Math.max(0, divider.offsetTop - 48), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    if (!narrow && meId && activeId) inputRef.current?.focus({ preventScroll: true });
  }, [activeId, narrow, meId]);

  /* render */

  const renderRows = (list: ChannelSummary[]) =>
    list.map((c) => (
      <ChannelRow
        key={c.id}
        c={c}
        active={c.id === activeId}
        now={now}
        online={c.kind === 'DIRECT' && c.peer ? online.has(c.peer.id) : undefined}
        onSelect={(id) => selectChannel(id)}
      />
    ));

  const panelTitle =
    panel?.kind === 'thread' ? 'Hilo' : panel?.kind === 'pins' ? 'Mensajes fijados' : panel?.kind === 'saved' ? 'Guardados' : 'Detalles';

  const intro = (
    <div className="chat-intro">
      {head || summary ? <ChannelGlyph c={(head ?? summary)!} size="lg" online={isDirect ? peerOnline : undefined} /> : null}
      <h3 className="chat-intro__title">
        {isDirect ? `Tu conversación con ${title}` : isGroup ? title : `Este es el inicio de #${title}`}
      </h3>
      <p className="chat-intro__text">
        {head?.description ||
          head?.topic ||
          (isDirect
            ? 'Lo que escriban aquí solo lo ven ustedes dos.'
            : isGroup
              ? 'Solo las personas de este grupo ven estos mensajes.'
              : 'Comparte avisos, archivos y decisiones con el equipo.')}
      </p>
    </div>
  );

  const failedHere = failedUploads.filter((f) => f.item.channelId === activeId);

  return (
    <AppShell title="Chat">
      <div className={`chat ${view === 'convo' ? 'chat--thread' : 'chat--list'}${panel ? ' has-panel' : ''}`}>
        <aside className="chat__side" aria-label="Conversaciones">
          <div className="chat-side-head">
            <strong className="chat-side-head__title">Chat</strong>
            <button
              type="button"
              className={`chat-tool${dndActive ? ' is-on' : ''}`}
              title={dndActive && prefs?.dndUntil ? `No molestar ${untilLabel(prefs.dndUntil)}` : 'No molestar'}
              aria-label="No molestar"
              onClick={(e) => setMenu({ kind: 'dnd', anchor: e.currentTarget.getBoundingClientRect() })}
            >
              <Icon d={ICONS.moon} size={17} />
            </button>
            <button type="button" className="chat-tool" title="Nueva conversación" aria-label="Nueva conversación" onClick={() => setPicker('dm')}>
              <Icon d={ICONS.compose} size={17} />
            </button>
          </div>
          {dndActive && prefs?.dndUntil ? (
            <button type="button" className="chat-dnd" onClick={(e) => setMenu({ kind: 'dnd', anchor: e.currentTarget.getBoundingClientRect() })}>
              <Icon d={ICONS.moon} size={14} /> No molestar {untilLabel(prefs.dndUntil)}
            </button>
          ) : null}
          <div className="chat-search">
            <span className="chat-search__icon">
              <Icon d={ICONS.search} size={15} />
            </span>
            <input
              className="chat-search__input"
              type="text"
              value={query}
              placeholder="Buscar canal, persona o mensaje"
              aria-label="Buscar"
              autoComplete="off"
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value) setResults(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setQuery('');
                  setResults(null);
                }
                if (e.key === 'Enter') void runSearch();
              }}
            />
          </div>

          <div className="chat-list">
            <div className="chat-nav">
              <button type="button" className={`chat-nav__item${panel?.kind === 'saved' ? ' is-active' : ''}`} onClick={() => (panel?.kind === 'saved' ? setPanel(null) : openSaved())}>
                <Icon d={ICONS.bookmark} size={15} /> Guardados
              </button>
              <button type="button" className="chat-nav__item" onClick={() => setSwitcher(true)}>
                <Icon d={ICONS.search} size={15} /> Ir a…
                <kbd className="chat-nav__kbd">Ctrl K</kbd>
              </button>
            </div>
            {results ? (
              <div className="chat-results">
                <div className="chat-section__title">
                  <span>{results.length ? `${results.length} mensajes` : 'Sin mensajes'}</span>
                  <button type="button" className="chat-link" onClick={() => setResults(null)}>
                    Cerrar
                  </button>
                </div>
                {results.map((m) => (
                  <MessageResult
                    key={m.id}
                    m={m}
                    now={now}
                    where={m.channel?.kind === 'DIRECT' ? m.author.fullName : `#${m.channel?.name ?? ''}`}
                    onClick={() => selectChannel(m.channelId, { msg: m.parentId ?? m.id })}
                  />
                ))}
              </div>
            ) : sections === null ? (
              channelsError ? (
                <EmptyLite icon="!" title="No se pudo cargar">
                  <button type="button" className="btn ghost btn-sm" onClick={() => void loadChannels()}>
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
            ) : (
              <>
                {sections.teams.length || !q ? (
                  <Section
                    title="Canales"
                    action={
                      <button type="button" className="chat-section__add" aria-label="Nuevo canal" title="Nuevo canal" onClick={() => setPicker('channel')}>
                        <Icon d={ICONS.plus} size={14} />
                      </button>
                    }
                  >
                    {renderRows(sections.teams)}
                  </Section>
                ) : null}
                {sections.events.length ? <Section title="Eventos">{renderRows(sections.events)}</Section> : null}
                {sections.directs.length || !q ? (
                  <Section
                    title="Mensajes directos"
                    action={
                      <button type="button" className="chat-section__add" aria-label="Nuevo mensaje" title="Nuevo mensaje" onClick={() => setPicker('dm')}>
                        <Icon d={ICONS.plus} size={14} />
                      </button>
                    }
                  >
                    {sections.directs.length ? renderRows(sections.directs) : <p className="chat-list__hint">Escribe a alguien del equipo con +</p>}
                  </Section>
                ) : null}
                {q.length >= 2 ? (
                  <button type="button" className="chat-search-more" onClick={() => void runSearch()} disabled={searching}>
                    {searching ? 'Buscando…' : `Buscar «${query.trim()}» en mensajes`}
                  </button>
                ) : null}
                {!sections.teams.length && !sections.events.length && !sections.directs.length && q.length < 2 && q ? (
                  <p className="chat-list__none">Sin resultados</p>
                ) : null}
              </>
            )}
          </div>
        </aside>

        <section
          className={`chat__main${dragOver ? ' is-drop' : ''}`}
          aria-label={title || 'Conversación'}
          onDragOver={(e) => {
            if (!activeId || !canPost || !e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget === e.target) setDragOver(false);
          }}
          onDrop={onDrop}
        >
          {!activeId ? (
            <div className="chat-empty">
              <EmptyLite icon={<Icon d={ICONS.bubble} size={20} />} title="Elige una conversación">
                <button type="button" className="btn ghost btn-sm" onClick={() => setSwitcher(true)}>
                  Ir a… (Ctrl K)
                </button>
              </EmptyLite>
            </div>
          ) : (
            <>
              <header className="chat-head">
                <button type="button" className="chat-back" aria-label="Conversaciones" onClick={() => setView('list')}>
                  <Icon d={ICONS.back} size={20} />
                </button>
                <button
                  type="button"
                  className="chat-head__id"
                  title="Ver detalles"
                  onClick={() => setPanel((p) => (p?.kind === 'info' ? null : { kind: 'info' }))}
                  disabled={!head}
                >
                  {head || summary ? (
                    <ChannelGlyph c={(head ?? summary)!} size="lg" online={isDirect ? peerOnline : undefined} />
                  ) : (
                    <span className="chat-avatar chat-avatar--lg skeleton" aria-hidden />
                  )}
                  <span className="chat-head__copy">
                    <span className="chat-head__title">
                      {title}
                      {muted ? (
                        <span className="chat-head__muted" aria-label="Silenciado">
                          <Icon d={ICONS.bellOff} size={13} />
                        </span>
                      ) : null}
                    </span>
                    {subtitle ? <span className={`chat-head__sub${typingNames.length ? ' is-typing' : ''}${peerOnline && !typingNames.length ? ' is-online' : ''}`}>{subtitle}</span> : null}
                  </span>
                </button>
                <div className="chat-head__tools">
                  {head?.eventId ? (
                    <Link className="chat-tool" href={`/events/${head.eventId}`} title="Ver evento" aria-label="Ver evento">
                      <Icon d={ICON_EVENT} size={17} />
                    </Link>
                  ) : null}
                  {head && !directLike ? (
                    <button type="button" className="chat-head__members" title="Miembros" onClick={() => setPanel({ kind: 'info' })}>
                      <Icon d={ICONS.users} size={15} /> {head.memberCount}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`chat-tool${panel?.kind === 'pins' ? ' is-on' : ''}`}
                    title="Fijados"
                    aria-label="Mensajes fijados"
                    onClick={() => (panel?.kind === 'pins' ? setPanel(null) : openPins())}
                  >
                    <Icon d={ICONS.pin} size={17} />
                  </button>
                  {head ? (
                    <button
                      type="button"
                      className={`chat-tool${head.muted ? ' is-on' : ''}`}
                      title={head.muted ? 'Silenciado' : 'Avisos'}
                      aria-label="Avisos de la conversación"
                      onClick={(e) => setMenu({ kind: 'mute', anchor: e.currentTarget.getBoundingClientRect() })}
                    >
                      <Icon d={head.muted ? ICONS.bellOff : ICONS.bell} size={17} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`chat-tool${panel?.kind === 'info' ? ' is-on' : ''}`}
                    title="Detalles"
                    aria-label="Detalles de la conversación"
                    onClick={() => setPanel((p) => (p?.kind === 'info' ? null : { kind: 'info' }))}
                  >
                    <Icon d={ICONS.info} size={17} />
                  </button>
                </div>
              </header>

              <div className="chat-viewport">
                {dividerAbove && unreadFrom ? (
                  <div className="chat-pill chat-pill--top" role="status">
                    <button type="button" onClick={jumpToUnread}>
                      <Icon d={ICONS.send} size={13} /> Mensajes nuevos
                    </button>
                    <button type="button" aria-label="Marcar como leído" title="Marcar como leído" onClick={() => setUnreadMark(null)}>
                      <Icon d={ICONS.close} size={13} />
                    </button>
                  </div>
                ) : null}
                <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
                  {messages === undefined ? (
                    loadError === activeId ? (
                      <div className="chat-empty">
                        <EmptyLite icon="!" title="No se pudo cargar la conversación">
                          <button type="button" className="btn ghost btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
                            Reintentar
                          </button>
                        </EmptyLite>
                      </div>
                    ) : (
                      <StreamGhost />
                    )
                  ) : messages.length === 0 ? (
                    <div className="chat-stream">{intro}</div>
                  ) : (
                    <div className="chat-stream">
                      {entry?.hasMore ? (
                        <button type="button" className="chat-older" onClick={() => void loadOlder()} disabled={loadingOlder}>
                          {loadingOlder ? 'Cargando…' : 'Mensajes anteriores'}
                        </button>
                      ) : (
                        intro
                      )}
                      <MessageStream list={messages} x={actions} unreadFrom={unreadFrom} receipt={receipt} />
                    </div>
                  )}
                </div>

                {!atBottom && messages && messages.length > 0 ? (
                  <button
                    type="button"
                    className={`chat-pill chat-pill--bottom${newCount ? ' has-new' : ''}`}
                    aria-label={newCount ? `${newCount} mensajes nuevos, ir al último` : 'Ir al último mensaje'}
                    onClick={jumpToBottom}
                  >
                    <Icon d={ICONS.down} size={16} />
                    {newCount ? <span>{newCount === 1 ? '1 nuevo' : `${newCount} nuevos`}</span> : null}
                  </button>
                ) : null}
                {dragOver ? <div className="chat-dropzone">Suelta para enviar</div> : null}
              </div>

              {upload ? (
                <div className="chat-upload" role="status">
                  <span className="chat-upload__label">
                    {upload.total > 1 ? `${upload.index}/${upload.total} · ` : ''}
                    {upload.fraction === null ? 'Preparando' : 'Enviando'} {upload.label}
                  </span>
                  <span className="chat-upload__bar">
                    <span style={{ width: `${Math.round((upload.fraction ?? 0) * 100)}%` }} />
                  </span>
                </div>
              ) : null}

              {failedHere.length ? (
                <div className="chat-upfail" role="alert">
                  {failedHere.map((f) => (
                    <div key={f.id} className="chat-upfail__row">
                      <span className="chat-upfail__text">
                        No se envió «{f.item.label}» · {f.error}
                      </span>
                      <button type="button" className="chat-retry" onClick={() => retryUpload(f)}>
                        Reintentar
                      </button>
                      <button type="button" className="chat-retry" onClick={() => setFailedUploads((all) => all.filter((x) => x.id !== f.id))}>
                        Descartar
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {recording ? (
                <div className="chat-recording" role="status">
                  <button type="button" className="chat-tool" aria-label="Cancelar grabación" onClick={cancelRecording}>
                    <Icon d={ICONS.close} size={18} />
                  </button>
                  <span className="chat-recording__dot" aria-hidden />
                  <span className="chat-recording__time">{mmss((Date.now() - (recordingSince ?? Date.now())) / 1000)}</span>
                  <span className="chat-recording__hint">Grabando nota de voz…</span>
                  <button type="button" className="chat-send" aria-label="Enviar nota de voz" onClick={() => void finishRecording()}>
                    <Icon d={ICONS.check} size={18} />
                  </button>
                </div>
              ) : (
                <Composer
                  value={draft}
                  onChange={onDraft}
                  onSend={sendMain}
                  onFiles={() => pickFiles('main')}
                  onMic={() => void startRecording()}
                  onPaste={onPaste('main')}
                  disabled={!canPost}
                  disabledText="Solo dirección publica en este canal"
                  placeholder={isDirect ? `Mensaje a ${title.split(/\s+/)[0] || ''}` : isGroup ? `Mensaje a ${title}` : `Mensaje en #${title}`}
                  inputRef={inputRef}
                  replyTo={activeId ? (replyTo[activeId] ?? null) : null}
                  onCancelReply={() =>
                    setReplyTo((r) => {
                      const next = { ...r };
                      if (activeId) delete next[activeId];
                      return next;
                    })
                  }
                  people={people}
                  searchPeople={searchPeople}
                  canMentionChannel={Boolean(head?.canManage) && !directLike}
                  isOnline={isOnline}
                  onPicked={onPicked}
                  onEditLast={editLast}
                />
              )}
            </>
          )}
        </section>

        {panel ? (
          <aside className="chat-panel" aria-label={panelTitle}>
            <PanelHead title={panelTitle} onClose={() => setPanel(null)}>
              {panel.kind === 'thread' && title ? <span className="chat-panel__sub">{directLike ? title : `#${title}`}</span> : null}
            </PanelHead>
            {panel.kind === 'thread' ? (
              <>
                <div className="chat-panel__body">
                  {thread ? (
                    <>
                      <MessageStream list={[thread.root]} x={threadActions} />
                      <div className="chat-panel__divider">
                        {thread.replies.length === 1 ? '1 respuesta' : `${thread.replies.length} respuestas`}
                      </div>
                      <MessageStream list={thread.replies} x={threadActions} />
                    </>
                  ) : (
                    <StreamGhost />
                  )}
                </div>
                {thread ? (
                  <Composer
                    compact
                    value={threadDraft}
                    onChange={setThreadDraft}
                    onSend={sendThread}
                    onFiles={() => pickFiles('thread')}
                    onPaste={onPaste('thread')}
                    disabled={!canPost}
                    disabledText="Solo dirección publica en este canal"
                    placeholder="Responder en el hilo…"
                    inputRef={threadInputRef}
                    replyTo={threadReply}
                    onCancelReply={() => setThreadReply(null)}
                    people={people}
                    searchPeople={searchPeople}
                    canMentionChannel={false}
                    isOnline={isOnline}
                    onPicked={onPicked}
                  />
                ) : null}
              </>
            ) : panel.kind === 'pins' ? (
              <div className="chat-panel__body">
                <PinsList
                  pins={pins}
                  now={now}
                  onJump={(m) => {
                    if (narrow) setPanel(null);
                    jumpTo(m.id);
                  }}
                />
              </div>
            ) : panel.kind === 'saved' ? (
              <div className="chat-panel__body">
                <SavedList
                  items={saved}
                  error={savedError}
                  now={now}
                  onRetry={loadSaved}
                  onJump={(it) => {
                    if (narrow) setPanel(null);
                    if (it.channel.id === activeId && document.getElementById(`m-${it.message.parentId ?? it.message.id}`)) jumpTo(it.message.parentId ?? it.message.id);
                    else selectChannel(it.channel.id, { msg: it.message.parentId ?? it.message.id });
                  }}
                  onUnsave={(it) => actions.save({ ...it.message, saved: true })}
                />
              </div>
            ) : (
              <div className="chat-panel__body chat-panel__body--flush">{channelInfo ?? <StreamGhost />}</div>
            )}
          </aside>
        ) : null}
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        accept={`image/*,video/*,audio/*,${ACCEPT}`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          enqueueFiles(files, fileTarget.current);
        }}
      />

      {viewer ? <MediaViewer items={viewer.items} start={viewer.index} onClose={() => setViewer(null)} /> : null}
      {picker ? (
        <NewConversation
          initialMode={picker}
          meId={meId}
          onClose={() => setPicker(null)}
          onOpen={(id) => {
            setPicker(null);
            selectChannel(id);
            scheduleChannels();
          }}
          onError={showToast}
        />
      ) : null}
      {switcher && channels ? (
        <QuickSwitcher
          channels={channels}
          meId={meId}
          isOnline={isOnline}
          onSelect={(id) => selectChannel(id)}
          onOpenDm={openDm}
          onClose={() => setSwitcher(false)}
        />
      ) : null}
      {menu ? (
        <Menu
          anchor={menu.anchor}
          title={menu.kind === 'dnd' ? (dndActive && prefs?.dndUntil ? `No molestar ${untilLabel(prefs.dndUntil)}` : 'No molestar') : 'Avisos'}
          items={menu.kind === 'dnd' ? dndItems : muteItems}
          onClose={() => setMenu(null)}
        />
      ) : null}
      {toast ? (
        <div className="chat-toast" role="alert" onClick={() => setToast(null)}>
          {toast}
        </div>
      ) : null}
    </AppShell>
  );
}
