export type EntityKey = 'ARTA' | 'EXPLANADA';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  title?: string | null;
  roleKey: string;
  entities: EntityKey[];
  permissions: string[];
};

const TOKEN_KEY = 'arta_token';
const ENTITY_KEY = 'arta_entity';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getActiveEntity(): EntityKey {
  if (typeof window === 'undefined') return 'ARTA';
  return (localStorage.getItem(ENTITY_KEY) as EntityKey) || 'ARTA';
}

export function setActiveEntity(entity: EntityKey) {
  localStorage.setItem(ENTITY_KEY, entity);
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    if (typeof window !== 'undefined') {
      document.cookie = 'arta_session=; Path=/; SameSite=Lax; Max-Age=0';
      window.location.href = '/login';
    }
    throw new Error('No autorizado');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
