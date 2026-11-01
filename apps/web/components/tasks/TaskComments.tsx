'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '@/lib/api';
import { encodeMentions, fold, type Colleague } from '@/components/chat/chat-model';
import type { TaskRecord } from './task-types';

const MENTION_QUERY = /(^|[\s([{])@([\p{L}\p{N}._-]{0,30}(?: [\p{L}\p{N}._-]{0,30})?)$/u;

/** Comentar una tarea: `@` arroba a alguien del equipo y le llega el aviso. */
export function TaskComments({ task, onUpdated }: { task: TaskRecord; onUpdated: (task: TaskRecord) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [people, setPeople] = useState<Colleague[]>([]);
  const [active, setActive] = useState(0);
  const picked = useRef(new Map<string, Colleague>());
  const ref = useRef<HTMLTextAreaElement>(null);
  const query = mention?.query ?? null;

  useEffect(() => {
    if (query === null) return;
    const id = window.setTimeout(() => {
      api<Colleague[]>(`/chat/colleagues${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
        .then(setPeople)
        .catch(() => setPeople([]));
    }, 180);
    return () => window.clearTimeout(id);
  }, [query]);

  const candidates = useMemo(() => {
    if (query === null) return [];
    const q = fold(query.trim());
    return people.filter((p) => !q || fold(p.fullName).includes(q)).slice(0, 6);
  }, [people, query]);

  const detect = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart;
    const m = caret === el.selectionEnd ? MENTION_QUERY.exec(el.value.slice(0, caret)) : null;
    if (!m) {
      setMention(null);
      return;
    }
    setActive(0);
    setMention({ start: caret - m[2].length - 1, query: m[2] });
  };

  const pick = (p: Colleague) => {
    const el = ref.current;
    if (!el || !mention) return;
    picked.current.set(p.id, p);
    const insert = `@${p.fullName.trim()} `;
    const pos = mention.start + insert.length;
    setText(text.slice(0, mention.start) + insert + text.slice(el.selectionStart));
    setMention(null);
    window.requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<TaskRecord>(`/tasks/${task.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: encodeMentions(body, [...picked.current.values()]) }),
      });
      setText('');
      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo comentar');
    } finally {
      setBusy(false);
    }
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
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(candidates[Math.min(active, candidates.length - 1)]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="task-comment">
      {mention && candidates.length ? (
        <div className="chat-mentions" role="listbox" aria-label="Mencionar">
          {candidates.map((p, i) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`chat-mentions__row${i === active ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
            >
              <span className="chat-mentions__name">{p.fullName}</span>
              {p.title ? <span className="chat-mentions__meta">{p.title}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        ref={ref}
        rows={2}
        value={text}
        maxLength={2000}
        placeholder="Escribe un comentario. Con @ avisas a alguien."
        aria-label="Comentario"
        onChange={(e) => {
          setText(e.target.value);
          detect(e.target);
        }}
        onSelect={(e) => detect(e.currentTarget)}
        onBlur={() => window.setTimeout(() => setMention(null), 120)}
        onKeyDown={onKeyDown}
      />
      <div className="task-comment__bar">
        {error ? <span className="task-comment__error">{error}</span> : <span />}
        <button type="button" className="btn btn-sm" disabled={!text.trim() || busy} onClick={() => void send()}>
          {busy ? 'Enviando…' : 'Comentar'}
        </button>
      </div>
    </div>
  );
}
