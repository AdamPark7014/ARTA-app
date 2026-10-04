'use client';

import { useMemo, useRef, useState } from 'react';
import { QUICK_REACTIONS } from './chat-model';
import { floatAt, useDismiss } from './chat-ui';
import { EMOJI_CATEGORIES, recentEmojis, rememberEmoji, searchEmoji, type EmojiCategory } from './emoji-data';

const W = 340;
const H = 380;

/**
 * Selector de emojis local (sin CDN). Con `quick` muestra arriba las 8
 * reacciones rápidas del contrato, en el mismo orden que en las apps.
 */
export function EmojiPicker({
  onPick,
  onClose,
  anchor,
  quick,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  anchor?: DOMRect | null;
  quick?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const [q, setQ] = useState('');
  const sections = useMemo<EmojiCategory[]>(() => {
    const recent = recentEmojis();
    return recent.length ? [{ id: 'recientes', label: 'Recientes', icon: '🕘', emojis: recent }, ...EMOJI_CATEGORIES] : EMOJI_CATEGORIES;
  }, []);
  const [cat, setCat] = useState(sections[0].id);
  const results = q.trim() ? searchEmoji(q) : null;

  const pick = (e: string) => {
    rememberEmoji(e);
    onPick(e);
  };

  const jump = (id: string) => {
    setCat(id);
    const box = scrollRef.current;
    const target = box?.querySelector<HTMLElement>(`[data-cat="${id}"]`);
    if (box && target) box.scrollTop = target.offsetTop - box.offsetTop;
  };

  const spy = () => {
    const box = scrollRef.current;
    if (!box) return;
    let current = sections[0].id;
    box.querySelectorAll<HTMLElement>('[data-cat]').forEach((el) => {
      if (el.offsetTop - box.offsetTop <= box.scrollTop + 8) current = el.dataset.cat ?? current;
    });
    if (current !== cat) setCat(current);
  };

  const cell = (e: string, i: number) => (
    <button key={`${e}-${i}`} type="button" className="chat-emoji__cell" onClick={() => pick(e)} aria-label={e}>
      {e}
    </button>
  );

  return (
    <div
      ref={ref}
      className="chat-emoji"
      role="dialog"
      aria-label="Emojis"
      style={floatAt(anchor, W, H + (quick ? 48 : 0))}
      onClick={(e) => e.stopPropagation()}
    >
      {quick ? (
        <div className="chat-emoji__quick" aria-label="Reacciones rápidas">
          {QUICK_REACTIONS.map((e) => (
            <button key={e} type="button" className="chat-emoji__cell" onClick={() => pick(e)} aria-label={`Reaccionar ${e}`}>
              {e}
            </button>
          ))}
        </div>
      ) : null}
      <div className="chat-emoji__search">
        <input
          autoFocus
          type="text"
          placeholder="Buscar emoji (fiesta, gracias, fuego…)"
          aria-label="Buscar emoji"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // El picker vive dentro del <form> del composer: Enter nunca debe enviar.
              e.preventDefault();
              if (results?.length) pick(results[0]);
            }
          }}
        />
      </div>
      {results ? (
        <div className="chat-emoji__scroll">
          {results.length ? <div className="chat-emoji__grid">{results.map(cell)}</div> : <p className="chat-emoji__none">Sin resultados</p>}
        </div>
      ) : (
        <>
          <div className="chat-emoji__tabs" role="tablist" aria-label="Categorías">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={cat === s.id}
                className={`chat-emoji__tab${cat === s.id ? ' is-on' : ''}`}
                title={s.label}
                aria-label={s.label}
                onClick={() => jump(s.id)}
              >
                {s.icon}
              </button>
            ))}
          </div>
          <div className="chat-emoji__scroll" ref={scrollRef} onScroll={spy}>
            {sections.map((s) => (
              <section key={s.id} data-cat={s.id}>
                <h4 className="chat-emoji__label">{s.label}</h4>
                <div className="chat-emoji__grid">{s.emojis.map(cell)}</div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
