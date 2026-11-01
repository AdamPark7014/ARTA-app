'use client';

import { useEffect } from 'react';
import { isMobileBrowser } from './platform';

/** Menos que esto no es el teclado: es la barra de Safari que se esconde. */
const KEYBOARD_MIN_PX = 120;

/**
 * Con el teclado abierto, Safari de iPhone no acorta la página: la empuja hacia
 * arriba y la barra del chat se va de la pantalla. Aquí la caja se ajusta a lo
 * que de verdad se ve (`visualViewport`): título arriba, mensajes en medio y el
 * campo de escribir justo encima del teclado, como en una app.
 */
export function useKeyboardFit(selector: string) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport || !isMobileBrowser()) return;

    const release = (box: HTMLElement | null) => {
      box?.style.removeProperty('height');
      box?.style.removeProperty('min-height');
    };

    const apply = () => {
      const box = document.querySelector<HTMLElement>(selector);
      if (!box) return;
      const open = window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
      if (!open) {
        release(box);
        return;
      }
      window.scrollTo(0, 0);
      const top = box.getBoundingClientRect().top;
      box.style.height = `${Math.max(180, viewport.height - top - 6)}px`;
      box.style.minHeight = '0';
    };

    viewport.addEventListener('resize', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      release(document.querySelector<HTMLElement>(selector));
    };
  }, [selector]);
}
