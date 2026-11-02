'use client';

import { useCallback, useEffect, useState } from 'react';

export type SiteNavLink = { label: string; href: string };

type SiteHeaderProps = {
  nav: SiteNavLink[];
  homeHref?: string;
  contactHref: string;
  /** Páginas sin portada oscura: el encabezado arranca sólido, sobre papel. */
  solid?: boolean;
};

/** La marca: el SVG va como máscara para que tome el color del encabezado sin cargar dos archivos. */
export function SiteLogo({ className = '' }: { className?: string }) {
  return <span className={`sa-logo ${className}`.trim()} role="img" aria-label="Arta Producciones" />;
}

export function SiteHeader({ nav, homeHref = '/p/arta', contactHref, solid = false }: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    document.body.classList.add('sa-lock');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('sa-lock');
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  const light = (solid || scrolled) && !menuOpen;

  return (
    <header className={`sa-nav ${light ? 'is-light' : ''} ${menuOpen ? 'is-open' : ''}`.trim()}>
      <a href={homeHref || '#'} className="sa-nav__brand" onClick={closeMenu} aria-label="Arta Producciones, inicio">
        <SiteLogo />
      </a>
      <nav className="sa-nav__links" aria-label="Principal">
        {nav.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
        <a className="sa-btn sa-btn--nav" href={contactHref}>
          Contacto
        </a>
      </nav>
      <button
        type="button"
        className="sa-nav__toggle"
        aria-expanded={menuOpen}
        aria-controls="sa-menu"
        aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span />
        <span />
      </button>
      <div id="sa-menu" className="sa-menu" hidden={!menuOpen}>
        <nav aria-label="Menú">
          {nav.map((link) => (
            <a key={link.href} href={link.href} onClick={closeMenu}>
              {link.label}
            </a>
          ))}
          <a href={contactHref} onClick={closeMenu}>
            Contacto
          </a>
        </nav>
      </div>
    </header>
  );
}
