import type { AuthUser } from '@/lib/api';
import { api } from '@/lib/api';
import type { EntityKey } from '@/lib/domains';
import {
  AUDITORIO_HOST,
  ARTA_HOST,
  HANDOFF_PARAM,
  ROOT_DOMAIN,
  entityFromHost,
  hostForEntity,
  isEntitySubdomain,
  isLocalHostname,
} from '@/lib/domains';

export { HANDOFF_PARAM };

export type HandoffPayload = {
  user: AuthUser;
  entity: EntityKey;
};

function targetBase(targetEntity: EntityKey, path: string): string | null {
  if (typeof window === 'undefined') return null;
  const { protocol, hostname, port } = window.location;
  const portSuffix = port ? `:${port}` : '';
  const safePath = path.startsWith('/') ? path : `/${path}`;

  if (!isEntitySubdomain(hostname) && isLocalHostname(hostname)) {
    return null;
  }

  const currentEntity = entityFromHost(hostname);
  if (currentEntity === targetEntity) return safePath;

  let targetHost = hostForEntity(targetEntity);
  if (hostname.endsWith('.localhost')) {
    targetHost = targetEntity === 'ARTA' ? 'arta.localhost' : 'auditorio.localhost';
  } else if (isLocalHostname(hostname) === false && hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    targetHost = targetEntity === 'ARTA' ? ARTA_HOST : AUDITORIO_HOST;
  }

  return `${protocol}//${targetHost}${portSuffix}${safePath}`;
}

/**
 * Secure cross-entity URL using one-time server handoff code (no JWT in query).
 */
export async function createSecureHandoffUrl(
  targetEntity: EntityKey,
  path: string,
): Promise<string | null> {
  const base = targetBase(targetEntity, path);
  if (!base) return null;
  if (!base.startsWith('http')) return base;

  try {
    const res = await api<{ code: string }>('/auth/handoff', {
      method: 'POST',
      body: JSON.stringify({ entity: targetEntity, path }),
    });
    return `${base}${base.includes('?') ? '&' : '?'}${HANDOFF_PARAM}=${encodeURIComponent(res.code)}`;
  } catch {
    return base;
  }
}

/**
 * Consume ?_nxt= one-time handoff code. Legacy base64 JWT payloads are rejected.
 */
export async function consumeHandoffParam(): Promise<HandoffPayload | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(HANDOFF_PARAM);
  if (!raw) return null;

  params.delete(HANDOFF_PARAM);
  const newSearch = params.toString();
  const newUrl =
    window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
  window.history.replaceState(null, '', newUrl);

  // One-time code only (hex). Reject legacy JWT-in-query payloads.
  if (!/^[a-f0-9]{32,}$/i.test(raw)) {
    return null;
  }

  try {
    const res = await fetch('/api/auth/handoff/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code: raw }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      entity: EntityKey;
      user: AuthUser;
    };
    return {
      user: data.user,
      entity: data.entity,
    };
  } catch {
    return null;
  }
}
