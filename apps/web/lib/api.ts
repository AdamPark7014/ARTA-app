export type EntityKey = 'ARTA' | 'EXPLANADA';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  title?: string | null;
  roleKey: string;
  entities: EntityKey[];
  permissions: string[];
  organizationId?: string;
  totpEnabled?: boolean;
};

const LEGACY_TOKEN_KEY = 'arta_token';
const ENTITY_KEY = 'arta_entity';

/** Purge any leftover JWT from pre-cookie-only clients. */
export function clearToken() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

export function getActiveEntity(): EntityKey {
  if (typeof window === 'undefined') return 'ARTA';
  return (localStorage.getItem(ENTITY_KEY) as EntityKey) || 'ARTA';
}

export function setActiveEntity(entity: EntityKey) {
  localStorage.setItem(ENTITY_KEY, entity);
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function getCsrfToken(): string | null {
  return readCookie('arta_csrf');
}

export function hasSessionHint(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.includes('arta_session=1');
}

import { shouldAuthRedirectOn401 } from '@/lib/domains';

/**
 * Error del API que conserva el cuerpo.
 *
 * Antes todo se aplanaba a `new Error(string)`, así que un 409 de edición
 * concurrente llegaba a la pantalla como un texto suelto y no había forma de
 * enseñar QUÉ cambió ni ofrecer «conservar lo mío / tomar lo suyo».
 */
export class ApiError<B = unknown> extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: B,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Choque de edición concurrente: alguien guardó mientras editabas. */
export type RevisionConflict = {
  code: 'REVISION_CONFLICT';
  message: string;
  currentRevision: number;
  author?: string | null;
  diff: { changes: FieldChange[]; summary: { added: number; removed: number; changed: number } } | null;
  theirs?: unknown;
};

export type FieldChange = {
  scope: string;
  key: string;
  label: string;
  kind: 'added' | 'removed' | 'changed';
  before: string | null;
  after: string | null;
};

export function isRevisionConflict(e: unknown): e is ApiError<RevisionConflict> {
  return (
    e instanceof ApiError &&
    e.status === 409 &&
    !!e.body &&
    (e.body as RevisionConflict).code === 'REVISION_CONFLICT'
  );
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  clearToken();

  const method = (options.method || 'GET').toUpperCase();
  const headers: HeadersInit = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = getCsrfToken();
    if (csrf) (headers as Record<string, string>)['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  if (res.status === 401) {
    clearToken();
    if (typeof document !== 'undefined') {
      document.cookie = 'arta_session=; Path=/; SameSite=Lax; Max-Age=0';
      document.cookie = 'arta_csrf=; Path=/; SameSite=Lax; Max-Age=0';
      if (shouldAuthRedirectOn401(window.location.pathname, window.location.hostname)) {
        window.location.href = '/login';
      }
    }
    throw new Error('No autorizado');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err?.message || `Error ${res.status}`, res.status, err);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
