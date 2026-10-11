'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { initials } from '@/components/ui/UserChip';

type Props = {
  name: string;
  title?: string | null;
  onLogout: () => void;
};

/** Avatar con iniciales de la barra superior y su menú corto: seguridad de la cuenta y salir. */
export function AccountMenu({ name, title, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="account" ref={wrapRef}>
      <button
        type="button"
        className="account__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Cuenta de ${name}`}
        title={name}
        onClick={() => setOpen((v) => !v)}
      >
        {initials(name)}
      </button>

      {open ? (
        <div className="account__menu" role="menu" aria-label="Cuenta">
          <div className="account__who">
            <strong>{name}</strong>
            {title ? <span>{title}</span> : null}
          </div>
          <Link role="menuitem" className="account__item" href="/security" onClick={() => setOpen(false)}>
            Seguridad de la cuenta
          </Link>
          <button type="button" role="menuitem" className="account__item" onClick={onLogout}>
            Salir
          </button>
        </div>
      ) : null}
    </div>
  );
}
