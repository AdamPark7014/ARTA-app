'use client';

import { useEffect } from 'react';

/**
 * Entrada suave al bajar. Sin JavaScript o con «reducir movimiento» todo se ve desde el principio:
 * el CSS solo esconde mientras `data-motion` esté puesto, y esto lo pone al montar.
 */
export function SiteMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    const root = document.querySelector<HTMLElement>('.sa');
    if (!root) return;
    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          seen.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    const observe = () => {
      root.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => seen.observe(el));
    };
    observe();
    root.setAttribute('data-motion', 'on');
    // La vista previa de Studio vuelve a pintar secciones: las nuevas también entran.
    const changes = new MutationObserver(observe);
    changes.observe(root, { childList: true, subtree: true });
    return () => {
      seen.disconnect();
      changes.disconnect();
      root.removeAttribute('data-motion');
    };
  }, []);
  return null;
}
