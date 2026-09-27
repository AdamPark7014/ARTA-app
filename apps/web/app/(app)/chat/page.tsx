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
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { EmptyLite } from '@/components/ui/Lite';
import { api } from '@/lib/api';
import { joinChannel, leaveChannel, sendTyping, useRealtime, useRealtimeStatus } from '@/lib/realtime';
import { useUser } from '@/lib/user-context';
import { AttachmentView, Icon, ICONS, MediaViewer } from '@/components/chat/ChatAttachment';
import {
  ACCEPT,
  attachmentLabel,
  buildBlocks,
  clock,
  EDIT_WINDOW_MS,
  fold,
  fullStamp,
  hueOf,
  initials,
  listTime,
  MAX_LEN,
  mmss,
  patchMessage,
  prepareFile,
  QUICK_REACTIONS,
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
} from '@/components/chat/chat-model';

/*
 * Chat en canales, el mismo que las apps de Android e iPhone: #general, #anuncios,
 * canales de evento, privados y directos; hilos, reacciones, fijados, fotos,
 * video, notas de voz y documentos; todo en vivo por socket.
 */

type Thread = { root: ChatMessage; replies: ChatMessage[] };
type Panel = { kind: 'thread'; rootId: string } | { kind: 'pins' } | null;
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

const PAGE = 50;
const TYPING_TTL = 5_000;
const TYPING_EVERY = 2_500;
const ICON_LOCK = 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3';
const ICON_EVENT = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4';
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/* ── utilidades ─────────────────────────────────────────────────────────── */

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

function errorText(e: unknown, fallback = 'No se pudo completar') {
  return e instanceof Error && e.message ? e.message : fallback;
}

function isEvent(c: { eventId?: string | null }) {
  return Boolean(c.eventId);
}

function RichText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </>
  );
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

function ChannelGlyph({
  c,
  size = 'md',
}: {
  c: Pick<ChannelSummary, 'id' | 'kind' | 'name' | 'eventId' | 'peer'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  if (c.kind === 'DIRECT') return <Avatar id={c.peer?.id ?? c.id} name={c.name} size={size} />;
  return (
    <span className={`chat-avatar chat-avatar--general chat-avatar--${size}`} aria-hidden>
      {isEvent(c) ? <Icon d={ICON_EVENT} size={16} /> : c.kind === 'PRIVATE' ? <Icon d={ICON_LOCK} size={15} /> : '#'}
    </span>
  );
}

function ChannelRow({
  c,
  active,
  now,
  onSelect,
}: {
  c: ChannelSummary;
  active: boolean;
  now: Date;
  onSelect: (id: string) => void;
}) {
  const unread = active ? 0 : c.unreadCount;
  return (
    <button
      type="button"
      className={`chat-row${active ? ' is-active' : ''}${unread > 0 ? ' has-unread' : ''}${c.muted ? ' is-muted' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(c.id)}
    >
      <ChannelGlyph c={c} />
      <span className="chat-row__main">
        <span className="chat-row__top">
          <span className="chat-row__name">{c.name}</span>
          {c.lastMessageAt ? <span className="chat-row__time">{listTime(c.lastMessageAt, now)}</span> : null}
        </span>
        <span className="chat-row__bottom">
          <span className="chat-row__preview">{c.lastMessagePreview || c.topic || ''}</span>
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="chat-section">
      <div className="chat-section__title">{title}</div>
      {children}
    </div>
  );
}

type MessageActions = {
  meId: string | null;
  canManage: boolean;
  canPost: boolean;
  inThread: boolean;
  editing: { id: string; body: string } | null;
  setEditing: (e: { id: string; body: string } | null) => void;
  saveEdit: () => void;
  react: (m: ChatMessage, emoji: string) => void;
  openThread: (m: ChatMessage) => void;
  pin: (m: ChatMessage) => void;
  remove: (m: ChatMessage) => void;
  retry: (m: ChatMessage) => void;
  discard: (m: ChatMessage) => void;
  onImage: (a: ChatAttachment) => void;
  highlight: string | null;
  touched: string | null;
  setTouched: (id: string | null) => void;
};

function MessageItem({ m, x }: { m: ChatMessage; x: MessageActions }) {
  const [picking, setPicking] = useState(false);
  const mine = m.author.id === x.meId;
  const isEditing = x.editing?.id === m.id;
  const canEdit = mine && !m.pending && Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
  const deleted = !m.body && !m.attachment;
  const local = m.pending || m.failed;

  return (
    <div
      id={`m-${m.id}`}
      className={`chat-msg${x.highlight === m.id ? ' is-highlight' : ''}${x.touched === m.id ? ' is-open' : ''}`}
      onClick={() => x.setTouched(x.touched === m.id ? null : m.id)}
    >
      <div
        className={`chat-bubble${m.pending ? ' chat-bubble--sending' : ''}${m.failed ? ' chat-bubble--failed' : ''}${
          m.attachment && !m.body ? ' chat-bubble--media' : ''
        }`}
        title={local ? undefined : fullStamp(m.createdAt)}
      >
        {m.pinnedAt ? (
          <span className="chat-bubble__pin" title="Fijado">
            <Icon d={ICONS.pin} size={11} /> Fijado
          </span>
        ) : null}
        {m.attachment ? <AttachmentView a={m.attachment} onImage={x.onImage} /> : null}
        {isEditing ? (
          <div className="chat-edit" onClick={(e) => e.stopPropagation()}>
            <textarea
              autoFocus
              value={x.editing?.body ?? ''}
              maxLength={MAX_LEN}
              rows={Math.min(8, (x.editing?.body ?? '').split('\n').length + 1)}
              onChange={(e) => x.setEditing({ id: m.id, body: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') x.setEditing(null);
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  x.saveEdit();
                }
              }}
            />
            <div className="chat-edit__row">
              <button type="button" className="btn ghost btn-sm" onClick={() => x.setEditing(null)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-sm" onClick={x.saveEdit}>
                Guardar
              </button>
            </div>
          </div>
        ) : m.body ? (
          <span className="chat-bubble__text">
            <RichText text={m.body} />
            {m.editedAt ? <span className="chat-bubble__edited"> (editado)</span> : null}
          </span>
        ) : deleted ? (
          <span className="chat-bubble__deleted">Mensaje eliminado</span>
        ) : null}
      </div>

      {m.reactions.length ? (
        <div className="chat-reactions">
          {m.reactions.map((r) => {
            const me = x.meId ? r.userIds.includes(x.meId) : false;
            return (
              <button
                key={r.emoji}
                type="button"
                className={`chat-reaction${me ? ' is-mine' : ''}`}
                title={r.users.map((u) => u.fullName).join(', ')}
                onClick={(e) => {
                  e.stopPropagation();
                  x.react(m, r.emoji);
                }}
              >
                {r.emoji} <span>{r.count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!x.inThread && m.replyCount > 0 ? (
        <button
          type="button"
          className="chat-replies"
          onClick={(e) => {
            e.stopPropagation();
            x.openThread(m);
          }}
        >
          {m.replyCount === 1 ? '1 respuesta' : `${m.replyCount} respuestas`}
        </button>
      ) : null}

      {m.failed ? (
        <div className="chat-failed" onClick={(e) => e.stopPropagation()}>
          No se envió ·{' '}
          {m.attachment ? null : (
            <button type="button" className="chat-retry" onClick={() => x.retry(m)}>
              Reintentar
            </button>
          )}{' '}
          <button type="button" className="chat-retry" onClick={() => x.discard(m)}>
            Descartar
          </button>
        </div>
      ) : null}

      {!local && !isEditing && !deleted ? (
        <div className="chat-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" aria-label="Reaccionar" title="Reaccionar" onClick={() => setPicking((v) => !v)}>
            <Icon d={ICONS.smile} size={15} />
          </button>
          {!x.inThread ? (
            <button type="button" aria-label="Responder en hilo" title="Responder en hilo" onClick={() => x.openThread(m)}>
              <Icon d={ICONS.thread} size={15} />
            </button>
          ) : null}
          {m.body ? (
            <button
              type="button"
              aria-label="Copiar"
              title="Copiar"
              onClick={() => void navigator.clipboard?.writeText(m.body).catch(() => undefined)}
            >
              <Icon d={ICONS.copy} size={15} />
            </button>
          ) : null}
          {x.canPost && !m.parentId ? (
            <button type="button" aria-label={m.pinnedAt ? 'Desfijar' : 'Fijar'} title={m.pinnedAt ? 'Desfijar' : 'Fijar'} onClick={() => x.pin(m)}>
              <Icon d={ICONS.pin} size={15} />
            </button>
          ) : null}
          {canEdit && m.kind === 'TEXT' ? (
            <button type="button" aria-label="Editar" title="Editar" onClick={() => x.setEditing({ id: m.id, body: m.body })}>
              <Icon d={ICONS.edit} size={15} />
            </button>
          ) : null}
          {mine || x.canManage ? (
            <button type="button" aria-label="Eliminar" title="Eliminar" onClick={() => x.remove(m)}>
              <Icon d={ICONS.trash} size={15} />
            </button>
          ) : null}
          {picking ? (
            <div className="chat-picker">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    setPicking(false);
                    x.react(m, e);
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MessageStream({
  list,
  x,
  showNames,
  receipt,
}: {
  list: ChatMessage[];
  x: MessageActions;
  showNames: boolean;
  receipt?: (last: ChatMessage) => { text: string; title: string } | null;
}) {
  const blocks = useMemo(() => buildBlocks(list, x.meId, new Date()), [list, x.meId]);
  const lastMineId = useMemo(() => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].author.id === x.meId && !list[i].pending) return list[i].id;
    return null;
  }, [list, x.meId]);

  return (
    <>
      {blocks.map((b) => {
        if (b.kind === 'day') {
          return (
            <div key={b.key} className="chat-day" role="separator">
              <span>{b.label}</span>
            </div>
          );
        }
        if (b.kind === 'system') {
          return (
            <div key={b.key} className="chat-system">
              {b.message.body}
            </div>
          );
        }
        const last = b.items[b.items.length - 1];
        const showPeer = showNames && !b.mine;
        const r = receipt && b.mine && last.id === lastMineId ? receipt(last) : null;
        return (
          <div
            key={b.key}
            className={`chat-group ${b.mine ? 'chat-group--mine' : 'chat-group--theirs'}${showPeer ? ' chat-group--named' : ''}`}
          >
            {showPeer ? <Avatar id={b.authorId} name={b.authorName} size="sm" /> : null}
            <div className="chat-group__body">
              {showPeer ? <div className="chat-group__name">{b.authorName}</div> : null}
              <div className="chat-group__stack">
                {b.items.map((m) => (
                  <MessageItem key={m.id} m={m} x={x} />
                ))}
              </div>
              <div className="chat-group__meta">
                {last.pending ? (
                  <span className="chat-group__sending" aria-label="Enviando">
                    •••
                  </span>
                ) : last.failed ? null : (
                  <time dateTime={last.createdAt}>{clock(new Date(last.createdAt))}</time>
                )}
                {r ? (
                  <span className="chat-group__receipt" title={r.title}>
                    {' '}
                    · {r.text}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  onFiles,
  onMic,
  onPaste,
  disabled,
  disabledText,
  placeholder,
  inputRef,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onFiles: () => void;
  onMic?: () => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
  disabled?: boolean;
  disabledText?: string;
  placeholder: string;
  inputRef?: React.RefObject<HTMLTextAreaElement>;
  compact?: boolean;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);

  if (disabled) {
    return (
      <div className={`chat-composer${compact ? ' chat-composer--compact' : ''}`}>
        <p className="chat-composer__locked">{disabledText}</p>
      </div>
    );
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSend();
    }
  };
  const canSend = value.trim().length > 0;

  return (
    <form
      className={`chat-composer${compact ? ' chat-composer--compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <div className="chat-composer__inner">
        <button type="button" className="chat-tool" aria-label="Adjuntar foto, video o documento" title="Adjuntar" onClick={onFiles}>
          <Icon d={ICONS.clip} size={18} />
        </button>
        <div className="chat-composer__field">
          <textarea
            ref={ref}
            className="chat-composer__input"
            rows={1}
            value={value}
            maxLength={MAX_LEN}
            placeholder={placeholder}
            aria-label="Mensaje"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
          />
        </div>
        {!canSend && onMic ? (
          <button type="button" className="chat-send chat-send--mic" aria-label="Grabar nota de voz" title="Nota de voz" onClick={onMic}>
            <Icon d={ICONS.mic} size={18} />
          </button>
        ) : (
          <button type="submit" className="chat-send" disabled={!canSend} aria-label="Enviar">
            <Icon d={ICONS.send} size={18} />
          </button>
        )}
      </div>
    </form>
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatMessage[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<Panel>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadDraft, setThreadDraft] = useState('');
  const [pins, setPins] = useState<ChatMessage[] | null>(null);
  const [typing, setTyping] = useState<TypingMap>({});
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [viewer, setViewer] = useState<ChatAttachment | null>(null);
  const [upload, setUpload] = useState<UploadState | null>(null);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [picker, setPicker] = useState<null | 'dm' | 'channel'>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [touched, setTouched] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [newBelow, setNewBelow] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const storeRef = useRef(store);
  storeRef.current = store;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileTarget = useRef<'main' | 'thread'>('main');
  const stickRef = useRef(true);
  const shownKeyRef = useRef<string | null>(null);
  const shownLastIdRef = useRef<string | null>(null);
  const prependRef = useRef<{ height: number; top: number } | null>(null);
  const jumpRef = useRef<string | null>(null);
  const seq = useRef(0);
  const readTimer = useRef<number>();
  const channelsTimer = useRef<number>();
  const typingSent = useRef(0);
  const queue = useRef<UploadItem[]>([]);
  const draining = useRef(false);
  const recorder = useRef<VoiceRecorder | null>(null);
  const toastTimer = useRef<number>();

  /** En móvil la conversación solo cuenta como «abierta» si está en pantalla. */
  const open = !narrow || view === 'convo';

  const showToast = useCallback((text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4_500);
  }, []);

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

  const selectChannel = useCallback(
    (id: string, opts: { msg?: string } = {}) => {
      setActiveId(id);
      setView('convo');
      setPanel(null);
      setTouched(null);
      router.replace(`/chat?channel=${encodeURIComponent(id)}${opts.msg ? `&msg=${encodeURIComponent(opts.msg)}` : ''}`, {
        scroll: false,
      });
    },
    [router],
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

  const loadLatest = useCallback(
    async (channelId: string, around?: string | null) => {
      const qs = around ? `around=${encodeURIComponent(around)}&limit=${PAGE}` : `limit=${PAGE}`;
      const page = await api<MessagePage>(`/chat/channels/${channelId}/messages?${qs}`);
      setStore((s) => {
        const cur = s[channelId];
        const list = around || !cur ? page.messages : upsertMessages(cur.list, page.messages);
        return { ...s, [channelId]: { list, hasMore: around || !cur ? page.hasMore : cur.hasMore } };
      });
    },
    [],
  );

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
      setHighlight(around);
      window.setTimeout(() => setHighlight((h) => (h === around ? null : h)), 3_000);
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
  }, [meId, activeId, msgParam, loadLatest, showToast]);

  useEffect(() => {
    if (activeId && open && store[activeId]) markRead(activeId);
    // Solo al abrir o al cargar la conversación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, open, Boolean(activeId && store[activeId])]);

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

  /* hilo y fijados */

  const openThread = useCallback((m: ChatMessage) => {
    const rootId = m.parentId || m.id;
    setPanel({ kind: 'thread', rootId });
    setThread((t) => (t?.root.id === rootId ? t : null));
    setThreadDraft('');
    api<Thread>(`/chat/messages/${rootId}/thread`)
      .then((t) => setThread(t))
      .catch((e) => {
        showToast(errorText(e, 'No se pudo abrir el hilo'));
        setPanel(null);
      });
  }, [showToast]);

  const openPins = useCallback(() => {
    if (!activeId) return;
    setPanel({ kind: 'pins' });
    setPins(null);
    api<{ messages: ChatMessage[] }>(`/chat/channels/${activeId}/pins`)
      .then((r) => setPins(r.messages))
      .catch(() => setPins([]));
  }, [activeId]);

  /* aplicar cambios de mensajes en lista, hilo y fijados */

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

  const applyUpdate = useCallback((m: ChatMessage) => {
    setStore((s) => {
      const cur = s[m.channelId];
      if (!cur) return s;
      return { ...s, [m.channelId]: { ...cur, list: patchMessage(cur.list, m) } };
    });
    setThread((t) => {
      if (!t) return t;
      if (t.root.id === m.id) return { ...t, root: m };
      return { ...t, replies: patchMessage(t.replies, m) };
    });
    setPins((p) => {
      if (!p) return p;
      if (!m.pinnedAt) return p.filter((x) => x.id !== m.id);
      return p.some((x) => x.id === m.id) ? patchMessage(p, m) : [m, ...p];
    });
  }, []);

  const applyDelete = useCallback((channelId: string, messageId: string) => {
    setStore((s) => {
      const cur = s[channelId];
      if (!cur) return s;
      return { ...s, [channelId]: { ...cur, list: cur.list.filter((m) => m.id !== messageId) } };
    });
    setThread((t) => (t ? { ...t, replies: t.replies.filter((m) => m.id !== messageId) } : t));
    setPins((p) => (p ? p.filter((m) => m.id !== messageId) : p));
    setPanel((p) => (p?.kind === 'thread' && p.rootId === messageId ? null : p));
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
  useRealtime<ChatMessage>('chat:message-updated', applyUpdate);
  useRealtime<{ channelId: string; messageId: string }>('chat:message-deleted', (p) => applyDelete(p.channelId, p.messageId));
  useRealtime<{ channelId: string; userId: string; fullName: string; at: number }>('chat:typing', (p) => {
    if (!p?.channelId || p.userId === meId) return;
    setTyping((t) => ({ ...t, [p.channelId]: { ...(t[p.channelId] ?? {}), [p.userId]: { name: p.fullName, at: Date.now() } } }));
  });
  useRealtime<{ channelId: string; userId: string; at: string }>('chat:read', (p) => {
    setDetail((d) =>
      d && d.id === p.channelId
        ? { ...d, members: d.members.map((mm) => (mm.id === p.userId ? { ...mm, lastReadAt: p.at } : mm)) }
        : d,
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

  /* enviar */

  const localMessage = useCallback(
    (channelId: string, body: string, parentId: string | null): ChatMessage => {
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
        pending: true,
      };
    },
    [user],
  );

  const deliver = useCallback(
    async (tmp: ChatMessage) => {
      applyMessage(tmp);
      try {
        const saved = await api<ChatMessage>(`/chat/channels/${tmp.channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body: tmp.body, parentId: tmp.parentId ?? undefined, clientId: tmp.clientId }),
        });
        applyMessage({ ...saved, clientId: tmp.clientId });
      } catch (e) {
        applyMessage({ ...tmp, pending: false, failed: true });
        showToast(errorText(e, 'No se envió el mensaje'));
      }
    },
    [applyMessage, showToast],
  );

  const sendMain = () => {
    if (!activeId || !user) return;
    const body = (drafts[activeId] ?? '').trim().slice(0, MAX_LEN);
    if (!body) return;
    stickRef.current = true;
    setDrafts((d) => ({ ...d, [activeId]: '' }));
    void deliver(localMessage(activeId, body, null));
  };

  const sendThread = () => {
    if (!thread || !user) return;
    const body = threadDraft.trim().slice(0, MAX_LEN);
    if (!body) return;
    setThreadDraft('');
    void deliver(localMessage(thread.root.channelId, body, thread.root.id));
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

  /* adjuntos: cola con avance, un mensaje por archivo */

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
        const saved = await api<ChatMessage>(`/chat/channels/${item.channelId}/messages`, {
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
        applyMessage(saved);
      } catch (e) {
        showToast(errorText(e, 'No se pudo enviar el archivo'));
      }
    }
    draining.current = false;
    setUpload(null);
  }, [applyMessage, showToast]);

  const enqueueFiles = useCallback(
    (files: File[], target: 'main' | 'thread') => {
      if (!files.length) return;
      const channelId = target === 'thread' ? thread?.root.channelId : activeId;
      if (!channelId) return;
      const parentId = target === 'thread' ? (thread?.root.id ?? null) : null;
      const caption = (target === 'thread' ? threadDraft : (drafts[channelId] ?? '')).trim().slice(0, MAX_LEN);
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
    [activeId, thread, threadDraft, drafts, drain, showToast],
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
    const body = editing.body.trim();
    const { id } = editing;
    setEditing(null);
    try {
      applyUpdate(await api<ChatMessage>(`/chat/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }));
    } catch (e) {
      showToast(errorText(e, 'No se pudo editar'));
    }
  };

  const actions: MessageActions = {
    meId,
    canManage: Boolean(detail?.canManage),
    canPost: detail?.canPost ?? true,
    inThread: false,
    editing,
    setEditing,
    saveEdit: () => void saveEdit(),
    react: (m, emoji) => {
      api<ChatMessage>(`/chat/messages/${m.id}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) })
        .then(applyUpdate)
        .catch((e) => showToast(errorText(e)));
    },
    openThread,
    pin: (m) => {
      api<ChatMessage>(`/chat/messages/${m.id}/pin`, { method: 'POST' })
        .then(applyUpdate)
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
    onImage: setViewer,
    highlight,
    touched,
    setTouched,
  };
  const threadActions: MessageActions = { ...actions, inThread: true };

  const toggleMute = async () => {
    if (!detail) return;
    const muted = !detail.muted;
    try {
      await api(`/chat/channels/${detail.id}/mute`, { method: 'PATCH', body: JSON.stringify({ muted }) });
      setDetail((d) => (d ? { ...d, muted } : d));
      setChannels((cs) => cs?.map((c) => (c.id === detail.id ? { ...c, muted } : c)) ?? cs);
    } catch (e) {
      showToast(errorText(e));
    }
  };

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

  /* lista derivada */

  const now = new Date();
  const q = fold(query.trim());
  const visible = channels?.filter((c) => !q || fold(c.name).includes(q)) ?? null;
  const sections = useMemo(() => {
    if (!visible) return null;
    const order = (c: ChannelSummary) => (c.slug === 'general' ? 0 : c.slug === 'anuncios' ? 1 : 2);
    const teams = visible.filter((c) => c.kind !== 'DIRECT' && !isEvent(c)).sort((a, b) => order(a) - order(b));
    const events = visible.filter((c) => c.kind !== 'DIRECT' && isEvent(c));
    const directs = visible.filter((c) => c.kind === 'DIRECT');
    return { teams, events, directs };
  }, [visible]);

  const summary = channels?.find((c) => c.id === activeId) ?? null;
  const head = detail?.id === activeId ? detail : null;
  const title = head?.name ?? summary?.name ?? '';
  const isDirect = (head?.kind ?? summary?.kind) === 'DIRECT';
  const canPost = head?.canPost ?? summary?.canPost ?? true;
  const entry = activeId ? store[activeId] : undefined;
  const messages = entry?.list;
  const draft = activeId ? (drafts[activeId] ?? '') : '';

  const subtitle = typingNames.length
    ? `${typingNames.slice(0, 2).join(' y ')}${typingNames.length > 2 ? ' y más' : ''} ${typingNames.length > 1 ? 'están' : 'está'} escribiendo…`
    : isDirect
      ? (head?.peer?.title ?? summary?.peer?.title ?? 'Mensaje directo')
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
    if (near) setNewBelow(false);
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
      setNewBelow(false);
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (lastId === shownLastIdRef.current) return;
    shownLastIdRef.current = lastId;
    if (stickRef.current || last?.pending) {
      stickRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } else if (last && last.author.id !== meId) {
      setNewBelow(true);
    }
  }, [messages, activeId, meId]);

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
    setNewBelow(false);
  };

  useEffect(() => {
    if (!narrow && meId && activeId) inputRef.current?.focus({ preventScroll: true });
  }, [activeId, narrow, meId]);

  /* render */

  const renderRows = (list: ChannelSummary[]) =>
    list.map((c) => <ChannelRow key={c.id} c={c} active={c.id === activeId} now={now} onSelect={(id) => selectChannel(id)} />);

  return (
    <AppShell title="Chat">
      <div className={`chat ${view === 'convo' ? 'chat--thread' : 'chat--list'}${panel ? ' has-panel' : ''}`}>
        <aside className="chat__side" aria-label="Conversaciones">
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
                  setQuery('');
                  setResults(null);
                }
                if (e.key === 'Enter') void runSearch();
              }}
            />
          </div>
          <div className="chat-side-actions">
            <button type="button" className="btn ghost btn-sm" onClick={() => setPicker('dm')}>
              <Icon d={ICONS.plus} size={14} /> Mensaje
            </button>
            <button type="button" className="btn ghost btn-sm" onClick={() => setPicker('channel')}>
              <Icon d={ICONS.plus} size={14} /> Canal
            </button>
          </div>

          <div className="chat-list">
            {results ? (
              <div className="chat-results">
                <div className="chat-section__title">
                  {results.length ? `${results.length} mensajes` : 'Sin mensajes'}
                  <button type="button" className="chat-link" onClick={() => setResults(null)}>
                    Cerrar
                  </button>
                </div>
                {results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="chat-result"
                    onClick={() => selectChannel(m.channelId, { msg: m.parentId ?? m.id })}
                  >
                    <span className="chat-result__where">
                      {m.channel?.kind === 'DIRECT' ? m.author.fullName : `#${m.channel?.name ?? ''}`} · {listTime(m.createdAt, now)}
                    </span>
                    <span className="chat-result__body">
                      <strong>{m.author.fullName.split(/\s+/)[0]}:</strong> {m.body || (m.attachment ? attachmentLabel(m.attachment) : '')}
                    </span>
                  </button>
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
                {sections.teams.length ? <Section title="Canales">{renderRows(sections.teams)}</Section> : null}
                {sections.events.length ? <Section title="Eventos">{renderRows(sections.events)}</Section> : null}
                {sections.directs.length ? <Section title="Mensajes directos">{renderRows(sections.directs)}</Section> : null}
                {q.length >= 2 ? (
                  <button type="button" className="chat-search-more" onClick={() => void runSearch()} disabled={searching}>
                    {searching ? 'Buscando…' : `Buscar «${query.trim()}» en mensajes`}
                  </button>
                ) : null}
                {!sections.teams.length && !sections.events.length && !sections.directs.length && q.length < 2 ? (
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
              <EmptyLite icon={<Icon d={ICONS.bubble} size={20} />} title="Elige una conversación" />
            </div>
          ) : (
            <>
              <header className="chat-head">
                <button type="button" className="chat-back" aria-label="Conversaciones" onClick={() => setView('list')}>
                  <Icon d={ICONS.back} size={20} />
                </button>
                {head || summary ? (
                  <ChannelGlyph c={(head ?? summary)!} size="lg" />
                ) : (
                  <span className="chat-avatar chat-avatar--lg skeleton" aria-hidden />
                )}
                <div className="chat-head__copy">
                  <h2 className="chat-head__title">{title}</h2>
                  {subtitle ? <p className={`chat-head__sub${typingNames.length ? ' is-typing' : ''}`}>{subtitle}</p> : null}
                </div>
                <div className="chat-head__tools">
                  {head?.eventId ? (
                    <Link className="chat-tool" href={`/events/${head.eventId}`} title="Ver evento" aria-label="Ver evento">
                      <Icon d={ICON_EVENT} size={17} />
                    </Link>
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
                      title={head.muted ? 'Activar avisos' : 'Silenciar'}
                      aria-label={head.muted ? 'Activar avisos' : 'Silenciar conversación'}
                      onClick={() => void toggleMute()}
                    >
                      <Icon d={head.muted ? ICONS.bellOff : ICONS.bell} size={17} />
                    </button>
                  ) : null}
                </div>
              </header>

              <div className="chat-viewport">
                <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
                  {messages === undefined ? (
                    loadError === activeId ? (
                      <div className="chat-empty">
                        <EmptyLite icon="!" title="No se pudo cargar la conversación" />
                      </div>
                    ) : (
                      <div className="chat-stream chat-stream--ghost" aria-busy="true">
                        {[48, 32, 56, 40].map((w, i) => (
                          <span key={i} className={`skeleton chat-ghost${i % 2 ? ' chat-ghost--mine' : ''}`} style={{ width: `${w}%` }} />
                        ))}
                      </div>
                    )
                  ) : messages.length === 0 ? (
                    <div className="chat-empty">
                      <EmptyLite icon={<Icon d={ICONS.bubble} size={20} />} title="Empieza la conversación" />
                    </div>
                  ) : (
                    <div className="chat-stream">
                      {entry?.hasMore ? (
                        <button type="button" className="chat-older" onClick={() => void loadOlder()} disabled={loadingOlder}>
                          {loadingOlder ? 'Cargando…' : 'Mensajes anteriores'}
                        </button>
                      ) : null}
                      <MessageStream list={messages} x={actions} showNames={!isDirect} receipt={receipt} />
                    </div>
                  )}
                </div>

                {!atBottom && messages && messages.length > 0 ? (
                  <button type="button" className={`chat-jump${newBelow ? ' has-new' : ''}`} aria-label="Ir al último mensaje" onClick={jumpToBottom}>
                    <Icon d={ICONS.down} size={18} />
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
                  placeholder={isDirect ? `Mensaje a ${title.split(/\s+/)[0] || ''}…` : `Mensaje en #${title}`}
                  inputRef={inputRef}
                />
              )}
            </>
          )}
        </section>

        {panel ? (
          <aside className="chat-panel" aria-label={panel.kind === 'thread' ? 'Hilo' : 'Fijados'}>
            <header className="chat-panel__head">
              <strong>{panel.kind === 'thread' ? 'Hilo' : 'Mensajes fijados'}</strong>
              <button type="button" className="chat-tool" aria-label="Cerrar" onClick={() => setPanel(null)}>
                <Icon d={ICONS.close} size={18} />
              </button>
            </header>
            {panel.kind === 'thread' ? (
              <>
                <div className="chat-panel__body">
                  {thread ? (
                    <>
                      <MessageStream list={[thread.root]} x={threadActions} showNames />
                      <div className="chat-panel__divider">
                        {thread.replies.length === 1 ? '1 respuesta' : `${thread.replies.length} respuestas`}
                      </div>
                      <MessageStream list={thread.replies} x={threadActions} showNames />
                    </>
                  ) : (
                    <p className="chat-list__none">Cargando…</p>
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
                  />
                ) : null}
              </>
            ) : (
              <div className="chat-panel__body">
                {pins === null ? (
                  <p className="chat-list__none">Cargando…</p>
                ) : pins.length === 0 ? (
                  <p className="chat-list__none">Nada fijado todavía</p>
                ) : (
                  pins.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="chat-result"
                      onClick={() => {
                        if (activeId) selectChannel(activeId, { msg: m.id });
                      }}
                    >
                      <span className="chat-result__where">
                        {m.author.fullName} · {listTime(m.createdAt, now)}
                      </span>
                      <span className="chat-result__body">{m.body || (m.attachment ? attachmentLabel(m.attachment) : '')}</span>
                    </button>
                  ))
                )}
              </div>
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

      {viewer ? <MediaViewer a={viewer} onClose={() => setViewer(null)} /> : null}
      {picker ? (
        <NewConversation
          mode={picker}
          onClose={() => setPicker(null)}
          onOpen={(id) => {
            setPicker(null);
            selectChannel(id);
            scheduleChannels();
          }}
          onError={showToast}
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

function NewConversation({
  mode,
  onClose,
  onOpen,
  onError,
}: {
  mode: 'dm' | 'channel';
  onClose: () => void;
  onOpen: (id: string) => void;
  onError: (text: string) => void;
}) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Colleague[] | null>(null);
  const [name, setName] = useState('');
  const [privateChannel, setPrivateChannel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'dm') return;
    const id = window.setTimeout(() => {
      api<Colleague[]>(`/chat/colleagues${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)
        .then(setPeople)
        .catch(() => setPeople([]));
    }, 220);
    return () => window.clearTimeout(id);
  }, [q, mode]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openDm = async (userId: string) => {
    setBusy(true);
    try {
      const c = await api<ChannelDetail>('/chat/dm', { method: 'POST', body: JSON.stringify({ userId }) });
      onOpen(c.id);
    } catch (e) {
      onError(errorText(e, 'No se pudo abrir la conversación'));
    } finally {
      setBusy(false);
    }
  };

  const createChannel = async () => {
    const clean = name.trim().replace(/^#/, '');
    if (clean.length < 2) return;
    setBusy(true);
    try {
      const c = await api<{ id: string }>('/chat/channels', {
        method: 'POST',
        body: JSON.stringify({ name: clean, kind: privateChannel ? 'PRIVATE' : 'PUBLIC' }),
      });
      onOpen(c.id);
    } catch (e) {
      onError(errorText(e, 'No se pudo crear el canal'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-modal" role="dialog" aria-label={mode === 'dm' ? 'Nuevo mensaje' : 'Nuevo canal'} onClick={onClose}>
      <div className="chat-modal__card" onClick={(e) => e.stopPropagation()}>
        <header className="chat-panel__head">
          <strong>{mode === 'dm' ? 'Nuevo mensaje' : 'Nuevo canal'}</strong>
          <button type="button" className="chat-tool" aria-label="Cerrar" onClick={onClose}>
            <Icon d={ICONS.close} size={18} />
          </button>
        </header>
        {mode === 'dm' ? (
          <>
            <input autoFocus type="text" placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="chat-modal__list">
              {people === null ? (
                <p className="chat-list__none">Cargando…</p>
              ) : people.length === 0 ? (
                <p className="chat-list__none">Sin resultados</p>
              ) : (
                people.map((p) => (
                  <button key={p.id} type="button" className="chat-row" disabled={busy} onClick={() => void openDm(p.id)}>
                    <Avatar id={p.id} name={p.fullName} />
                    <span className="chat-row__main">
                      <span className="chat-row__name">{p.fullName}</span>
                      {p.title ? <span className="chat-row__preview">{p.title}</span> : null}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <form
            className="chat-modal__form"
            onSubmit={(e) => {
              e.preventDefault();
              void createChannel();
            }}
          >
            <input autoFocus type="text" placeholder="Nombre del canal" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            <label className="chat-modal__check">
              <input type="checkbox" checked={privateChannel} onChange={(e) => setPrivateChannel(e.target.checked)} />
              Privado (solo quien invites)
            </label>
            <button type="submit" className="btn" disabled={busy || name.trim().replace(/^#/, '').length < 2}>
              Crear canal
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
