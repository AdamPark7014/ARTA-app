import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../common/prisma/prisma.service';
import { sha256Hex } from '../common/crypto';

/**
 * Quién puede bajar un archivo de `/uploads` sin pasar por un endpoint con permisos.
 *
 * Público (sin sesión): solo imágenes sueltas en la raíz de `/uploads` (`/uploads/x.jpg`) y las
 * imágenes de `uploads/site/` (portada y galería del sitio). Ahí viven las fotos del sitio público (carrusel, noticias, pósters de Studio) y el
 * buscador las indexa (`robots.ts`). Todo lo demás —PDF, Excel, Word, audio, video,
 * y cualquier subcarpeta (`chat/`, `documents/`, `testigos/`, `checklists/`, …)—
 * pide una sesión válida del panel (cookie `arta_access` con sesión viva en BD) o del
 * portal de proveedores (cookie/Bearer `arta_vendor`).
 *
 * Las apps móviles ya mandan la cookie en imágenes, audio y video (Coil/OkHttp con el
 * cookie jar; iOS con `HTTPCookieStorage.shared` y `AVURLAssetHTTPCookiesKey`).
 */
const PUBLIC_IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif']);

/** Carpetas cuyas imágenes usa el sitio público (portada y galería viven en `uploads/site/…`). */
const PUBLIC_IMAGE_DIRS = ['site/'];

/** `/uploads/foto.jpg` y `/uploads/site/galeria/foto.jpg` sí; `/uploads/chat/foto.jpg` o `/uploads/x.pdf` no. */
export function isPublicUpload(rawPath: string): boolean {
  // El servidor de archivos decodifica la ruta: se revisa ya decodificada para que `%2e%2e` no
  // salte de `site/` a otra carpeta.
  let path: string;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return false;
  }
  if (path.includes('%') || path.includes('\0')) return false;
  if (!path.startsWith('/uploads/')) return false;
  const rest = path.slice('/uploads/'.length);
  if (!rest || rest.includes('\\') || rest.includes('..') || rest.includes('//')) return false;
  const ext = rest.toLowerCase().split('.').pop() || '';
  if (!PUBLIC_IMAGE_EXT.has(ext)) return false;
  if (!rest.includes('/')) return true;
  return PUBLIC_IMAGE_DIRS.some((dir) => rest.startsWith(dir));
}

type StaffPayload = { sub?: string; jti?: string; roleKey?: string; organizationId?: string | null };

/** Caché corta para no consultar la sesión en cada miniatura del chat. */
const SESSION_TTL_MS = 60_000;
const sessionCache = new Map<string, { ok: boolean; at: number }>();

async function liveStaffSession(prisma: PrismaService, jti: string): Promise<boolean> {
  const hit = sessionCache.get(jti);
  if (hit && Date.now() - hit.at < SESSION_TTL_MS) return hit.ok;
  let ok = false;
  try {
    const session = await prisma.userSession.findFirst({
      where: { tokenHash: sha256Hex(jti) },
      select: { revokedAt: true, expiresAt: true, user: { select: { accessExpiresAt: true } } },
    });
    const until = session?.user?.accessExpiresAt;
    ok =
      !!session &&
      !session.revokedAt &&
      session.expiresAt > new Date() &&
      !(until && until.getTime() < Date.now());
  } catch {
    ok = false;
  }
  if (sessionCache.size > 5000) sessionCache.clear();
  sessionCache.set(jti, { ok, at: Date.now() });
  return ok;
}

/** Solo para pruebas. */
export function clearUploadSessionCache() {
  sessionCache.clear();
}

export type UploadViewer =
  | { kind: 'staff'; payload: StaffPayload }
  | { kind: 'vendor' }
  | null;

/** Sesión del panel o del portal de proveedores que autoriza bajar archivos privados. */
export async function resolveUploadViewer(
  req: { cookies?: Record<string, string>; headers: Record<string, string | string[] | undefined> },
  jwt: JwtService,
  prisma: PrismaService,
): Promise<UploadViewer> {
  const staff = req.cookies?.arta_access;
  if (staff) {
    try {
      const payload = await jwt.verifyAsync<StaffPayload>(staff);
      if (payload?.sub && payload.jti && (await liveStaffSession(prisma, payload.jti))) {
        return { kind: 'staff', payload };
      }
    } catch {
      /* sigue con proveedor */
    }
  }
  const auth = req.headers.authorization;
  const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const vendor = bearer || req.cookies?.arta_vendor;
  if (vendor) {
    try {
      const payload = await jwt.verifyAsync<{ typ?: string; pinId?: string }>(vendor);
      if (payload?.typ === 'vendor' && payload.pinId) return { kind: 'vendor' };
    } catch {
      /* sin sesión */
    }
  }
  return null;
}
