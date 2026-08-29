'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Ancho real del contenedor, para dibujar el PDF al tamaño disponible en vez de
 * a un ancho fijo. Se redondea a saltos grandes porque volver a rasterizar un
 * PDF es caro: no tiene sentido rehacerlo por dos píxeles al arrastrar la
 * ventana o al abrir el modo grande.
 */
export function useElementWidth(step = 40) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const apply = (raw: number) => {
      const snapped = Math.round(raw / step) * step;
      setWidth((prev) => (prev === snapped ? prev : snapped));
    };

    apply(el.getBoundingClientRect().width);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) apply(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  return { ref, width };
}
