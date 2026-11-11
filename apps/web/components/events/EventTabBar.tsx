'use client';

import { useEffect, useRef, useState } from 'react';
import type { Tab } from './event-detail.types';
import { TAB_LABELS } from './useEventTab';

type ModuleTab = {
  key: Tab;
  label: string;
  count: number;
};

type Props = {
  tab: Tab;
  modules: readonly ModuleTab[];
  onSelect: (tab: Tab) => void;
};

/**
 * Las 11 pestañas al mismo nivel no decían por dónde empezar (recorrido 11-11-2026). Maqueta aprobada
 * por Adam: Resumen y tres grupos; el grupo abierto enseña sus módulos en una segunda tira. Un grupo con
 * un solo módulo visible para este usuario se queda con el nombre del módulo y sin segunda tira.
 */
export const TAB_GROUPS: ReadonlyArray<{ key: string; label: string; tabs: readonly Tab[] }> = [
  { key: 'produccion', label: 'Producción', tabs: ['checklists', 'tasks', 'files', 'testigos'] },
  { key: 'dinero', label: 'Dinero', tabs: ['finance', 'ocs', 'sponsors', 'adendum'] },
  { key: 'venta', label: 'Venta', tabs: ['campaign', 'ticketing'] },
];

export function groupModules(modules: readonly ModuleTab[]) {
  return TAB_GROUPS.map((g) => ({
    ...g,
    modules: modules.filter((m) => g.tabs.includes(m.key)),
  })).filter((g) => g.modules.length);
}

export function EventTabBar({ tab, modules, onSelect }: Props) {
  const groups = groupModules(modules);
  const active = groups.find((g) => g.tabs.includes(tab));
  // Con la tira desbordada (ventanas angostas), la pestaña activa siempre a la vista.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>('.tab-bar__btn.is-active');
    if (!nav || !el) return;
    const left = el.offsetLeft - nav.offsetLeft;
    if (left < nav.scrollLeft + 24) nav.scrollLeft = Math.max(0, left - 24);
    else if (left + el.offsetWidth > nav.scrollLeft + nav.clientWidth - 24)
      nav.scrollLeft = left + el.offsetWidth - nav.clientWidth + 24;
  }, [tab]);

  // Al bajar, las pestañas se quedan pegadas bajo la barra superior (que ya lleva
  // el nombre del evento): la barra condensada es esa pareja. `is-stuck` le da la
  // línea y la sombra que la barra superior suelta mientras tanto.
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = barRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h')) || 58;
    // Pegada, su borde de arriba queda justo en la barra superior: ya no cabe entera
    // en la ventana recortada 1 px por debajo de esa barra.
    const io = new IntersectionObserver(
      ([entry]) => setStuck(entry.intersectionRatio < 1 && entry.boundingClientRect.top <= top + 1),
      { rootMargin: `-${top + 1}px 0px 0px 0px`, threshold: [1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (stuck) root.setAttribute('data-tabs-stuck', '');
    else root.removeAttribute('data-tabs-stuck');
    return () => root.removeAttribute('data-tabs-stuck');
  }, [stuck]);

  return (
    <div ref={barRef} className={`event-tabs${stuck ? ' is-stuck' : ''}`}>
      <nav className="tab-bar event-tabs__desktop" aria-label="Secciones del evento" ref={navRef}>
        <button
          className={`tab-bar__btn ${tab === 'overview' ? 'is-active' : ''}`}
          type="button"
          onClick={() => onSelect('overview')}
        >
          {TAB_LABELS.overview}
        </button>
        {groups.map((g) => {
          const single = g.modules.length === 1 ? g.modules[0] : null;
          const count = single ? single.count : 0;
          return (
            <button
              key={g.key}
              className={`tab-bar__btn ${active?.key === g.key ? 'is-active' : ''}`}
              type="button"
              aria-expanded={single ? undefined : active?.key === g.key}
              onClick={() => onSelect(active?.key === g.key ? tab : g.modules[0].key)}
            >
              {single ? single.label : g.label}
              {count ? <span className="tab-bar__count">{count}</span> : null}
            </button>
          );
        })}
      </nav>
      {active && active.modules.length > 1 ? (
        <nav className="event-subtabs" aria-label={`Módulos de ${active.label}`}>
          {active.modules.map((m) => (
            <button
              key={m.key}
              className={`event-subtabs__btn ${tab === m.key ? 'is-active' : ''}`}
              type="button"
              aria-current={tab === m.key ? 'page' : undefined}
              onClick={() => onSelect(m.key)}
            >
              {m.label}
              {m.count ? <span className="event-subtabs__count">{m.count}</span> : null}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
