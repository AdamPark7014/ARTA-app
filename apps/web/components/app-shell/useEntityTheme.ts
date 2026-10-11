'use client';

import { useEffect } from 'react';
import type { EntityKey } from '@/lib/api';

/**
 * Mantiene `<html data-entity>` en la entidad activa. Con `null` no toca nada:
 * mientras la sesión carga, manda lo que dejó el script inicial del layout
 * (si aquí se pusiera ARTA por defecto, el Auditorio parpadearía en claro).
 * Al salir del panel se quita, y el sitio público vuelve a su propio tema.
 */
export function useEntityTheme(entity: EntityKey | null) {
  useEffect(() => {
    if (!entity) return;
    const root = document.documentElement;
    root.setAttribute('data-entity', entity);
    return () => root.removeAttribute('data-entity');
  }, [entity]);
}
