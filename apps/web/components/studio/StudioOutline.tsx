'use client';

import { FIXED_PAGES, pageMeta, type LayoutPage } from '@/lib/site-blocks';

type StudioOutlineProps = {
  pages: LayoutPage[];
  /** Lo que está seleccionado: una página, `ajustes` o una sección agregada a Inicio. */
  selected: string;
  /** Una línea por página: qué tiene, si está en borrador o quitada. */
  statusOf: (page: LayoutPage) => string;
  settingsDraft: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onMove: (index: number, delta: number) => void;
  onToggle: (page: LayoutPage) => void;
};

/** El sitio, página por página, en el orden del menú. */
export function StudioOutline({ pages, selected, statusOf, settingsDraft, busy, onSelect, onMove, onToggle }: StudioOutlineProps) {
  return (
    <nav className="st-outline" aria-label="Páginas del sitio">
      <p className="st-outline__cap">Páginas del sitio</p>
      <ol>
        {pages.map((page, index) => {
          const { label } = pageMeta(page.key);
          const fixed = page.key === 'inicio';
          return (
            <li key={page.key} className={`st-block ${selected === page.key ? 'is-selected' : ''} ${page.visible ? '' : 'is-off'}`.trim()}>
              <button type="button" className="st-block__main" aria-current={selected === page.key} onClick={() => onSelect(page.key)}>
                <strong>{label}</strong>
                <span>{statusOf(page)}</span>
              </button>
              {fixed ? (
                <span className="st-block__fixed">Siempre primero</span>
              ) : (
                <div className="st-order">
                  <button type="button" disabled={busy || index <= 1} aria-label={`Subir ${label} en el menú`} onClick={() => onMove(index, -1)}>
                    Subir
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === pages.length - 1}
                    aria-label={`Bajar ${label} en el menú`}
                    onClick={() => onMove(index, 1)}
                  >
                    Bajar
                  </button>
                  {FIXED_PAGES.includes(page.key) ? null : (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`${page.visible ? 'Quitar del sitio' : 'Poner en el sitio'} la página ${label}`}
                      onClick={() => onToggle(page)}
                    >
                      {page.visible ? 'Quitar' : 'Poner'}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className={`st-block__main st-outline__settings ${selected === 'ajustes' ? 'is-selected' : ''}`.trim()}
        aria-current={selected === 'ajustes'}
        onClick={() => onSelect('ajustes')}
      >
        <strong>Datos del sitio</strong>
        <span>{settingsDraft ? 'Borrador sin publicar' : 'Correo, teléfono, redes y lema'}</span>
      </button>
    </nav>
  );
}
