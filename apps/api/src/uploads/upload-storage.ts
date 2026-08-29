import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';

export const uploadRoot = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');

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
