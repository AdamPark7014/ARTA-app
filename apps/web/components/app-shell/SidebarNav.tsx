'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import {
  activeNavKey,
  navHref,
  navItemMatches,
  navKey,
  type NavItem,
} from '@/lib/access-matrix';
import { NavIcon } from './NavIcon';

type Props = {
  /** Items ya filtrados por rol / permisos / entidad */
  items: NavItem[];
  query: string;
};

/**
 * Menú del sidebar.
 *
 * Junta 2026-08-28: el menú por defecto solo lleva Dashboard, las cuatro
 * entradas de eventos y la administración. Las vistas de portafolio quedan
 * marcadas `hidden` y aparecen únicamente cuando se busca — así el menú deja de
 * desglosar cada check sin que ninguna herramienta se vuelva inalcanzable.
 *
 * Vive en su propio componente porque `useSearchParams` obliga a un límite de
 * Suspense; encerrarlo aquí evita volver dinámicas todas las páginas del panel.
 */
export function SidebarNav({ items, query }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searching = !!query.trim();

  const groups = useMemo(() => {
    const visible = searching
      ? items.filter((item) => navItemMatches(item, query))
      : items.filter((item) => !item.hidden);

    const map = new Map<string, NavItem[]>();
    for (const item of visible) {
      const g = item.group || 'General';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return Array.from(map.entries());
  }, [items, query, searching]);

  const activeKey = useMemo(
    () => activeNavKey(items, pathname, searchParams),
    [items, pathname, searchParams],
  );

  if (!groups.length) {
    return (
      <nav className="nav" aria-label="Módulos del panel">
        <p className="nav-empty muted">Sin resultados para “{query}”</p>
      </nav>
    );
  }

  return (
    <nav className="nav" aria-label="Módulos del panel">
      {groups.map(([group, groupItems]) => (
        <div key={group} className="nav-group">
          <div className="nav-group-label">{group}</div>
          {groupItems.map((item) => {
            const key = navKey(item);
            return (
              <Link
                key={key}
                href={navHref(item)}
                className={key === activeKey ? 'active' : ''}
              >
                <NavIcon href={item.href} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
      {!searching ? (
        <p className="nav-hint muted">
          Las herramientas de cada show (checklists, campaña, boletera, corrida,
          hospitality, prensa, convenios…) viven dentro del evento. Busca arriba
          para abrir una vista de portafolio.
        </p>
      ) : null}
    </nav>
  );
}
