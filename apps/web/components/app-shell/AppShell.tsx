'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useUser } from '@/lib/user-context';
import { EntityKey, getToken } from '@/lib/api';
import { canSeeNavItem, NAV_ITEMS, ROLE_SCOPE } from '@/lib/access-matrix';
import { buildCrossEntityUrl } from '@/lib/cross-entity-handoff';

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

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

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

  function switchEntity(next: EntityKey) {
    if (!user || next === entity) return;
    if (!user.entities.includes(next)) return;

    const token = getToken();
    const url = token
      ? buildCrossEntityUrl(next, '/dashboard', {
          accessToken: token,
          user,
          entity: next,
        })
      : null;

    if (url && url.startsWith('http')) {
      window.location.href = url;
      return;
    }

    setEntity(next);
  }

  if (loading || !user) {
    return (
      <div className="login-wrap">
        <p className="muted">Cargando ARTA…</p>
      </div>
    );
  }

  const can = (e: EntityKey) => user.entities.includes(e);
  const brandSub = entity === 'ARTA' ? 'PRODUCCIONES' : 'AUDITORIO AREMA';

  return (
    <div className="shell" data-entity={entity}>
      <aside className="sidebar">
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
          <div>
            <h1>{title || 'Panel'}</h1>
            <div className="topbar-sub">
              {entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema · Explanada'}
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
