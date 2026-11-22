'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Estado que vive en la dirección (sección, filtro, búsqueda): al ir y volver se
 * conserva, y se puede compartir el enlace. Cambia la URL con `router.replace`
 * (sin llenar el historial) y quita el parámetro cuando vuelve al valor por defecto.
 *
 *   const [section, setSection] = useUrlState('seccion', 'pay');
 *   const [q, setQ] = useUrlState('q', '');          // /purchase-orders?seccion=pay&q=audio
 *
 * Necesita estar bajo <Suspense> como todo `useSearchParams` en Next 15.
 */
export function useUrlState(key: string, fallback = ''): [string, (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params?.get(key) ?? fallback;
  const [value, setValue] = useState(fromUrl);

  // Atrás / adelante del navegador traen otro valor.
  useEffect(() => {
    setValue(fromUrl);
  }, [fromUrl]);

  const set = useCallback(
    (next: string) => {
      setValue(next);
      const query = new URLSearchParams(window.location.search);
      if (!next || next === fallback) query.delete(key);
      else query.set(key, next);
      const qs = query.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [fallback, key, pathname, router],
  );

  return [value, set];
}
