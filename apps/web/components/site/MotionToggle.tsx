'use client';

import { useState } from 'react';

/**
 * Pausa lo que corre solo en una sección (WCAG 2.2.2): pasar el ratón encima no le sirve a quien
 * usa teclado o el teléfono. Marca la sección que la contiene; el resto lo hace la hoja de estilos.
 */
export function MotionToggle({ what }: { what: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <button
      type="button"
      className="sa-motion"
      aria-label={paused ? `Reproducir ${what}` : `Pausar ${what}`}
      onClick={(event) => {
        event.currentTarget.closest('section')?.classList.toggle('is-paused', !paused);
        setPaused(!paused);
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d={paused ? 'M8 5l11 7-11 7V5z' : 'M7 5h4v14H7zM13 5h4v14h-4z'} />
      </svg>
    </button>
  );
}
