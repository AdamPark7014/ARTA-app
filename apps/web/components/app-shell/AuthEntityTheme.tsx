'use client';

import { useEffect, useState } from 'react';
import type { EntityKey } from '@/lib/api';
import { entityFromHost } from '@/lib/domains';
import { useEntityTheme } from './useEntityTheme';

/** Login e invitación: el tema sale del subdominio (auditorio.* oscuro); si no hay, ARTA claro. */
export function AuthEntityTheme() {
  const [entity, setEntity] = useState<EntityKey | null>(null);

  useEffect(() => {
    setEntity(entityFromHost(window.location.hostname) ?? 'ARTA');
  }, []);

  useEntityTheme(entity);
  return null;
}
