'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Línea fina arriba mientras se cambia de pantalla: que se note que el clic llegó
 * aunque la siguiente pantalla tarde. Arranca al tocar un enlace interno y termina
 * cuando cambia la ruta. Sin nada que cargar no se ve: aparece a los 120 ms.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const params = useSearchParams();
  const route = `${pathname}?${params.toString()}`;
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('loading'), 120);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setState((prev) => (prev === 'loading' ? 'done' : 'idle'));
  }, [route]);

  useEffect(() => {
    if (state !== 'done') return;
    const id = window.setTimeout(() => setState('idle'), 260);
    return () => window.clearTimeout(id);
  }, [state]);

  if (state === 'idle') return null;
  return <div className={`route-progress route-progress--${state}`} aria-hidden />;
}
