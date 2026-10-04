import { HEADER_SECTION_ID, SIGNATURES_SECTION_ID, walkFormat } from '../common/format-schema';
import { RETIRED_TEMPLATES, STANDARD_FORMATS, STANDARD_FORMAT_VERSION, standardFormat, storedFormatVersion } from './format-catalog';

/**
 * Los índices por módulo (Hospedaje, Transporte, Prensa, Artes) leen estos
 * ids del formato. Si cambian, la columna sale vacía sin que nada falle.
 */
const STABLE_IDS: Record<string, string[]> = {
  HOSPEDAJE: ['nombre', 'contacto', 'desayuno'],
  TRANSPORTACION: ['prov', 'vans', 'modelo', 'contacto'],
  RUEDA_PRENSA: ['venue', 'hora', 'ciudad'],
  ARTES_SHOWS: ['promotores', 'boletera', 'sponsors'],
};

describe('format-catalog', () => {
  it('trae los siete formatos de la carpeta del cliente más Catering y Mantenimiento, con versión', () => {
    expect(STANDARD_FORMATS.map((f) => f.key).sort()).toEqual([
      'ARTES_SHOWS',
      'CATERING',
      'EVENTO_GENERAL',
      'HOSPEDAJE',
      'MANTENIMIENTO',
      'PENDONES',
      'PRODUCCION',
      'RUEDA_PRENSA',
      'TRANSPORTACION',
    ]);
    expect(standardFormat('MANTENIMIENTO')!.entities).toEqual(['EXPLANADA']);
    for (const f of STANDARD_FORMATS) {
      expect(storedFormatVersion(f.schema)).toBe(STANDARD_FORMAT_VERSION);
      expect(f.schema.sections[f.schema.sections.length - 1].id).toBe(SIGNATURES_SECTION_ID);
    }
  });

  it('cada formato abre con el encabezado enlazado al evento', () => {
    for (const f of STANDARD_FORMATS) {
      const header = f.schema.sections[0];
      expect(header.id).toBe(HEADER_SECTION_ID);
      expect(header.layout).toBe('header');
      expect(header.items.some((i) => i.bind === 'event.name')).toBe(true);
      const cols = header.items.reduce((n, i) => n + (i.cols ?? 6), 0);
      expect(cols % 12).toBe(0);
    }
  });

  it('ids únicos por formato y tablas con columnas válidas', () => {
    for (const f of STANDARD_FORMATS) {
      const ids = new Set<string>();
      for (const s of f.schema.sections) {
        expect(s.id).toBeTruthy();
        for (const i of s.items) {
          expect(i.id).toBeTruthy();
          expect(i.label).toBeTruthy();
          expect(ids.has(`${s.id}:${i.id}`)).toBe(false);
          ids.add(`${s.id}:${i.id}`);
          if (i.type === 'table') {
            expect(i.columns?.length).toBeGreaterThan(0);
            const colIds = new Set(i.columns!.map((c) => c.id));
            expect(colIds.size).toBe(i.columns!.length);
            expect(Array.isArray(i.rows)).toBe(true);
          }
          if (i.type === 'select') expect(i.options?.length).toBeGreaterThan(1);
        }
      }
    }
  });

  it('conserva los ids que leen los módulos', () => {
    for (const [key, ids] of Object.entries(STABLE_IDS)) {
      const f = standardFormat(key)!;
      const present = new Set(walkFormat(f.schema).map(({ item }) => item.id));
      for (const id of ids) expect(present.has(id)).toBe(true);
    }
  });

  it('Evento general trae los 42 puntos del Word del cliente', () => {
    const f = standardFormat('EVENTO_GENERAL')!;
    const checks = walkFormat(f.schema).filter(({ item }) => item.type === 'check');
    expect(checks).toHaveLength(42);
    const labels = checks.map(({ item }) => item.label);
    for (const must of ['Planta de luz', 'Permiso pirotecnia', 'Stage hands', 'Pipas de agua', 'DRO', 'Unifilas']) {
      expect(labels).toContain(must);
    }
  });

  it('Pendones suma las tres partes por avenida', () => {
    const f = standardFormat('PENDONES')!;
    const table = walkFormat(f.schema).find(({ item }) => item.type === 'table')!.item;
    expect(table.columns!.filter((c) => c.total).map((c) => c.id)).toEqual(['parte1', 'parte2', 'parte3']);
  });

  it('Rueda de prensa: Convocatoria es el primer rubro y el Timeline va después de medios', () => {
    const sections = standardFormat('RUEDA_PRENSA')!.schema.sections.map((s) => s.id);
    expect(sections.indexOf('convocatoria')).toBe(1);
    expect(sections.indexOf('timeline')).toBe(sections.indexOf('medios') + 1);
    const conv = standardFormat('RUEDA_PRENSA')!.schema.sections.find((s) => s.id === 'convocatoria')!;
    expect(conv.items.map((i) => i.label)).toEqual(['Encargado', 'Drive de contenido para rueda']);
    const timeline = standardFormat('RUEDA_PRENSA')!.schema.sections.find((s) => s.id === 'timeline')!;
    expect(timeline.items.map((i) => i.id)).toEqual(['pre', 'durante', 'despues']);
    for (const t of timeline.items) expect(t.columns!.map((c) => c.id)).toEqual(['hora', 'actividad', 'responsable']);
  });

  it('las plantillas retiradas no se solapan con las estándar', () => {
    const standard = new Set(STANDARD_FORMATS.map((f) => f.key));
    for (const r of RETIRED_TEMPLATES) expect(standard.has(r.key)).toBe(false);
  });
});
