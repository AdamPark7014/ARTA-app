import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ChecklistPdfService } from './checklist-pdf.service';
import { STANDARD_FORMATS } from './format-catalog';
import { bindFormatToEvent, walkFormat, YES } from '../common/format-schema';

/**
 * El generador REAL imprime cada formato estándar y tiene que dejar un campo
 * de captura por cada dato que se escribe sobre la hoja. Sin base de datos:
 * `generate()` solo necesita el disco.
 */
describe('ChecklistPdfService.generate', () => {
  // Doce formatos reales con imágenes de marca: con la máquina cargada pasan de 5 s.
  jest.setTimeout(30_000);
  let dir: string;
  const previousUploadDir = process.env.UPLOAD_DIR;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'arta-formatos-'));
    process.env.UPLOAD_DIR = dir;
  });

  afterAll(() => {
    process.env.UPLOAD_DIR = previousUploadDir;
    rmSync(dir, { recursive: true, force: true });
  });

  const event = {
    name: 'ANDRÉS PARRA',
    artist: 'Andrés Parra',
    venue: 'Auditorio Arema',
    city: 'Puebla',
    startsAt: new Date('2026-11-16T02:00:00.000Z'),
    schedule: '20:00 a 23:00',
  };

  const svc = () => new ChecklistPdfService(null as never);

  it.each(STANDARD_FORMATS.map((f) => [f.key, f] as const))('imprime %s con un campo por dato', async (_key, format) => {
    const data = bindFormatToEvent(format.schema, event);
    const { url, filePath, fieldMap } = await svc().generate(`test-${format.key}`, {
      title: format.name,
      eventName: event.name,
      entity: 'ARTA',
      artist: event.artist,
      venue: event.venue,
      city: event.city,
      templateKey: format.key,
      data,
      delivered: null,
      authorized: null,
      statusLabel: 'Borrador',
    });

    expect(url).toBe(`/uploads/checklists/test-${format.key}.pdf`);
    expect(statSync(filePath).size).toBeGreaterThan(2000);
    const bytes = readFileSync(filePath);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

    // Un campo por ítem capturable (las tablas se llenan en el formulario).
    const expected = walkFormat(data).filter(({ item }) => item.type !== 'table');
    const keys = new Set(fieldMap.fields.map((f) => `${f.sectionId}:${f.itemId}`));
    for (const { section, item } of expected) expect(keys.has(`${section.id}:${item.id}`)).toBe(true);
    expect(fieldMap.fields.some((f) => f.type === 'check') || format.key !== 'EVENTO_GENERAL').toBe(true);

    // Todo dentro de la hoja y por encima del pie.
    for (const f of fieldMap.fields) {
      expect(f.page).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeGreaterThanOrEqual(40);
      expect(f.x + f.w).toBeLessThanOrEqual(fieldMap.pageWidth - 40);
      expect(f.y).toBeGreaterThan(60);
      expect(f.y + f.h).toBeLessThan(fieldMap.pageHeight - 90);
    }
  });

  /*
   * Junta del 23-10-2026: «que las firmas vengan abajo inmersas dentro del
   * documento, no hasta arriba». El Checklist de hospedaje lleno dejaba las
   * firmas solas al principio de la hoja 2; ahora la última sección (o su
   * último tramo, si cruza de hoja) se va con ellas y quedan debajo.
   */
  it.each(STANDARD_FORMATS.map((f) => [f.key, f] as const))('%s: las firmas van al final, junto a la última sección', async (_key, format) => {
    const data = bindFormatToEvent(format.schema, event);
    for (const { item } of walkFormat(data)) {
      if (item.type === 'table') {
        const cols = item.columns ?? [];
        item.rows = Array.from({ length: Math.max(4, item.rows?.length ?? 0) }, (_, r) =>
          Object.fromEntries(cols.map((c) => [c.id, c.type === 'number' || c.type === 'money' ? r + 1 : `${c.label} ${r + 1}`])),
        );
      } else if (item.type === 'check' || !item.type) item.done = true;
      else if (item.type === 'yesno') item.value = YES;
      else item.value = item.type === 'longtext' ? 'Texto largo de ejemplo para el recuadro del formato.' : 'Dato';
    }
    const { layout } = await svc().generate(`test-firmas-${format.key}`, {
      title: format.name,
      eventName: event.name,
      entity: 'ARTA',
      data,
      delivered: null,
      authorized: null,
      statusLabel: 'Borrador',
    });
    // Sin salto de hoja entre lo último escrito y las firmas: nunca solas arriba.
    expect(layout.signatures).toEqual(layout.contentEnd);
    expect(layout.lastSection).not.toBeNull();
    expect(layout.signatures.page).toBeGreaterThanOrEqual(layout.lastSection!.page);
  });

  it('con datos, tablas largas y firmas sigue cabiendo y pagina', async () => {
    const format = STANDARD_FORMATS.find((f) => f.key === 'HOSPEDAJE')!;
    const data = bindFormatToEvent(format.schema, event);
    for (const { item } of walkFormat(data)) {
      if (item.type === 'table') {
        item.rows = Array.from({ length: 40 }, (_, i) => ({ nombre: `Persona ${i + 1}`, habitacion: String(100 + i), checkin: '2026-11-14', checkout: '2026-11-16', confirmacion: `C${i}`, notas: '' }));
      } else if (item.type === 'yesno') item.value = YES;
      else if (item.type === 'text' || item.type === 'longtext') item.value = 'Texto de prueba con acentos: ñ, á, é — y comillas “raras”';
    }
    const sig = {
      signerName: 'Arturo Taja',
      signedAt: '2026-09-23T20:00:00.000Z',
      imageDataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    };
    const { filePath, fieldMap, layout } = await svc().generate(
      'test-largo',
      {
        title: format.name,
        eventName: event.name,
        entity: 'EXPLANADA',
        data,
        delivered: sig,
        authorized: sig,
        editedBy: 'Adam',
        editedAt: new Date(),
        statusLabel: 'En revisión',
      },
      7,
    );
    expect(filePath.endsWith('test-largo-r7.pdf')).toBe(true);
    // 40 renglones por tabla: aunque el documento pagine, las firmas cierran
    // la última hoja junto a la última sección («Confirmaciones»).
    expect(layout.signatures).toEqual(layout.contentEnd);
    expect(layout.signatures.page).toBe(layout.lastSection!.page);
    const pages = (readFileSync(filePath, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(Math.max(...fieldMap.fields.map((f) => f.page))).toBeGreaterThanOrEqual(0);
  });

  const pageCount = (filePath: string) => (readFileSync(filePath, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;

  it('una celda larga se imprime completa: la fila crece en vez de cortar el texto', async () => {
    const format = STANDARD_FORMATS.find((f) => f.key === 'MANTENIMIENTO')!;
    const base = bindFormatToEvent(format.schema, event);
    const input = (data: typeof base) => ({
      title: format.name,
      eventName: event.name,
      entity: 'EXPLANADA',
      data,
      delivered: null,
      authorized: null,
      statusLabel: 'Borrador',
    });
    const vacio = await svc().generate('test-mant-vacio', input(base));

    const largo = 'Se revisó a fondo y hay que cambiar piezas, pintar, limpiar filtros y volver a revisar con el proveedor la semana próxima';
    const lleno = JSON.parse(JSON.stringify(base)) as typeof base;
    for (const { item } of walkFormat(lleno)) {
      if (item.type === 'table') item.rows = item.rows!.map((r) => ({ ...r, responsable: 'Mantenimiento', observaciones: largo, cambios: largo }));
    }
    const conTexto = await svc().generate('test-mant-lleno', input(lleno));
    expect(pageCount(conTexto.filePath)).toBeGreaterThan(pageCount(vacio.filePath));
    for (const f of conTexto.fieldMap.fields) expect(f.y + f.h).toBeLessThan(conTexto.fieldMap.pageHeight - 90);
  });

  it('el texto fijo del Compromiso de horarios no deja campos de captura', async () => {
    const format = STANDARD_FORMATS.find((f) => f.key === 'COMPROMISO_HORARIOS')!;
    const { fieldMap } = await svc().generate('test-compromiso', {
      title: format.name,
      eventName: event.name,
      entity: 'EXPLANADA',
      data: bindFormatToEvent(format.schema, event),
      delivered: null,
      authorized: null,
      statusLabel: 'Borrador',
    });
    const sections = new Set(fieldMap.fields.map((f) => f.sectionId));
    expect(sections.has('condiciones')).toBe(false);
    expect(sections.has('aceptacion')).toBe(false);
    expect(sections.has('cargo_extension')).toBe(true);
  });
});
