/**
 * Catálogo de formatos estándar de Arta — versión 2 (23-09-2026).
 *
 * Fuente: carpeta «FORMATOS ARTA» de Drive (gerencia@artaproductions.com):
 * CHECKLIST EVENTO GENERAL · PRODUCCIÓN · HOSPEDAJE · TRANSPORTACIÓN · RUEDA
 * DE PRENSA · INFO ARTES SHOWS (Word) y DISTRIBUCIÓN PENDONES (Excel). Cada
 * formato de aquí reproduce los campos del cliente en su orden y con sus
 * palabras; lo que en Word era un «BOTÓN» es un adjunto o una tabla que se
 * captura dentro del sistema, y lo que era «SÍ / NO» es un campo `yesno`.
 *
 * ORDEN DE COMPRA y CREACIÓN BOLETERA no viven aquí: son módulos propios con
 * su PDF (`lib/po-pdf.ts`, `lib/boletera-pdf.ts`). Sus plantillas-checklist
 * duplicadas se retiran (ver `RETIRED_TEMPLATES`).
 *
 * Los ids de ítem son estables: los índices por módulo (Hospedaje, Transporte,
 * Prensa, Artes) leen `nombre`, `contacto`, `prov`, `vans`, `modelo`, `venue`,
 * `hora`, `ciudad`, `promotores`, `boletera`, `sponsors` — no cambiarlos.
 *
 * ARTA y Auditorio son negocios separados (11-10-2026, ver
 * `docs/entidades-arta-auditorio.md`): los formatos de Arta van solo a eventos
 * de Arta y el Auditorio (`EXPLANADA`) tiene los suyos, tomados de sus propios
 * documentos: CHECKLIST AUDITORIO.xlsx (hojas AUDITORIO + MERCH, LIMPIEZA y
 * MANTENIMIENTO) y Compromiso de horarios — Día del show (Word).
 */
import type { ChecklistTemplateKey, EntityKey } from '@prisma/client';
import {
  HEADER_SECTION_ID,
  SIGNATURES_SECTION_ID,
  type FormatColumn,
  type FormatData,
  type FormatItem,
  type FormatRow,
  type FormatSection,
} from '../common/format-schema';

/**
 * Sube cuando cambie la forma de algún formato estándar.
 * v3 (30-09-2026): Rueda de Prensa con Convocatoria y Timeline.
 * v4 (11-10-2026): formatos del Auditorio (Checklist Auditorio, Limpieza,
 *   Compromiso de horarios) y Mantenimiento rehecho con el Excel del Auditorio.
 *
 * Cada formato guarda en `formatVersion` la versión del catálogo en la que
 * cambió por última vez. El script de actualización solo sube (y migra) los
 * que están por debajo de la suya: un formato nuevo del Auditorio no reescribe
 * los formatos vivos de Arta.
 */
export const STANDARD_FORMAT_VERSION = 4;

/** Última versión en la que cambiaron los formatos de Arta. */
const ARTA_FORMATS_VERSION = 3;

/** Versión de los formatos del Auditorio. */
const AUDITORIO_FORMATS_VERSION = 4;

export type StandardFormat = {
  key: ChecklistTemplateKey;
  name: string;
  description: string;
  entities: EntityKey[];
  schema: FormatData;
};

/* ── Constructores ─────────────────────────────────────────────────────── */

const text = (id: string, label: string, extra: Partial<FormatItem> = {}): FormatItem => ({
  id,
  label,
  type: 'text',
  value: '',
  ...extra,
});

const longtext = (id: string, label: string, extra: Partial<FormatItem> = {}): FormatItem => ({
  id,
  label,
  type: 'longtext',
  value: '',
  ...extra,
});

const yesno = (id: string, label: string): FormatItem => ({ id, label, type: 'yesno', value: null });

const date = (id: string, label: string, extra: Partial<FormatItem> = {}): FormatItem => ({
  id,
  label,
  type: 'date',
  value: null,
  ...extra,
});

const time = (id: string, label: string): FormatItem => ({ id, label, type: 'time', value: '' });

const number = (id: string, label: string): FormatItem => ({ id, label, type: 'number', value: null });

const attachment = (id: string, label: string, extra: Partial<FormatItem> = {}): FormatItem => ({
  id,
  label,
  type: 'attachment',
  value: '',
  fileId: null,
  ...extra,
});

const col = (id: string, label: string, extra: Partial<FormatColumn> = {}): FormatColumn => ({
  id,
  label,
  type: 'text',
  ...extra,
});

const table = (
  id: string,
  label: string,
  columns: FormatColumn[],
  extra: Partial<FormatItem> = {},
): FormatItem => ({
  id,
  label,
  type: 'table',
  columns,
  rows: [],
  minRows: 6,
  ...extra,
});

/** Texto fijo del documento (condición, cláusula): se imprime tal cual. */
const paragraph = (id: string, text: string): FormatItem => ({ id, label: text, type: 'paragraph' });

/**
 * Tabla que nace con la lista de la plantilla escrita en la primera columna
 * (las actividades del Excel, los conceptos del Word), como la hoja del
 * cliente. Esa columna es `prefilled`: no cuenta como captura.
 */
const listTable = (
  id: string,
  label: string,
  columns: FormatColumn[],
  entries: string[],
  extra: Partial<FormatItem> = {},
): FormatItem => {
  const [first, ...rest] = columns;
  const lead: FormatColumn = { ...first, prefilled: true };
  const rows: FormatRow[] = entries.map((entry) => ({
    [lead.id]: entry,
    ...Object.fromEntries(rest.map((c) => [c.id, null])),
  }));
  return table(id, label, [lead, ...rest], { rows, minRows: entries.length, ...extra });
};

/** `Baños hombres planta baja` → `banos_hombres_planta_baja` (ids estables). */
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/** Renglones de un cronograma: hora, qué pasa y quién lo lleva. */
const timelineColumns = (): FormatColumn[] => [
  col('hora', 'Hora', { type: 'time', width: 1 }),
  col('actividad', 'Actividad', { width: 3 }),
  col('responsable', 'Responsable', { width: 2 }),
];

const checks = (id: string, title: string, entries: Array<[string, string]>): FormatSection => ({
  id,
  title,
  layout: 'columns',
  items: entries.map(([itemId, label]) => ({
    id: itemId,
    label,
    type: 'check' as const,
    done: false,
    note: '',
  })),
});

/**
 * Encabezado de los Word del cliente:
 *   NOMBRE DEL SHOW ·· FECHA ·· HORA
 *   CIUDAD ·········· VENUE
 * Se rellena solo desde el evento al crear el formato.
 */
function header(options: { city?: boolean } = {}): FormatSection {
  const items: FormatItem[] = [
    text('show', 'Nombre del show', { bind: 'event.name', cols: 6 }),
    date('fecha', 'Fecha', { bind: 'event.date', cols: 3 }),
    text('hora', 'Hora', { bind: 'event.time', cols: 3, placeholder: '20:00' }),
  ];
  if (options.city !== false) items.push(text('ciudad', 'Ciudad', { bind: 'event.city', cols: 6 }));
  items.push(text('venue', 'Venue', { bind: 'event.venue', cols: options.city === false ? 12 : 6 }));
  return { id: HEADER_SECTION_ID, title: 'Datos del show', layout: 'header', items };
}

/**
 * Bloque de firmas: lo capturan los pads digitales (ENTREGADO / AUTORIZADO),
 * no el formulario. Las etiquetas son las que imprime el formato: un documento
 * puede nombrar a quién firma cada pad (p. ej. Producción externa / Auditorio).
 */
export function signaturesSection(labels: { delivered?: string; authorized?: string } = {}): FormatSection {
  return {
    id: SIGNATURES_SECTION_ID,
    title: 'Firmas digitales',
    items: [
      { id: 'firma_entregado', label: labels.delivered || 'Entregado', type: 'signature' },
      { id: 'firma_autorizado', label: labels.authorized || 'Autorizado', type: 'signature' },
    ],
  };
}

const versioned = (formatVersion: number, sections: FormatSection[], firmas = signaturesSection()): FormatData => ({
  formatVersion,
  sections: [...sections, firmas],
});

/** Formato de Arta. */
const schema = (...sections: FormatSection[]): FormatData => versioned(ARTA_FORMATS_VERSION, sections);

/** Formato del Auditorio. */
const auditorio = (sections: FormatSection[], firmas?: FormatSection): FormatData =>
  versioned(AUDITORIO_FORMATS_VERSION, sections, firmas);

/* ── Listas de los documentos del Auditorio (tal cual, en su orden) ───── */

/** Hoja LIMPIEZA. */
const LIMPIEZA_AREAS = [
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
];

/** Hoja MANTENIMIENTO. */
const MANTENIMIENTO_AREAS = [
  'Planta de luz de emergencia',
  'Escenario',
  'Camerinos',
  'Escaleras eléctricas',
  'Elevador',
  'Baños hombres planta baja',
  'Baños mujeres planta baja',
  'Puerta de cristal',
  'Baños hombres primer piso',
  'Baños mujeres primer piso',
  'Suites',
  'Baños hombres segundo piso',
  'Baños mujeres segundo piso',
  'Butacas sala planta baja',
  'Butacas sala primer piso',
  'Butacas sala segundo piso',
  'Aire acondicionado todo el recinto',
  'Pintura en pasillos planta baja',
  'Pintura en pasillos primer piso',
  'Pintura en pasillos segundo piso',
];

/** Compromiso de horarios: el renglón vacío del Word queda para un concepto libre. */
const COMPROMISO_CONCEPTOS = [
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
];

/** Compromiso de horarios: CONDICIONES, palabra por palabra. */
const COMPROMISO_CONDICIONES = [
  'El escenario e instalaciones serán entregados a la Producción en buenas condiciones de operación, salvo cualquier condición o desperfecto previamente identificado y documentado.',
  'La Producción deberá revisar y recibir el escenario e instalaciones antes de iniciar sus actividades. Cualquier observación deberá reportarse inmediatamente al responsable del Auditorio.',
  'La Producción será responsable de conservar el escenario e instalaciones durante el montaje, evento y desmontaje. Cualquier daño ocasionado por su personal, proveedores, equipos o actividades deberá ser reparado o cubierto económicamente por el responsable.',
  'La ambulancia deberá encontrarse en el recinto a partir del horario establecido y permanecer disponible durante el periodo requerido por la operación del evento.',
  'La planta de luz o generador eléctrico deberá contar con caja acústica y encontrarse instalado, encendido y operativo en el horario establecido para las pruebas técnicas y operación del show.',
  'El desmontaje deberá concluir dentro del horario comprometido y las instalaciones deberán quedar liberadas en el horario establecido.',
  'En caso de que la Producción no concluya el desmontaje dentro del horario establecido, se aplicará un costo adicional por cada hora o fracción de hora excedente, de acuerdo con la tarifa vigente o lo establecido en la contratación del evento.',
  'Cualquier modificación a los horarios deberá ser solicitada y autorizada previamente por el responsable del Auditorio.',
];

/** Compromiso de horarios: ACEPTACIÓN. */
const COMPROMISO_ACEPTACION =
  'El Encargado de Producción Externa manifiesta conocer y aceptar los horarios y condiciones establecidos en el presente documento y se compromete a coordinar a su equipo, proveedores y personal para su cumplimiento.';

/* ── Los formatos ──────────────────────────────────────────────────────── */

export const STANDARD_FORMATS: StandardFormat[] = [
  {
    key: 'EVENTO_GENERAL',
    name: 'Checklist Evento General',
    description: 'Los 42 puntos del show, del venue a los permisos',
    entities: ['ARTA'],
    schema: schema(
      header(),
      checks('venue_produccion', 'Venue y producción', [
        ['venue_ok', 'Venue'],
        ['planta_luz', 'Planta de luz'],
        ['campana', 'Campaña'],
        ['rider_hospitalidad', 'Rider hospitalidad'],
        ['catering', 'Cotizar catering'],
        ['camerinos', 'Definir división, cuántos y medidas de camerinos'],
        ['carpas', 'Renta de carpas'],
        ['mobiliario', 'Mobiliario'],
      ]),
      checks('logistica', 'Logística y staff', [
        ['chk_transportacion', 'Llenar checklist de transportación'],
        ['chk_hospedaje', 'Llenar checklist de hospedaje'],
        ['viaticos', 'Viáticos'],
        ['pago_staff', 'Pago staff'],
        ['papeleria', 'Preparar caja de papelería'],
        ['acreditaciones', 'Acreditaciones'],
        ['radios', 'Radios'],
        ['uniformes', 'Uniformes staff'],
      ]),
      checks('montaje', 'Montaje y layout', [
        ['layout', 'Secciones layout'],
        ['activaciones', 'Activaciones'],
        ['vallas', 'Renta de vallas'],
        ['gradas', 'Renta de gradas'],
        ['sillas', 'Renta de sillas'],
        ['unifilas', 'Unifilas'],
        ['senaletica', 'Impresión señalética'],
        ['triplay', 'Triplay'],
        ['portafloor', 'Portafloor'],
        ['stage_hands', 'Stage hands'],
      ]),
      checks('seguridad_servicios', 'Seguridad y servicios', [
        ['extintores', 'Extintores'],
        ['seguridad', 'Seguridad'],
        ['acomodadores', 'Acomodadores'],
        ['limpieza', 'Limpieza'],
        ['ambulancia', 'Ambulancia'],
        ['barras', 'Operación de barras'],
        ['banos', 'Renta de baños portátiles'],
        ['banos_vip', 'Renta de baños VIP camerinos'],
        ['pipas', 'Pipas de agua'],
      ]),
      checks('permisos', 'Permisos e impuestos', [
        ['pc_estatal', 'Permiso PC estatal'],
        ['pc_municipal', 'Permiso PC municipal'],
        ['bomberos', 'Permiso bomberos'],
        ['pirotecnia', 'Permiso pirotecnia'],
        ['dro', 'DRO'],
        ['perito', 'Perito'],
        ['impuestos', 'Impuestos'],
      ]),
      {
        id: 'observaciones',
        title: 'Observaciones',
        items: [longtext('observaciones', 'Observaciones', { optional: true })],
      },
    ),
  },

  {
    key: 'PRODUCCION',
    name: 'Checklist Producción',
    description: 'Riders, proveedores, encargados, horarios y minuto a minuto',
    entities: ['ARTA'],
    schema: schema(
      header(),
      {
        id: 'riders',
        title: 'Riders',
        items: [
          attachment('rider_orig', 'Rider original'),
          attachment('rider_acept', 'Rider aceptado (vs. original)'),
        ],
      },
      {
        id: 'proveedores',
        title: 'Empresas proveedoras',
        items: [
          text('prov_audio', 'Empresa proveedora de audio'),
          text('prov_iluminacion', 'Empresa proveedora de iluminación'),
          text('prov_video', 'Empresa proveedora de video'),
          text('prov_planta', 'Empresa proveedora de planta de luz'),
          text('prov_efectos', 'Empresa proveedora de efectos'),
          text('prov_backline', 'Empresa proveedora de backline'),
          text('prov_escenario', 'Empresa proveedora de escenario y ground support'),
          text('prov_stage_hands', 'Empresa proveedora de stage hands'),
        ],
      },
      {
        id: 'pms',
        title: 'Production managers',
        items: [
          text('pm_artista', 'Production manager del artista', { placeholder: 'Nombre y contacto' }),
          text('pm_promotor', 'Production manager del promotor', { placeholder: 'Nombre y contacto' }),
        ],
      },
      {
        id: 'encargados',
        title: 'Encargados de equipo',
        items: [
          text('enc_audio', 'Encargado de equipo de audio', { placeholder: 'Nombre y contacto' }),
          text('enc_iluminacion', 'Encargado de equipo de iluminación', { placeholder: 'Nombre y contacto' }),
          text('enc_video', 'Encargado de video', { placeholder: 'Nombre y contacto' }),
          text('enc_planta', 'Encargado de planta de luz', { placeholder: 'Nombre y contacto' }),
          text('enc_efectos', 'Encargado de efectos', { placeholder: 'Nombre y contacto' }),
          text('enc_backline', 'Encargado de backline', { placeholder: 'Nombre y contacto' }),
          text('enc_escenario', 'Encargado de escenario y ground support', { placeholder: 'Nombre y contacto' }),
          text('enc_stage_hands', 'Encargado de stage hands', { placeholder: 'Nombre y contacto' }),
        ],
      },
      {
        id: 'tiempos',
        title: 'Tiempos',
        items: [time('ingreso_venue', 'Horario de ingreso a venue'), time('montaje', 'Horario de montaje')],
      },
      {
        id: 'minuto_a_minuto',
        title: 'Minuto a minuto',
        items: [
          table(
            'minuto_a_minuto',
            'Minuto a minuto',
            [
              col('hora', 'Hora', { type: 'time', width: 1 }),
              col('actividad', 'Actividad', { width: 3 }),
              col('responsable', 'Responsable', { width: 2 }),
            ],
            { minRows: 8 },
          ),
        ],
      },
      {
        id: 'layout',
        title: 'Layout y observaciones',
        items: [attachment('layout', 'Layout'), longtext('observaciones', 'Observaciones', { optional: true })],
      },
    ),
  },

  {
    key: 'HOSPEDAJE',
    name: 'Checklist Hospedaje',
    description: 'Hotel, enlace, desayuno, rooming de Party A y B, confirmaciones',
    entities: ['ARTA'],
    schema: schema(
      header(),
      {
        id: 'hotel',
        title: 'Hotel',
        items: [
          text('nombre', 'Nombre del hotel'),
          text('contacto', 'Nombre y contacto del enlace con el hotel'),
          yesno('desayuno', 'Incluye desayuno'),
          longtext('observaciones', 'Observaciones', { optional: true }),
        ],
      },
      {
        id: 'party_a',
        title: 'Party A',
        items: [
          table('party_a', 'Party A', [
            col('nombre', 'Nombre', { width: 3 }),
            col('habitacion', 'Habitación', { width: 1 }),
            col('checkin', 'Check-in', { type: 'date', width: 1 }),
            col('checkout', 'Check-out', { type: 'date', width: 1 }),
            col('confirmacion', 'Confirmación', { width: 1.3 }),
            col('notas', 'Notas', { width: 2 }),
          ]),
        ],
      },
      {
        id: 'party_b',
        title: 'Party B',
        items: [
          table('party_b', 'Party B', [
            col('nombre', 'Nombre', { width: 3 }),
            col('habitacion', 'Habitación', { width: 1 }),
            col('checkin', 'Check-in', { type: 'date', width: 1 }),
            col('checkout', 'Check-out', { type: 'date', width: 1 }),
            col('confirmacion', 'Confirmación', { width: 1.3 }),
            col('notas', 'Notas', { width: 2 }),
          ]),
        ],
      },
      {
        id: 'confirmaciones',
        title: 'Confirmaciones',
        items: [attachment('confirmaciones', 'Confirmaciones del hotel')],
      },
    ),
  },

  {
    key: 'TRANSPORTACION',
    name: 'Checklist Transportación',
    description: 'Proveedor, camionetas, qué incluye, estatus y traslados',
    entities: ['ARTA'],
    schema: schema(
      header(),
      {
        id: 'provider',
        title: 'Proveedor',
        items: [
          text('prov', 'Nombre del proveedor'),
          text('contacto', 'Contacto del proveedor'),
          number('vans', 'Cantidad de camionetas'),
          text('modelo', 'Modelo de camionetas'),
          longtext('incluye', 'El servicio incluye'),
          {
            id: 'status',
            label: 'Estatus',
            type: 'select',
            options: ['Pendiente', 'Cotizado', 'Confirmado', 'Pagado', 'Completado'],
            value: 'Pendiente',
          },
          longtext('observaciones', 'Observaciones', { optional: true }),
        ],
      },
      {
        id: 'traslados',
        title: 'Traslados',
        items: [
          table(
            'traslados',
            'Traslados',
            [
              col('fecha', 'Fecha', { type: 'date', width: 1 }),
              col('hora', 'Hora', { type: 'time', width: 1 }),
              col('origen', 'Origen', { width: 2 }),
              col('destino', 'Destino', { width: 2 }),
              col('pasajeros', 'Pasajeros', { width: 2 }),
              col('unidad', 'Unidad', { width: 1 }),
            ],
            { optional: true, minRows: 5 },
          ),
        ],
      },
    ),
  },

  {
    key: 'RUEDA_PRENSA',
    name: 'Checklist Rueda de Prensa',
    description: 'Datos de la RP, convocatoria, encargados, montaje, medios confirmados y timeline',
    entities: ['ARTA'],
    schema: schema(
      {
        id: HEADER_SECTION_ID,
        title: 'Datos de la rueda de prensa',
        layout: 'header',
        items: [
          text('evento', 'Evento', { bind: 'event.name', cols: 6 }),
          date('fecha', 'Fecha de la RP', { cols: 3 }),
          text('hora', 'Hora de la RP', { cols: 3, placeholder: '11:00' }),
          text('ciudad', 'Ciudad de la RP', { bind: 'event.city', cols: 6 }),
          text('venue', 'Venue de la RP', { cols: 6 }),
        ],
      },
      // Correcciones 30-09-2026: «agregar como primer rubro un cintillo que diga convocatoria».
      {
        id: 'convocatoria',
        title: 'Convocatoria',
        items: [
          text('conv_encargado', 'Encargado', { placeholder: 'Nombre y contacto de quien convoca a medios' }),
          text('conv_drive', 'Drive de contenido para rueda', { placeholder: 'Liga del Drive (artes, boletín, fotos…)' }),
        ],
      },
      {
        id: 'encargados',
        title: 'Encargados',
        items: [
          text('contacto_venue', 'Nombre y contacto del encargado de venue'),
          text('audio', 'Nombre y contacto del proveedor de audio y micrófonos'),
          text('coffee', 'Encargado de coffee break'),
        ],
      },
      {
        id: 'montaje',
        title: 'Montaje',
        items: [yesno('banners', 'Banners'), yesno('pantallas', 'Pantallas'), yesno('identificadores', 'Identificadores de mesa')],
      },
      {
        id: 'medios',
        title: 'Medios confirmados',
        items: [
          table('medios', 'Medios confirmados', [
            col('medio', 'Medio', { width: 2 }),
            col('reportero', 'Reportero / conductor', { width: 2 }),
            col('contacto', 'Contacto', { width: 2 }),
            col('confirmado', 'Confirmado', { width: 1 }),
          ]),
        ],
      },
      // Correcciones 30-09-2026: después de medios, cronograma antes, durante y después de la RP.
      {
        id: 'timeline',
        title: 'Timeline de la rueda de prensa',
        items: [
          table('pre', 'Antes de la rueda de prensa', timelineColumns(), { minRows: 4 }),
          table('durante', 'Durante la rueda de prensa', timelineColumns(), { minRows: 4 }),
          table('despues', 'Después de la rueda de prensa', timelineColumns(), { minRows: 3 }),
        ],
      },
      {
        id: 'observaciones',
        title: 'Observaciones',
        items: [longtext('observaciones', 'Observaciones', { optional: true })],
      },
    ),
  },

  {
    key: 'ARTES_SHOWS',
    name: 'Checklist Info Artes Shows',
    description: 'Datos para las artes, entregables por formato y autorización',
    entities: ['ARTA'],
    schema: schema(
      header({ city: false }),
      {
        id: 'meta',
        title: 'Datos para las artes',
        items: [
          text('promotores', 'Promotoras'),
          text('boletera', 'Boletera'),
          text('sponsors', 'Patrocinadores'),
          text('extras', 'Extras', { optional: true }),
        ],
      },
      {
        id: 'entregables',
        title: 'Entregables',
        items: [
          attachment('fb', 'Formato FB (1350)'),
          attachment('ig', 'Formato IG (1440)'),
          attachment('story', 'Formato Story (1920)'),
          attachment('precios', 'Precios (todos)'),
          attachment('reel', 'Reel general'),
        ],
      },
      {
        id: 'control',
        title: 'Solicitud y autorización',
        items: [
          longtext('observaciones', 'Observaciones', { optional: true }),
          date('fecha_solicitud', 'Fecha de solicitud'),
          date('fecha_cambio', 'Fecha de cambio (cuando se realizó)'),
          text('autorizo', 'Firma / nombre autorizado'),
        ],
      },
    ),
  },

  {
    key: 'PENDONES',
    name: 'Distribución de Pendones',
    description: 'Avenidas por oleada (primera, segunda y tercera parte) con totales',
    entities: ['ARTA'],
    schema: schema(
      {
        id: HEADER_SECTION_ID,
        title: 'Datos',
        layout: 'header',
        items: [
          text('evento', 'Evento', { bind: 'event.name', cols: 8 }),
          text('ciudad', 'Ciudad', { bind: 'event.city', cols: 4 }),
        ],
      },
      {
        id: 'avenidas',
        title: 'Colocación de pendones',
        items: [
          table(
            'avenidas',
            'Colocación de pendones',
            [
              col('avenida', 'Avenidas principales', { width: 3 }),
              col('parte1', 'Primera parte', { type: 'number', width: 1, total: true }),
              col('parte2', 'Segunda parte', { type: 'number', width: 1, total: true }),
              col('parte3', 'Tercera parte', { type: 'number', width: 1, total: true }),
            ],
            { minRows: 10, totalLabel: 'Total' },
          ),
        ],
      },
      {
        id: 'colocacion',
        title: 'Fechas de colocación',
        items: [
          date('fecha_parte1', 'Primera parte'),
          date('fecha_parte2', 'Segunda parte'),
          date('fecha_parte3', 'Tercera parte'),
          yesno('permiso', 'Permiso de vía pública'),
          longtext('observaciones', 'Observaciones', { optional: true }),
        ],
      },
    ),
  },

  /*
   * Catering no viene de Drive: es un formato del sistema que ya existía como
   * lista de casillas (igual que el Mantenimiento de antes). Adam (24-09):
   * «más que palomitas, colocar los campos necesarios». Se le da la misma
   * forma de documento.
   */
  {
    key: 'CATERING',
    name: 'Catering y Camerinos',
    description: 'Proveedor, menú, horarios de servicio y camerinos',
    entities: ['ARTA'],
    schema: schema(
      header(),
      {
        id: 'proveedor',
        title: 'Catering',
        items: [
          text('proveedor', 'Proveedor de catering'),
          text('contacto', 'Contacto del proveedor'),
          number('personas', 'Personas a atender'),
          longtext('menu', 'Menú confirmado'),
          longtext('restricciones', 'Restricciones dietéticas', { optional: true }),
        ],
      },
      {
        id: 'horarios',
        title: 'Horarios de servicio',
        items: [
          table('horarios', 'Horarios de servicio', [
            col('hora', 'Hora', { type: 'time', width: 1 }),
            col('servicio', 'Servicio', { width: 2 }),
            col('personas', 'Personas', { type: 'number', width: 1 }),
            col('lugar', 'Lugar', { width: 2 }),
          ]),
        ],
      },
      {
        id: 'camerinos',
        title: 'Camerinos',
        items: [
          table('camerinos', 'Camerinos', [
            col('camerino', 'Camerino', { width: 1 }),
            col('para', 'Para quién', { width: 2 }),
            col('medidas', 'Medidas', { width: 1 }),
            col('equipamiento', 'Equipamiento', { width: 2 }),
            col('listo', 'Listo', { width: 1 }),
          ]),
          longtext('observaciones', 'Observaciones', { optional: true }),
        ],
      },
    ),
  },

  /*
   * ── Auditorio Arema Explanada (EXPLANADA) ──────────────────────────────
   * De los documentos del propio Auditorio (11-10-2026): CHECKLIST
   * AUDITORIO.xlsx (hojas AUDITORIO + MERCH, LIMPIEZA y MANTENIMIENTO) y
   * «Compromiso de horarios — Día del show» (Word). Solo eventos del Auditorio.
   */
  {
    key: 'CHECKLIST_AUDITORIO',
    name: 'Checklist Auditorio',
    description: 'Producción, camerinos, merch, prensa y venue del show en el Auditorio Arema Explanada',
    entities: ['EXPLANADA'],
    schema: auditorio([
      {
        id: HEADER_SECTION_ID,
        title: 'Datos del show',
        layout: 'header',
        items: [
          text('evento', 'Evento', { bind: 'event.name', cols: 6 }),
          text('showtime', 'Showtime', { bind: 'event.time', cols: 6, placeholder: '20:00' }),
          text('promotor', 'Empresa / promotor', { bind: 'event.promoter', cols: 6 }),
          text('boletera', 'Boletera', { cols: 6 }),
        ],
      },
      {
        id: 'produccion',
        title: 'Producción',
        items: [
          time('load_in', 'Load in'),
          time('load_out', 'Load out'),
          time('soundcheck', 'Soundcheck'),
          attachment('rider', 'Rider'),
          attachment('minuto_a_minuto', 'Minuto a minuto'),
          text('encargado_produccion', 'Encargado de producción', { placeholder: 'Nombre y contacto' }),
          yesno('pirotecnia', 'Pirotecnia'),
          yesno('papirotecnia', 'Papirotecnia'),
          yesno('co2', 'CO2'),
        ],
      },
      {
        id: 'camerinos',
        title: 'Camerinos',
        items: [
          text('horarios', 'Horarios', { placeholder: 'De qué hora a qué hora' }),
          number('cuantos', 'Cuántos camerinos'),
          yesno('quick_change', 'Quick change'),
          yesno('catering_caliente', 'Catering caliente (no gas)'),
        ],
      },
      // La hoja MERCH del Excel repite evento y porcentaje y suma operador y contacto.
      {
        id: 'merch',
        title: 'Merch',
        items: [
          yesno('merch', 'Merch (sí o no)'),
          number('porcentaje', 'Porcentaje a cobrar (%)'),
          text('operador', 'Operador'),
          text('contacto_merch', 'Contacto merch del talento'),
        ],
      },
      {
        id: 'prensa',
        title: 'Prensa',
        items: [
          number('medios', 'Cuántos medios'),
          number('canciones', 'Cuántas canciones'),
          text('encargado_prensa', 'Encargado por promotor', { placeholder: 'Nombre y contacto' }),
        ],
      },
      {
        id: 'venue',
        title: 'Venue',
        items: [
          text('permisos', 'Permisos', { placeholder: 'Cuáles y en qué estatus' }),
          attachment('contrato', 'Contrato'),
          time('apertura_puertas', 'Apertura de puertas'),
          time('apertura_sala', 'Apertura de sala'),
          time('termino_show', 'Término del show'),
          number('capacidad', 'Capacidad esperada'),
        ],
      },
      {
        id: 'observaciones',
        title: 'Observaciones',
        items: [longtext('observaciones', 'Observaciones', { optional: true })],
      },
    ]),
  },

  {
    key: 'LIMPIEZA',
    name: 'Checklist Limpieza',
    description: 'Limpieza del recinto por área: responsable, horario, estatus y observaciones',
    entities: ['EXPLANADA'],
    schema: auditorio([
      {
        id: HEADER_SECTION_ID,
        title: 'Datos',
        layout: 'header',
        items: [
          text('evento', 'Evento', { bind: 'event.name', cols: 6 }),
          text('showtime', 'Showtime', { bind: 'event.time', cols: 3, placeholder: '20:00' }),
          { ...number('capacidad', 'Capacidad'), cols: 3 },
        ],
      },
      {
        id: 'limpieza',
        title: 'Limpieza por área',
        items: [
          listTable(
            'actividades',
            'Limpieza por área',
            [
              col('actividad', 'Actividad', { width: 2.4 }),
              col('responsable', 'Responsable', { width: 1.6 }),
              col('horario', 'Horario', { width: 1 }),
              col('estatus', 'Estatus', { width: 1 }),
              col('observaciones', 'Observaciones', { width: 2.2 }),
            ],
            LIMPIEZA_AREAS,
          ),
        ],
      },
    ]),
  },

  {
    key: 'MANTENIMIENTO',
    name: 'Checklist Mantenimiento',
    description: 'Mantenimiento del recinto por área: supervisión, observaciones con foto, cambios, solicitud, entrega y testigos',
    entities: ['EXPLANADA'],
    schema: auditorio([
      {
        id: HEADER_SECTION_ID,
        title: 'Datos',
        layout: 'header',
        items: [
          text('evento', 'Evento', { bind: 'event.name', cols: 8 }),
          date('fecha', 'Fecha del evento', { bind: 'event.date', cols: 4 }),
        ],
      },
      {
        id: 'mantenimiento',
        title: 'Mantenimiento por área',
        items: [
          listTable(
            'actividades',
            'Mantenimiento por área',
            [
              col('actividad', 'Actividad', { width: 2.1 }),
              col('responsable', 'Responsable', { width: 1.4 }),
              col('fecha_supervision', 'Fecha de supervisión', { type: 'date', width: 1.2 }),
              col('observaciones', 'Observaciones', { width: 1.9 }),
              col('cambios', 'Cambios', { width: 1.6 }),
              col('fecha_solicitud', 'Fecha de solicitud', { type: 'date', width: 1.2 }),
              col('fecha_entrega', 'Fecha de entrega', { type: 'date', width: 1.2 }),
            ],
            MANTENIMIENTO_AREAS,
          ),
        ],
      },
      /*
       * «Observaciones con botón para foto» y «Testigos con botón para fotos»:
       * una celda de tabla no lleva archivo, así que cada área tiene sus dos
       * adjuntos (foto desde el teléfono, archivo o link a un álbum). Son
       * opcionales: el avance lo da la tabla.
       */
      {
        id: 'fotos',
        title: 'Fotos: observaciones y testigos',
        items: MANTENIMIENTO_AREAS.flatMap((area) => [
          attachment(`obs_${slug(area)}`, `${area} · foto de observaciones`, { optional: true }),
          attachment(`testigos_${slug(area)}`, `${area} · testigos (fotos)`, { optional: true }),
        ]),
      },
      {
        id: 'observaciones',
        title: 'Observaciones',
        items: [longtext('observaciones', 'Observaciones', { optional: true })],
      },
    ]),
  },

  {
    key: 'COMPROMISO_HORARIOS',
    name: 'Compromiso de horarios — Día del show',
    description: 'Producción externa: horarios comprometidos y reales, condiciones, cargo por extensión de desmontaje y aceptación firmada',
    entities: ['EXPLANADA'],
    schema: auditorio(
      [
        {
          id: HEADER_SECTION_ID,
          title: 'Producción externa',
          layout: 'header',
          items: [
            text('evento', 'Evento', { bind: 'event.name', cols: 8 }),
            date('fecha', 'Fecha', { bind: 'event.date', cols: 4 }),
            text('productor', 'Productor / empresa', { bind: 'event.promoter', cols: 6 }),
            text('encargado', 'Encargado de producción', { cols: 6 }),
          ],
        },
        {
          id: 'horarios',
          title: 'Horarios y condiciones operativas',
          items: [
            listTable(
              'horarios',
              'Horarios y condiciones operativas',
              [
                col('concepto', 'Concepto', { width: 3.4 }),
                col('comprometido', 'Horario comprometido', { type: 'time', width: 1.3 }),
                col('real', 'Hora real', { type: 'time', width: 1.1 }),
                col('observaciones', 'Observaciones', { width: 2.2 }),
              ],
              COMPROMISO_CONCEPTOS,
            ),
          ],
        },
        {
          id: 'condiciones',
          title: 'Condiciones',
          items: COMPROMISO_CONDICIONES.map((texto, i) => paragraph(`condicion_${i + 1}`, texto)),
        },
        {
          id: 'cargo_extension',
          title: 'Cargo por extensión de desmontaje',
          items: [
            time('horario_limite', 'Horario límite de desmontaje'),
            number('costo_hora', 'Costo por hora o fracción excedente ($)'),
          ],
        },
        {
          id: 'aceptacion',
          title: 'Aceptación',
          items: [paragraph('aceptacion', COMPROMISO_ACEPTACION)],
        },
      ],
      // El Word cierra con las firmas de las dos partes (nombre, firma y fecha).
      signaturesSection({ delivered: 'Producción externa', authorized: 'Auditorio Explanada Puebla' }),
    ),
  },
];

/**
 * Plantillas que duplican un módulo del sistema y se retiran (quedan
 * inactivas: los formatos ya creados no se tocan, los eventos nuevos no las
 * reciben; se reactivan desde Plantillas si hiciera falta).
 */
export const RETIRED_TEMPLATES: Array<{ key: ChecklistTemplateKey; reason: string }> = [
  { key: 'ORDEN_COMPRA', reason: 'Órdenes de compra es módulo propio con el machote en PDF' },
  { key: 'BOLETERA', reason: 'Creación de boletera es módulo propio con su PDF' },
  { key: 'CORRIDA_FINANCIERA', reason: 'La corrida vive en Finanzas (Excel embebido)' },
  { key: 'CAMPANA', reason: 'Campaña es módulo propio con PDFs interna y externa' },
  { key: 'ANTICIPOS', reason: 'Los anticipos son órdenes de compra con comprobante' },
];

/**
 * Plantillas activas que no viven en el catálogo pero también son de una sola
 * entidad. «Distribución de Pendones (Excel)» (`CUSTOM`, la crea
 * `scripts/register-format-sources.ts`) es el libro de Pendones de Arta: con
 * entidades vacías se copiaba también a los eventos del Auditorio.
 */
export const EXTRA_TEMPLATE_ENTITIES: Array<{ key: ChecklistTemplateKey; name: string; entities: EntityKey[] }> = [
  { key: 'CUSTOM', name: 'Distribución de Pendones (Excel)', entities: ['ARTA'] },
];

export function standardFormat(key: string): StandardFormat | undefined {
  return STANDARD_FORMATS.find((f) => f.key === key);
}

/** Formatos estándar que aplican a una entidad (vacío = las dos). */
export function formatsForEntity(entity: EntityKey): StandardFormat[] {
  return STANDARD_FORMATS.filter((f) => !f.entities.length || f.entities.includes(entity));
}

/** Versión del catálogo con la que se guardó una plantilla (0 = anterior al catálogo). */
export function storedFormatVersion(schemaJson: unknown): number {
  if (!schemaJson || typeof schemaJson !== 'object') return 0;
  const v = (schemaJson as { formatVersion?: unknown }).formatVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
