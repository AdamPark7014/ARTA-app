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

export function EventTabBar({ tab, modules, onSelect }: Props) {
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
      <label className="event-tabs__mobile">
        <span className="event-tabs__mobile-label">Módulo</span>
        <select
          className="field field--select event-tabs__select"
          aria-label="Módulo del evento"
          value={tab}
          onChange={(e) => onSelect(e.target.value as Tab)}
        >
          <option value="overview">{TAB_LABELS.overview}</option>
          {modules.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}{m.count ? ` (${m.count})` : ''}
            </option>
          ))}
        </select>
      </label>

      <nav className="tab-bar event-tabs__desktop" aria-label="Módulos del evento" ref={navRef}>
        <button
          className={`tab-bar__btn ${tab === 'overview' ? 'is-active' : ''}`}
          type="button"
          onClick={() => onSelect('overview')}
        >
          {TAB_LABELS.overview}
        </button>
        {modules.map((m) => (
          <button
            key={m.key}
            className={`tab-bar__btn ${tab === m.key ? 'is-active' : ''}`}
            type="button"
            onClick={() => onSelect(m.key)}
          >
            {m.label}
            {m.count ? <span className="tab-bar__count">{m.count}</span> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}
