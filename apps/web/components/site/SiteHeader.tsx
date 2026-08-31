'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { panelLoginUrl } from '@/lib/domains';

type SiteHeaderProps = {
  /** `home` = full marketing nav; `article` = compact nav for news detail */
  mode?: 'home' | 'article';
};

export function SiteHeader({ mode = 'home' }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(mode === 'article');
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const panelLogin = panelLoginUrl('ARTA');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24 || mode === 'article');
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [mode]);

  useEffect(() => {
    if (!menuOpen) return;
    document.body.classList.add('site-nav-open');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('site-nav-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  const homeHref = '/p/arta';
  const newsHref = `${homeHref}#noticias`;

  return (
    <>
      {menuOpen ? (
        <button
          type="button"
          className="site-nav-backdrop"
          aria-label="Cerrar menú"
          onClick={closeMenu}
        />
      ) : null}
      <header
        className={`site-nav ${scrolled ? 'is-scrolled' : ''} ${menuOpen ? 'site-nav--open' : ''}`}
      >
        <Link href={homeHref} className="site-brand" onClick={closeMenu}>
          <Image
            src="/brand/arta-logo.png"
            alt="arta"
            width={140}
            height={56}
            className="site-logo-img"
            priority
          />
        </Link>
        <button
          type="button"
          className="site-nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="site-primary-nav"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
          <span className="sr-only">Menú</span>
        </button>
        <nav id="site-primary-nav" className={`site-nav-links ${menuOpen ? 'is-open' : ''}`}>
          {mode === 'article' ? (
            <Link href={newsHref} onClick={closeMenu}>
              ← Noticias
            </Link>
          ) : null}
          <a href={`${homeHref}#nosotros`} onClick={closeMenu}>
            Nosotros
          </a>
          <a href={`${homeHref}#modulos`} onClick={closeMenu}>
            Operación
          </a>
          <a href={newsHref} onClick={closeMenu}>
            Noticias
          </a>
          <a href={`${homeHref}#faq`} onClick={closeMenu}>
            FAQ
          </a>
          <a href={`${homeHref}#ubicacion`} onClick={closeMenu}>
            Ubicación
          </a>
          <a href={`${homeHref}#contacto`} className="btn ghost btn-sm" onClick={closeMenu}>
            Contacto
          </a>
          <a href={panelLogin} className="btn btn-sm site-nav-panel">
            Acceso equipo
          </a>
        </nav>
      </header>
    </>
  );
}
