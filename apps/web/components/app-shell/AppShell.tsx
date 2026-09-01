'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useUser } from '@/lib/user-context';
import { EntityKey } from '@/lib/api';
import { canAccessEventOps, ROLE_SCOPE, userHasPermission, visibleNavItems } from '@/lib/access-matrix';
import { createSecureHandoffUrl } from '@/lib/cross-entity-handoff';
import { NotificationBell } from './NotificationBell';
import { SidebarNav } from './SidebarNav';
import { SidebarSearch } from './SidebarSearch';
import { UserChip } from '@/components/ui/UserChip';

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
  const [navQuery, setNavQuery] = useState('');
  /**
   * Menú que se esconde solo y vuelve al acercar el cursor al borde izquierdo,
   * como el Dock de macOS.
   *
   * Arranca APAGADO: escondido de fábrica, quien entra por primera vez no
   * encuentra la navegación — solo queda un filo dorado de 6 px que hay que
   * adivinar. Se activa desde «Esconder menú» y a partir de ahí se recuerda.
   */
  const [autoHide, setAutoHide] = useState(false);
  const [autoHideReady, setAutoHideReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('arta_nav_autohide');
      if (stored === '1' || stored === '0') setAutoHide(stored === '1');
    } catch {
      /* modo privado: se queda fijo */
    }
    setAutoHideReady(true);
  }, []);

  function toggleAutoHide(e: React.MouseEvent<HTMLButtonElement>) {
    // El botón vive dentro del menú: si conserva el foco, `:focus-within` deja
    // el menú abierto y parece que el botón no hizo nada.
    e.currentTarget.blur();
    setAutoHide((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('arta_nav_autohide', next ? '1' : '0');
      } catch {
        /* sin persistencia, pero funciona en esta sesión */
      }
      return next;
    });
  }

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname, entity]);

  const nav = useMemo(() => (user ? visibleNavItems(user, entity) : []), [user, entity]);

  const canCreateEvent =
    !!user &&
    canAccessEventOps(user.roleKey, entity) &&
    userHasPermission(user.roleKey, user.permissions, ['event.create', 'everything']);

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
    <div
      className={`shell ${navOpen ? 'shell--nav-open' : ''} ${
        autoHideReady && autoHide ? 'shell--nav-auto' : ''
      }`}
      data-entity={entity}
    >
      {/* Franja sensible: al pasar el cursor, el menú entra (estilo Dock macOS). */}
      {autoHideReady && autoHide ? (
        <div className="shell-hot-edge" aria-hidden title="Menú" />
      ) : null}
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
            <div className="brand-wordmark" aria-label="EXPLANADA · Auditorio Arema">
              <span className="brand-wordmark__mark">EXPLANADA</span>
            </div>
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

        <SidebarSearch value={navQuery} onChange={setNavQuery} />

        <Suspense fallback={<nav className="nav" aria-hidden />}>
          <SidebarNav items={nav} query={navQuery} />
        </Suspense>

        <div className="sidebar-foot">
          <button
            type="button"
            className="nav-autohide"
            aria-pressed={autoHide}
            onClick={toggleAutoHide}
            title={
              autoHide
                ? 'El menú se esconde solo; vuelve al acercar el cursor al borde izquierdo'
                : 'Esconder el menú y mostrarlo al acercar el cursor al borde izquierdo'
            }
          >
            {autoHide ? '⇤ Menú automático activo' : '⇥ Esconder menú (automático)'}
          </button>
          <UserChip name={user.fullName} subtitle={user.title || user.roleKey} />
          <div className="scope-hint">{ROLE_SCOPE[user.roleKey] || ''}</div>
          <button type="button" className="btn ghost btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={logout}>
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
            {autoHideReady && autoHide ? (
              <button
                type="button"
                className="btn ghost btn-sm topbar-pin-nav"
                onClick={toggleAutoHide}
                title="Fijar el menú lateral"
              >
                Fijar menú
              </button>
            ) : null}
            <div>
              <h1>{title || 'Panel'}</h1>
              <div className="topbar-sub">
                {entity === 'ARTA' ? 'Arta Producciones' : 'Auditorio Arema · Explanada'}
                {autoHideReady && autoHide ? (
                  <span className="topbar-autohide-hint"> · Acerca el cursor al borde izquierdo para el menú</span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            <NotificationBell />
            {canCreateEvent ? (
              <Link href="/events/new" className="btn btn-sm">
                Nuevo evento
              </Link>
            ) : null}
            <span className={`badge ${entity === 'ARTA' ? 'arta' : 'explanada'}`}>
              {entity === 'ARTA' ? 'ARTA' : 'AUDITORIO'}
            </span>
          </div>
        </header>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
