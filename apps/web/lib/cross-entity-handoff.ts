import type { AuthUser } from '@/lib/api';
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
  accessToken: string;
  user: AuthUser;
  entity: EntityKey;
};

export function encodeHandoff(payload: HandoffPayload): string {
  try {
    const json = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(json)));
  } catch {
    return '';
  }
}

export function decodeHandoff(encoded: string): HandoffPayload | null {
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    const data = JSON.parse(json) as HandoffPayload;
    if (!data?.accessToken || !data?.user) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Build absolute URL to the other entity host with optional JWT handoff.
 * On plain localhost (no entity subdomain), returns null → caller uses setEntity.
 */
export function buildCrossEntityUrl(
  targetEntity: EntityKey,
  path: string,
  payload: HandoffPayload | null,
): string | null {
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

  // Local hosts-file: keep same TLD/port; arta.localhost / auditorio.localhost
  if (hostname.endsWith('.localhost')) {
    targetHost = targetEntity === 'ARTA' ? 'arta.localhost' : 'auditorio.localhost';
  } else if (isLocalHostname(hostname) === false && hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    targetHost = targetEntity === 'ARTA' ? ARTA_HOST : AUDITORIO_HOST;
  }

  const base = `${protocol}//${targetHost}${portSuffix}${safePath}`;
  if (!payload) return base;
  const encoded = encodeHandoff(payload);
  return encoded ? `${base}?${HANDOFF_PARAM}=${encoded}` : base;
}

/** Read and strip ?_nxt= from the current URL. */
export function consumeHandoffParam(): HandoffPayload | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(HANDOFF_PARAM);
  if (!raw) return null;

  params.delete(HANDOFF_PARAM);
  const newSearch = params.toString();
  const newUrl =
    window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
  window.history.replaceState(null, '', newUrl);

  return decodeHandoff(raw);
}
