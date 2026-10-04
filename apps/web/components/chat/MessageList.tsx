'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { AttachmentView, Icon, ICONS } from './ChatAttachment';
import {
  buildBlocks,
  clock,
  EDIT_WINDOW_MS,
  fetchLinkPreview,
  fullStamp,
  isDeleted,
  MAX_LEN,
  plainText,
  QUICK_REACTIONS,
  type ChatAttachment,
  type ChatMessage,
  type ChatReaction,
  type LinkPreview,
  type ReplyRef,
} from './chat-model';
import { ChatInline, ChatMarkdown, firstLink, isEmojiOnly } from './chat-markdown';
import { Avatar, Menu } from './chat-ui';
import { EmojiPicker } from './EmojiPicker';

export type MessageActions = {
  meId: string | null;
  canManage: boolean;
  canPost: boolean;
  inThread: boolean;
  editing: { id: string; body: string } | null;
  setEditing: (e: { id: string; body: string } | null) => void;
  saveEdit: () => void;
  react: (m: ChatMessage, emoji: string) => void;
  openThread: (m: ChatMessage) => void;
  reply: (m: ChatMessage) => void;
  save: (m: ChatMessage) => void;
  pin: (m: ChatMessage) => void;
  remove: (m: ChatMessage) => void;
  retry: (m: ChatMessage) => void;
  discard: (m: ChatMessage) => void;
  copyLink: (m: ChatMessage) => void;
  copied: (text: string) => void;
  onImage: (a: ChatAttachment) => void;
  jumpTo: (messageId: string) => void;
  onMention?: (userId: string) => void;
  isOnline?: (userId: string) => boolean;
  highlight: string | null;
  touched: string | null;
  setTouched: (id: string | null) => void;
};

export type Receipt = { text: string; title: string };

/** «Ana, Luis y tú reaccionaron con 👍». */
function whoReacted(r: ChatReaction, meId: string | null) {
  const names = r.users.map((u) => (u.id === meId ? 'Tú' : u.fullName.split(/\s+/)[0]));
  const mine = names.indexOf('Tú');
  if (mine > 0) names.unshift(names.splice(mine, 1)[0]);
  const shown = names.slice(0, 6);
  const rest = r.count - shown.length;
  const list = rest > 0 ? `${shown.join(', ')} y ${rest} más` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}` : (shown[0] ?? '');
  const verb = r.count === 1 && names[0] !== 'Tú' ? 'reaccionó' : 'reaccionaron';
  return `${list} ${names.length === 1 && names[0] === 'Tú' ? 'reaccionaste' : verb} con ${r.emoji}`;
}

function ReplyQuote({ r, onJump }: { r: ReplyRef; onJump: (id: string) => void }) {
  return (
    <button
      type="button"
      className="chat-quote"
      title="Ir al mensaje original"
      onClick={(e) => {
        e.stopPropagation();
        onJump(r.id);
      }}
    >
      <span className="chat-quote__author">{r.authorName}</span>
      <span className={`chat-quote__text${r.deleted ? ' is-deleted' : ''}`}>
        {r.deleted ? 'Mensaje eliminado' : r.excerpt ? <ChatInline text={r.excerpt} /> : r.attachmentName ? `📎 ${r.attachmentName}` : 'Adjunto'}
      </span>
    </button>
  );
}

const loadPreview = (url: string) => api<LinkPreview | null>(`/chat/link-preview?url=${encodeURIComponent(url)}`);

function LinkPreviewCard({ url }: { url: string }) {
  const [p, setP] = useState<LinkPreview | null>(null);
  const [noImage, setNoImage] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchLinkPreview(url, loadPreview).then((r) => {
      if (alive) setP(r && (r.title || r.description) ? r : null);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  if (!p) return null;
  const href = p.url || url;
  let host = '';
  try {
    host = new URL(href).hostname.replace(/^www\./, '');
  } catch {
    /* URL rara: sin dominio */
  }
  return (
    <a className="chat-preview" href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      <span className="chat-preview__copy">
        <span className="chat-preview__site">{p.siteName || host}</span>
        {p.title ? <span className="chat-preview__title">{p.title}</span> : null}
        {p.description ? <span className="chat-preview__desc">{p.description}</span> : null}
      </span>
      {p.image && !noImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="chat-preview__img" src={p.image} alt="" loading="lazy" onError={() => setNoImage(true)} />
      ) : null}
    </a>
  );
}

function EditBox({ m, x }: { m: ChatMessage; x: MessageActions }) {
  const body = x.editing?.body ?? '';
  return (
    <div className="chat-edit" onClick={(e) => e.stopPropagation()}>
      <textarea
        autoFocus
        value={body}
        maxLength={MAX_LEN}
        rows={Math.min(10, body.split('\n').length + 1)}
        aria-label="Editar mensaje"
        onFocus={(e) => e.currentTarget.setSelectionRange(body.length, body.length)}
        onChange={(e) => x.setEditing({ id: m.id, body: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            x.setEditing(null);
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            x.saveEdit();
          }
        }}
      />
      <div className="chat-edit__row">
        <span className="chat-edit__hint">Esc cancela · Enter guarda</span>
        <button type="button" className="btn ghost btn-sm" onClick={() => x.setEditing(null)}>
          Cancelar
        </button>
        <button type="button" className="btn btn-sm" onClick={x.saveEdit} disabled={!body.trim()}>
          Guardar
        </button>
      </div>
    </div>
  );
}

export function MessageItem({
  m,
  x,
  first,
  receipt,
}: {
  m: ChatMessage;
  x: MessageActions;
  first: boolean;
  receipt?: Receipt | null;
}) {
  const [emojiAt, setEmojiAt] = useState<DOMRect | null>(null);
  const [menuAt, setMenuAt] = useState<DOMRect | null>(null);
  const mine = m.author.id === x.meId;
  const isEditing = x.editing?.id === m.id;
  const local = Boolean(m.pending || m.failed);
  const deleted = isDeleted(m);
  const canEdit = mine && !local && !deleted && m.kind === 'TEXT' && Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS;
  const link = useMemo(() => (m.body && !deleted && !local ? firstLink(m.body) : null), [m.body, deleted, local]);
  const jumbo = useMemo(() => Boolean(m.body) && !m.attachment && isEmojiOnly(m.body), [m.body, m.attachment]);
  const mentionsMe = Boolean(x.meId && m.body && !mine && (m.body.includes(`(user:${x.meId})`) || /(^|\s)@canal\b/.test(m.body)));
  const busy = Boolean(emojiAt || menuAt);
  const stamp = local ? undefined : fullStamp(m.createdAt);

  const openEmoji = (el: HTMLElement) => setEmojiAt(el.getBoundingClientRect());

  return (
    <div
      id={`m-${m.id}`}
      className={[
        'chat-msg',
        first ? 'is-first' : '',
        x.highlight === m.id ? 'is-highlight' : '',
        x.touched === m.id || busy ? 'is-open' : '',
        mentionsMe ? 'is-mention' : '',
        m.pending ? 'is-sending' : '',
        m.failed ? 'is-failed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={() => x.setTouched(x.touched === m.id ? null : m.id)}
    >
      <div className="chat-msg__gutter">
        {first ? (
          <Avatar id={m.author.id} name={m.author.fullName} online={x.isOnline ? x.isOnline(m.author.id) || undefined : undefined} />
        ) : (
          <time className="chat-msg__hover-time" dateTime={m.createdAt} title={stamp}>
            {clock(new Date(m.createdAt))}
          </time>
        )}
      </div>

      <div className="chat-msg__main">
        {first ? (
          <div className="chat-msg__head">
            <span className="chat-msg__author">{m.author.fullName}</span>
            {m.author.title ? <span className="chat-msg__role">{m.author.title}</span> : null}
            {m.pending ? (
              <span className="chat-msg__time">Enviando…</span>
            ) : (
              <time className="chat-msg__time" dateTime={m.createdAt} title={stamp}>
                {clock(new Date(m.createdAt))}
              </time>
            )}
          </div>
        ) : null}

        {(m.pinnedAt || m.saved) && !deleted ? (
          <div className="chat-msg__flags">
            {m.pinnedAt ? (
              <span className="chat-msg__flag">
                <Icon d={ICONS.pin} size={11} /> Fijado
              </span>
            ) : null}
            {m.saved ? (
              <span className="chat-msg__flag">
                <Icon d={ICONS.bookmark} size={11} /> Guardado
              </span>
            ) : null}
          </div>
        ) : null}

        {m.replyTo && !deleted ? <ReplyQuote r={m.replyTo} onJump={x.jumpTo} /> : null}

        {deleted ? (
          <div className="chat-msg__deleted">Mensaje eliminado</div>
        ) : (
          <>
            {m.attachment ? (
              <div className="chat-msg__att">
                <AttachmentView a={m.attachment} onImage={x.onImage} />
              </div>
            ) : null}
            {isEditing ? (
              <EditBox m={m} x={x} />
            ) : m.body ? (
              <div className={`chat-msg__body${jumbo ? ' is-jumbo' : ''}${m.editedAt ? ' is-edited' : ''}`}>
                <ChatMarkdown text={m.body} meId={x.meId} onMention={x.onMention} />
                {m.editedAt ? (
                  <span className="chat-msg__edited" title={`Editado ${fullStamp(m.editedAt)}`}>
                    {' '}
                    (editado)
                  </span>
                ) : null}
              </div>
            ) : null}
            {link ? <LinkPreviewCard url={link} /> : null}
          </>
        )}

        {m.reactions.length && !deleted ? (
          <div className="chat-reactions">
            {m.reactions.map((r) => {
              const me = x.meId ? r.userIds.includes(x.meId) : false;
              const who = whoReacted(r, x.meId);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  className={`chat-reaction${me ? ' is-mine' : ''}`}
                  data-tip={who}
                  aria-label={who}
                  aria-pressed={me}
                  onClick={(e) => {
                    e.stopPropagation();
                    x.react(m, r.emoji);
                  }}
                >
                  <span className="chat-reaction__emoji">{r.emoji}</span>
                  <span className="chat-reaction__count">{r.count}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="chat-reaction chat-reaction--add"
              aria-label="Agregar reacción"
              data-tip="Agregar reacción"
              onClick={(e) => {
                e.stopPropagation();
                openEmoji(e.currentTarget);
              }}
            >
              <Icon d={ICONS.smile} size={14} />
            </button>
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
            <Icon d={ICONS.thread} size={13} />
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

        {receipt ? (
          <div className="chat-receipt" title={receipt.title || undefined}>
            {receipt.text}
          </div>
        ) : null}
      </div>

      {!local && !isEditing && !deleted ? (
        <div className="chat-actions" role="toolbar" aria-label="Acciones del mensaje" onClick={(e) => e.stopPropagation()}>
          {QUICK_REACTIONS.slice(0, 3).map((e) => (
            <button key={e} type="button" className="chat-actions__emoji" title={`Reaccionar con ${e}`} aria-label={`Reaccionar con ${e}`} onClick={() => x.react(m, e)}>
              {e}
            </button>
          ))}
          <button type="button" aria-label="Agregar reacción" title="Agregar reacción" onClick={(e) => openEmoji(e.currentTarget)}>
            <Icon d={ICONS.smile} size={16} />
          </button>
          <span className="chat-actions__sep" aria-hidden />
          {x.canPost ? (
            <button type="button" aria-label="Responder citando" title="Responder citando" onClick={() => x.reply(m)}>
              <Icon d={ICONS.reply} size={16} />
            </button>
          ) : null}
          {!x.inThread ? (
            <button type="button" aria-label="Responder en hilo" title="Responder en hilo" onClick={() => x.openThread(m)}>
              <Icon d={ICONS.thread} size={16} />
            </button>
          ) : null}
          <button
            type="button"
            className={m.saved ? 'is-on' : undefined}
            aria-label={m.saved ? 'Quitar de guardados' : 'Guardar'}
            title={m.saved ? 'Quitar de guardados' : 'Guardar para después'}
            onClick={() => x.save(m)}
          >
            <Icon d={ICONS.bookmark} size={16} />
          </button>
          <button type="button" aria-label="Más acciones" title="Más" onClick={(e) => setMenuAt(menuAt ? null : e.currentTarget.getBoundingClientRect())}>
            <Icon d={ICONS.more} size={16} />
          </button>
        </div>
      ) : null}

      {emojiAt ? (
        <EmojiPicker
          quick
          anchor={emojiAt}
          onClose={() => setEmojiAt(null)}
          onPick={(e) => {
            setEmojiAt(null);
            x.react(m, e);
          }}
        />
      ) : null}
      {menuAt ? (
        <Menu
          anchor={menuAt}
          onClose={() => setMenuAt(null)}
          items={[
            m.body
              ? {
                  label: 'Copiar texto',
                  icon: ICONS.copy,
                  onSelect: () => {
                    void navigator.clipboard
                      ?.writeText(plainText(m.body))
                      .then(() => x.copied('Texto copiado'))
                      .catch(() => undefined);
                  },
                }
              : null,
            { label: 'Copiar enlace', icon: ICONS.link, onSelect: () => x.copyLink(m) },
            x.canPost && !m.parentId ? { label: m.pinnedAt ? 'Desfijar' : 'Fijar en el canal', icon: ICONS.pin, onSelect: () => x.pin(m) } : null,
            canEdit ? { label: 'Editar', icon: ICONS.edit, hint: '↑', onSelect: () => x.setEditing({ id: m.id, body: plainText(m.body) }) } : null,
            mine || x.canManage ? { label: 'Eliminar', icon: ICONS.trash, danger: true, onSelect: () => x.remove(m) } : null,
          ]}
        />
      ) : null}
    </div>
  );
}

/**
 * Lista tipo Slack: avatar y nombre al inicio de cada racha (mismo autor, ≤5 min),
 * separadores de día, «Mensajes nuevos» antes de `unreadFrom` y «Visto» bajo tu último mensaje.
 */
export function MessageStream({
  list,
  x,
  unreadFrom,
  receipt,
}: {
  list: ChatMessage[];
  x: MessageActions;
  unreadFrom?: string | null;
  receipt?: (last: ChatMessage) => Receipt | null;
}) {
  const blocks = useMemo(() => buildBlocks(list, x.meId, new Date()), [list, x.meId]);
  const lastMineId = useMemo(() => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].author.id === x.meId && !list[i].pending && !list[i].failed) return list[i].id;
    return null;
  }, [list, x.meId]);
  const lastMine = lastMineId ? list.find((m) => m.id === lastMineId) : undefined;
  const r = receipt && lastMine ? receipt(lastMine) : null;
  const dividerRef = useRef<HTMLDivElement>(null);

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
              <ChatInline text={b.message.body} />
            </div>
          );
        }
        return (
          <div key={b.key} className="chat-group">
            {b.items.map((m, i) => (
              <div key={m.id} className="chat-group__row">
                {m.id === unreadFrom ? (
                  <div ref={dividerRef} className="chat-unread" role="separator" data-unread>
                    <span>Mensajes nuevos</span>
                  </div>
                ) : null}
                <MessageItem m={m} x={x} first={i === 0 || m.id === unreadFrom} receipt={m.id === lastMineId ? r : null} />
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
