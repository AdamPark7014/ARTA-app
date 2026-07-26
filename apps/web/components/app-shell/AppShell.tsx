'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@/lib/user-context';
import { EntityKey } from '@/lib/api';
import { canSeeNavItem, NAV_ITEMS, ROLE_SCOPE } from '@/lib/access-matrix';
import { createSecureHandoffUrl } from '@/lib/cross-entity-handoff';

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const { user, loading, entity, setEntity, logout } = useUser();
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname, entity]);

  const nav = useMemo(() => {
    if (!user) return [];
    return NAV_ITEMS.filter((item) => canSeeNavItem(user, item, entity));
  }, [user, entity]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof nav>();
    for (const item of nav) {
      const g = item.group || 'General';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(item);
    }
    return Array.from(map.entries());
  }, [nav]);

  async function switchEntity(next: EntityKey) {
    if (!user || next === entity) return;
    if (!user.entities.includes(next)) return;

    const secure = await createSecureHandoffUrl(next, '/dashboard');
    if (secure && secure.startsWith('http')) {
      window.location.href = secure;
      return;
    }

    // Same-host / local: no cross-subdomain handoff needed
    setEntity(next);
  }

  if (loading || !user) {
    return (
      <div className="shell shell--loading" aria-busy="true" aria-label="Cargando ARTA">
        <aside className="sidebar">
          <div className="brand">
            <div className="skeleton skeleton--value" style={{ width: 110, height: 36 }} />
            <span>
              <div className="skeleton skeleton--label" style={{ width: 90, marginTop: 8 }} />
            </span>
          </div>
          <div className="entity-switch" aria-hidden>
            <div className="skeleton skeleton--row" style={{ height: 28, borderRadius: 999 }} />
            <div className="skeleton skeleton--row" style={{ height: 28, borderRadius: 999 }} />
          </div>
          <nav className="nav" aria-hidden>
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="skeleton skeleton--row"
                style={{ height: 36, width: `${78 - (i % 3) * 8}%`, marginBottom: 6 }}
              />
            ))}
          </nav>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="topbar-left">
              <div className="skeleton skeleton--value" style={{ width: 160, height: 22 }} />
            </div>
          </header>
          <div className="content" style={{ padding: '1.25rem 1.5rem' }}>
            <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
              Cargando ARTA…
            </p>
            <div className="skeleton-stack">
              <div className="skeleton skeleton--row" style={{ width: '70%' }} />
              <div className="skeleton skeleton--row" style={{ width: '92%' }} />
              <div className="skeleton skeleton--row" style={{ width: '55%' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const can = (e: EntityKey) => user.entities.includes(e);
  const brandSub = entity === 'ARTA' ? 'PRODUCCIONES' : 'AUDITORIO AREMA';

  return (
    <div className={`shell ${navOpen ? 'shell--nav-open' : ''}`} data-entity={entity}>
      {navOpen ? (
        <button
          type="button"
          className="shell-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setNavOpen(false)}
        />
      ) : null}

      <aside className="sidebar" id="app-sidebar">
        <div className="brand">
          {entity === 'ARTA' ? (
            <Image
              src="/brand/arta-logo.png"
              alt="arta"
              width={118}
              height={48}
              className="shell-logo"
              priority
            />
          ) : (
            <>explanada</>
          )}
          <span>{brandSub}</span>
        </div>

        <div className="entity-switch" role="tablist" aria-label="Entidad">
          <button
            type="button"
            role="tab"
            aria-selected={entity === 'ARTA'}
            className={entity === 'ARTA' ? 'active' : ''}
            disabled={!can('ARTA')}
            onClick={() => switchEntity('ARTA')}
          >
            Arta
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={entity === 'EXPLANADA'}
            className={entity === 'EXPLANADA' ? 'active' : ''}
            disabled={!can('EXPLANADA')}
            onClick={() => switchEntity('EXPLANADA')}
          >
            Auditorio
          </button>
        </div>

        <p className="entity-hint">
          {can('ARTA') && can('EXPLANADA')
            ? 'Puedes operar ambas entidades'
            : `Tu acceso: ${user.entities.map((e) => (e === 'ARTA' ? 'Arta' : 'Auditorio')).join(' · ')}`}
        </p>

        <nav className="nav">
          {groups.map(([group, items]) => (
            <div key={group} className="nav-group">
              <div className="nav-group-label">{group}</div>
              {items.map((n) => {
                const active =
                  pathname === n.href ||
                  (n.href !== '/dashboard' && pathname.startsWith(n.href));
                return (
                  <Link key={n.href} href={n.href} className={active ? 'active' : ''}>
                    {n.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <strong>{user.fullName}</strong>
          <div>{user.title || user.roleKey}</div>
          <div className="scope-hint">{ROLE_SCOPE[user.roleKey] || ''}</div>
          <button type="button" className="btn ghost" style={{ marginTop: 12, width: '100%' }} onClick={logout}>
            Salir
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={navOpen}
              aria-controls="app-sidebar"
              onClick={() => setNavOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
              <span className="sr-only">Menú</span>
            </button>
            <div>
              <h1>{title || 'Panel'}</h1>
              <div className="topbar-sub">
                {entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema · Explanada'}
              </div>
            </div>
          </div>
          <span className={`badge ${entity === 'ARTA' ? 'arta' : 'explanada'}`}>
            {entity === 'ARTA' ? 'ARTA' : 'AUDITORIO'}
          </span>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
