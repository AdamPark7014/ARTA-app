/**
 * Imprime los formatos estándar (Arta y Auditorio) con datos de muestra, sin base de datos,
 * para revisar el diseño del PDF a ojo antes de desplegar.
 *
 *   OUT_DIR=C:\tmp\formatos npx ts-node --transpile-only scripts/render-format-samples.ts
 *   (PowerShell: $env:OUT_DIR='C:\tmp\formatos'; npx ts-node ...)
 *
 * Deja `<KEY>.pdf` y `<KEY>.fields.json` por formato. `--empty` los imprime
 * sin datos (como los recibe un evento recién creado). Con
 * `SAMPLE_SIGNATURE=<firma.png>` los imprime firmados (entrega y autorización)
 * para revisar el renglón de firmas al final del documento. Las galerías
 * (Recorrido de seguridad) salen con fotos de `prisma/seed-assets`, un video y
 * una foto HEIC (estos dos como recuadro con link).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { STANDARD_FORMATS } from '../src/checklists/format-catalog';
import { ChecklistPdfService, type PdfMedia } from '../src/checklists/checklist-pdf.service';
import {
  bindFormatToEvent,
  walkFormat,
  YES,
  type FormatAttachmentFile,
  type FormatData,
  type FormatItem,
} from '../src/common/format-schema';

const OUT = process.env.OUT_DIR || join(process.cwd(), 'tmp', 'formatos');
process.env.UPLOAD_DIR = OUT;

const EVENT = {
  name: 'DANIEL BOAVENTURA SINFÓNICO',
  artist: 'Daniel Boaventura',
  promoter: 'Arta Producciones',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  startsAt: new Date('2026-11-16T02:00:00.000Z'),
  schedule: '20:00 a 23:00',
};

const SAMPLE_TEXT: Record<string, string> = {
  nombre: 'Hotel Cartesiano',
  contacto: 'Ana Rivera · 222 555 0101',
  prov: 'Transportes del Valle',
  vans: '3',
  modelo: 'Toyota Hiace 2025',
  incluye: 'Chofer, gasolina y casetas. Disponibilidad 24 h durante el show.',
  observaciones: 'Confirmar con el hotel el late check-out del artista y su equipo.',
  pm_artista: 'Marcos Lima · +55 11 9999 0000',
  pm_promotor: 'Williams Taja · 222 111 2233',
  contacto_venue: 'Rodrigo López · 222 333 4455',
  audio: 'Audio Pro Puebla · 222 777 8899',
  coffee: 'Café La Estación',
  promotores: 'Arta Producciones / OS Lemos',
  boletera: 'Arema',
  sponsors: 'Grupo Radio Centro',
  extras: 'Sinfónica Minería · Mtro. Tomer Adaddi',
  autorizo: 'Arturo Taja',
  hora: '20:00',
  evento: EVENT.name,
  venue: EVENT.venue,
  ciudad: EVENT.city,
  show: EVENT.name,
};

/** Fotos de muestra (las del seed) más un video y una HEIC sin archivo en disco. */
const SAMPLE_PHOTOS = ['seed-hero-1.jpg', 'seed-news-1.jpg', 'seed-hero-2.jpg', 'seed-news-2.jpg', 'seed-hero-3.jpg'];

function sampleMedia(): Record<string, PdfMedia> {
  const dir = join(__dirname, '..', 'prisma', 'seed-assets');
  const media: Record<string, PdfMedia> = {};
  SAMPLE_PHOTOS.forEach((file, i) => {
    const path = join(dir, file);
    if (!existsSync(path)) return;
    media[`foto-${i}`] = {
      path,
      url: `/uploads/${file}`,
      name: `IMG_${4120 + i}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: statSync(path).size,
    };
  });
  media.video = { path: null, url: '/uploads/recorrido.mov', name: 'Recorrido accesos.mov', mimeType: 'video/quicktime', sizeBytes: 86 * 1024 * 1024 };
  media.heic = { path: null, url: '/uploads/salida.heic', name: 'IMG_4131.HEIC', mimeType: 'image/heic', sizeBytes: 2_400_000 };
  return media;
}

const MEDIA = sampleMedia();

function sampleGallery(index: number): FormatAttachmentFile[] {
  const at = (min: number) => new Date(Date.UTC(2026, 10, 16, 2 + Math.floor(min / 60), min % 60)).toISOString();
  const ids = Object.keys(MEDIA);
  // Durante: todo; post: tres fotos y el video.
  const pick = index % 2 ? ids : [ids[0], ids[1], ids[2], 'video'].filter((id) => MEDIA[id]);
  return pick.map((id, i) => ({
    fileId: id,
    name: MEDIA[id].name,
    url: MEDIA[id].url,
    mimeType: MEDIA[id].mimeType,
    sizeBytes: MEDIA[id].sizeBytes,
    at: at(15 + i * 7),
  }));
}

function sampleValue(item: FormatItem, index: number): FormatItem {
  const it: FormatItem = { ...item };
  switch (item.type) {
    case 'check':
    case undefined:
      it.done = index % 3 !== 2;
      if (index % 4 === 0) it.note = 'Proveedor confirmado';
      break;
    case 'text':
      it.value = SAMPLE_TEXT[item.id] ?? (item.id.startsWith('prov_') ? 'Meyer Sound Puebla S.A. de C.V.' : item.id.startsWith('enc_') ? 'Luis Ortega · 222 000 1111' : 'Dato de ejemplo');
      break;
    case 'longtext':
      it.value = SAMPLE_TEXT[item.id] ?? 'Texto largo de ejemplo que se parte en varios renglones dentro del recuadro del formato para comprobar el ajuste.';
      break;
    case 'number':
      it.value = 3;
      break;
    case 'date':
      it.value = '2026-11-15';
      break;
    case 'time':
      it.value = index % 2 ? '14:00' : '10:00';
      break;
    case 'yesno':
      it.value = index % 2 ? YES : 'NO';
      break;
    case 'select':
      it.value = item.options?.[2] ?? item.options?.[0] ?? '';
      break;
    case 'attachment':
      if (item.multiple) {
        it.files = sampleGallery(index);
        break;
      }
      it.value = index % 2 ? 'https://drive.google.com/drive/folders/1IJ_ntDodKv7dd2Jg6y6dTB7UG3cHA6yB' : `${item.label}.pdf`;
      break;
    case 'table': {
      const cols = item.columns ?? [];
      const cell = (c: (typeof cols)[number], r: number) =>
        c.type === 'number' ? (r + 1) * 5 : c.type === 'money' ? 1500 * (r + 1) : c.type === 'time' ? `${10 + r}:00` : c.type === 'date' ? '2026-11-14' : `${c.label} ${r + 1}`;
      // Lista que trae la plantilla (áreas del Auditorio, conceptos): se respeta y se llenan las primeras.
      it.rows = item.rows?.length
        ? item.rows.map((row, r) =>
            r < 3 ? Object.fromEntries(cols.map((c) => [c.id, c.prefilled ? row[c.id] ?? null : cell(c, r)])) : { ...row },
          )
        : Array.from({ length: 4 }, (_, r) => Object.fromEntries(cols.map((c) => [c.id, cell(c, r)])));
      break;
    }
    default:
      break;
  }
  return it;
}

function filled(schema: FormatData): FormatData {
  let i = 0;
  return {
    ...schema,
    sections: schema.sections.map((s) => ({ ...s, items: s.items.map((it) => sampleValue(it, i++)) })),
  };
}

/** Firmas de muestra si se pasó una imagen (`SAMPLE_SIGNATURE`). */
function sampleSignatures() {
  const path = process.env.SAMPLE_SIGNATURE;
  if (!path) return { delivered: null, authorized: null };
  const imageDataUrl = `data:image/png;base64,${readFileSync(path).toString('base64')}`;
  return {
    delivered: { signerName: 'Rodrigo López', imageDataUrl, signedAt: '2026-11-15T22:10:00.000Z' },
    authorized: { signerName: 'Arturo Taja', imageDataUrl, signedAt: '2026-11-16T01:05:00.000Z' },
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const empty = process.argv.includes('--empty');
  const signatures = sampleSignatures();
  const svc = new ChecklistPdfService(null as never);
  for (const format of STANDARD_FORMATS) {
    const base = bindFormatToEvent(format.schema, EVENT);
    const data = empty ? base : filled(base);
    const { fieldMap } = await svc.generate(
      format.key,
      {
        title: format.name,
        eventName: EVENT.name,
        entity: format.entities.includes('EXPLANADA') ? 'EXPLANADA' : 'ARTA',
        artist: EVENT.artist,
        venue: EVENT.venue,
        city: EVENT.city,
        templateKey: format.key,
        data,
        ...signatures,
        editedBy: 'Adam Pozo',
        editedAt: new Date(),
        statusLabel: signatures.delivered ? 'En revisión' : 'Borrador',
        media: MEDIA,
        linkBase: 'https://auditorio.artaproducciones.com',
      },
      3,
    );
    writeFileSync(join(OUT, `${format.key}.fields.json`), JSON.stringify(fieldMap, null, 2));
    const captured = walkFormat(data).length;
    console.log(`${format.key}: ${captured} ítems · ${fieldMap.fields.length} campos sobre la hoja → ${join(OUT, 'checklists', `${format.key}-r3.pdf`)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
