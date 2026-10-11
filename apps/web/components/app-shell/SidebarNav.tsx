'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  activeNavKey,
  navHref,
  navItemMatches,
  navKey,
  type NavItem,
} from '@/lib/access-matrix';
import { NavIcon } from './NavIcon';
import { useChatUnread } from './useChatUnread';

type Props = {
  /** Items ya filtrados por rol / permisos / entidad */
  items: NavItem[];
  query: string;
};

/**
 * Menú del sidebar.
 *
 * Junta 2026-08-28: el menú por defecto solo lleva Dashboard, las cuatro
 * entradas de eventos, órdenes de compra y la administración. Las vistas de
 * portafolio quedan marcadas `hidden` — el menú deja de desglosar cada check —
 * pero se abren en un clic desde «Más herramientas», sin tener que adivinar un
 * término en el buscador.
 *
 * Vive en su propio componente porque `useSearchParams` obliga a un límite de
 * Suspense; encerrarlo aquí evita volver dinámicas todas las páginas del panel.
 */
export function SidebarNav({ items, query }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searching = !!query.trim();
  const [showMore, setShowMore] = useState(false);
  const chatUnread = useChatUnread(items.some((item) => item.href === '/chat') && pathname !== '/chat');

  const hiddenItems = useMemo(() => items.filter((item) => item.hidden), [items]);

  const groups = useMemo(() => {
    const visible = searching
      ? items.filter((item) => navItemMatches(item, query))
      : items.filter((item) => !item.hidden || showMore);

    const map = new Map<string, NavItem[]>();
    for (const item of visible) {
      const g = item.group || 'General';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return Array.from(map.entries());
  }, [items, query, searching, showMore]);

  const activeKey = useMemo(
    () => activeNavKey(items, pathname, searchParams),
    [items, pathname, searchParams],
  );

  // Con el menú largo (Admin abajo), el ítem activo puede quedar fuera de la vista.
  const navRef = useRef<HTMLElement>(null);
  // Solo se desplaza el menú (nunca la página, ni el cajón escondido del teléfono).
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('a.active');
    if (!nav || !el) return;
    const box = nav.getBoundingClientRect();
    const item = el.getBoundingClientRect();
    if (item.bottom > box.bottom - 16) nav.scrollTop += item.bottom - box.bottom + 24;
    else if (item.top < box.top) nav.scrollTop -= box.top - item.top + 8;
  }, [activeKey]);

  if (!groups.length) {
    return (
      <nav className="nav" aria-label="Módulos del panel">
        <p className="nav-empty muted">Sin resultados para “{query}”</p>
      </nav>
    );
  }

  return (
    <nav className="nav" aria-label="Módulos del panel" ref={navRef}>
      {groups.map(([group, groupItems]) => (
        <div key={group} className="nav-group">
          <div className="nav-group-label">{group}</div>
          {groupItems.map((item) => {
            const key = navKey(item);
            const badge = item.href === '/chat' && chatUnread > 0 ? chatUnread : 0;
            return (
              <Link
                key={key}
                href={navHref(item)}
                className={key === activeKey ? 'active' : ''}
                aria-label={badge ? `${item.label}, ${badge} sin leer` : undefined}
              >
                <NavIcon href={item.href} />
                <span>{item.label}</span>
                {badge ? <span className="nav-badge">{badge > 99 ? '99+' : badge}</span> : null}
              </Link>
            );
          })}
        </div>
      ))}

      {!searching && hiddenItems.length ? (
        <button
          type="button"
          className="nav-more"
          aria-expanded={showMore}
          onClick={() => setShowMore((v) => !v)}
        >
          <span aria-hidden>{showMore ? '−' : '+'}</span>
          {showMore ? 'Ocultar vistas de portafolio' : `Más herramientas (${hiddenItems.length})`}
        </button>
      ) : null}
    </nav>
  );
}
