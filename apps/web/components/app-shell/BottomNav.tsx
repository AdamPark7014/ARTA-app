'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/access-matrix';
import { navHref } from '@/lib/access-matrix';

/** Los destinos de la barra, en orden. Solo salen los que esta persona puede ver. */
const TABS: Array<{ href: string; label: string }> = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/events', label: 'Eventos' },
  { href: '/tasks', label: 'Tareas' },
  { href: '/chat', label: 'Chat' },
];

/**
 * Barra inferior del panel en teléfono (diseño por módulo, 21-11-2026): los
 * destinos de siempre a un toque y «Más» abre el menú completo. En modo app la
 * barra la pone la app nativa, así que aquí no se pinta (`_acabado.scss`).
 */
export function BottomNav({
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
  const tabs = TABS.flatMap((t) => {
    const item = items.find((i) => i.href === t.href && !i.hidden);
    return item ? [{ ...t, to: navHref(item) }] : [];
  });
  if (tabs.length < 2) return null;
  const active = tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href;
  return (
    <nav className="bnav" aria-label="Navegación principal">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.to}
          className={`bnav__tab ${active === t.href && !moreOpen ? 'is-on' : ''}`}
          aria-current={active === t.href ? 'page' : undefined}
          aria-label={t.href === '/chat' && chatUnread > 0 ? `${t.label}, ${chatUnread} sin leer` : undefined}
        >
          <span className="bnav__mark" aria-hidden />
          <span className="bnav__label">{t.label}</span>
          {t.href === '/chat' && chatUnread > 0 ? <span className="bnav__dot" aria-hidden /> : null}
        </Link>
      ))}
      <button
        type="button"
        className={`bnav__tab ${moreOpen || !active ? 'is-on' : ''}`}
        aria-expanded={moreOpen}
        aria-controls="app-sidebar"
        onClick={onMore}
      >
        <span className="bnav__mark" aria-hidden />
        <span className="bnav__label">Más</span>
      </button>
    </nav>
  );
}
