'use client';

import { useEffect } from 'react';
import { LEGACY_ANCHORS } from '@/lib/site-blocks';

/**
 * El sitio fue una sola página: hay ligas compartidas como `/p/arta#noticias`. El `#` no llega al
 * servidor, así que la redirección tiene que pasar aquí, ya en el navegador.
 */
export function LegacyAnchors() {
  useEffect(() => {
    const follow = () => {
      const target = LEGACY_ANCHORS[window.location.hash.slice(1)];
      if (target) window.location.replace(target);
    };
    follow();
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  return null;
}
