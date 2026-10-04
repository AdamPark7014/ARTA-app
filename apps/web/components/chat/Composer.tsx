'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { Icon, ICONS } from './ChatAttachment';
import { attachmentLabel, fold, MAX_LEN, plainText, type ChatMessage } from './chat-model';
import { Avatar } from './chat-ui';
import { EmojiPicker } from './EmojiPicker';

export type MentionPerson = { id: string; fullName: string; title?: string | null };

type Candidate = { kind: 'person'; p: MentionPerson } | { kind: 'channel' };

const MENTION_QUERY = /(^|[\s([{])@([\p{L}\p{N}._-]{0,30}(?: [\p{L}\p{N}._-]{0,30})?)$/u;

/**
 * Redactor del chat: Enter envía, Shift+Enter salto de línea, @ menciona
 * (↑ ↓ Enter/Tab, Esc cierra), Ctrl/Cmd+B/I negrita y cursiva, ↑ con el campo
 * vacío edita tu último mensaje. En pantalla se ve `@Nombre`; quien envía
 * lo convierte al token `[@Nombre](user:id)`.
 */
export function Composer({
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
  replyTo,
  onCancelReply,
  people,
  searchPeople,
  canMentionChannel,
  isOnline,
  onPicked,
  onEditLast,
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
  inputRef?: RefObject<HTMLTextAreaElement>;
  compact?: boolean;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  people: MentionPerson[];
  searchPeople?: (q: string) => Promise<MentionPerson[]>;
  canMentionChannel?: boolean;
  isOnline?: (id: string) => boolean;
  onPicked?: (p: MentionPerson) => void;
  onEditLast?: () => void;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? localRef;
  const emojiBtn = useRef<HTMLButtonElement>(null);
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<MentionPerson[]>([]);
  const [emojiAt, setEmojiAt] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref]);

  // Sin lista de miembros (canal grande o API viejo): se busca en el directorio.
  const query = mention?.query ?? null;
  useEffect(() => {
    if (query === null || people.length || !searchPeople) return;
    const id = window.setTimeout(() => {
      searchPeople(query)
        .then(setRemote)
        .catch(() => setRemote([]));
    }, 180);
    return () => window.clearTimeout(id);
  }, [query, people.length, searchPeople]);

  const candidates = useMemo<Candidate[]>(() => {
    if (query === null) return [];
    const q = fold(query.trim());
    const pool = people.length ? people : remote;
    const scored = pool
      .map((p) => {
        const name = fold(p.fullName);
        const rank = !q ? 1 : name.startsWith(q) ? 0 : name.split(/\s+/).some((w) => w.startsWith(q)) ? 1 : name.includes(q) ? 2 : -1;
        return { p, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.p.fullName.localeCompare(b.p.fullName, 'es'))
      .slice(0, 8)
      .map<Candidate>((x) => ({ kind: 'person', p: x.p }));
    if (canMentionChannel && 'canal'.startsWith(q)) scored.push({ kind: 'channel' });
    return scored;
  }, [query, people, remote, canMentionChannel]);

  if (disabled) {
    return (
      <div className={`chat-composer${compact ? ' chat-composer--compact' : ''}`}>
        <p className="chat-composer__locked">{disabledText}</p>
      </div>
    );
  }

  const detect = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart;
    if (caret !== el.selectionEnd) {
      setMention(null);
      return;
    }
    const m = MENTION_QUERY.exec(el.value.slice(0, caret));
    if (!m) {
      setMention(null);
      return;
    }
    const q = m[2];
    setMention((cur) => {
      if (cur?.query !== q) setActive(0);
      return { start: caret - q.length - 1, query: q };
    });
  };

  const placeCaret = (pos: number) => {
    window.requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const insertMention = (c: Candidate) => {
    const el = ref.current;
    if (!el || !mention) return;
    const text = c.kind === 'channel' ? '@canal ' : `@${c.p.fullName.trim()} `;
    const end = el.selectionStart;
    onChange((value.slice(0, mention.start) + text + value.slice(end)).slice(0, MAX_LEN));
    if (c.kind === 'person') onPicked?.(c.p);
    setMention(null);
    placeCaret(mention.start + text.length);
  };

  const insertText = (t: string) => {
    const el = ref.current;
    const s = el?.selectionStart ?? value.length;
    const e = el?.selectionEnd ?? value.length;
    onChange((value.slice(0, s) + t + value.slice(e)).slice(0, MAX_LEN));
    placeCaret(s + t.length);
  };

  const wrap = (mark: string) => {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    onChange((value.slice(0, s) + mark + value.slice(s, e) + mark + value.slice(e)).slice(0, MAX_LEN));
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + mark.length, e + mark.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (mention && candidates.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setActive((a) => (a + d + candidates.length) % candidates.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        insertMention(candidates[Math.min(active, candidates.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Escape' && replyTo && onCancelReply) {
      e.preventDefault();
      onCancelReply();
      return;
    }
    if (e.key === 'ArrowUp' && !value && onEditLast) {
      e.preventDefault();
      onEditLast();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' && !e.shiftKey) {
        e.preventDefault();
        wrap('*');
        return;
      }
      if (k === 'i' && !e.shiftKey) {
        e.preventDefault();
        wrap('_');
        return;
      }
      if (k === 'x' && e.shiftKey) {
        e.preventDefault();
        wrap('~');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const canSend = value.trim().length > 0;
  const near = value.length > MAX_LEN - 500;
  const replyText = replyTo
    ? replyTo.body
      ? plainText(replyTo.body).replace(/\s+/g, ' ').slice(0, 140)
      : replyTo.attachment
        ? attachmentLabel(replyTo.attachment)
        : 'Mensaje eliminado'
    : '';

  return (
    <form
      className={`chat-composer${compact ? ' chat-composer--compact' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <div className="chat-composer__box">
        {replyTo ? (
          <div className="chat-replybar">
            <Icon d={ICONS.reply} size={15} />
            <span className="chat-replybar__copy">
              Respondiendo a <strong>{replyTo.author.fullName}</strong>
              <span className="chat-replybar__text">{replyText}</span>
            </span>
            <button type="button" className="chat-tool chat-tool--sm" aria-label="Cancelar respuesta" title="Cancelar (Esc)" onClick={onCancelReply}>
              <Icon d={ICONS.close} size={15} />
            </button>
          </div>
        ) : null}

        {mention && candidates.length ? (
          <div className="chat-mentions" role="listbox" aria-label="Mencionar">
            <div className="chat-mentions__title">Mencionar</div>
            {candidates.map((c, i) => (
              <button
                key={c.kind === 'person' ? c.p.id : '@canal'}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`chat-mentions__row${i === active ? ' is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertMention(c)}
              >
                {c.kind === 'person' ? (
                  <>
                    <Avatar id={c.p.id} name={c.p.fullName} size="sm" online={isOnline ? isOnline(c.p.id) : undefined} />
                    <span className="chat-mentions__name">{c.p.fullName}</span>
                    {c.p.title ? <span className="chat-mentions__meta">{c.p.title}</span> : null}
                  </>
                ) : (
                  <>
                    <span className="chat-avatar chat-avatar--general chat-avatar--sm">@</span>
                    <span className="chat-mentions__name">@canal</span>
                    <span className="chat-mentions__meta">Avisa a todo el canal</span>
                  </>
                )}
              </button>
            ))}
          </div>
        ) : null}

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
              aria-autocomplete="list"
              onChange={(e) => {
                onChange(e.target.value);
                detect(e.target);
              }}
              onSelect={(e) => detect(e.currentTarget)}
              onBlur={() => window.setTimeout(() => setMention(null), 120)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
            />
            <button
              ref={emojiBtn}
              type="button"
              className={`chat-tool chat-tool--inset${emojiAt ? ' is-on' : ''}`}
              aria-label="Emoji"
              title="Emoji"
              onClick={() => setEmojiAt(emojiAt ? null : (emojiBtn.current?.getBoundingClientRect() ?? null))}
            >
              <Icon d={ICONS.smile} size={18} />
            </button>
          </div>
          {!canSend && onMic ? (
            <button type="button" className="chat-send chat-send--mic" aria-label="Grabar nota de voz" title="Nota de voz" onClick={onMic}>
              <Icon d={ICONS.mic} size={18} />
            </button>
          ) : (
            <button type="submit" className="chat-send" disabled={!canSend} aria-label="Enviar" title="Enviar (Enter)">
              <Icon d={ICONS.send} size={18} />
            </button>
          )}
        </div>
        {near ? (
          <div className={`chat-composer__count${value.length >= MAX_LEN ? ' is-over' : ''}`} aria-live="polite">
            {value.length.toLocaleString('es-MX')} / {MAX_LEN.toLocaleString('es-MX')}
          </div>
        ) : null}
      </div>
      {emojiAt ? (
        <EmojiPicker
          anchor={emojiAt}
          onClose={() => setEmojiAt(null)}
          onPick={(e) => {
            setEmojiAt(null);
            insertText(e);
          }}
        />
      ) : null}
    </form>
  );
}
