'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { activeNavKey, navHref, navKey, type NavItem } from '@/lib/access-matrix';

/** Los destinos de la barra, en orden de uso. Solo salen los que esta persona puede ver. */
/** `keys`: el atajo de teclado (g y la letra), para decirlo al pasar el cursor. */
const PILLS: Array<{ href: string; query?: string; label: string; keys?: string }> = [
  { href: '/dashboard', label: 'Inicio', keys: 'i' },
  { href: '/events', query: 'scope=active', label: 'Eventos', keys: 'e' },
  { href: '/calendar', label: 'Calendario', keys: 'k' },
  { href: '/tasks', label: 'Tareas', keys: 't' },
  { href: '/chat', label: 'Chat', keys: 'c' },
  { href: '/purchase-orders', label: 'Órdenes', keys: 'o' },
  { href: '/finanzas', label: 'Finanzas' },
  { href: '/ticketing', label: 'Boletera' },
];

/**
 * Navegación en píldora (dirección Mosaico, 21-11-2026): los módulos de todos los
 * días a un clic en la barra de arriba y «Más» abre el menú completo, con la
 * entidad y el resto de las herramientas. En teléfono manda la barra inferior.
 */
export function TopNav({
  items,
  onMore,
  moreOpen,
  chatUnread = 0,
}: {
  items: NavItem[];
  onMore: () => void;
  moreOpen: boolean;
  chatUnread?: number;
}) {
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();

  const pills = useMemo(
    () =>
      PILLS.flatMap((p) => {
        const item = items.find((i) => i.href === p.href && (p.query ? i.query === p.query : true) && !i.hidden);
        return item ? [{ label: p.label, full: item.label, key: navKey(item), to: navHref(item), keys: p.keys }] : [];
      }),
    [items],
  );
  const activeKey = useMemo(() => activeNavKey(items, pathname, searchParams), [items, pathname, searchParams]);
  const inPills = pills.some((p) => p.key === activeKey);
  // Dentro de un evento (o en eventos pasados) la píldora de Eventos sigue encendida.
  const eventsKey = pills.find((p) => p.label === 'Eventos')?.key;
  const onKey = inPills ? activeKey : pathname.startsWith('/events') && pathname !== '/events/new' ? eventsKey : '';

  return (
    <nav className="pnav" aria-label="Navegación rápida">
      {pills.map((p, i) => {
        const badge = p.label === 'Chat' && chatUnread > 0 ? chatUnread : 0;
        return (
          <Link
            key={p.key}
            href={p.to}
            data-rank={i + 1}
            className={`pnav__pill ${p.key === onKey && !moreOpen ? 'is-on' : ''}`}
            aria-current={p.key === onKey ? 'page' : undefined}
            title={p.keys ? `${p.full} · atajo: g y luego ${p.keys}` : undefined}
            aria-label={badge ? `${p.label}, ${badge} sin leer` : p.label === p.full ? undefined : p.full}
          >
            {p.label}
            {badge ? <span className="pnav__badge">{badge > 99 ? '99+' : badge}</span> : null}
          </Link>
        );
      })}
      <button
        type="button"
        className={`pnav__pill pnav__more ${moreOpen || !onKey ? 'is-on' : ''}`}
        aria-expanded={moreOpen}
        aria-controls="app-sidebar"
        onClick={onMore}
      >
        Más
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </nav>
  );
}
