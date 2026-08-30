'use client';

import { useEffect, useRef } from 'react';

/**
 * ⌘/Ctrl+S → guardar, sin interferir con el atajo nativo del navegador.
 * `enabled` suele ser `canEdit && dirty && !saving`.
 */
export function useSaveHotkey(enabled: boolean, save: () => void | Promise<void>) {
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      void saveRef.current();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
