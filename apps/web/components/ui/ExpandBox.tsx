'use client';

import { useEffect, useState, type ReactNode } from 'react';

type Props = {
  /** Se muestra en la barra del modo grande */
  title: string;
  children: ReactNode;
  /** Acciones propias del contenido, a la izquierda del botón de ampliar */
  actions?: ReactNode;
  /**
   * Abrir ya a pantalla completa. Útil en PDF / hoja / checklist: trabajar en
   * una columna estrecha no sirve; el documento debe mandar desde el primer clic.
   */
  defaultExpanded?: boolean;
};

/**
 * Caja que se puede llevar a pantalla completa.
 *
 * Trabajar sobre un PDF o una hoja de cálculo en una columna estrecha no sirve:
 * con «Ampliar» el contenido pasa a ocupar toda la ventana, y se sale con el
 * mismo botón o con Escape. El contenido se mantiene montado —no se
 * desmonta y vuelve a montar— para no perder lo que se lleva escrito.
 */
export function ExpandBox({ title, children, actions, defaultExpanded = false }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false);
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  return (
    <div className={`expandbox ${expanded ? 'expandbox--full' : 'expandbox--inline'}`}>
      <div className="expandbox__bar">
        <strong className="expandbox__title">{title}</strong>
        <div className="row row--tight">
          {actions}
          <button
            className="btn ghost btn-sm"
            type="button"
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? 'Salir de pantalla completa (Esc)' : 'Ampliar a pantalla completa'}
          </button>
        </div>
      </div>
      <div className="expandbox__body">{children}</div>
    </div>
  );
}
