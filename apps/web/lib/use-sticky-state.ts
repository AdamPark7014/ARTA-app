'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Estado que sobrevive a la navegación (filtros, pestaña activa, agrupación).
 * Sin esto el equipo vuelve a elegir «Vencidas» cada vez que entra a Tareas.
 */
export function useStickyState<T>(key: string, initial: T): [T, (next: T) => void] {
  const storageKey = `arta.ui.${key}`;
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* modo privado / JSON corrupto: se queda con el inicial */
    }
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* sin almacenamiento: el estado sigue funcionando en memoria */
    }
  }, [storageKey, value]);

  return [value, setValue];
}
