'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { PageKey } from '@/lib/site-blocks';
import type { SiteLink } from '@/lib/site-model';

type SiteHeaderProps = {
  /** Todas las páginas que se ven, en el orden del menú. */
  links: SiteLink[];
  /** Página en la que estamos: el menú la marca. */
  active?: PageKey;
  /** Hay foto o tinta debajo: el encabezado arranca transparente. Si no, sólido sobre papel. */
  overDark?: boolean;
};

/** La marca: el SVG va como máscara para que tome el color del encabezado sin cargar dos archivos. */
export function SiteLogo({ className = '' }: { className?: string }) {
  return <span className={`sa-logo ${className}`.trim()} role="img" aria-label="Arta Producciones" />;
}

export function SiteHeader({ links, active, overDark = false }: SiteHeaderProps) {
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

  const light = (!overDark || scrolled) && !menuOpen;
  const contact = links.find((l) => l.key === 'contacto');
  const bar = links.filter((l) => l.key !== 'inicio' && l.key !== 'contacto' && !l.secondary);

  return (
    <header className={`sa-nav ${light ? 'is-light' : ''} ${menuOpen ? 'is-open' : ''}`.trim()}>
      <Link href="/p/arta" className="sa-nav__brand" onClick={closeMenu} aria-label="Arta Producciones, inicio">
        <SiteLogo />
      </Link>
      <nav className="sa-nav__links" aria-label="Principal">
        {bar.map((link) => (
          <Link key={link.key} href={link.href} aria-current={link.key === active ? 'page' : undefined}>
            {link.label}
          </Link>
        ))}
        {contact ? (
          <Link className="sa-btn sa-btn--nav" href={contact.href} aria-current={active === 'contacto' ? 'page' : undefined}>
            {contact.label}
          </Link>
        ) : null}
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
          {links.map((link) => (
            <Link key={link.key} href={link.href} onClick={closeMenu} aria-current={link.key === active ? 'page' : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
