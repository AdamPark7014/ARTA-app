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

// Safari con «Bloquear todas las cookies» (o la vista web de otra app) lanza
// SecurityError al tocar localStorage: la entidad cae a ARTA en vez de romper.
export function getActiveEntity(): EntityKey {
  if (typeof window === 'undefined') return 'ARTA';
  try {
    return (localStorage.getItem(ENTITY_KEY) as EntityKey) || 'ARTA';
  } catch {
    return 'ARTA';
  }
}

export function setActiveEntity(entity: EntityKey) {
  try {
    localStorage.setItem(ENTITY_KEY, entity);
  } catch {
    /* sin almacenamiento local */
  }
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

// ── Mensajes humanos ─────────────────────────────────────────────────────────
//
// Toda falla del API llega a la pantalla ya escrita para una persona: español, una
// línea, qué pasó y qué hacer. Nada de «Error 500», «Internal server error» ni
// «Failed to fetch». El cuerpo crudo sigue en `ApiError.body` para quien lo necesite
// (choques de revisión, depuración).
//
//   try { await api('/tasks', { method: 'POST', body }); }
//   catch (e) { setError(userMessage(e)); }           // ya viene humano
//
//   userMessage(e, 'cargar las órdenes')  →  «No pudimos cargar las órdenes. Intenta de nuevo en un momento.»

export const NETWORK_MESSAGE = 'Sin conexión. Revisa tu internet y vuelve a intentar.';
export const SESSION_MESSAGE = 'Tu sesión terminó. Vuelve a entrar.';

const ENGLISH = /\b(the|must|should|is|are|not found|error|internal|server|failed|cannot|invalid|unauthorized|forbidden|bad request|conflict|property|exists?|required|unexpected|undefined|null|timeout|payload|too large)\b/i;
const SPANISH = /[áéíóúñ¿¡«»]|\b(no|sin|usa|elige|primero|incorrect[oa]|el|la|los|las|de|del|para|ya|un|una|solo|falta|debe|puede|hay|tu|tus|este|esta|ese|esa|\w+(?:ad|id)[oa]s?|\w+ción|permiso|acceso)\b/i;
const CODE_LIKE = /\b(error\s*\d{3}|\(\d{3}\)|prisma|sql|stack|exception|econn\w*)\b/i;
const SHOUTED = /\b[A-Z][A-Z_]{5,}\b/;

/** El texto del servidor sirve tal cual solo si ya es una frase en español, corta y sin códigos. */
function readableServerText(raw: unknown): string | null {
  // La validación del API puede mandar una lista: sirve la primera frase legible.
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const text = readableServerText(item);
      if (text) return text;
    }
    return null;
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || text.length > 180 || text.includes('\n')) return null;
  if (CODE_LIKE.test(text) || SHOUTED.test(text) || ENGLISH.test(text) || !SPANISH.test(text)) return null;
  const first = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?…]$/.test(first) ? first : `${first}.`;
}

function isRead(method: string) {
  return method === 'GET' || method === 'HEAD';
}

/** Frase para una respuesta fallida, por estado. `method` distingue «cargar» de «guardar». */
export function messageForStatus(status: number, body: unknown, method = 'GET'): string {
  const server = readableServerText((body as { message?: unknown } | null)?.message);
  if (status === 0) return NETWORK_MESSAGE;
  if (status === 401) return SESSION_MESSAGE;
  if (status === 403) return server || 'No tienes permiso para esto. Pídeselo a dirección.';
  if (status === 404) return server ? `${server.replace(/\.$/, '')}. Recarga la página.` : 'Ya no existe o lo movieron. Recarga la página.';
  if (status === 409) return server || 'Alguien lo cambió antes que tú. Recarga para ver lo último.';
  if (status === 413) return 'El archivo es demasiado grande. Prueba con uno más ligero.';
  if (status === 429) return server || 'Demasiados intentos seguidos. Espera un momento y vuelve a intentar.';
  if (status === 400 || status === 422) return server || 'Revisa los datos y vuelve a intentar.';
  if (status >= 500 || status === 408) {
    return isRead(method)
      ? 'No pudimos cargar esto. Intenta de nuevo en un momento.'
      : 'No se pudo guardar. Intenta de nuevo en un momento.';
  }
  return server || (isRead(method) ? 'No pudimos cargar esto. Intenta de nuevo.' : 'No se pudo guardar. Intenta de nuevo.');
}

/**
 * Mensaje para la persona a partir de cualquier error atrapado. Con `action`
 * («cargar las órdenes», «guardar la tarea») las fallas genéricas nombran qué falló.
 */
export function userMessage(e: unknown, action?: string): string {
  if (e instanceof ApiError) {
    const generic = e.status === 0 || e.status >= 500 || e.status === 408;
    if (action && generic && e.status !== 0) return `No pudimos ${action}. Intenta de nuevo en un momento.`;
    return e.message;
  }
  if (e instanceof TypeError || (e instanceof Error && /fetch|network|load failed/i.test(e.message))) return NETWORK_MESSAGE;
  if (e instanceof Error) {
    const own = readableServerText(e.message);
    if (own) return own;
  }
  return action ? `No pudimos ${action}. Intenta de nuevo en un momento.` : 'Algo salió mal. Intenta de nuevo en un momento.';
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

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (e) {
    // Una cancelación (AbortController) no es una falla de red: se deja pasar tal cual.
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(NETWORK_MESSAGE, 0, null);
  }
  if (res.status === 401) {
    clearToken();
    if (typeof document !== 'undefined') {
      document.cookie = 'arta_session=; Path=/; SameSite=Lax; Max-Age=0';
      document.cookie = 'arta_csrf=; Path=/; SameSite=Lax; Max-Age=0';
      if (shouldAuthRedirectOn401(window.location.pathname, window.location.hostname)) {
        window.location.href = '/login';
      }
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(SESSION_MESSAGE, 401, body);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(messageForStatus(res.status, err, method), res.status, err);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
