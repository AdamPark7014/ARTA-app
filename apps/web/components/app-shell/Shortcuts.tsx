'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { navHref, type NavItem } from '@/lib/access-matrix';

/** `g` + letra: las pantallas que más se usan. Solo las que esta persona tiene en su menú. */
const GO_TO: Array<{ key: string; href: string; label: string }> = [
  { key: 'i', href: '/dashboard', label: 'Inicio' },
  { key: 'e', href: '/events', label: 'Eventos' },
  { key: 'k', href: '/calendar', label: 'Calendario' },
  { key: 't', href: '/tasks', label: 'Tareas' },
  { key: 'c', href: '/chat', label: 'Chat' },
  { key: 'o', href: '/purchase-orders', label: 'Órdenes de compra' },
  { key: 'a', href: '/notifications', label: 'Avisos' },
];

const CHORD_MS = 1200;

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * Atajos del teclado en todo el panel: `?` los enseña y `g` + letra lleva a una pantalla.
 * Nunca estorban al escribir: dentro de un campo no hacen nada.
 */
export function Shortcuts({ items }: { items: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const chord = useRef(0);
  const reachable = useMemo(() => {
    const hrefs = new Set(items.map((i) => navHref(i).split('?')[0]));
    return GO_TO.filter((g) => g.href === '/notifications' || hrefs.has(g.href));
  }, [items]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      const key = e.key.toLowerCase();
      if (Date.now() - chord.current < CHORD_MS) {
        chord.current = 0;
        const target = reachable.find((g) => g.key === key);
        if (target) {
          e.preventDefault();
          setOpen(false);
          router.push(target.href);
        }
        return;
      }
      if (key === 'g') chord.current = Date.now();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [reachable, router]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <div
        className="modal panel shortcuts"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-head">
          <h2 id="shortcuts-title">Atajos del teclado</h2>
          <button className="btn ghost btn-sm" type="button" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </div>
        <dl className="shortcuts__list">
          <div>
            <dt>
              <kbd>Ctrl</kbd> <kbd>K</kbd>
            </dt>
            <dd>Buscar en todo el panel</dd>
          </div>
          {reachable.map((g) => (
            <div key={g.key}>
              <dt>
                <kbd>g</kbd> <kbd>{g.key}</kbd>
              </dt>
              <dd>{g.label}</dd>
            </div>
          ))}
          <div>
            <dt>
              <kbd>?</kbd>
            </dt>
            <dd>Ver esta lista</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
