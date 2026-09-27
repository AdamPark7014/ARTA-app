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

/** Opciones de multer compartidas por todo lo que recibe archivos. */
export const MULTER_OPTIONS = {
  storage: diskStorage({
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
  }),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter,
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

const MAGIC_BY_EXT: Record<string, (head: Buffer) => boolean> = {
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
