import { calcProgress } from '../common/checklist-progress';
import {
  HEADER_SECTION_ID,
  SIGNATURES_SECTION_ID,
  bindFormatToEvent,
  isFormatItemComplete,
  signatureLabels,
  walkFormat,
  type FormatItem,
} from '../common/format-schema';
import {
  EXTRA_TEMPLATE_ENTITIES,
  RETIRED_TEMPLATES,
  STANDARD_FORMATS,
  STANDARD_FORMAT_VERSION,
  formatsForEntity,
  standardFormat,
  storedFormatVersion,
} from './format-catalog';

const ARTA_KEYS = [
  'ARTES_SHOWS',
  'CATERING',
  'EVENTO_GENERAL',
  'HOSPEDAJE',
  'PENDONES',
  'PRODUCCION',
  'RUEDA_PRENSA',
  'TRANSPORTACION',
];
const AUDITORIO_KEYS = ['CHECKLIST_AUDITORIO', 'COMPROMISO_HORARIOS', 'LIMPIEZA', 'MANTENIMIENTO'];

/** El ítem `id` del formato `key` (falla si no existe). */
function itemOf(key: string, id: string): FormatItem {
  const hit = walkFormat(standardFormat(key)!.schema).find(({ item }) => item.id === id);
  if (!hit) throw new Error(`${key} no trae ${id}`);
  return hit.item;
}

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
  it('trae los ocho formatos de Arta y los cuatro del Auditorio, con versión y firmas al final', () => {
    expect(STANDARD_FORMATS.map((f) => f.key).sort()).toEqual([...ARTA_KEYS, ...AUDITORIO_KEYS].sort());
    for (const f of STANDARD_FORMATS) {
      expect(storedFormatVersion(f.schema)).toBeGreaterThanOrEqual(3);
      expect(storedFormatVersion(f.schema)).toBeLessThanOrEqual(STANDARD_FORMAT_VERSION);
      expect(f.schema.sections[f.schema.sections.length - 1].id).toBe(SIGNATURES_SECTION_ID);
    }
    expect(Math.max(...STANDARD_FORMATS.map((f) => storedFormatVersion(f.schema)))).toBe(STANDARD_FORMAT_VERSION);
  });

  it('ARTA y Auditorio separados: cada formato es de una sola entidad', () => {
    for (const key of ARTA_KEYS) expect(standardFormat(key)!.entities).toEqual(['ARTA']);
    for (const key of AUDITORIO_KEYS) expect(standardFormat(key)!.entities).toEqual(['EXPLANADA']);
    expect(formatsForEntity('ARTA').map((f) => f.key).sort()).toEqual(ARTA_KEYS);
    expect(formatsForEntity('EXPLANADA').map((f) => f.key).sort()).toEqual(AUDITORIO_KEYS);
    expect(EXTRA_TEMPLATE_ENTITIES).toContainEqual({ key: 'CUSTOM', name: 'Distribución de Pendones (Excel)', entities: ['ARTA'] });
  });

  it('subir el catálogo por el Auditorio no migra los formatos vivos de Arta', () => {
    // El script de actualización compara contra la versión de CADA formato.
    for (const key of ARTA_KEYS) expect(storedFormatVersion(standardFormat(key)!.schema)).toBe(3);
    for (const key of AUDITORIO_KEYS) expect(storedFormatVersion(standardFormat(key)!.schema)).toBe(4);
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
            // Renglones de la plantilla: solo columnas que existen y lo escrito en la primera (prefilled).
            for (const row of i.rows!) for (const k of Object.keys(row)) expect(colIds.has(k)).toBe(true);
            if (i.rows!.length) expect(i.columns![0].prefilled).toBe(true);
            expect(i.columns!.slice(1).some((c) => c.prefilled)).toBe(false);
            // Una tabla recién creada no cuenta como capturada.
            expect(isFormatItemComplete(i)).toBe(false);
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

  /* ── Auditorio (documentos del propio Auditorio, 11-10-2026) ───────────── */

  const event = {
    name: 'SHOW EXPLANADA',
    promoter: 'Promotora Uno',
    venue: 'Auditorio Arema Explanada',
    city: 'Puebla',
    startsAt: new Date('2026-11-16T02:00:00.000Z'),
    schedule: '20:00',
  };

  const labelsOf = (key: string, sectionId: string) =>
    standardFormat(key)!.schema.sections.find((s) => s.id === sectionId)!.items.map((i) => i.label);

  it('Checklist Auditorio: hojas AUDITORIO y MERCH del Excel, encabezado desde el evento', () => {
    const f = standardFormat('CHECKLIST_AUDITORIO')!;
    expect(f.schema.sections.map((s) => s.id)).toEqual([
      HEADER_SECTION_ID,
      'produccion',
      'camerinos',
      'merch',
      'prensa',
      'venue',
      'observaciones',
      SIGNATURES_SECTION_ID,
    ]);
    expect(labelsOf('CHECKLIST_AUDITORIO', HEADER_SECTION_ID)).toEqual(['Evento', 'Showtime', 'Empresa / promotor', 'Boletera']);
    expect(labelsOf('CHECKLIST_AUDITORIO', 'produccion')).toEqual([
      'Load in',
      'Load out',
      'Soundcheck',
      'Rider',
      'Minuto a minuto',
      'Encargado de producción',
      'Pirotecnia',
      'Papirotecnia',
      'CO2',
    ]);
    expect(labelsOf('CHECKLIST_AUDITORIO', 'camerinos')).toEqual([
      'Horarios',
      'Cuántos camerinos',
      'Quick change',
      'Catering caliente (no gas)',
    ]);
    expect(labelsOf('CHECKLIST_AUDITORIO', 'merch')).toEqual([
      'Merch (sí o no)',
      'Porcentaje a cobrar (%)',
      'Operador',
      'Contacto merch del talento',
    ]);
    expect(labelsOf('CHECKLIST_AUDITORIO', 'prensa')).toEqual(['Cuántos medios', 'Cuántas canciones', 'Encargado por promotor']);
    expect(labelsOf('CHECKLIST_AUDITORIO', 'venue')).toEqual([
      'Permisos',
      'Contrato',
      'Apertura de puertas',
      'Apertura de sala',
      'Término del show',
      'Capacidad esperada',
    ]);
    expect(itemOf('CHECKLIST_AUDITORIO', 'rider').type).toBe('attachment');
    expect(itemOf('CHECKLIST_AUDITORIO', 'pirotecnia').type).toBe('yesno');

    const bound = bindFormatToEvent(f.schema, event);
    const header = bound.sections[0].items;
    expect(header.find((i) => i.id === 'evento')!.value).toBe('SHOW EXPLANADA');
    expect(header.find((i) => i.id === 'showtime')!.value).toBe('20:00');
    expect(header.find((i) => i.id === 'promotor')!.value).toBe('Promotora Uno');
  });

  it('Checklist Limpieza: las 15 áreas de la hoja ya escritas y el avance arranca solo con el encabezado', () => {
    const table = itemOf('LIMPIEZA', 'actividades');
    expect(table.columns!.map((c) => c.label)).toEqual(['Actividad', 'Responsable', 'Horario', 'Estatus', 'Observaciones']);
    expect(table.rows!.map((r) => r.actividad)).toEqual([
      'Limpieza camerinos',
      'Limpieza completa PB',
      'Limpieza completa nivel 1',
      'Limpieza completa nivel 2',
      'Limpieza completa camerinos',
      'Baños limpios PB',
      'Baños limpios nivel 1',
      'Baños limpios nivel 2',
      'Limpieza suites',
      'Limpieza escenario',
      'Oficinas arriba',
      'Oficinas abajo',
      'NEXARA',
      'Bodega',
      'Oficina Pau y taquilla',
    ]);
    expect(labelsOf('LIMPIEZA', HEADER_SECTION_ID)).toEqual(['Evento', 'Showtime', 'Capacidad']);
    // Evento y showtime vienen del evento; capacidad y la tabla, no: 2 de 4.
    expect(calcProgress(bindFormatToEvent(standardFormat('LIMPIEZA')!.schema, event))).toBe(50);
  });

  it('Checklist Mantenimiento: las 20 áreas, las columnas del Excel y dos adjuntos por área para las fotos', () => {
    const table = itemOf('MANTENIMIENTO', 'actividades');
    expect(table.columns!.map((c) => c.label)).toEqual([
      'Actividad',
      'Responsable',
      'Fecha de supervisión',
      'Observaciones',
      'Cambios',
      'Fecha de solicitud',
      'Fecha de entrega',
    ]);
    expect(table.columns!.filter((c) => c.type === 'date').map((c) => c.id)).toEqual([
      'fecha_supervision',
      'fecha_solicitud',
      'fecha_entrega',
    ]);
    const areas = table.rows!.map((r) => r.actividad as string);
    expect(areas).toHaveLength(20);
    expect(areas[0]).toBe('Planta de luz de emergencia');
    expect(areas[19]).toBe('Pintura en pasillos segundo piso');

    const fotos = standardFormat('MANTENIMIENTO')!.schema.sections.find((s) => s.id === 'fotos')!.items;
    expect(fotos).toHaveLength(40);
    for (const item of fotos) {
      expect(item.type).toBe('attachment');
      expect(item.optional).toBe(true);
    }
    expect(fotos.map((i) => i.id).slice(0, 2)).toEqual(['obs_planta_de_luz_de_emergencia', 'testigos_planta_de_luz_de_emergencia']);
    expect(fotos[0].label).toBe('Planta de luz de emergencia · foto de observaciones');
    expect(fotos[11].label).toBe('Baños hombres planta baja · testigos (fotos)');
    // Las fotos son opcionales: con el encabezado lleno y nada más, 2 de 3.
    expect(calcProgress(bindFormatToEvent(standardFormat('MANTENIMIENTO')!.schema, event))).toBe(67);
  });

  it('Compromiso de horarios: conceptos del Word, condiciones palabra por palabra y firmas de las dos partes', () => {
    const f = standardFormat('COMPROMISO_HORARIOS')!;
    expect(labelsOf('COMPROMISO_HORARIOS', HEADER_SECTION_ID)).toEqual([
      'Evento',
      'Fecha',
      'Productor / empresa',
      'Encargado de producción',
    ]);
    const table = itemOf('COMPROMISO_HORARIOS', 'horarios');
    expect(table.columns!.map((c) => c.label)).toEqual(['Concepto', 'Horario comprometido', 'Hora real', 'Observaciones']);
    expect(table.rows!.map((r) => r.concepto)).toEqual([
      'Inicio de montaje',
      'Llegada de ambulancia',
      'Llegada de planta de luz / generador eléctrico con caja acústica',
      'Encendido y puesta en operación del generador',
      '',
      'Inicio del show',
      'Fin del show',
      'Inicio de desmontaje',
      'Hora límite para concluir desmontaje',
      'Entrega final de instalaciones',
    ]);

    const condiciones = f.schema.sections.find((s) => s.id === 'condiciones')!.items;
    expect(condiciones).toHaveLength(8);
    for (const c of condiciones) expect(c.type).toBe('paragraph');
    expect(condiciones[0].label).toBe(
      'El escenario e instalaciones serán entregados a la Producción en buenas condiciones de operación, salvo cualquier condición o desperfecto previamente identificado y documentado.',
    );
    expect(condiciones[7].label).toBe(
      'Cualquier modificación a los horarios deberá ser solicitada y autorizada previamente por el responsable del Auditorio.',
    );
    expect(labelsOf('COMPROMISO_HORARIOS', 'cargo_extension')).toEqual([
      'Horario límite de desmontaje',
      'Costo por hora o fracción excedente ($)',
    ]);
    const aceptacion = f.schema.sections.find((s) => s.id === 'aceptacion')!.items;
    expect(aceptacion).toHaveLength(1);
    expect(aceptacion[0].label).toMatch(/^El Encargado de Producción Externa manifiesta conocer y aceptar/);

    expect(signatureLabels(f.schema)).toEqual({ delivered: 'Producción externa', authorized: 'Auditorio Explanada Puebla' });
    // El texto fijo no se captura ni cuenta: evento, fecha y productor vienen del evento → 3 de 7.
    expect(walkFormat(f.schema).some(({ item }) => item.type === 'paragraph')).toBe(false);
    expect(calcProgress(bindFormatToEvent(f.schema, event))).toBe(43);
  });

  it('los formatos de Arta conservan las firmas ENTREGADO / AUTORIZADO', () => {
    for (const key of ARTA_KEYS) {
      expect(signatureLabels(standardFormat(key)!.schema)).toEqual({ delivered: 'Entregado', authorized: 'Autorizado' });
    }
  });
});
