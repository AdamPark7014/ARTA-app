import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { attachmentKind, attachmentLabel, chatContentMatches, chatMimeFor, chatRuleFor, utf8FileName } from './chat-attachments';

describe('chat-attachments', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chat-att-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const file = (name: string, bytes: Buffer) => {
    const p = join(dir, name);
    writeFileSync(p, bytes);
    return p;
  };
  const box = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`), Buffer.alloc(16)]);

  it.each([
    ['foto.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])],
    ['IMG_0001.HEIC', box('heic')],
    ['video.mp4', box('isom')],
    ['clip.mov', box('qt  ')],
    ['nota-de-voz.m4a', box('M4A ')],
    ['audio.ogg', Buffer.from('OggS\0\x02\0\0')],
    ['doc.pdf', Buffer.from('%PDF-1.7\n')],
    ['contrato.docx', Buffer.from('PK\x03\x04\x14\0\0\0')],
    ['notas.txt', Buffer.from('hola equipo\n')],
  ])('acepta %s con su firma real', (name, bytes) => {
    expect(chatContentMatches(file(name, bytes), name)).toBe(true);
  });

  it('rechaza archivos renombrados y extensiones fuera de la lista', () => {
    expect(chatContentMatches(file('falso.jpg', Buffer.from('MZ\x90\0\x03\0\0\0')), 'falso.jpg')).toBe(false);
    expect(chatContentMatches(file('falso.mp4', Buffer.from('%PDF-1.4\n')), 'falso.mp4')).toBe(false);
    expect(chatContentMatches(file('bin.txt', Buffer.from([0x68, 0x00, 0x69, 0x00])), 'bin.txt')).toBe(false);
    expect(chatRuleFor('x.html')).toBeNull();
    expect(chatRuleFor('x.svg')).toBeNull();
    expect(chatContentMatches(file('x.exe', Buffer.from('MZ')), 'x.exe')).toBe(false);
  });

  it('el tipo lo decide la extensión; .webm respeta audio', () => {
    expect(chatMimeFor('/uploads/1.heic', 'application/octet-stream')).toBe('image/heic');
    expect(chatMimeFor('/uploads/1.webm', 'audio/webm;codecs=opus')).toBe('audio/webm');
    expect(chatMimeFor('/uploads/1.webm', 'video/webm')).toBe('video/webm');
    expect(chatMimeFor('/uploads/1.jpg', 'text/html')).toBe('image/jpeg');
    expect(attachmentKind(null, '/uploads/1.m4a')).toBe('audio');
  });

  it('etiquetas como WhatsApp', () => {
    expect(attachmentLabel('/uploads/1.jpg', 'foto.jpg')).toBe('📷 Foto');
    expect(attachmentLabel('/uploads/1.mp4', 'video.mp4', 'video/mp4')).toBe('🎥 Video');
    expect(attachmentLabel('/uploads/1.m4a', 'nota-de-voz-123.m4a', 'audio/mp4')).toBe('🎤 Nota de voz');
    expect(attachmentLabel('/uploads/1.mp3', 'cancion.mp3')).toBe('🎵 cancion.mp3');
    expect(attachmentLabel('/uploads/1.pdf', 'x.pdf')).toBe('📄 x.pdf');
  });

  it('nombres con acentos: latin1 de multer → UTF-8, sin romper los que ya vienen bien', () => {
    const asMulter = Buffer.from('cotización año.pdf', 'utf8').toString('latin1');
    expect(utf8FileName(asMulter)).toBe('cotización año.pdf');
    expect(utf8FileName('plain.pdf')).toBe('plain.pdf');
  });
});
