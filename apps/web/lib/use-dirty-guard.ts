'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Evita perder trabajo sin guardar. Bloquea el cierre de pestaña y expone
 * `confirmLeave()` para las navegaciones internas (cambiar de formato, de
 * campaña, de pestaña del evento).
 */
export function useDirtyGuard(dirty: boolean, message = 'Tienes cambios sin guardar. ¿Salir de todas formas?') {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return useCallback(() => {
    if (!dirtyRef.current) return true;
    return window.confirm(message);
  }, [message]);
}
