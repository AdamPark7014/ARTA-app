'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { navHref, navItemMatches, navKey, type NavItem } from '@/lib/access-matrix';
import { useUser } from '@/lib/user-context';
import { REF_GROUPS, REF_ICON, type ChatRef } from '@/components/chat/chat-refs';
import { NavIcon } from './NavIcon';

type Props = {
  /** Items ya filtrados por rol / permisos / entidad (los mismos del menú). */
  items: NavItem[];
};

type EventHit = {
  id: string;
  name: string;
  artist?: string | null;
  venue?: string | null;
  city?: string | null;
  startsAt?: string | null;
  status?: string | null;
};

type PersonHit = { id: string; fullName: string; title?: string | null };

type Result = {
  key: string;
  section: string;
  title: string;
  detail?: string;
  href: string;
  /** Ícono: el trazo del menú al que pertenece. */
  icon: string;
  /** Trazo propio, para lo que no es una pantalla del menú. */
  path?: string;
  initials?: string;
};

const PER_SECTION = 5;
/** Sin escribir nada: lo más próximo y lo que traes a la mano, sin llenar la pantalla. */
const IDLE_EVENTS = 3;
const IDLE_TASKS = 4;
/** Tareas, OC, formatos, documentos y anticipos se buscan en el servidor, con mis permisos. */
const REMOTE_KINDS = 'task,po,format,doc,advance';
const SECTION_OF = Object.fromEntries(REF_GROUPS.map((g) => [g.kind, g.title]));

function refResult(r: ChatRef): Result {
  return {
    key: `ref-${r.kind}-${r.id}`,
    section: SECTION_OF[r.kind] ?? 'Resultados',
    title: r.title || r.label,
    detail: [r.statusLabel, r.amount, r.subtitle].filter(Boolean).join(' · '),
    href: r.href || '/',
    icon: '/',
    path: REF_ICON[r.kind],
  };
}

/** Sin acentos ni mayúsculas: «sinfonica» encuentra «Sinfónica». */
function folded(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Todas las palabras tienen que aparecer; las que empiezan por lo buscado van primero. */
function score(haystack: string, words: string[]): number {
  let total = 0;
  for (const word of words) {
    const at = haystack.indexOf(word);
    if (at < 0) return -1;
    total += at === 0 ? 3 : haystack[at - 1] === ' ' ? 2 : 1;
  }
  return total;
}

function shortDay(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function eventResult(event: EventHit, section: Result['section']): Result {
  return {
    key: `event-${event.id}`,
    section,
    title: event.name,
    detail: [shortDay(event.startsAt), event.venue || event.city].filter(Boolean).join(' · '),
    href: `/events/${event.id}`,
    icon: '/calendar',
  };
}

/**
 * Buscador de toda la plataforma (Ctrl K / ⌘ K desde cualquier pantalla): eventos,
 * personas y pantallas del menú, con la lista de lo que viene antes de teclear.
 * Eventos y directorio se piden la primera vez que se abre y quedan en memoria;
 * cambiar de entidad los vuelve a pedir. Flechas para moverse, Enter para abrir,
 * Esc para cerrar.
 */
export function TopbarSearch({ items }: Props) {
  const router = useRouter();
  const { entity } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const [events, setEvents] = useState<EventHit[]>([]);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [loaded, setLoaded] = useState('');
  const [remote, setRemote] = useState<ChatRef[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const query = value.trim();

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const params = new URLSearchParams({ entity, kinds: query ? REMOTE_KINDS : 'task' });
    if (query) params.set('q', query);
    const id = window.setTimeout(
      () => {
        api<{ results?: ChatRef[] }>(`/chat/refs/search?${params}`)
          .then((res) => {
            if (alive) setRemote(Array.isArray(res?.results) ? res.results : []);
          })
          .catch(() => {
            if (alive) setRemote([]);
          });
      },
      query ? 180 : 0,
    );
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [open, query, entity]);

  const load = useCallback(() => {
    if (loaded === entity) return;
    setLoaded(entity);
    api<EventHit[]>(`/events?entity=${entity}&scope=all`)
      .then((rows) => setEvents(Array.isArray(rows) ? rows : []))
      .catch(() => setEvents([]));
    api<PersonHit[]>(`/users/directory?entity=${entity}`)
      .then((rows) => setPeople(Array.isArray(rows) ? rows : []))
      .catch(() => setPeople([]));
  }, [entity, loaded]);

  const results = useMemo<Result[]>(() => {
    if (!query) {
      const now = Date.now();
      return events
        .filter((e) => e.startsAt && new Date(e.startsAt).getTime() >= now - 86_400_000 && e.status !== 'CANCELLED')
        .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())
        .slice(0, IDLE_EVENTS)
        .map((e) => eventResult(e, 'Próximos eventos'))
        .concat(remote.slice(0, IDLE_TASKS).map((r) => ({ ...refResult(r), section: 'Tus tareas' })));
    }
    const words = folded(query).split(/\s+/).filter(Boolean);
    const best = <T,>(rows: T[], text: (row: T) => string) =>
      rows
        .map((row) => ({ row, points: score(folded(text(row)), words) }))
        .filter((hit) => hit.points >= 0)
        .sort((a, b) => b.points - a.points)
        .slice(0, PER_SECTION)
        .map((hit) => hit.row);
    return [
      ...best(events, (e) => [e.name, e.artist, e.venue, e.city].filter(Boolean).join(' ')).map((e) =>
        eventResult(e, 'Eventos'),
      ),
      ...remote.map(refResult),
      ...best(people, (p) => `${p.fullName} ${p.title ?? ''}`).map<Result>((p) => ({
        key: `person-${p.id}`,
        section: 'Personas',
        title: p.fullName,
        detail: p.title || undefined,
        href: `/chat?with=${encodeURIComponent(p.id)}`,
        icon: '/chat',
        initials: initialsOf(p.fullName),
      })),
      ...items
        .filter((item) => navItemMatches(item, query))
        .slice(0, PER_SECTION)
        .map<Result>((item) => ({
          key: `nav-${navKey(item)}`,
          section: 'Pantallas',
          title: item.label,
          detail: item.group,
          href: navHref(item),
          icon: item.href,
        })),
    ];
  }, [query, events, people, items, remote]);

  useEffect(() => {
    listRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
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

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function go(result: Result) {
    setValue('');
    setOpen(false);
    inputRef.current?.blur();
    router.push(result.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setValue('');
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active] ?? results[0]);
    }
  }

  const showList = open && (!!query || results.length > 0);

  return (
    <div ref={boxRef} className={`topbar-search ${query ? 'has-query' : ''}`} role="search">
      <svg className="topbar-search__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
        <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        className="topbar-search__input"
        type="search"
        placeholder="Buscar eventos, tareas, OC, personas"
        aria-label="Buscar en ARTA"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onFocus={() => {
          setOpen(true);
          load();
        }}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
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
        <div ref={listRef} className="topbar-search__results" id={listId} role="listbox" aria-label="Resultados">
          {results.length ? (
            results.map((result, i) => (
              <div key={result.key} role="presentation">
                {i === 0 || results[i - 1].section !== result.section ? (
                  <p className="topbar-search__section" role="presentation">
                    {result.section}
                  </p>
                ) : null}
                <button
                  type="button"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`topbar-search__item ${i === active ? 'is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  // Antes del blur del campo: si no, el clic se pierde al cerrarse la lista.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(result)}
                >
                  {result.initials ? (
                    <span className="topbar-search__avatar" aria-hidden>
                      {result.initials}
                    </span>
                  ) : result.path ? (
                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
                      <path d={result.path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <NavIcon href={result.icon} size={16} />
                  )}
                  <span className="topbar-search__copy">
                    <span className="topbar-search__title">{result.title}</span>
                    {result.detail ? <small>{result.detail}</small> : null}
                  </span>
                </button>
              </div>
            ))
          ) : (
            <p className="topbar-search__empty">Sin resultados para «{query}»</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
