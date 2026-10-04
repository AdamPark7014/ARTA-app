'use client';

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Icon, ICONS } from './ChatAttachment';
import { hueOf, initials, type ChannelSummary } from './chat-model';

/* Piezas compartidas del chat: avatares con presencia, menús, diálogos y utilidades. */

export const ICON_LOCK = 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3';
export const ICON_EVENT = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4';

export function useNarrow(query = '(max-width: 759px)') {
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

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function errorText(e: unknown, fallback = 'No se pudo completar') {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function isEvent(c: { eventId?: string | null }) {
  return Boolean(c.eventId);
}

/** Directo o directo de grupo: van juntos en «Mensajes directos». */
export function isDirectLike(c: { kind: string; isGroupDm?: boolean | null }) {
  return c.kind === 'DIRECT' || Boolean(c.isGroupDm);
}

export function Avatar({
  id,
  name,
  size = 'md',
  online,
}: {
  id: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** `undefined` = sin punto; `false` = aro gris (desconectado). */
  online?: boolean;
}) {
  const h = hueOf(id);
  const style = {
    '--chat-tint': `hsl(${h} 30% 56% / 0.15)`,
    '--chat-ink': `hsl(${h} 42% 76%)`,
    '--chat-ring': `hsl(${h} 34% 62% / 0.22)`,
  } as CSSProperties;
  return (
    <span className={`chat-avatar chat-avatar--${size}`} style={style} aria-hidden>
      {initials(name)}
      {online === undefined ? null : <span className={`chat-presence${online ? ' is-on' : ''}`} />}
    </span>
  );
}

export function ChannelGlyph({
  c,
  size = 'md',
  online,
}: {
  c: Pick<ChannelSummary, 'id' | 'kind' | 'name' | 'eventId' | 'peer' | 'isGroupDm'>;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
}) {
  if (c.kind === 'DIRECT') return <Avatar id={c.peer?.id ?? c.id} name={c.name} size={size} online={online} />;
  if (c.isGroupDm) {
    const names = c.name.split(',').map((s) => s.trim()).filter(Boolean);
    return (
      <span className={`chat-stack chat-stack--${size}`} aria-hidden>
        <Avatar id={`${c.id}-a`} name={names[0] ?? c.name} size="xs" />
        <Avatar id={`${c.id}-b`} name={names[1] ?? '+'} size="xs" />
      </span>
    );
  }
  return (
    <span className={`chat-avatar chat-avatar--general chat-avatar--${size}`} aria-hidden>
      {isEvent(c) ? <Icon d={ICON_EVENT} size={16} /> : c.kind === 'PRIVATE' ? <Icon d={ICON_LOCK} size={15} /> : '#'}
    </span>
  );
}

/* ── capas (menús, selectores, diálogos): Esc y clic fuera cierran solo la de arriba ── */

const layers: symbol[] = [];

export function useDismiss(ref: RefObject<HTMLElement>, onClose: () => void, enabled = true) {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!enabled) return;
    const id = Symbol('layer');
    layers.push(id);
    const top = () => layers[layers.length - 1] === id;
    const onDown = (e: PointerEvent) => {
      if (!top()) return;
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !top()) return;
      e.preventDefault();
      cb.current();
    };
    // El clic que abrió la capa no debe cerrarla.
    const t = window.setTimeout(() => document.addEventListener('pointerdown', onDown, true));
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      const i = layers.indexOf(id);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [ref, enabled]);
}

/** Posición fija junto al botón que abrió el menú; en móvil el CSS lo vuelve hoja inferior. */
export function floatAt(anchor: DOMRect | null | undefined, w: number, h: number): CSSProperties | undefined {
  if (!anchor || typeof window === 'undefined') return undefined;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = anchor.bottom + 6;
  if (top + h > vh - 8) top = Math.max(8, anchor.top - 6 - h);
  const left = Math.min(Math.max(8, anchor.right - w), Math.max(8, vw - w - 8));
  return { position: 'fixed', top, left };
}

export type MenuItem = {
  label: string;
  icon?: string;
  onSelect: () => void;
  danger?: boolean;
  checked?: boolean;
  hint?: string;
};

export function Menu({
  items,
  anchor,
  onClose,
  title,
}: {
  items: (MenuItem | null | false)[];
  anchor: DOMRect | null;
  onClose: () => void;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  const list = items.filter(Boolean) as MenuItem[];
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, []);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[(i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
    next?.focus();
  };
  return (
    <div
      ref={ref}
      className="chat-menu"
      role="menu"
      style={floatAt(anchor, 232, list.length * 36 + 12 + (title ? 30 : 0))}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
    >
      {title ? <div className="chat-menu__title">{title}</div> : null}
      {list.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className={`chat-menu__item${it.danger ? ' is-danger' : ''}`}
          onClick={() => {
            onClose();
            it.onSelect();
          }}
        >
          {it.icon ? <Icon d={it.icon} size={15} /> : <span className="chat-menu__blank" />}
          <span className="chat-menu__label">{it.label}</span>
          {it.hint ? <span className="chat-menu__hint">{it.hint}</span> : null}
          {it.checked ? <Icon d={ICONS.check} size={14} /> : null}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  label,
  onClose,
  children,
  className,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose);
  return (
    <div className="chat-modal" role="dialog" aria-modal="true" aria-label={label}>
      <div ref={ref} className={`chat-modal__card${className ? ` ${className}` : ''}`}>
        {children}
      </div>
    </div>
  );
}

export function PanelHead({ title, onClose, children }: { title: ReactNode; onClose: () => void; children?: ReactNode }) {
  return (
    <header className="chat-panel__head">
      <strong className="chat-panel__title">{title}</strong>
      {children}
      <button type="button" className="chat-tool" aria-label="Cerrar" title="Cerrar (Esc)" onClick={onClose}>
        <Icon d={ICONS.close} size={18} />
      </button>
    </header>
  );
}

/** «hasta las 18:00» o «hasta mañana 08:00». */
export function untilLabel(iso: string, now = new Date()) {
  const d = new Date(iso);
  const hm = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toDateString() === d.toDateString();
  if (sameDay) return `hasta las ${hm}`;
  if (tomorrow) return `hasta mañana ${hm}`;
  return `hasta el ${d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} ${hm}`;
}
