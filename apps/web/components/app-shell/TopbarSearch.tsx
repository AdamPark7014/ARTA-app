'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { navHref, navItemMatches, navKey, type NavItem } from '@/lib/access-matrix';
import { NavIcon } from './NavIcon';

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Items ya filtrados por rol / permisos / entidad (los mismos del menú). */
  items: NavItem[];
  /**
   * Con el menú lateral a la vista, buscar filtra ese mismo menú. Escondido
   * (teléfono o «Esconder el menú») no se vería nada: entonces los resultados
   * se abren debajo del buscador.
   */
  menuHidden: boolean;
};

const MAX_RESULTS = 8;

/**
 * Buscador de la barra superior (SISTEMA-VISUAL: «buscador Ctrl K que lleva a
 * lo que ya busca el menú»). Busca lo mismo que buscaba el menú — módulos y
 * vistas de portafolio, incluidas las ocultas — sin pedir nada nuevo a la API.
 * Ctrl K (⌘ K en Mac) lo enfoca desde cualquier pantalla; Enter abre el
 * primer resultado y Escape lo limpia.
 */
export function TopbarSearch({ value, onChange, items, menuHidden }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [active, setActive] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const [narrow, setNarrow] = useState(false);

  const query = value.trim();
  const results = useMemo(
    () => (query ? items.filter((item) => navItemMatches(item, query)).slice(0, MAX_RESULTS) : []),
    [items, query],
  );
  const showList = !!query && (menuHidden || narrow);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
    const mq = window.matchMedia('(max-width: 900px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    // Va en `window`: si una pantalla ya usa Ctrl K para lo suyo (el «Ir a…» del
    // chat escucha en `document` y llega antes), se respeta y aquí no se hace nada.
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(item: NavItem) {
    onChange('');
    inputRef.current?.blur();
    router.push(navHref(item));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      onChange('');
      e.currentTarget.blur();
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown' && showList) {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp' && showList) {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[showList ? active : 0] ?? results[0]);
    }
  }

  return (
    <div className={`topbar-search ${query ? 'has-query' : ''}`} role="search">
      <svg className="topbar-search__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        className="topbar-search__input"
        type="search"
        placeholder="Buscar en el menú"
        aria-label="Buscar en el menú"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length ? `${listId}-${active}` : undefined}
      />
      <kbd className="topbar-search__kbd" aria-hidden>
        {isMac ? '⌘ K' : 'Ctrl K'}
      </kbd>

      {showList ? (
        <div className="topbar-search__results" id={listId} role="listbox" aria-label="Resultados">
          {results.length ? (
            results.map((item, i) => (
              <Link
                key={navKey(item)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                href={navHref(item)}
                className={`topbar-search__item ${i === active ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => onChange('')}
              >
                <NavIcon href={item.href} size={16} />
                <span>{item.label}</span>
                {item.group ? <small>{item.group}</small> : null}
              </Link>
            ))
          ) : (
            <p className="topbar-search__empty">Sin resultados para «{query}»</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
