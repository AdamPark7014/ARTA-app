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
 */
import type { ChecklistTemplateKey, EntityKey } from '@prisma/client';
import {
  HEADER_SECTION_ID,
  SIGNATURES_SECTION_ID,
  type FormatColumn,
  type FormatData,
  type FormatItem,
  type FormatSection,
} from '../common/format-schema';

/**
 * Sube cuando cambie la forma de algún formato estándar.
 * v3 (30-09-2026): Rueda de Prensa con Convocatoria y Timeline.
 */
export const STANDARD_FORMAT_VERSION = 3;

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

/** Bloque de firmas: lo capturan los pads digitales, no el formulario. */
export function signaturesSection(): FormatSection {
  return {
    id: SIGNATURES_SECTION_ID,
    title: 'Firmas digitales',
    items: [
      { id: 'firma_entregado', label: 'Entregado', type: 'signature' },
      { id: 'firma_autorizado', label: 'Autorizado', type: 'signature' },
    ],
  };
}

const schema = (...sections: FormatSection[]): FormatData => ({
  formatVersion: STANDARD_FORMAT_VERSION,
  sections: [...sections, signaturesSection()],
});

/* ── Los siete formatos ────────────────────────────────────────────────── */

export const STANDARD_FORMATS: StandardFormat[] = [
  {
    key: 'EVENTO_GENERAL',
    name: 'Checklist Evento General',
    description: 'Los 42 puntos del show, del venue a los permisos',
    entities: [],
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
    entities: [],
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
    entities: [],
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
    entities: [],
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
    entities: [],
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
    entities: [],
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
    entities: [],
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
   * Los dos siguientes no vienen de Drive: son formatos del sistema que ya
   * existían como listas de casillas. Adam (24-09): «más que palomitas,
   * colocar los campos necesarios». Se les da la misma forma de documento.
   */
  {
    key: 'CATERING',
    name: 'Catering y Camerinos',
    description: 'Proveedor, menú, horarios de servicio y camerinos',
    entities: [],
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

  {
    key: 'MANTENIMIENTO',
    name: 'Mantenimiento (Auditorio)',
    description: 'Inspección del venue, hallazgos, reparaciones e inventario técnico',
    entities: ['EXPLANADA'],
    schema: schema(
      {
        id: HEADER_SECTION_ID,
        title: 'Datos',
        layout: 'header',
        items: [
          text('evento', 'Evento', { bind: 'event.name', cols: 6 }),
          date('fecha_inspeccion', 'Fecha de inspección', { cols: 3 }),
          text('responsable', 'Responsable', { cols: 3 }),
        ],
      },
      {
        id: 'hallazgos',
        title: 'Inspección del venue',
        items: [
          table('hallazgos', 'Hallazgos', [
            col('area', 'Área', { width: 1 }),
            col('hallazgo', 'Hallazgo', { width: 3 }),
            col('prioridad', 'Prioridad', { width: 1 }),
            col('estado', 'Estado', { width: 1 }),
          ]),
        ],
      },
      {
        id: 'inventario',
        title: 'Inventario técnico',
        items: [
          table('inventario', 'Inventario técnico', [
            col('equipo', 'Equipo', { width: 2 }),
            col('cantidad', 'Cantidad', { type: 'number', width: 1 }),
            col('estado', 'Estado', { width: 1 }),
            col('observacion', 'Observación', { width: 2 }),
          ]),
        ],
      },
      checks('cierre', 'Cierre', [
        ['inspeccion', 'Inspección del venue realizada'],
        ['reparaciones', 'Reparaciones atendidas'],
        ['inventario_ok', 'Inventario técnico revisado'],
      ]),
      {
        id: 'observaciones',
        title: 'Observaciones',
        items: [longtext('observaciones', 'Observaciones', { optional: true })],
      },
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

export function standardFormat(key: string): StandardFormat | undefined {
  return STANDARD_FORMATS.find((f) => f.key === key);
}

/** Versión del catálogo con la que se guardó una plantilla (0 = anterior al catálogo). */
export function storedFormatVersion(schemaJson: unknown): number {
  if (!schemaJson || typeof schemaJson !== 'object') return 0;
  const v = (schemaJson as { formatVersion?: unknown }).formatVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
