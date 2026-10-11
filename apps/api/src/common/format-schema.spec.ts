import { calcProgress } from './checklist-progress';
import {
  bindFormatToEvent,
  capturedRows,
  carryFormatValues,
  columnTotal,
  droppedFormatValues,
  eventDateValue,
  eventTimeValue,
  formatItemDisplay,
  isFormatItemComplete,
  normalizeFormatData,
  signatureLabels,
  tableRows,
  walkFormat,
  YES,
  NO,
  type FormatData,
} from './format-schema';

describe('format-schema · completitud por tipo', () => {
  it('casilla: marcada o no', () => {
    expect(isFormatItemComplete({ id: 'a', label: 'A', type: 'check', done: true })).toBe(true);
    expect(isFormatItemComplete({ id: 'a', label: 'A', done: false })).toBe(false);
  });

  it('texto, hora, fecha, SÍ/NO y opción: con algo escrito', () => {
    expect(isFormatItemComplete({ id: 'a', label: 'A', type: 'time', value: '10:00' })).toBe(true);
    expect(isFormatItemComplete({ id: 'a', label: 'A', type: 'yesno', value: NO })).toBe(true);
    expect(isFormatItemComplete({ id: 'a', label: 'A', type: 'yesno', value: null })).toBe(false);
    expect(isFormatItemComplete({ id: 'a', label: 'A', type: 'longtext', value: '  ' })).toBe(false);
    expect(isFormatItemComplete({ id: 'a', label: 'A', type: 'number', value: 0 })).toBe(true);
  });

  it('tabla: al menos un renglón con contenido (los vacíos de captura no cuentan)', () => {
    const cols = [{ id: 'a', label: 'A' }];
    expect(isFormatItemComplete({ id: 't', label: 'T', type: 'table', columns: cols, rows: [] })).toBe(false);
    expect(isFormatItemComplete({ id: 't', label: 'T', type: 'table', columns: cols, rows: [{ a: '' }, { a: null }] })).toBe(false);
    expect(isFormatItemComplete({ id: 't', label: 'T', type: 'table', columns: cols, rows: [{ a: '' }, { a: 'x' }] })).toBe(true);
    expect(tableRows({ rows: [{ a: '' }, { a: 'x' }] })).toHaveLength(1);
  });

  it('adjunto: link, nombre o archivo enlazado', () => {
    expect(isFormatItemComplete({ id: 'r', label: 'Rider', type: 'attachment', value: '' })).toBe(false);
    expect(isFormatItemComplete({ id: 'r', label: 'Rider', type: 'attachment', value: 'rider.pdf' })).toBe(true);
    expect(isFormatItemComplete({ id: 'r', label: 'Rider', type: 'attachment', value: '', fileId: 'f1' })).toBe(true);
  });
});

describe('format-schema · totales y lectura', () => {
  const pendones = {
    id: 'av',
    label: 'Avenidas',
    type: 'table' as const,
    columns: [
      { id: 'avenida', label: 'Avenida' },
      { id: 'p1', label: 'Primera', type: 'number' as const, total: true },
      { id: 'p2', label: 'Segunda', type: 'number' as const, total: true },
    ],
    rows: [
      { avenida: 'Federal Atlixco', p1: 10, p2: '5' },
      { avenida: 'Camino Real', p1: 4, p2: '' },
      { avenida: '', p1: null, p2: null },
    ],
  };

  it('suma columnas numéricas ignorando vacíos y texto', () => {
    expect(columnTotal(pendones, 'p1')).toBe(14);
    expect(columnTotal(pendones, 'p2')).toBe(5);
    expect(columnTotal({ rows: [{ p1: 'abc' }] }, 'p1')).toBeNull();
  });

  it('lee una tabla como texto por renglón', () => {
    expect(formatItemDisplay(pendones)).toBe('Federal Atlixco · 10 · 5 | Camino Real · 4');
    expect(formatItemDisplay({ ...pendones, rows: [] })).toBeNull();
  });

  it('lee casilla con nota, dinero con centavos y adjunto', () => {
    expect(formatItemDisplay({ id: 'a', label: 'A', type: 'check', done: true, note: 'Meyer' })).toBe('Sí (Meyer)');
    expect(
      formatItemDisplay({
        id: 't',
        label: 'T',
        type: 'table',
        columns: [{ id: 'm', label: 'M', type: 'money' }],
        rows: [{ m: 1500 }],
      }),
    ).toBe('$1,500.00');
    expect(formatItemDisplay({ id: 'r', label: 'R', type: 'attachment', value: '', fileId: 'f' })).toBe('Adjunto');
  });
});

describe('format-schema · enlace con el evento', () => {
  const schema: FormatData = {
    sections: [
      {
        id: 'encabezado',
        title: 'Datos',
        layout: 'header',
        items: [
          { id: 'show', label: 'Show', type: 'text', value: '', bind: 'event.name' },
          { id: 'fecha', label: 'Fecha', type: 'date', value: null, bind: 'event.date' },
          { id: 'hora', label: 'Hora', type: 'text', value: '', bind: 'event.time' },
          { id: 'ciudad', label: 'Ciudad', type: 'text', value: 'Cholula', bind: 'event.city' },
        ],
      },
    ],
  };
  const event = {
    name: 'ANDRÉS PARRA',
    city: 'Puebla',
    startsAt: new Date('2026-11-16T02:30:00.000Z'),
    schedule: '',
  };

  it('rellena lo vacío y respeta lo escrito', () => {
    const out = bindFormatToEvent(schema, event);
    const items = out.sections[0].items;
    expect(items[0].value).toBe('ANDRÉS PARRA');
    expect(items[1].value).toBe('2026-11-15'); // 02:30 UTC = 20:30 en México, día 15
    expect(items[2].value).toBe('20:30');
    expect(items[3].value).toBe('Cholula');
    expect(bindFormatToEvent(schema, event, { overwrite: true }).sections[0].items[3].value).toBe('Puebla');
  });

  it('prefiere el horario capturado a la hora de inicio', () => {
    expect(eventTimeValue({ startsAt: event.startsAt, schedule: '20:00 a 23:00' })).toBe('20:00 a 23:00');
    expect(eventDateValue(null)).toBe('');
    expect(eventDateValue('no-es-fecha')).toBe('');
  });

  it('con varias funciones la hora se lee «16:00 y 20:00»', () => {
    expect(eventTimeValue({ schedule: 'Función 1 — 16:00 · Función 2 — 20:00' })).toBe('16:00 y 20:00');
    expect(eventTimeValue({ schedule: 'Función 1 — 13:00 · Función 2 — 16:00 · Función 3 — 20:00' })).toBe(
      '13:00, 16:00 y 20:00',
    );
    expect(eventTimeValue({ schedule: 'Función 2 — 20:00' })).toBe('20:00');
  });
});

describe('format-schema · migración de respuestas', () => {
  const target: FormatData = {
    sections: [
      {
        id: 'hotel',
        title: 'Hotel',
        items: [
          { id: 'nombre', label: 'Nombre del hotel', type: 'text', value: '' },
          { id: 'desayuno', label: 'Incluye desayuno', type: 'yesno', value: null },
          { id: 'observaciones', label: 'Observaciones', type: 'longtext', value: '' },
        ],
      },
      {
        id: 'party_a',
        title: 'Party A',
        items: [{ id: 'party_a', label: 'Rooming', type: 'table', columns: [{ id: 'nombre', label: 'Nombre' }], rows: [] }],
      },
      {
        id: 'checks',
        title: 'Checks',
        items: [{ id: 'venue_ok', label: 'Venue', type: 'check', done: false }],
      },
    ],
  };
  const previous = {
    sections: [
      {
        id: 'hotel_viejo',
        title: 'Hotel',
        items: [
          { id: 'nombre', label: 'Hotel', type: 'text', value: 'Cartesiano' },
          { id: 'desayuno', label: 'Desayuno', type: 'check', done: true },
          { id: 'habitaciones', label: 'Núm. habitaciones', type: 'number', value: 12 },
        ],
      },
      { id: 'checks', title: 'Checks', items: [{ id: 'venue_ok', label: 'Venue', type: 'check', done: true }] },
    ],
  };

  it('conserva lo capturado por id aunque cambie la sección, y convierte casilla → SÍ/NO', () => {
    const out = carryFormatValues(target, previous);
    const hotel = out.sections[0].items;
    expect(hotel[0].value).toBe('Cartesiano');
    expect(hotel[1].value).toBe(YES);
    expect(hotel[2].value).toBe('');
    expect(out.sections[2].items[0].done).toBe(true);
    // Lo que ya no existe en la plantilla nueva no se cuela.
    expect(JSON.stringify(out)).not.toContain('habitaciones');
  });

  it('aguanta datos viejos incompletos', () => {
    expect(carryFormatValues(target, null).sections).toHaveLength(3);
    expect(carryFormatValues(target, { sections: [{ id: 'x' }] }).sections[0].items[0].value).toBe('');
    expect(normalizeFormatData({ sections: [{ id: 's', items: [{ id: 'y', type: 'yesno', value: 'si' }] }] }).sections[0].items[0].value).toBe(YES);
    expect(normalizeFormatData('basura').sections).toEqual([]);
  });
});

describe('format-schema · formatos del Auditorio (texto fijo, listas de la plantilla, firmas con nombre)', () => {
  const lista = {
    id: 'actividades',
    label: 'Actividades',
    type: 'table' as const,
    columns: [
      { id: 'actividad', label: 'Actividad', prefilled: true },
      { id: 'responsable', label: 'Responsable' },
    ],
    rows: [
      { actividad: 'Bodega', responsable: null },
      { actividad: 'Suites', responsable: null },
    ],
  };

  it('la lista que trae la plantilla no cuenta como captura; lo escrito en otra columna sí', () => {
    expect(isFormatItemComplete(lista)).toBe(false);
    expect(capturedRows(lista)).toHaveLength(0);
    expect(formatItemDisplay(lista)).toBeNull();
    const lleno = { ...lista, rows: [lista.rows[0], { actividad: 'Suites', responsable: 'Ana' }] };
    expect(isFormatItemComplete(lleno)).toBe(true);
    expect(formatItemDisplay(lleno)).toBe('Suites · Ana');
    // Un renglón que la persona agrega solo con la primera columna sí es captura si no hay columnas fijas.
    expect(capturedRows({ ...lista, columns: lista.columns.map((c) => ({ ...c, prefilled: false })) })).toHaveLength(2);
  });

  it('texto fijo: no se captura, no puntúa y no se migra', () => {
    const data: FormatData = {
      sections: [
        {
          id: 'condiciones',
          title: 'Condiciones',
          items: [
            { id: 'c1', label: 'La Producción deberá revisar…', type: 'paragraph' },
            { id: 'enc', label: 'Encargado', type: 'text', value: '' },
          ],
        },
      ],
    };
    expect(isFormatItemComplete(data.sections[0].items[0])).toBe(true);
    expect(walkFormat(data).map(({ item }) => item.id)).toEqual(['enc']);
    expect(calcProgress(data)).toBe(0);
    data.sections[0].items[1].value = 'Luis';
    expect(calcProgress(data)).toBe(100);
    expect(formatItemDisplay(data.sections[0].items[0])).toBeNull();
  });

  it('firmas: ENTREGADO / AUTORIZADO por defecto, o el nombre de cada parte', () => {
    expect(signatureLabels({ sections: [] })).toEqual({ delivered: 'Entregado', authorized: 'Autorizado' });
    expect(signatureLabels(null)).toEqual({ delivered: 'Entregado', authorized: 'Autorizado' });
    const conNombres = {
      sections: [
        {
          id: 'firmas',
          title: 'Firmas',
          items: [
            { id: 'firma_entregado', label: 'Producción externa', type: 'signature' },
            { id: 'firma_autorizado', label: 'Auditorio Explanada Puebla', type: 'signature' },
          ],
        },
      ],
    };
    expect(signatureLabels(conNombres)).toEqual({ delivered: 'Producción externa', authorized: 'Auditorio Explanada Puebla' });
    // Las firmas viejas del seed eran texto: no cambian la etiqueta.
    const viejas = { sections: [{ id: 'firmas', title: 'F', items: [{ id: 'firma_entregado', label: 'Usar botón', type: 'text' }] }] };
    expect(signatureLabels(viejas).delivered).toBe('Entregado');
  });
});

describe('format-schema · droppedFormatValues (no migrar a ciegas)', () => {
  const nuevo: FormatData = {
    sections: [
      { id: 'encabezado', title: 'Datos', items: [{ id: 'evento', label: 'Evento', type: 'text', value: '' }] },
      {
        id: 'mantenimiento',
        title: 'Mantenimiento',
        items: [{ id: 'actividades', label: 'Actividades', type: 'table', columns: [{ id: 'a', label: 'A' }], rows: [] }],
      },
      { id: 'observaciones', title: 'Observaciones', items: [{ id: 'observaciones', label: 'Observaciones', type: 'longtext', value: '' }] },
    ],
  };

  const viejo = (overrides: Record<string, unknown> = {}) => ({
    sections: [
      {
        id: 'encabezado',
        title: 'Datos',
        items: [
          { id: 'evento', label: 'Evento', type: 'text', value: 'SHOW' },
          { id: 'responsable', label: 'Responsable', type: 'text', value: overrides.responsable ?? '' },
        ],
      },
      {
        id: 'hallazgos',
        title: 'Inspección del venue',
        items: [{ id: 'hallazgos', label: 'Hallazgos', type: 'table', columns: [{ id: 'area', label: 'Área' }], rows: overrides.rows ?? [] }],
      },
      { id: 'cierre', title: 'Cierre', items: [{ id: 'inspeccion', label: 'Inspección realizada', type: 'check', done: overrides.done ?? false, note: '' }] },
      { id: 'observaciones', title: 'Observaciones', items: [{ id: 'observaciones', label: 'Observaciones', type: 'longtext', value: 'Todo bien' }] },
    ],
  });

  it('un formato sin nada capturado fuera de lo que sigue existiendo se migra sin pérdida', () => {
    expect(droppedFormatValues(nuevo, viejo())).toEqual([]);
    const out = carryFormatValues(nuevo, viejo());
    expect(out.sections[0].items[0].value).toBe('SHOW');
    expect(out.sections[2].items[0].value).toBe('Todo bien');
  });

  it('reporta lo capturado que se quedaría fuera', () => {
    expect(droppedFormatValues(nuevo, viejo({ responsable: 'Rodrigo', rows: [{ area: 'Baños' }], done: true }))).toEqual([
      'Datos › Responsable',
      'Inspección del venue › Hallazgos',
      'Cierre › Inspección realizada',
    ]);
  });

  it('«Campos adicionales» del evento también cuentan como pérdida', () => {
    const conExtras = {
      sections: [
        ...viejo().sections,
        {
          id: 'extras',
          title: 'Campos adicionales',
          items: [{ id: 'extras', label: 'Campos adicionales', type: 'table', columns: [{ id: 'label', label: 'Etiqueta' }], rows: [{ label: 'Gafete' }] }],
        },
      ],
    };
    expect(droppedFormatValues(nuevo, conExtras)).toEqual(['Campos adicionales › Campos adicionales']);
  });

  it('una tabla que pasa a ser texto (o al revés) también se pierde', () => {
    const tablaATexto: FormatData = {
      sections: [{ id: 's', title: 'S', items: [{ id: 'hallazgos', label: 'Hallazgos', type: 'text', value: '' }] }],
    };
    expect(droppedFormatValues(tablaATexto, viejo({ rows: [{ area: 'Baños' }] }))).toContain('Inspección del venue › Hallazgos');
  });
});
