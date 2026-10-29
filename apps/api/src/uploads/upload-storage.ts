import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { closeSync, existsSync, mkdirSync, openSync, readSync, unlinkSync } from 'fs';
import { extname, join, resolve } from 'path';

export const uploadRoot = resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));

/**
 * Los archivos subidos se sirven estáticos en /uploads/* desde el mismo origen
 * que el panel. Un .html o .svg se serviría con un Content-Type que el
 * navegador ejecuta, lo que daría XSS almacenado en una sesión autenticada.
 * Lista blanca por extensión: lo que no esté, se rechaza.
 */
export const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.xlsx',
  '.xls',
  '.csv',
  '.doc',
  '.docx',
]);

/**
 * Fotos y videos del teléfono (iPhone manda HEIC y .mov; Android, .mp4). Solo
 * los acepta `POST /uploads` (adjuntos de un evento o de un formato, p. ej. la
 * galería del Recorrido de seguridad, junta 23-10-2026); el resto de las
 * subidas sigue con `ALLOWED_EXTENSIONS`.
 */
export const MEDIA_EXTENSIONS = new Set(['.heic', '.heif', '.mp4', '.m4v', '.mov', '.webm', '.3gp']);
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.webm', '.3gp']);

/** Tope de un documento o foto (lo de siempre). */
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
/**
 * Tope de un video: un minuto de iPhone en 1080p (H.264) pesa ~60 MB y en HEVC
 * ~40 MB; 250 MB dejan unos 4 minutos. Un 4K largo no entra: se graba en 1080p
 * o se recorta. Traefik no limita el cuerpo y el API escribe a disco (multer).
 */
export const MAX_VIDEO_BYTES = 250 * 1024 * 1024;

/** Tipo que se guarda y se sirve: el `Content-Type` del cliente no siempre viene (HEIC, .mov en Windows). */
const MEDIA_MIME: Record<string, string> = {
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.3gp': 'video/3gpp',
};

export function isVideoFile(fileName: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(fileName || '').toLowerCase());
}

/** MIME de un archivo de fotos o video por su extensión; `null` si no es de esos. */
export function mediaMimeFor(fileName: string): string | null {
  return MEDIA_MIME[extname(fileName || '').toLowerCase()] ?? null;
}

/** El tope que le toca a un archivo según su tipo. */
export function maxBytesFor(fileName: string): number {
  return isVideoFile(fileName) ? MAX_VIDEO_BYTES : MAX_UPLOAD_BYTES;
}

export function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function fileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    cb(new BadRequestException(`Tipo de archivo no permitido: ${ext || '(sin extensión)'}`), false);
    return;
  }
  cb(null, true);
}

const diskUploads = diskStorage({
  destination: (_req: unknown, _file: unknown, cb: (e: Error | null, dest: string) => void) => {
    ensureDir(uploadRoot);
    cb(null, uploadRoot);
  },
  filename: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (e: Error | null, name: string) => void,
  ) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
  },
});

/** Opciones de multer compartidas por todo lo que recibe archivos. */
export const MULTER_OPTIONS = {
  storage: diskUploads,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter,
};

/** Lo de siempre más fotos y videos del teléfono. */
export function mediaFileFilter(
  _req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext) && !MEDIA_EXTENSIONS.has(ext)) {
    cb(new BadRequestException(`Tipo de archivo no permitido: ${ext || '(sin extensión)'}`), false);
    return;
  }
  cb(null, true);
}

/**
 * `POST /uploads`: admite fotos y videos. Multer corta en el tope de video;
 * el de documentos y fotos (40 MB) lo aplica el controlador con `maxBytesFor`
 * en cuanto el archivo llega, y lo que se pase se borra del disco.
 */
export const MEDIA_MULTER_OPTIONS = {
  storage: diskUploads,
  limits: { fileSize: MAX_VIDEO_BYTES },
  fileFilter: mediaFileFilter,
};

/**
 * Comprobación por «magic bytes».
 *
 * La lista blanca de extensiones no basta: el nombre y el `Content-Type` los
 * pone quien sube. Un ejecutable renombrado a `.xlsx` pasaba el filtro y
 * quedaba servido en `/uploads/*`. Aquí se mira el contenido real.
 *
 * `.csv` no tiene firma —es texto— así que se acepta sin comprobar.
 */
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const ascii = (h: Buffer, from: number, to: number) => h.subarray(from, to).toString('latin1');
/** ISO BMFF (mp4, mov, m4v, 3gp): «ftyp» en el byte 4; los .mov viejos empiezan con otro átomo. Igual que el chat. */
const isoBox = (h: Buffer) => ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(ascii(h, 4, 8));
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif']);
const heif = (h: Buffer) => ascii(h, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(h, 8, 12));
const ebml = (h: Buffer) => h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3;

const MAGIC_BY_EXT: Record<string, (head: Buffer) => boolean> = {
  '.heic': heif,
  '.heif': heif,
  '.mp4': isoBox,
  '.m4v': isoBox,
  '.mov': isoBox,
  '.3gp': isoBox,
  '.webm': ebml,
  '.pdf': (h) => h.subarray(0, 4).toString('latin1') === '%PDF',
  // xlsx/docx son zips (OOXML); xls/doc son contenedores OLE2 antiguos
  '.xlsx': (h) => h.subarray(0, 4).toString('latin1') === 'PK\x03\x04',
  '.docx': (h) => h.subarray(0, 4).toString('latin1') === 'PK\x03\x04',
  '.xls': (h) => h.subarray(0, 8).equals(OLE2),
  '.doc': (h) => h.subarray(0, 8).equals(OLE2),
  '.png': (h) => h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.jpg': (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  '.jpeg': (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  '.gif': (h) => /^GIF8[79]a$/.test(h.subarray(0, 6).toString('latin1')),
  '.webp': (h) =>
    h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP',
};

/** `true` si el contenido corresponde de verdad a la extensión declarada. */
export function contentMatchesExtension(filePath: string, fileName: string): boolean {
  const ext = extname(fileName).toLowerCase();
  const check = MAGIC_BY_EXT[ext];
  if (!check) return true; // .csv y cualquier otra extensión permitida sin firma
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const head = Buffer.alloc(16);
    const read = readSync(fd, head, 0, 16, 0);
    if (read < 4) return false;
    return check(head);
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/** Borra del disco un archivo que no pasó la validación. */
export function discardUpload(filePath: string) {
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    /* si el disco falla, el archivo queda huérfano pero no se registra */
  }
}
