'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { NavItem } from '@/lib/access-matrix';

/**
 * Botón «+» de la barra (dirección Mosaico): crear lo de todos los días desde
 * cualquier pantalla. Solo ofrece lo que esta persona puede crear.
 */
export function QuickCreate({ items, eventLabel }: { items: NavItem[]; eventLabel: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const options = [
    items.some((i) => i.href === '/tasks') ? { href: '/tasks?nueva=1', label: 'Nueva tarea', hint: 'Para ti o para alguien del equipo', keys: 'n' } : null,
    items.some((i) => i.href === '/events/new') ? { href: '/events/new', label: eventLabel, hint: 'Con sus formatos y fechas', keys: '' } : null,
  ].filter(<T,>(x: T | null): x is T => x !== null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  if (!options.length) return null;
  return (
    <div className="qc" ref={ref}>
      <button
        type="button"
        className="qc__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Crear"
        title="Crear"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="qc__menu" role="menu" aria-label="Crear">
          {options.map((o) => (
            <Link key={o.href} href={o.href} role="menuitem" className="qc__item" onClick={() => setOpen(false)}>
              <span className="qc__label">
                {o.label}
                {o.keys ? <kbd aria-hidden>{o.keys}</kbd> : null}
              </span>
              <small>{o.hint}</small>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
