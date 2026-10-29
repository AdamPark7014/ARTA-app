import { closeSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  MEDIA_EXTENSIONS,
  contentMatchesExtension,
  discardUpload,
  maxBytesFor,
  mediaFileFilter,
  mediaMimeFor,
} from './upload-storage';

/**
 * La lista blanca de extensiones no bastaba: el nombre y el `Content-Type` los
 * pone quien sube, así que un ejecutable renombrado a `.xlsx` quedaba servido
 * en `/uploads/*` desde el mismo origen que el panel.
 */
describe('contentMatchesExtension', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'arta-upload-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, bytes: Buffer | string): string {
    const path = join(dir, name);
    writeFileSync(path, bytes);
    return path;
  }

  it('acepta un PDF de verdad', () => {
    const p = write('ok.pdf', Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1'));
    expect(contentMatchesExtension(p, 'ok.pdf')).toBe(true);
  });

  it('rechaza un ejecutable renombrado a .pdf', () => {
    const p = write('malo.pdf', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]));
    expect(contentMatchesExtension(p, 'malo.pdf')).toBe(false);
  });

  it('acepta un .xlsx (zip OOXML)', () => {
    const p = write('libro.xlsx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));
    expect(contentMatchesExtension(p, 'libro.xlsx')).toBe(true);
  });

  it('rechaza un .xlsx que en realidad es HTML', () => {
    const p = write('falso.xlsx', '<html><script>alert(1)</script></html>');
    expect(contentMatchesExtension(p, 'falso.xlsx')).toBe(false);
  });

  it('reconoce PNG, JPEG y GIF', () => {
    const png = write('a.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const jpg = write('a.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
    const gif = write('a.gif', Buffer.from('GIF89a-----', 'latin1'));
    expect(contentMatchesExtension(png, 'a.png')).toBe(true);
    expect(contentMatchesExtension(jpg, 'a.jpg')).toBe(true);
    expect(contentMatchesExtension(gif, 'a.gif')).toBe(true);
  });

  it('deja pasar el .csv, que es texto y no tiene firma', () => {
    const p = write('datos.csv', 'concepto,monto\nAudio,12000\n');
    expect(contentMatchesExtension(p, 'datos.csv')).toBe(true);
  });

  it('rechaza un archivo demasiado corto para tener firma', () => {
    const p = write('corto.pdf', Buffer.from([0x25]));
    expect(contentMatchesExtension(p, 'corto.pdf')).toBe(false);
  });

  it('rechaza si el archivo no existe', () => {
    expect(contentMatchesExtension(join(dir, 'no-existe.pdf'), 'no-existe.pdf')).toBe(false);
  });

  it('la lista blanca sigue cubriendo lo que el panel acepta', () => {
    for (const ext of ['.pdf', '.xlsx', '.csv', '.png', '.jpg']) {
      expect(ALLOWED_EXTENSIONS.has(ext)).toBe(true);
    }
    expect(ALLOWED_EXTENSIONS.has('.html')).toBe(false);
    expect(ALLOWED_EXTENSIONS.has('.svg')).toBe(false);
  });

  it('discardUpload borra el archivo rechazado y no revienta si ya no está', () => {
    const p = write('tirar.pdf', Buffer.from('%PDF', 'latin1'));
    discardUpload(p);
    expect(contentMatchesExtension(p, 'tirar.pdf')).toBe(false);
    expect(() => discardUpload(p)).not.toThrow();
  });

  it('no deja descriptores abiertos al comprobar muchas veces', () => {
    const p = write('muchas.pdf', Buffer.from('%PDF-1.4', 'latin1'));
    for (let i = 0; i < 500; i += 1) contentMatchesExtension(p, 'muchas.pdf');
    // Si `contentMatchesExtension` filtrara descriptores, esto lanzaría EMFILE.
    const fd = openSync(p, 'r');
    closeSync(fd);
    expect(contentMatchesExtension(p, 'muchas.pdf')).toBe(true);
  });
});

/*
 * Fotos y videos del teléfono para la galería del Recorrido de seguridad
 * (junta 23-10-2026): HEIC y .mov del iPhone, .mp4 de Android. Entran solo por
 * `POST /uploads` (`MEDIA_MULTER_OPTIONS`) y también se revisa su contenido.
 */
describe('fotos y videos del teléfono', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'arta-media-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, bytes: Buffer): string {
    const path = join(dir, name);
    writeFileSync(path, bytes);
    return path;
  }

  const box = (type: string, brand: string) =>
    Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(type + brand, 'latin1'), Buffer.alloc(16)]);

  it('acepta mp4, mov y HEIC de verdad', () => {
    expect(contentMatchesExtension(write('a.mp4', box('ftyp', 'isom')), 'a.mp4')).toBe(true);
    expect(contentMatchesExtension(write('a.mov', box('ftyp', 'qt  ')), 'IMG_0001.MOV')).toBe(true);
    expect(contentMatchesExtension(write('viejo.mov', box('wide', '\0\0\0\0')), 'viejo.mov')).toBe(true);
    expect(contentMatchesExtension(write('a.heic', box('ftyp', 'heic')), 'IMG_0001.HEIC')).toBe(true);
  });

  it('rechaza un ejecutable o un JPG renombrados a video o HEIC', () => {
    const exe = write('malo.mp4', Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00', 'latin1'));
    expect(contentMatchesExtension(exe, 'malo.mp4')).toBe(false);
    const jpg = write('foto.heic', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
    expect(contentMatchesExtension(jpg, 'foto.heic')).toBe(false);
  });

  it('el filtro de medios deja pasar documentos, fotos y videos, pero no HTML ni SVG', () => {
    const accept = (name: string) =>
      new Promise<boolean>((resolve) => mediaFileFilter(null, { originalname: name } as Express.Multer.File, (err, ok) => resolve(!err && ok)));
    return Promise.all([
      accept('IMG_0001.MOV'),
      accept('IMG_0002.HEIC'),
      accept('recorrido.mp4'),
      accept('acta.pdf'),
      accept('pagina.html'),
      accept('logo.svg'),
    ]).then((r) => expect(r).toEqual([true, true, true, true, false, false]));
  });

  it('los videos no entran por las demás subidas (la lista de siempre no cambia)', () => {
    for (const ext of MEDIA_EXTENSIONS) expect(ALLOWED_EXTENSIONS.has(ext)).toBe(false);
  });

  it('tope por tipo y MIME por extensión', () => {
    expect(maxBytesFor('recorrido.mov')).toBe(MAX_VIDEO_BYTES);
    expect(maxBytesFor('IMG_1.HEIC')).toBe(MAX_UPLOAD_BYTES);
    expect(maxBytesFor('acta.pdf')).toBe(MAX_UPLOAD_BYTES);
    expect(MAX_VIDEO_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES);
    expect(mediaMimeFor('IMG_1.MOV')).toBe('video/quicktime');
    expect(mediaMimeFor('IMG_1.heic')).toBe('image/heic');
    expect(mediaMimeFor('acta.pdf')).toBeNull();
  });
});
