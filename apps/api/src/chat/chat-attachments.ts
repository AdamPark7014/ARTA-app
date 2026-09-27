import { BadRequestException } from '@nestjs/common';
import { closeSync, openSync, readSync } from 'fs';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ensureDir, uploadRoot } from '../uploads/upload-storage';

/** Carpeta propia: `/uploads/chat/*` queda fuera del candado de originales de dirección. */
export const CHAT_UPLOAD_DIR = join(uploadRoot, 'chat');

/**
 * Adjuntos del chat: todo lo que se comparte desde un teléfono (fotos, video,
 * notas de voz, documentos), como en WhatsApp.
 *
 * El tipo lo decide el API por extensión + firma del contenido; el `Content-Type`
 * que manda el cliente no cuenta (salvo `.webm`, que puede ser audio o video).
 * Nada que el navegador ejecute (.html, .svg, .js) entra aquí.
 */
export type AttachmentKind = 'image' | 'video' | 'audio' | 'document';

type Rule = { mime: string; kind: AttachmentKind; magic?: (h: Buffer) => boolean };

const ascii = (h: Buffer, from: number, to: number) => h.subarray(from, to).toString('latin1');
const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const zip = (h: Buffer) => ascii(h, 0, 4) === 'PK\x03\x04';
const ole2 = (h: Buffer) => h.subarray(0, 8).equals(OLE2);
/** ISO BMFF (mp4, mov, m4a, heic, 3gp): «ftyp» en el byte 4; los .mov viejos empiezan con otro átomo. */
const isoBox = (h: Buffer) => ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(ascii(h, 4, 8));
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif']);
const heif = (h: Buffer) => ascii(h, 4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(h, 8, 12));
const ebml = (h: Buffer) => h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3;
const jpeg = (h: Buffer) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff;

export const CHAT_ATTACHMENTS: Record<string, Rule> = {
  // Fotos
  '.jpg': { mime: 'image/jpeg', kind: 'image', magic: jpeg },
  '.jpeg': { mime: 'image/jpeg', kind: 'image', magic: jpeg },
  '.png': { mime: 'image/png', kind: 'image', magic: (h) => ascii(h, 1, 4) === 'PNG' },
  '.gif': { mime: 'image/gif', kind: 'image', magic: (h) => /^GIF8[79]a$/.test(ascii(h, 0, 6)) },
  '.webp': { mime: 'image/webp', kind: 'image', magic: (h) => ascii(h, 0, 4) === 'RIFF' && ascii(h, 8, 12) === 'WEBP' },
  '.heic': { mime: 'image/heic', kind: 'image', magic: heif },
  '.heif': { mime: 'image/heif', kind: 'image', magic: heif },
  // Video
  '.mp4': { mime: 'video/mp4', kind: 'video', magic: isoBox },
  '.m4v': { mime: 'video/mp4', kind: 'video', magic: isoBox },
  '.mov': { mime: 'video/quicktime', kind: 'video', magic: isoBox },
  '.3gp': { mime: 'video/3gpp', kind: 'video', magic: isoBox },
  '.webm': { mime: 'video/webm', kind: 'video', magic: ebml },
  // Audio y notas de voz
  '.m4a': { mime: 'audio/mp4', kind: 'audio', magic: isoBox },
  '.aac': { mime: 'audio/aac', kind: 'audio', magic: (h) => h[0] === 0xff && (h[1] & 0xf6) === 0xf0 },
  '.mp3': { mime: 'audio/mpeg', kind: 'audio', magic: (h) => ascii(h, 0, 3) === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) },
  '.ogg': { mime: 'audio/ogg', kind: 'audio', magic: (h) => ascii(h, 0, 4) === 'OggS' },
  '.opus': { mime: 'audio/ogg', kind: 'audio', magic: (h) => ascii(h, 0, 4) === 'OggS' },
  '.wav': { mime: 'audio/wav', kind: 'audio', magic: (h) => ascii(h, 0, 4) === 'RIFF' && ascii(h, 8, 12) === 'WAVE' },
  // Documentos
  '.pdf': { mime: 'application/pdf', kind: 'document', magic: (h) => ascii(h, 0, 4) === '%PDF' },
  '.doc': { mime: 'application/msword', kind: 'document', magic: ole2 },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'document', magic: zip },
  '.xls': { mime: 'application/vnd.ms-excel', kind: 'document', magic: ole2 },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'document', magic: zip },
  '.ppt': { mime: 'application/vnd.ms-powerpoint', kind: 'document', magic: ole2 },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'document', magic: zip },
  '.pages': { mime: 'application/vnd.apple.pages', kind: 'document', magic: zip },
  '.numbers': { mime: 'application/vnd.apple.numbers', kind: 'document', magic: zip },
  '.key': { mime: 'application/vnd.apple.keynote', kind: 'document', magic: zip },
  '.zip': { mime: 'application/zip', kind: 'document', magic: zip },
  '.csv': { mime: 'text/csv', kind: 'document' },
  '.txt': { mime: 'text/plain', kind: 'document' },
};

export const CHAT_MAX_BYTES = 100 * 1024 * 1024;

export function chatRuleFor(fileName: string): Rule | null {
  return CHAT_ATTACHMENTS[extname(fileName || '').toLowerCase()] ?? null;
}

/** Tipo para servir el archivo: la tabla manda; `.webm` respeta si el cliente dijo audio. */
export function chatMimeFor(fileName: string, clientMime?: string | null): string {
  const ext = extname(fileName || '').toLowerCase();
  const rule = CHAT_ATTACHMENTS[ext];
  if (!rule) return 'application/octet-stream';
  if (ext === '.webm' && (clientMime || '').toLowerCase().startsWith('audio/')) return 'audio/webm';
  return rule.mime;
}

export function attachmentKind(mime: string | null | undefined, url?: string | null): AttachmentKind {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (!m && url) return chatRuleFor(url)?.kind ?? 'document';
  return 'document';
}

/** Texto sin contenido: sin firma no hay nada que comparar, pero no puede traer bytes nulos. */
function looksLikeText(head: Buffer, read: number): boolean {
  return !head.subarray(0, read).includes(0);
}

/** `true` si el contenido real corresponde a la extensión declarada. */
export function chatContentMatches(filePath: string, fileName: string): boolean {
  const rule = chatRuleFor(fileName);
  if (!rule) return false;
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const head = Buffer.alloc(32);
    const read = readSync(fd, head, 0, 32, 0);
    if (!rule.magic) return read === 0 || looksLikeText(head, read);
    if (read < 4) return false;
    return rule.magic(head);
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export const CHAT_MULTER_OPTIONS = {
  storage: diskStorage({
    destination: (_req: unknown, _file: unknown, cb: (e: Error | null, dest: string) => void) => {
      ensureDir(CHAT_UPLOAD_DIR);
      cb(null, CHAT_UPLOAD_DIR);
    },
    filename: (_req: unknown, file: Express.Multer.File, cb: (e: Error | null, name: string) => void) => {
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${unique}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: CHAT_MAX_BYTES },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (error: Error | null, accept: boolean) => void) => {
    if (!chatRuleFor(file.originalname)) {
      cb(new BadRequestException('Ese tipo de archivo no se puede compartir en el chat'), false);
      return;
    }
    cb(null, true);
  },
};

/** Multer entrega el nombre como latin1; los teléfonos lo mandan en UTF-8 («cotización.pdf»). */
export function utf8FileName(original: string): string {
  const decoded = Buffer.from(original, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? original : decoded;
}

/** Etiqueta del aviso y de la lista de chats, como WhatsApp («📷 Foto», «🎤 Nota de voz»). */
export function attachmentLabel(url: string, name: string | null, mime?: string | null): string {
  switch (attachmentKind(mime, url)) {
    case 'image':
      return '📷 Foto';
    case 'video':
      return '🎥 Video';
    case 'audio':
      return /^nota[-_ ]de[-_ ]voz/i.test(name || '') ? '🎤 Nota de voz' : `🎵 ${name || 'Audio'}`;
    default:
      return `📄 ${name || 'Documento'}`;
  }
}
