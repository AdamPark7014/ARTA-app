import type { Route } from '@playwright/test';
import * as XLSX from 'xlsx';

import { TEST_USER, type ApiStubs, type AuthUserFixture } from './mock-api';

/**
 * Datos «ricos» para pulir la UI: cada pantalla del panel con contenido real
 * —nombres largos, montos, estados mezclados, fechas relativas a HOY— en vez
 * del mínimo que usan los specs funcionales.
 *
 * Uso:
 *   await seedSession(page, baseURL);
 *   await mockAuthenticatedApi(page, RICH_STUBS);   // ya trae /auth/me con RICH_USER
 *   await page.goto(RICH_ROUTES.find((r) => r.name === 'event-ocs')!.path);
 *
 * Todo es inventado (repo público): personas, correos @arta.test /
 * @example.com, IPs de documentación (RFC 5737) y razones sociales ficticias.
 * Las formas siguen los tipos de cada pantalla (`event-detail.types.ts`,
 * `chat-model.ts`, `task-types.ts` y los `type` locales de cada página).
 */

/* ── fechas relativas a hoy (hora local del equipo que corre la prueba) ───── */

const NOW = new Date();

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO de hoy + `days` a la hora local indicada. */
function at(days: number, hours: number, minutes = 0): string {
  return new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days, hours, minutes, 0, 0).toISOString();
}

/** `YYYY-MM-DD` local de hoy + `days`. */
function dayKey(days: number): string {
  const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Vencimiento de tarea: el API las guarda como medianoche UTC del día. */
function dueKey(days: number): string {
  return `${dayKey(days)}T00:00:00.000Z`;
}

function minutesAgo(min: number): string {
  return new Date(NOW.getTime() - min * 60_000).toISOString();
}

function daysAgo(days: number, hours = 10, minutes = 0): string {
  return at(-days, hours, minutes);
}

/* ── personas ─────────────────────────────────────────────────────────────── */

/** Copia de TEST_USER (super_admin, todo) con nombre y puesto largos a propósito. */
export const RICH_USER: AuthUserFixture = {
  ...TEST_USER,
  fullName: 'Ana Robles Villaseñor',
  title: 'Dirección de operaciones y producción',
  email: 'ana.robles@arta.test',
};

type Person = {
  id: string;
  fullName: string;
  title: string;
  email: string;
  roleKey: string;
  entities: Array<'ARTA' | 'EXPLANADA'>;
  active: boolean;
};

const ANA: Person = {
  id: RICH_USER.id,
  fullName: RICH_USER.fullName,
  title: RICH_USER.title || '',
  email: RICH_USER.email,
  roleKey: 'super_admin',
  entities: ['ARTA', 'EXPLANADA'],
  active: true,
};
const BETO: Person = {
  id: 'usr-rich-beto',
  fullName: 'Bernardo Sandoval Echeverría',
  title: 'Coordinación de logística, transporte y hospedaje de artistas',
  email: 'bernardo.sandoval@arta.test',
  roleKey: 'logistica',
  entities: ['ARTA', 'EXPLANADA'],
  active: true,
};
const MARIELA: Person = {
  id: 'usr-rich-mariela',
  fullName: 'Mariela Fuentes de la Garza Montoya',
  title: 'Gerencia de convenios, patrocinios y relaciones con medios',
  email: 'mariela.fuentesdelagarza.convenios@arta.test',
  roleKey: 'convenios',
  entities: ['ARTA', 'EXPLANADA'],
  active: true,
};
const OCTAVIO: Person = {
  id: 'usr-rich-octavio',
  fullName: 'Octavio Lizárraga Benítez',
  title: 'Producción técnica: audio, iluminación y escenario',
  email: 'octavio.lizarraga@arta.test',
  roleKey: 'logistica',
  entities: ['ARTA'],
  active: true,
};
const RENATA: Person = {
  id: 'usr-rich-renata',
  fullName: 'Renata Altamirano Iturbide',
  title: 'Dirección del Auditorio Explanada',
  email: 'renata.altamirano@arta.test',
  roleKey: 'dir_auditorio',
  entities: ['EXPLANADA', 'ARTA'],
  active: true,
};
const JOAQUIN: Person = {
  id: 'usr-rich-joaquin',
  fullName: 'Joaquín Esparza Villalobos',
  title: 'Finanzas y pagos a proveedores',
  email: 'joaquin.esparza@arta.test',
  roleKey: 'enlace_gobierno',
  entities: ['ARTA', 'EXPLANADA'],
  active: true,
};
const XIMENA: Person = {
  id: 'usr-rich-ximena',
  fullName: 'Ximena Carvajal Ortiz de Montellano',
  title: 'Diseño, artes y campaña publicitaria',
  email: 'ximena.carvajal@arta.test',
  roleKey: 'gerente_arta',
  entities: ['ARTA'],
  active: true,
};
const GERARDO: Person = {
  id: 'usr-rich-gerardo',
  fullName: 'Gerardo Treviño Salcedo',
  title: 'Enlace con gobierno, permisos y protección civil',
  email: 'gerardo.trevino@arta.test',
  roleKey: 'enlace_gobierno',
  entities: ['ARTA', 'EXPLANADA'],
  active: true,
};
const PAULINA: Person = {
  id: 'usr-rich-paulina',
  fullName: 'Paulina Ugalde Rivas',
  title: 'Taquilla y boletera',
  email: 'paulina.ugalde@arta.test',
  roleKey: 'dir_adjunta',
  entities: ['ARTA', 'EXPLANADA'],
  active: true,
};
const SAMUEL: Person = {
  id: 'usr-rich-samuel',
  fullName: 'Samuel Ibarra Quintanilla',
  title: 'Archivo y carpetas generales',
  email: 'samuel.ibarra@example.com',
  roleKey: 'solo_carpetas',
  entities: ['ARTA', 'EXPLANADA'],
  active: false,
};

const PEOPLE: Person[] = [ANA, BETO, MARIELA, OCTAVIO, RENATA, JOAQUIN, XIMENA, GERARDO, PAULINA, SAMUEL];

const ref = (p: Person) => ({ id: p.id, fullName: p.fullName });
const nameOnly = (p: Person) => ({ fullName: p.fullName });

/** `/users/directory`: el hub del evento lee { id, fullName, email }; Tareas, { title, roleKey }. */
const DIRECTORY = PEOPLE.filter((p) => p.active).map((p) => ({
  id: p.id,
  fullName: p.fullName,
  email: p.email,
  title: p.title,
  roleKey: p.roleKey,
}));

/* ── eventos ──────────────────────────────────────────────────────────────── */

const EVT1_ID = 'evt-rich-1';
const EVT2_ID = 'evt-rich-2';

type EventRow = {
  id: string;
  name: string;
  artist: string | null;
  promoter: string | null;
  venue: string | null;
  city: string | null;
  status: string;
  entity: 'ARTA' | 'EXPLANADA';
  campaignType: string;
  startsAt: string | null;
  endsAt: string | null;
  schedule: string | null;
  functions: number | null;
  description: string | null;
  updatedAt: string;
  _count: { checklists: number; purchaseOrders: number; tasks: number };
};

const EVENTS: EventRow[] = [
  {
    id: EVT1_ID,
    name: 'Gira Latinoamericana Sinfónica 2026 — Edición Especial con Orquesta Filarmónica',
    artist: 'Orquesta Filarmónica Metropolitana y Coro Juvenil de Cámara',
    promoter: 'Producciones Escénicas del Altiplano, S.A. de C.V.',
    venue: 'Auditorio Metropolitano Arena Central — Escenario Principal',
    city: 'Puebla',
    status: 'ACTIVE',
    entity: 'ARTA',
    campaignType: 'CONCERT',
    startsAt: at(0, 21, 0),
    endsAt: at(0, 23, 30),
    schedule: '21:00',
    functions: 1,
    description:
      'Concierto sinfónico de dos horas con intermedio, 84 músicos en escena, coro de 40 voces y proyección de visuales en tres pantallas LED. Acceso del público desde las 19:30; la producción entra a montaje a las 07:00 y el ensayo general es a las 16:00.',
    updatedAt: minutesAgo(35),
    _count: { checklists: 6, purchaseOrders: 6, tasks: 7 },
  },
  {
    id: 'evt-rich-3',
    name: 'Ensayo general abierto con escuelas de música',
    artist: 'Orquesta Filarmónica Metropolitana',
    promoter: 'Arta Producciones',
    venue: 'Auditorio Metropolitano Arena Central',
    city: 'Puebla',
    status: 'ACTIVE',
    entity: 'ARTA',
    campaignType: 'INTERNAL',
    startsAt: at(0, 9, 30),
    endsAt: at(0, 12, 0),
    schedule: '09:30',
    functions: 1,
    description: 'Ensayo con público escolar invitado; sin venta de boletos.',
    updatedAt: daysAgo(1, 18),
    _count: { checklists: 2, purchaseOrders: 0, tasks: 2 },
  },
  {
    id: EVT2_ID,
    name: 'Festival de Bandas Emergentes del Auditorio',
    artist: 'Varios artistas (12 bandas locales seleccionadas por convocatoria)',
    promoter: 'Auditorio Explanada',
    venue: 'Auditorio Explanada — Explanada norte',
    city: 'Puebla',
    status: 'ACTIVE',
    entity: 'EXPLANADA',
    campaignType: 'FESTIVAL',
    startsAt: at(3, 16, 0),
    endsAt: at(3, 23, 59),
    schedule: '16:00',
    functions: 1,
    description:
      'Festival de un día con dos escenarios alternados. Todavía no se le asignan formatos: la producción la lleva el colectivo organizador.',
    updatedAt: daysAgo(2, 12),
    _count: { checklists: 0, purchaseOrders: 0, tasks: 1 },
  },
  {
    id: 'evt-rich-4',
    name: 'Noche de Comedia: Monólogos sin Censura',
    artist: 'Colectivo Risas al Margen',
    promoter: 'Comedia en Vivo Producciones',
    venue: 'Teatro de la Ciudad',
    city: 'Cholula',
    status: 'ACTIVE',
    entity: 'ARTA',
    campaignType: 'CONCERT',
    startsAt: at(6, 18, 0),
    endsAt: at(6, 23, 0),
    schedule: 'Función 1 — 18:00 · Función 2 — 20:30 · Función 3 — 22:45',
    functions: 3,
    description: null,
    updatedAt: daysAgo(3, 9),
    _count: { checklists: 4, purchaseOrders: 2, tasks: 3 },
  },
  {
    id: 'evt-rich-5',
    name: 'Concierto Acústico a la Luz de las Velas — Tributo a los Grandes Boleros de los Años Cincuenta',
    artist: 'Trío Serenata Poblana',
    promoter: 'Auditorio Explanada',
    venue: 'Auditorio Explanada — Sala de cámara',
    city: 'Puebla',
    status: 'ACTIVE',
    entity: 'EXPLANADA',
    campaignType: 'CONCERT',
    startsAt: at(12, 20, 30),
    endsAt: at(12, 22, 30),
    schedule: '20:30',
    functions: 1,
    description: 'Formato íntimo, aforo reducido y mesas para 4 personas.',
    updatedAt: daysAgo(4, 16),
    _count: { checklists: 3, purchaseOrders: 2, tasks: 2 },
  },
  {
    id: 'evt-rich-6',
    name: 'Expo Feria Gastronómica y Cultural de la Sierra Norte',
    artist: null,
    promoter: 'Cámara Regional de Restauranteros (ficticia)',
    venue: 'Explanada del Centro de Convenciones',
    city: 'Puebla',
    status: 'DRAFT',
    entity: 'ARTA',
    campaignType: 'FESTIVAL',
    startsAt: at(40, 11, 0),
    endsAt: at(42, 20, 0),
    schedule: '11:00',
    functions: 1,
    description: null,
    updatedAt: daysAgo(6, 11),
    _count: { checklists: 1, purchaseOrders: 0, tasks: 0 },
  },
  {
    id: 'evt-rich-7',
    name: 'Gala de Ballet Clásico: El Cascanueces',
    artist: 'Compañía Estatal de Danza',
    promoter: 'Arta Producciones',
    venue: 'Auditorio Metropolitano Arena Central',
    city: 'Puebla',
    status: 'CLOSED',
    entity: 'ARTA',
    campaignType: 'CONCERT',
    startsAt: at(-20, 19, 0),
    endsAt: at(-20, 21, 30),
    schedule: '19:00',
    functions: 1,
    description: null,
    updatedAt: daysAgo(15, 10),
    _count: { checklists: 6, purchaseOrders: 5, tasks: 9 },
  },
  {
    id: 'evt-rich-8',
    name: 'Carrera Nocturna 10K con Concierto al Final',
    artist: 'DJ invitado',
    promoter: 'Club Deportivo Corredores del Valle (ficticio)',
    venue: 'Auditorio Explanada — Estacionamiento poniente',
    city: 'Puebla',
    status: 'CANCELLED',
    entity: 'EXPLANADA',
    campaignType: 'FESTIVAL',
    startsAt: at(25, 20, 0),
    endsAt: null,
    schedule: '20:00',
    functions: 1,
    description: null,
    updatedAt: daysAgo(8, 13),
    _count: { checklists: 0, purchaseOrders: 0, tasks: 0 },
  },
];

const evt = (id: string) => EVENTS.find((e) => e.id === id)!;
const EVT1 = evt(EVT1_ID);
const EVT2 = evt(EVT2_ID);

/** `/events?scope=…`: el API filtra; aquí se imita para que Boletera no liste cerrados. */
function eventsHandler(route: Route) {
  const scope = new URL(route.request().url()).searchParams.get('scope');
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime();
  const past = (e: EventRow) =>
    e.status === 'CLOSED' ||
    e.status === 'CANCELLED' ||
    (!!e.startsAt && new Date(e.endsAt || e.startsAt).getTime() < today);
  const list = scope === 'active' ? EVENTS.filter((e) => !past(e)) : scope === 'past' ? EVENTS.filter(past) : EVENTS;
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) });
}

/* ── archivos de prueba (Excel y PDF reales, generados en memoria) ────────── */

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function corridaWorkbook(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['CORRIDA FINANCIERA — GIRA LATINOAMERICANA SINFÓNICA 2026', '', '', '', ''],
    ['Concepto', 'Cantidad', 'Precio unitario', 'Total', 'Notas'],
    ['INGRESOS', '', '', '', ''],
    ['Taquilla Zona Platino Preferente (filas A a F)', 420, 2850, null, 'Preventa al 92 %'],
    ['Taquilla Zona Oro Central', 980, 1950, null, ''],
    ['Taquilla Zona Plata Lateral con visibilidad completa', 1450, 1200, null, ''],
    ['Taquilla Balcón General', 1600, 650, null, 'Incluye 120 cortesías de convenios'],
    ['Patrocinio en efectivo — Grupo Financiero (ficticio)', 1, 250000, null, 'Contrato firmado'],
    ['EGRESOS', '', '', '', ''],
    ['Honorarios de la orquesta y el coro', 1, 1450000, null, '50 % de anticipo pagado'],
    ['Audio profesional (line array, consola y monitoreo)', 1, 186412, null, 'OC por autorizar'],
    ['Iluminación robótica y video LED', 1, 98600, null, ''],
    ['Hospedaje de músicos y staff (3 noches)', 1, 245300, null, 'Pagado'],
    ['Transporte terrestre aeropuerto–hotel–venue', 1, 54000, null, 'Cotización rechazada, se busca otra'],
    ['Campaña publicitaria (exterior, radio y redes)', 1, 312500, null, ''],
    ['Renta del venue y servicios', 1, 380000, null, ''],
    ['', '', '', '', ''],
    ['TOTAL INGRESOS', '', '', null, ''],
    ['TOTAL EGRESOS', '', '', null, ''],
    ['UTILIDAD ESTIMADA', '', '', null, ''],
  ]);
  const w = ws as Record<string, unknown>;
  const num = (addr: string) => Number((w[addr] as { v?: unknown } | undefined)?.v) || 0;
  const sum = (from: number, to: number) => {
    let s = 0;
    for (let r = from; r <= to; r += 1) s += num(`D${r}`);
    return s;
  };
  // Fórmula + valor ya calculado: la hoja se ve con totales sin esperar al recálculo.
  for (let r = 4; r <= 16; r += 1) {
    if (r === 9) continue;
    w[`D${r}`] = { t: 'n', f: `B${r}*C${r}`, v: num(`B${r}`) * num(`C${r}`) };
  }
  w['D18'] = { t: 'n', f: 'SUM(D4:D8)', v: sum(4, 8) };
  w['D19'] = { t: 'n', f: 'SUM(D10:D16)', v: sum(10, 16) };
  w['D20'] = { t: 'n', f: 'D18-D19', v: num('D18') - num('D19') };
  w['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  w['!cols'] = [{ wch: 52 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 36 }];
  const supuestos = XLSX.utils.aoa_to_sheet([
    ['Supuesto', 'Valor'],
    ['Ocupación esperada', 0.88],
    ['Comisión de boletera', 0.08],
    ['Tipo de cambio de referencia', 18.4],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Corrida');
  XLSX.utils.book_append_sheet(wb, supuestos, 'Supuestos');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

function campaignWorkbook(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['GASTOS DE PUBLICIDAD Y CONVENIOS', '', '', ''],
    ['Concepto', 'Cantidad', 'Costo unitario', 'Total'],
    ['RENTA ESPECTACULAR GRUPO MÁS 12.90 X 7.20', 2, 15000, null],
    ['IMPRESIÓN ESPECTACULAR GRUPO MÁS 12.90 X 7.20', 2, 4180, null],
    ['IMPRESIÓN PENDÓN PUEBLA', 300, 145, null],
    ['COLOCACIÓN PENDÓN PUEBLA', 300, 50, null],
    ['RENTA VALLA MÓVIL', 4, 13800, null],
    ['PAPELETA 8 CARTAS', 5000, 3.6, null],
  ]);
  const w = ws as Record<string, unknown>;
  const num = (addr: string) => Number((w[addr] as { v?: unknown } | undefined)?.v) || 0;
  for (let r = 3; r <= 8; r += 1) {
    w[`D${r}`] = { t: 'n', f: `B${r}*C${r}`, v: Math.round(num(`B${r}`) * num(`C${r}`) * 100) / 100 };
  }
  w['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  w['!cols'] = [{ wch: 48 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Campaña');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}

/** PDF de una página (Helvetica, WinAnsi) válido para el visor del panel. */
function pdfBuffer(title: string, lines: string[]): Buffer {
  const clean = (s: string) =>
    s
      .replace(/[—–]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[^\x20-\xFF]/g, '?')
      .replace(/([\\()])/g, '\\$1');
  const body = [
    `BT /F1 16 Tf 56 760 Td (${clean(title)}) Tj ET`,
    ...lines.map((l, i) => `BT /F1 10 Tf 56 ${728 - i * 16} Td (${clean(l)}) Tj ET`),
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

function binary(contentType: string, make: () => Buffer) {
  let cached: Buffer | null = null;
  return (route: Route) => {
    cached = cached || make();
    return route.fulfill({ status: 200, contentType, body: cached });
  };
}

const xlsxFile = (make: () => Buffer) => binary(XLSX_TYPE, make);
const pdfFile = (title: string, lines: string[]) => binary('application/pdf', () => pdfBuffer(title, lines));

/* ── formatos (checklists) ────────────────────────────────────────────────── */

type Item = Record<string, unknown> & { id: string; label: string; type?: string };
type Section = { id: string; title: string; layout?: 'list' | 'columns' | 'header'; items: Item[] };
type FormatData = { formatVersion: number; sections: Section[] };

const TODAY_KEY = dayKey(0);

function headerSection(e: EventRow): Section {
  return {
    id: 'encabezado',
    title: 'Datos del show',
    layout: 'header',
    items: [
      { id: 'show', label: 'Nombre del show', type: 'text', value: e.name, bind: 'event.name', cols: 8 },
      { id: 'fecha', label: 'Fecha', type: 'date', value: TODAY_KEY, bind: 'event.date', cols: 2 },
      { id: 'hora', label: 'Hora', type: 'text', value: e.schedule || '', bind: 'event.time', cols: 2 },
      { id: 'venue', label: 'Venue', type: 'text', value: e.venue || '', bind: 'event.venue', cols: 6 },
      { id: 'ciudad', label: 'Ciudad', type: 'text', value: e.city || '', bind: 'event.city', cols: 2 },
      { id: 'productor', label: 'Productor / empresa', type: 'text', value: e.promoter || '', bind: 'event.promoter', cols: 4 },
    ],
  };
}

function signatures(delivered = 'Entregado', authorized = 'Autorizado'): Section {
  return {
    id: 'firmas',
    title: 'Firmas digitales',
    items: [
      { id: 'firma_entregado', label: delivered, type: 'signature' },
      { id: 'firma_autorizado', label: authorized, type: 'signature' },
    ],
  };
}

/** Formato de casillas: marca hechas las primeras `ratio` de cada sección. */
function checksFormat(
  e: EventRow,
  sections: Array<{ id: string; title: string; checks: string[]; layout?: 'list' | 'columns' }>,
  ratio: number,
): FormatData {
  return {
    formatVersion: 2,
    sections: [
      headerSection(e),
      ...sections.map((s) => ({
        id: s.id,
        title: s.title,
        layout: s.layout,
        items: s.checks.map((label, i) => ({
          id: `${s.id}_${i + 1}`,
          label,
          type: 'check',
          done: i < Math.round(s.checks.length * ratio),
          note: i === 0 && ratio > 0 ? 'Confirmado por teléfono con el proveedor' : '',
        })),
      })),
      signatures(),
    ],
  };
}

const PRODUCCION_DATA: FormatData = {
  formatVersion: 4,
  sections: [
    headerSection(EVT1),
    {
      id: 'audio',
      title: 'Audio — sistema principal, monitoreo y microfonía',
      items: [
        {
          id: 'consola',
          label: 'Consola de sala',
          type: 'select',
          options: ['Digital de 64 canales', 'Digital de 48 canales', 'Analógica de 32 canales'],
          value: 'Digital de 64 canales',
        },
        {
          id: 'sistema',
          label: 'Sistema de PA (marca, modelo y número de cajas por lado)',
          type: 'text',
          value: 'Line array de 12 cajas por lado, 8 subwoofers en arreglo cardioide y 6 front fills',
        },
        { id: 'inear', label: 'Monitoreo in-ear para la orquesta y el coro', type: 'yesno', value: 'SÍ' },
        { id: 'potencia', label: 'Potencia total requerida (kW)', type: 'number', value: 96 },
        { id: 'prueba', label: 'Hora de prueba de sonido', type: 'time', value: '15:30' },
        { id: 'llegada', label: 'Fecha de llegada del equipo', type: 'date', value: TODAY_KEY },
        {
          id: 'obs',
          label: 'Observaciones del ingeniero de sala',
          type: 'longtext',
          value:
            'El director musical pide reforzar la sección de cuerdas con micrófonos de condensador de diafragma pequeño en cada atril. La consola de monitores va a la izquierda del escenario (stage left) y necesita una toma de corriente independiente de 220 V. Evitar cualquier tarima metálica bajo los contrabajos por resonancia.',
          optional: true,
        },
      ],
    },
    {
      id: 'input',
      title: 'Lista de entradas (input list)',
      items: [
        {
          id: 'input',
          label: 'Lista de entradas',
          type: 'table',
          columns: [
            { id: 'canal', label: 'Canal', type: 'number', width: 0.8 },
            { id: 'fuente', label: 'Fuente / instrumento', width: 3 },
            { id: 'mic', label: 'Micrófono o caja directa', width: 2.2 },
            { id: 'base', label: 'Base', width: 1.2 },
            { id: 'notas', label: 'Notas', width: 2.6 },
          ],
          rows: [
            { canal: 1, fuente: 'Violines primeros (atriles 1 a 4)', mic: 'Condensador pequeño ×4', base: 'Clip', notas: 'Phantom 48 V' },
            { canal: 2, fuente: 'Violines segundos (atriles 1 a 4)', mic: 'Condensador pequeño ×4', base: 'Clip', notas: '' },
            { canal: 3, fuente: 'Violas', mic: 'Condensador pequeño ×3', base: 'Clip', notas: '' },
            { canal: 4, fuente: 'Violonchelos', mic: 'Condensador grande ×2', base: 'Boom corta', notas: 'Sin tarima metálica' },
            { canal: 5, fuente: 'Contrabajos', mic: 'Dinámico ×2', base: 'Boom corta', notas: '' },
            { canal: 6, fuente: 'Piano de cola de concierto (tapa completa)', mic: 'Par estéreo de condensador', base: 'Boom alta', notas: 'Afinación a 442 Hz antes del ensayo' },
            { canal: 7, fuente: 'Coro — par principal', mic: 'Par espaciado de condensador', base: 'Torre de 4 m', notas: '' },
            { canal: 8, fuente: 'Voz del director (presentaciones)', mic: 'Inalámbrico de mano', base: '—', notas: 'Frecuencia coordinada' },
          ],
          minRows: 10,
        },
      ],
    },
    {
      id: 'iluminacion',
      title: 'Iluminación, video y escenografía',
      layout: 'columns',
      items: [
        { id: 'il1', label: 'Plano de iluminación aprobado por el diseñador', type: 'check', done: true, note: 'Versión 3, enviada por correo' },
        { id: 'il2', label: '24 cabezas robóticas tipo spot', type: 'check', done: true, note: '' },
        { id: 'il3', label: 'Seguidores (2) con operador', type: 'check', done: false, note: '' },
        { id: 'il4', label: 'Tres pantallas LED de 6 × 3 m con procesador', type: 'check', done: true, note: '' },
        { id: 'il5', label: 'Máquina de niebla de bajo nivel (solo en el segundo acto)', type: 'check', done: false, note: '' },
        { id: 'il6', label: 'Atriles con luz para 84 músicos', type: 'check', done: false, note: 'Faltan 12 lámparas' },
      ],
    },
    {
      id: 'presupuesto',
      title: 'Presupuesto de producción técnica',
      items: [
        {
          id: 'costos',
          label: 'Costos de producción',
          type: 'table',
          columns: [
            { id: 'concepto', label: 'Concepto', width: 3.2, prefilled: true },
            { id: 'cantidad', label: 'Cantidad', type: 'number', width: 1 },
            { id: 'unitario', label: 'Precio unitario', type: 'money', width: 1.4 },
            { id: 'total', label: 'Total', type: 'money', width: 1.4, total: true },
          ],
          rows: [
            { concepto: 'Renta de sistema de audio completo', cantidad: 1, unitario: 160700, total: 160700 },
            { concepto: 'Iluminación robótica y video LED', cantidad: 1, unitario: 85000, total: 85000 },
            { concepto: 'Planta de luz de 500 kVA con caja acústica', cantidad: 1, unitario: 38500, total: 38500 },
            { concepto: 'Técnicos de escenario (turno de 14 h)', cantidad: 12, unitario: 2400, total: 28800 },
            { concepto: 'Afinación de piano de concierto', cantidad: null, unitario: null, total: null },
          ],
          minRows: 5,
          totalLabel: 'Total de producción técnica',
        },
      ],
    },
    {
      id: 'adjuntos',
      title: 'Adjuntos',
      items: [
        {
          id: 'rider',
          label: 'Rider técnico firmado por el director musical',
          type: 'attachment',
          value: 'Rider técnico de la orquesta firmado por el director musical.pdf',
          fileId: 'file-rich-rider',
        },
        { id: 'plano', label: 'Plano de escenario con distribución de atriles', type: 'attachment', value: null, fileId: null },
      ],
    },
    {
      id: 'condiciones',
      title: 'Condiciones',
      items: [
        {
          id: 'condicion_1',
          label:
            'El proveedor de audio entrega el sistema probado y ecualizado a más tardar a las 14:00 del día del show; cualquier falla posterior se atiende con su personal en sitio sin costo adicional.',
          type: 'paragraph',
        },
        {
          id: 'condicion_2',
          label:
            'La producción del artista no puede modificar la posición de las torres de PA sin la aprobación del responsable de seguridad del venue.',
          type: 'paragraph',
        },
      ],
    },
    signatures('Producción técnica', 'Dirección de operaciones'),
  ],
};

const COMPROMISO_DATA: FormatData = {
  formatVersion: 4,
  sections: [
    {
      id: 'encabezado',
      title: 'Producción externa',
      layout: 'header',
      items: [
        { id: 'evento', label: 'Evento', type: 'text', value: EVT1.name, bind: 'event.name', cols: 8 },
        { id: 'fecha', label: 'Fecha', type: 'date', value: TODAY_KEY, bind: 'event.date', cols: 4 },
        { id: 'productor', label: 'Productor / empresa', type: 'text', value: EVT1.promoter, bind: 'event.promoter', cols: 6 },
        { id: 'encargado', label: 'Encargado de producción', type: 'text', value: OCTAVIO.fullName, cols: 6 },
      ],
    },
    {
      id: 'horarios',
      title: 'Horarios y condiciones operativas',
      items: [
        {
          id: 'horarios',
          label: 'Horarios y condiciones operativas',
          type: 'table',
          columns: [
            { id: 'concepto', label: 'Concepto', width: 3.4, prefilled: true },
            { id: 'comprometido', label: 'Horario comprometido', type: 'time', width: 1.3 },
            { id: 'real', label: 'Hora real', type: 'time', width: 1.1 },
            { id: 'observaciones', label: 'Observaciones', width: 2.2 },
          ],
          rows: [
            { concepto: 'Inicio de montaje', comprometido: '07:00', real: '07:10', observaciones: 'Llegó tarde el tráiler de audio' },
            { concepto: 'Llegada de ambulancia', comprometido: '17:00', real: '16:50', observaciones: '' },
            { concepto: 'Llegada de planta de luz / generador eléctrico con caja acústica', comprometido: '06:00', real: '06:00', observaciones: '' },
            { concepto: 'Apertura de puertas al público', comprometido: '19:30', real: '19:30', observaciones: '' },
            { concepto: 'Inicio del show', comprometido: '21:00', real: '21:05', observaciones: 'Se esperó al público de la fila de acceso B' },
          ],
          minRows: 5,
        },
      ],
    },
    {
      id: 'condiciones',
      title: 'Condiciones',
      items: [
        {
          id: 'condicion_1',
          label:
            'El escenario e instalaciones serán entregados a la Producción en buenas condiciones de operación, salvo cualquier condición o desperfecto previamente identificado y documentado.',
          type: 'paragraph',
        },
      ],
    },
    signatures('Producción externa', 'Auditorio Metropolitano'),
  ],
};

type ChecklistFixture = {
  id: string;
  title: string;
  progressPct: number;
  revision: number;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SEALED';
  template: { id: string; key: string };
  lastEditedAt: string | null;
  lastEditedBy: { fullName: string } | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  sealedAt?: string | null;
  sealedBy?: { fullName: string } | null;
  deliveredAt?: string | null;
  deliveredBy?: { fullName: string } | null;
  authorizedAt?: string | null;
  authorizedBy?: { fullName: string } | null;
  pdfUrl: string | null;
  pdfGeneratedAt: string | null;
  data: FormatData;
};

const CHECKLISTS: ChecklistFixture[] = [
  {
    id: 'chk-rich-produccion',
    title: 'Producción técnica — Rider de audio, iluminación, backline y requerimientos de escenario',
    progressPct: 83,
    revision: 7,
    status: 'DRAFT',
    template: { id: 'tpl-rich-produccion', key: 'PRODUCCION_TECNICA' },
    lastEditedAt: minutesAgo(48),
    lastEditedBy: nameOnly(OCTAVIO),
    pdfUrl: '/uploads/checklists/chk-rich-produccion-r7.pdf',
    pdfGeneratedAt: minutesAgo(48),
    data: PRODUCCION_DATA,
  },
  {
    id: 'chk-rich-transporte',
    title:
      'Transporte terrestre del aeropuerto al hotel y del hotel al venue (traslados de staff, banda y producción)',
    progressPct: 0,
    revision: 1,
    status: 'DRAFT',
    template: { id: 'tpl-rich-transporte', key: 'TRANSPORTE' },
    lastEditedAt: null,
    lastEditedBy: null,
    pdfUrl: null,
    pdfGeneratedAt: null,
    data: checksFormat(
      EVT1,
      [
        {
          id: 'aeropuerto',
          title: 'Aeropuerto → hotel',
          checks: [
            'Autobús ejecutivo de 45 plazas con portaequipaje para estuches de contrabajo',
            'Camioneta de carga para instrumentos (caja seca, con rampa)',
            'Gafete de acceso a plataforma para el coordinador',
          ],
        },
        {
          id: 'venue',
          title: 'Hotel → venue (día del show)',
          checks: ['Salida 06:30 con el staff técnico', 'Salida 15:00 con los músicos', 'Regreso escalonado después del show'],
        },
      ],
      0,
    ),
  },
  {
    id: 'chk-rich-seguridad',
    title: 'Seguridad, protección civil y servicios médicos',
    progressPct: 35,
    revision: 4,
    status: 'REVIEW',
    template: { id: 'tpl-rich-seguridad', key: 'SEGURIDAD' },
    lastEditedAt: daysAgo(1, 17, 20),
    lastEditedBy: nameOnly(GERARDO),
    submittedAt: daysAgo(1, 17, 25),
    deliveredAt: daysAgo(1, 17, 25),
    deliveredBy: nameOnly(GERARDO),
    pdfUrl: '/uploads/checklists/chk-rich-seguridad-r4.pdf',
    pdfGeneratedAt: daysAgo(1, 17, 25),
    data: checksFormat(
      EVT1,
      [
        {
          id: 'pc',
          title: 'Protección civil',
          checks: [
            'Programa interno de protección civil sellado por la autoridad municipal',
            'Rutas de evacuación señalizadas',
            'Extintores revisados',
            'Simulacro con el personal del venue',
          ],
        },
        {
          id: 'medico',
          title: 'Servicios médicos',
          checks: ['Ambulancia de soporte vital básico', 'Módulo de primeros auxilios', 'Paramédicos (4)'],
          layout: 'columns',
        },
      ],
      0.35,
    ),
  },
  {
    id: 'chk-rich-camerinos',
    title: 'Camerinos, catering y hospitalidad del artista',
    progressPct: 88,
    revision: 9,
    status: 'DRAFT',
    template: { id: 'tpl-rich-camerinos', key: 'CAMERINOS' },
    lastEditedAt: minutesAgo(130),
    lastEditedBy: nameOnly(BETO),
    pdfUrl: '/uploads/checklists/chk-rich-camerinos-r9.pdf',
    pdfGeneratedAt: minutesAgo(130),
    data: checksFormat(
      EVT1,
      [
        {
          id: 'camerinos',
          title: 'Camerinos',
          checks: [
            'Camerino del director con piano vertical',
            'Dos camerinos colectivos para la orquesta',
            'Camerino del coro con espejos y percheros',
            'Toallas y agua embotellada',
          ],
        },
        {
          id: 'catering',
          title: 'Catering',
          checks: ['Comida para 140 personas a las 14:00', 'Opción vegetariana y sin gluten', 'Café y fruta durante el montaje'],
        },
      ],
      0.88,
    ),
  },
  {
    id: 'chk-rich-hospedaje',
    title: 'Hospedaje',
    progressPct: 100,
    revision: 5,
    status: 'APPROVED',
    template: { id: 'tpl-rich-hospedaje', key: 'HOSPEDAJE' },
    lastEditedAt: daysAgo(3, 12),
    lastEditedBy: nameOnly(BETO),
    approvedAt: daysAgo(2, 10),
    deliveredAt: daysAgo(3, 12),
    deliveredBy: nameOnly(BETO),
    authorizedAt: daysAgo(2, 10),
    authorizedBy: nameOnly(ANA),
    pdfUrl: '/uploads/checklists/chk-rich-hospedaje-r5.pdf',
    pdfGeneratedAt: daysAgo(2, 10),
    data: checksFormat(
      EVT1,
      [
        {
          id: 'hotel',
          title: 'Hotel',
          checks: ['62 habitaciones dobles confirmadas', 'Late check-out para el staff técnico', 'Desayuno incluido'],
        },
      ],
      1,
    ),
  },
  {
    id: 'chk-rich-compromiso',
    title: 'Compromiso de horarios — Día del show',
    progressPct: 100,
    revision: 3,
    status: 'SEALED',
    template: { id: 'tpl-rich-compromiso', key: 'COMPROMISO_HORARIOS' },
    lastEditedAt: daysAgo(1, 9),
    lastEditedBy: nameOnly(OCTAVIO),
    approvedAt: daysAgo(1, 11),
    sealedAt: daysAgo(1, 11, 30),
    sealedBy: nameOnly(ANA),
    deliveredAt: daysAgo(1, 9),
    deliveredBy: nameOnly(OCTAVIO),
    authorizedAt: daysAgo(1, 11),
    authorizedBy: nameOnly(ANA),
    pdfUrl: '/uploads/checklists/chk-rich-compromiso-r3.pdf',
    pdfGeneratedAt: daysAgo(1, 11, 30),
    data: COMPROMISO_DATA,
  },
];

/** Lo que trae la LISTA del evento: sin `dataJson`. */
function checklistListRow(c: ChecklistFixture) {
  const { data: _data, ...rest } = c;
  return rest;
}

/** `GET /checklists/:id`: con contenido e historial. */
function checklistFull(c: ChecklistFixture) {
  return {
    ...checklistListRow(c),
    dataJson: c.data,
    versions: [
      { id: `${c.id}-v3`, createdAt: c.lastEditedAt || daysAgo(1), note: 'Ajuste de horarios después de la junta de producción', editedBy: c.lastEditedBy },
      { id: `${c.id}-v2`, createdAt: daysAgo(4, 13), note: null, editedBy: nameOnly(BETO) },
      { id: `${c.id}-v1`, createdAt: daysAgo(9, 10), note: 'Creado desde la plantilla', editedBy: nameOnly(ANA) },
    ],
  };
}

/* ── órdenes de compra ────────────────────────────────────────────────────── */

type PoLine = { id: string; concept: string; qty: number | null; unitPrice: number | null; total: number };

function lines(prefix: string, rows: Array<[string, number, number]>): PoLine[] {
  return rows.map(([concept, qty, unitPrice], i) => ({
    id: `${prefix}-l${i + 1}`,
    concept,
    qty,
    unitPrice,
    total: Math.round(qty * unitPrice * 100) / 100,
  }));
}

function poAmount(ls: PoLine[], withIva: boolean): number {
  const sub = ls.reduce((s, l) => s + l.total, 0);
  return Math.round(sub * (withIva ? 1.16 : 1) * 100) / 100;
}

type PoFixture = {
  id: string;
  eventId: string;
  rubro: string;
  vendorName: string;
  description: string | null;
  amount: number;
  status: string;
  paymentMethod: string;
  payeeType: string;
  withIva: boolean;
  lines: PoLine[];
  proofs: Array<{ id: string; fileUrl: string; label: string | null; amount: number | null }>;
  createdAt: string;
  authorizedAt: string | null;
  paidAt: string | null;
  createdBy: { fullName: string } | null;
  authorizedBy: { fullName: string } | null;
};

function po(p: Omit<PoFixture, 'amount'>): PoFixture {
  return { ...p, amount: poAmount(p.lines, p.withIva) };
}

const PURCHASE_ORDERS: PoFixture[] = [
  po({
    id: 'po-rich-1',
    eventId: EVT1_ID,
    rubro: 'audio',
    vendorName: 'Audio Profesional del Centro y Renta de Equipo Escénico, S.A. de C.V.',
    description:
      'Renta de sistema line array de 24 cajas, 8 subwoofers, consola digital de 64 canales y monitoreo in-ear para 40 músicos, con dos ingenieros y cuatro técnicos durante montaje, ensayo y show.',
    status: 'PENDING_AUTH',
    paymentMethod: 'TRANSFERENCIA',
    payeeType: 'PROVEEDOR',
    withIva: true,
    lines: lines('po-rich-1', [
      ['Sistema line array (24 cajas) con subwoofers y front fills', 1, 112000],
      ['Consola digital de 64 canales para sala y consola de monitores', 2, 18500],
      ['Monitoreo in-ear inalámbrico (40 mezclas)', 1, 11700],
    ]),
    proofs: [],
    createdAt: daysAgo(2, 11, 15),
    authorizedAt: null,
    paidAt: null,
    createdBy: nameOnly(OCTAVIO),
    authorizedBy: null,
  }),
  po({
    id: 'po-rich-2',
    eventId: EVT1_ID,
    rubro: 'luces',
    vendorName: 'Iluminación Escénica Robótica Integral',
    description: 'Iluminación robótica, seguidores y tres pantallas LED de 6 × 3 m con procesador de video.',
    status: 'AUTHORIZED',
    paymentMethod: 'CHEQUE',
    payeeType: 'PROVEEDOR',
    withIva: true,
    lines: lines('po-rich-2', [
      ['Cabezas robóticas tipo spot', 24, 2100],
      ['Pantallas LED de 6 × 3 m con procesador', 3, 11500],
      ['Seguidores con operador', 2, 1700],
    ]),
    proofs: [],
    createdAt: daysAgo(5, 10),
    authorizedAt: daysAgo(4, 9, 40),
    paidAt: null,
    createdBy: nameOnly(OCTAVIO),
    authorizedBy: nameOnly(ANA),
  }),
  po({
    id: 'po-rich-3',
    eventId: EVT1_ID,
    rubro: 'hospedaje',
    vendorName: 'Hotel Boutique Casona de los Ángeles — Centro Histórico',
    description: '62 habitaciones dobles por tres noches con desayuno para músicos, coro y staff técnico.',
    status: 'PAID',
    paymentMethod: 'TRANSFERENCIA',
    payeeType: 'PROVEEDOR',
    withIva: true,
    lines: lines('po-rich-3', [
      ['Habitación doble con desayuno (noche)', 186, 1100],
      ['Salón para junta de producción', 1, 6420],
    ]),
    proofs: [
      {
        id: 'proof-rich-1',
        fileUrl: '/uploads/proofs/transferencia-hotel-casona.pdf',
        label: 'Transferencia SPEI — Hotel Casona de los Ángeles',
        amount: null,
      },
    ],
    createdAt: daysAgo(12, 13),
    authorizedAt: daysAgo(11, 9),
    paidAt: daysAgo(9, 16, 30),
    createdBy: nameOnly(BETO),
    authorizedBy: nameOnly(ANA),
  }),
  po({
    id: 'po-rich-4',
    eventId: EVT1_ID,
    rubro: 'Afinación y mantenimiento de pianos de concierto',
    vendorName: 'Taller de Pianos Hermanos Valdivia',
    description: 'Afinación a 442 Hz antes del ensayo general y técnico de guardia durante el show.',
    status: 'DRAFT',
    paymentMethod: 'EFECTIVO',
    payeeType: 'PROVEEDOR',
    withIva: false,
    lines: lines('po-rich-4', [
      ['Afinación de piano de cola', 1, 4500],
      ['Técnico de guardia (turno)', 1, 4200],
    ]),
    proofs: [],
    createdAt: minutesAgo(90),
    authorizedAt: null,
    paidAt: null,
    createdBy: nameOnly(OCTAVIO),
    authorizedBy: null,
  }),
  po({
    id: 'po-rich-5',
    eventId: EVT1_ID,
    rubro: 'transporte',
    vendorName: 'Autobuses Turísticos Ejecutivos del Golfo',
    description: 'Cotización rechazada: no incluye camioneta de carga para los estuches de contrabajo.',
    status: 'REJECTED',
    paymentMethod: 'TRANSFERENCIA',
    payeeType: 'PROVEEDOR',
    withIva: true,
    lines: lines('po-rich-5', [['Autobús ejecutivo de 45 plazas (día)', 3, 15517.24]]),
    proofs: [],
    createdAt: daysAgo(6, 12),
    authorizedAt: null,
    paidAt: null,
    createdBy: nameOnly(BETO),
    authorizedBy: null,
  }),
  po({
    id: 'po-rich-6',
    eventId: EVT1_ID,
    rubro: 'catering',
    vendorName: 'Banquetes y Catering Sabores de la Tierra para Camerinos y Staff',
    description: 'Comida del día del show para 140 personas, café de montaje y fruta en camerinos.',
    status: 'PENDING_AUTH',
    paymentMethod: 'TRANSFERENCIA',
    payeeType: 'OTRO',
    withIva: true,
    lines: lines('po-rich-6', [
      ['Comida completa (persona)', 140, 185],
      ['Servicio de café durante el montaje', 1, 2100],
    ]),
    proofs: [],
    createdAt: daysAgo(1, 16, 5),
    authorizedAt: null,
    paidAt: null,
    createdBy: nameOnly(BETO),
    authorizedBy: null,
  }),
  po({
    id: 'po-rich-7',
    eventId: 'evt-rich-4',
    rubro: 'publicidad',
    vendorName: 'Medios Exteriores del Valle',
    description: 'Pendones y papeletas para las tres funciones.',
    status: 'PENDING_AUTH',
    paymentMethod: 'TRANSFERENCIA',
    payeeType: 'PROVEEDOR',
    withIva: true,
    lines: lines('po-rich-7', [
      ['IMPRESIÓN PENDÓN CHOLULA', 150, 105],
      ['COLOCACIÓN PENDÓN CHOLULA', 150, 38],
    ]),
    proofs: [],
    createdAt: daysAgo(9, 11),
    authorizedAt: null,
    paidAt: null,
    createdBy: nameOnly(XIMENA),
    authorizedBy: null,
  }),
  po({
    id: 'po-rich-8',
    eventId: 'evt-rich-4',
    rubro: 'audio',
    vendorName: 'Sonido Compacto para Teatro',
    description: null,
    status: 'PAID',
    paymentMethod: 'EFECTIVO',
    payeeType: 'PROVEEDOR',
    withIva: false,
    lines: lines('po-rich-8', [['Sistema de voz para teatro (función)', 3, 6500]]),
    proofs: [],
    createdAt: daysAgo(14, 10),
    authorizedAt: daysAgo(13, 10),
    paidAt: daysAgo(12, 18),
    createdBy: nameOnly(OCTAVIO),
    authorizedBy: nameOnly(ANA),
  }),
  po({
    id: 'po-rich-9',
    eventId: 'evt-rich-5',
    rubro: 'artes',
    vendorName: 'Estudio de Diseño Gráfico Tinta y Papel',
    description: 'Artes finales para redes, lona y boleto.',
    status: 'AUTHORIZED',
    paymentMethod: 'TRANSFERENCIA',
    payeeType: 'PROVEEDOR',
    withIva: true,
    lines: lines('po-rich-9', [['Paquete de artes (redes, lona y boleto)', 1, 18000]]),
    proofs: [],
    createdAt: daysAgo(7, 15),
    authorizedAt: daysAgo(6, 12),
    paidAt: null,
    createdBy: nameOnly(XIMENA),
    authorizedBy: nameOnly(RENATA),
  }),
  po({
    id: 'po-rich-10',
    eventId: 'evt-rich-5',
    rubro: 'planta_luz',
    vendorName: 'Energía Móvil para Eventos',
    description: 'Planta de respaldo para la sala de cámara.',
    status: 'PENDING_AUTH',
    paymentMethod: 'TRANSFERENCIA',
    payeeType: 'PROVEEDOR',
    withIva: true,
    lines: lines('po-rich-10', [['Planta de luz de 150 kVA (día)', 1, 14200]]),
    proofs: [],
    createdAt: daysAgo(10, 9),
    authorizedAt: null,
    paidAt: null,
    createdBy: nameOnly(RENATA),
    authorizedBy: null,
  }),
];

const posOf = (eventId: string) =>
  PURCHASE_ORDERS.filter((p) => p.eventId === eventId).map(({ eventId: _e, ...rest }) => rest);

/** `GET /analytics/purchase-orders` → `orders[]` (forma `PoRow` de la página). */
const PO_ANALYTICS = {
  orders: PURCHASE_ORDERS.map((p) => {
    const e = evt(p.eventId);
    return {
      id: p.id,
      eventId: p.eventId,
      eventName: e.name,
      eventStatus: e.status,
      rubro: p.rubro,
      vendorName: p.vendorName,
      paymentMethod: p.paymentMethod,
      payeeType: p.payeeType,
      withIva: p.withIva,
      proofCount: p.proofs.length,
      status: p.status,
      amount: p.amount,
      ageDays: Math.max(0, Math.round((NOW.getTime() - new Date(p.createdAt).getTime()) / 86_400_000)),
      createdAt: p.createdAt,
      createdBy: p.createdBy?.fullName ?? null,
    };
  }),
};

/* ── archivos y documentos del evento ─────────────────────────────────────── */

const EVT1_FILES = [
  {
    id: 'file-rich-corrida',
    fileName: 'Corrida financiera — Gira Latinoamericana Sinfónica 2026 (versión autorizada por dirección).xlsx',
    url: '/uploads/events/evt-rich-1/corrida-v3.xlsx',
    kind: 'excel',
    module: 'finance',
    checklistId: null,
    panelEditable: true,
    panelBlockReason: null,
    createdAt: daysAgo(10, 12),
    updatedAt: daysAgo(1, 19, 10),
    version: 3,
  },
  {
    id: 'file-rich-corrida-v1',
    fileName: 'Corrida preliminar (salida).pdf',
    url: '/uploads/events/evt-rich-1/corrida-preliminar.pdf',
    kind: 'pdf',
    module: 'finance',
    checklistId: null,
    createdAt: daysAgo(18, 9),
    updatedAt: daysAgo(18, 9),
    version: 1,
  },
  {
    id: 'file-rich-campana',
    fileName: 'Campaña publicitaria — conceptos, fechas de pauta y proveedores de exterior.xlsx',
    url: '/uploads/events/evt-rich-1/campana.xlsx',
    kind: 'excel',
    module: 'campaign',
    checklistId: null,
    panelEditable: true,
    createdAt: daysAgo(8, 10),
    updatedAt: daysAgo(2, 13),
    version: 2,
  },
  {
    id: 'file-rich-campana-pdf',
    fileName: 'Campaña interna (salida).pdf',
    url: '/uploads/events/evt-rich-1/campana-interna.pdf',
    kind: 'pdf',
    module: 'campaign',
    checklistId: null,
    createdAt: daysAgo(2, 13, 5),
    updatedAt: daysAgo(2, 13, 5),
    version: 1,
  },
  {
    id: 'file-rich-rider',
    fileName: 'Rider técnico de la orquesta firmado por el director musical.pdf',
    url: '/uploads/events/evt-rich-1/rider-tecnico.pdf',
    kind: 'pdf',
    module: 'checklist',
    checklistId: 'chk-rich-produccion',
    createdAt: daysAgo(6, 17),
    updatedAt: daysAgo(6, 17),
    version: 1,
  },
  {
    id: 'file-rich-proof',
    fileName: 'Comprobante de transferencia — Hotel Boutique Casona de los Ángeles.pdf',
    url: '/uploads/proofs/transferencia-hotel-casona.pdf',
    kind: 'proof',
    module: 'oc',
    checklistId: null,
    createdAt: daysAgo(9, 16, 30),
    updatedAt: daysAgo(9, 16, 30),
    version: 1,
  },
  {
    id: 'file-rich-convenios',
    fileName: 'CONVENIOS-Gira-Latinoamericana-Sinfonica-2026.xlsx',
    url: '/uploads/events/evt-rich-1/convenios.xlsx',
    kind: 'excel',
    module: 'sponsors',
    checklistId: null,
    createdAt: daysAgo(3, 12),
    updatedAt: daysAgo(3, 12),
    version: 1,
  },
  {
    id: 'file-rich-contrato',
    fileName: 'Contrato de prestación de servicios artísticos con anexos técnicos y calendario de pagos.pdf',
    url: '/uploads/events/evt-rich-1/contrato.pdf',
    kind: 'pdf',
    module: 'general',
    checklistId: null,
    createdAt: daysAgo(25, 11),
    updatedAt: daysAgo(25, 11),
    version: 1,
  },
];

const EVT1_DOCUMENTS = [
  {
    id: 'doc-rich-1',
    title: 'Minuta de la junta de producción con el promotor y la dirección musical',
    module: 'general',
    blocksJson: [
      { type: 'h1', text: 'Minuta de producción' },
      { type: 'p', text: 'Asistentes: dirección de operaciones, producción técnica, logística y el representante del promotor.' },
      { type: 'bullet', text: 'El ensayo general se mueve a las 16:00 por la llegada del coro.' },
      { type: 'bullet', text: 'Se agregan 12 lámparas de atril a la orden de iluminación.' },
      {
        type: 'table',
        rows: [
          ['Acuerdo', 'Responsable', 'Fecha'],
          ['Confirmar transporte de instrumentos', BETO.fullName, dayKey(-1)],
          ['Enviar plano de escenario', OCTAVIO.fullName, TODAY_KEY],
        ],
      },
    ],
    version: 4,
    pdfUrl: '/uploads/events/evt-rich-1/minuta-v4.pdf',
    pdfVersion: 4,
    updatedAt: daysAgo(1, 13),
    updatedBy: ref(ANA),
  },
  {
    id: 'doc-rich-2',
    title: 'Carta de bienvenida para músicos',
    module: 'general',
    blocksJson: [{ type: 'p', text: 'Bienvenidos a Puebla. En esta carta encontrarán horarios, hotel y contactos de producción.' }],
    version: 1,
    pdfUrl: null,
    pdfVersion: null,
    updatedAt: daysAgo(5, 10),
    updatedBy: ref(BETO),
  },
];

/* ── campaña, convenios, boletera, patrocinadores ─────────────────────────── */

const EVT1_CAMPAIGN = {
  id: 'camp-rich-1',
  authorized: false,
  type: 'CONCERT',
  notes: 'Pauta en exterior y radio; redes con presupuesto aparte.',
  status: 'DRAFT',
  submittedAt: null,
  authorizedAt: null,
  paidAt: null,
  convenioStatus: 'REVIEW',
  convenioSubmittedAt: daysAgo(1, 12),
  updatedAt: daysAgo(1, 12),
  dataJson: {
    concepts: [
      { concept: 'RENTA ESPECTACULAR GRUPO MÁS 12.90 X 7.20', qty: 2, from: dayKey(-14), to: dayKey(0), precioInterno: 15000, precioExterno: 18000 },
      { concept: 'IMPRESIÓN ESPECTACULAR GRUPO MÁS 12.90 X 7.20', qty: 2, from: dayKey(-16), to: dayKey(-15), precioInterno: 4180, precioExterno: 5500 },
      { concept: 'IMPRESIÓN PENDÓN PUEBLA', qty: 300, from: dayKey(-10), to: dayKey(-9), precioInterno: 145, precioExterno: 155 },
      { concept: 'COLOCACIÓN PENDÓN PUEBLA', qty: 300, from: dayKey(-9), to: dayKey(0), precioInterno: 50, precioExterno: 60 },
      { concept: 'PERMISO PENDÓN PUEBLA', qty: 300, from: dayKey(-9), to: dayKey(0), precioInterno: 390, precioExterno: 390 },
      { concept: 'RENTA VALLA MÓVIL', qty: 4, from: dayKey(-5), to: dayKey(-1), precioInterno: 13800, precioExterno: 20000 },
      {
        concept: 'Activación en plazas comerciales con ensamble de cuerdas y entrega de volantes (fines de semana previos al show)',
        qty: 2,
        from: dayKey(-8),
        to: dayKey(-1),
        precioInterno: 9500,
        precioExterno: null,
      },
      { concept: 'PAPELETA 8 CARTAS', qty: 5000, from: dayKey(-12), to: dayKey(-2), precioInterno: 3.6, precioExterno: 4.2 },
    ],
    convenios: [
      {
        concept: 'CONVENIO GRUPO TRIBUNA',
        description: 'Menciones en radio y nota en el suplemento cultural del domingo',
        zona: 'Zona Oro Central',
        qty: 40,
        price: 1950,
      },
      {
        concept: 'Convenio con estación de radio cultural universitaria (ficticia)',
        description: 'Cápsulas de 30 segundos durante dos semanas y entrevista en vivo con el director',
        zona: 'Balcón General',
        qty: 60,
        price: 650,
      },
      { concept: 'Revista de agenda cultural', description: 'Media plana a color', zona: 'Zona Plata Lateral', qty: 20, price: 1200 },
    ],
  },
};

const EVT1_TICKETING = [
  {
    id: 'tix-rich-1',
    boletera: 'Arema',
    logoUrl: null,
    holdUntil: at(-1, 23, 59),
    artist: EVT1.artist,
    promoter: EVT1.promoter,
    venue: EVT1.venue,
    notes: 'Liberar los holds del promotor 48 h antes del show.',
    artsUrl: 'https://www.example.com/artes/gira-sinfonica-2026',
    dateLabel: null,
    functions: 1,
    schedule: '21:00',
    description: 'Concierto sinfónico con coro. Recomendado para mayores de 8 años.',
    holdArtist: 40,
    holdPromoter: 120,
    holdVenue: 30,
    zonesJson: [
      { zona: 'Zona Platino Preferente (filas A a F)', aforo: 420, precio: 2850, sold: 388 },
      { zona: 'Zona Oro Central', aforo: 980, precio: 1950, sold: 902 },
      { zona: 'Zona Plata Lateral', aforo: 1450, precio: 1200, sold: 1104 },
      { zona: 'Balcón General', aforo: 1600, precio: 650, sold: 1288 },
      { zona: 'Palcos Corporativos (10 personas por palco)', aforo: 120, precio: 4200, sold: 90 },
    ],
    createdAt: daysAgo(30, 10),
    updatedAt: daysAgo(1, 9),
  },
];

const EVT1_SPONSORS = [
  {
    id: 'spo-rich-1',
    name: 'Grupo Financiero Horizonte Andino (ficticio)',
    tier: 'Oro',
    status: 'SIGNED',
    contact: null,
    contactName: 'Lucía Benavides Arriaga',
    contactEmail: 'patrocinios@example.com',
    contactPhone: null,
    contribution: 'Efectivo',
    amount: 250000,
    benefits: 'Logotipo en lona principal, 40 cortesías Zona Oro y mención al inicio del concierto',
    deliverables: 'Fotografías del evento y reporte de alcance en redes',
    paymentTerms: '50 % a la firma y 50 % una semana antes del show',
    validFrom: dayKey(-30),
    validUntil: dayKey(5),
    notes: null,
  },
  {
    id: 'spo-rich-2',
    name: 'Cervecería Artesanal del Volcán',
    tier: 'Hospitality',
    status: 'NEGOTIATING',
    contact: null,
    contactName: 'Hugo Mendizábal',
    contactEmail: 'hugo@example.com',
    contactPhone: null,
    contribution: 'Producto',
    amount: 60000,
    benefits: 'Barra exclusiva en el vestíbulo',
    deliverables: null,
    paymentTerms: null,
    validFrom: null,
    validUntil: null,
    notes: 'Esperan propuesta de ubicación de la barra.',
  },
  {
    id: 'spo-rich-3',
    name: 'Fundación para la Música y las Artes Escénicas de Puebla (ficticia)',
    tier: 'Media',
    status: 'PROPOSED',
    contact: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    contribution: 'Media / pauta',
    amount: null,
    benefits: null,
    deliverables: null,
    paymentTerms: null,
    validFrom: null,
    validUntil: null,
    notes: null,
  },
];

/* ── tareas ───────────────────────────────────────────────────────────────── */

type TaskFixture = {
  id: string;
  title: string;
  module: string | null;
  detail: string | null;
  status: string;
  dueAt: string | null;
  seenAt: string | null;
  submittedAt: string | null;
  completionNote: string | null;
  rejectionNote: string | null;
  approvedAt?: string | null;
  assigneeId: string | null;
  assignee: { id: string; fullName: string; email?: string } | null;
  assigneeIds: string[];
  assignees: Array<{ id: string; fullName: string; email?: string | null }>;
  createdById: string;
  createdBy: { id: string; fullName: string };
  approvedBy: { id: string; fullName: string } | null;
  rejectedBy: { id: string; fullName: string } | null;
  event: { id: string; name: string; status: string; entity: string } | null;
  evidences: Array<{ id: string; fileUrl: string; label: string | null; createdAt: string; uploadedBy: { id: string; fullName: string } }>;
  activities: Array<{ id: string; action: string; detail: string | null; createdAt: string; actor: { id: string; fullName: string } }>;
};

function task(
  t: Pick<TaskFixture, 'id' | 'title' | 'status'> &
    Partial<Omit<TaskFixture, 'assignees' | 'createdBy'>> & { to: Person[]; by: Person; eventId?: string },
): TaskFixture {
  const e = t.eventId ? evt(t.eventId) : null;
  return {
    id: t.id,
    title: t.title,
    module: t.module ?? null,
    detail: t.detail ?? null,
    status: t.status,
    dueAt: t.dueAt ?? null,
    seenAt: t.seenAt ?? null,
    submittedAt: t.submittedAt ?? null,
    completionNote: t.completionNote ?? null,
    rejectionNote: t.rejectionNote ?? null,
    approvedAt: t.approvedAt ?? null,
    assigneeId: t.to[0]?.id ?? null,
    assignee: t.to[0] ? { ...ref(t.to[0]), email: t.to[0].email } : null,
    assigneeIds: t.to.map((p) => p.id),
    assignees: t.to.map((p) => ({ ...ref(p), email: p.email })),
    createdById: t.by.id,
    createdBy: ref(t.by),
    approvedBy: t.approvedBy ?? null,
    rejectedBy: t.rejectedBy ?? null,
    event: e ? { id: e.id, name: e.name, status: e.status, entity: e.entity } : null,
    evidences: t.evidences ?? [],
    activities: t.activities ?? [
      { id: `${t.id}-a1`, action: 'created', detail: null, createdAt: daysAgo(4, 10), actor: ref(t.by) },
      { id: `${t.id}-a2`, action: 'assigned', detail: t.to.map((p) => p.fullName).join(', ') || null, createdAt: daysAgo(4, 10, 1), actor: ref(t.by) },
    ],
  };
}

const TASKS: TaskFixture[] = [
  task({
    id: 'task-rich-1',
    title: 'Confirmar con la aerolínea el transporte de los estuches de contrabajo y el arpa como equipaje especial',
    detail:
      'La orquesta viaja con 4 contrabajos y un arpa de concierto. Pedir carta de la aerolínea con dimensiones y peso autorizados, y confirmar que el autobús del aeropuerto tenga espacio para los estuches rígidos sin desmontar asientos.',
    module: 'Transporte',
    status: 'OPEN',
    dueAt: dueKey(-2),
    seenAt: daysAgo(3, 9),
    to: [BETO],
    by: ANA,
    eventId: EVT1_ID,
  }),
  task({
    id: 'task-rich-2',
    title: 'Enviar el plano de escenario con la distribución de atriles al proveedor de audio',
    module: 'Producción técnica',
    status: 'IN_PROGRESS',
    dueAt: dueKey(0),
    seenAt: daysAgo(1, 8),
    to: [OCTAVIO, XIMENA, ANA],
    by: ANA,
    eventId: EVT1_ID,
  }),
  task({
    id: 'task-rich-3',
    title: 'Programa interno de protección civil sellado por el municipio',
    detail: 'Se entregó el programa; falta el sello del simulacro.',
    module: 'Seguridad',
    status: 'PENDING_APPROVAL',
    dueAt: dueKey(-1),
    seenAt: daysAgo(2, 12),
    submittedAt: daysAgo(1, 18),
    completionNote: 'Adjunto el oficio con sello de recibido; el simulacro quedó para mañana a las 10:00.',
    to: [GERARDO],
    by: ANA,
    eventId: EVT1_ID,
    evidences: [
      {
        id: 'evi-rich-1',
        fileUrl: '/uploads/tasks/oficio-proteccion-civil.pdf',
        label: 'Oficio con sello de recibido',
        createdAt: daysAgo(1, 18),
        uploadedBy: ref(GERARDO),
      },
    ],
    activities: [
      { id: 'task-rich-3-a1', action: 'created', detail: null, createdAt: daysAgo(6, 9), actor: ref(ANA) },
      { id: 'task-rich-3-a2', action: 'assigned', detail: GERARDO.fullName, createdAt: daysAgo(6, 9, 1), actor: ref(ANA) },
      { id: 'task-rich-3-a3', action: 'evidence_added', detail: 'Oficio con sello de recibido', createdAt: daysAgo(1, 18), actor: ref(GERARDO) },
      { id: 'task-rich-3-a4', action: 'submitted', detail: null, createdAt: daysAgo(1, 18, 2), actor: ref(GERARDO) },
    ],
  }),
  task({
    id: 'task-rich-4',
    title: 'Reservar 62 habitaciones dobles',
    module: 'Hospedaje',
    status: 'DONE',
    dueAt: dueKey(-9),
    seenAt: daysAgo(12, 9),
    submittedAt: daysAgo(10, 12),
    approvedAt: daysAgo(10, 15),
    approvedBy: ref(ANA),
    to: [BETO],
    by: ANA,
    eventId: EVT1_ID,
  }),
  task({
    id: 'task-rich-5',
    title: 'Conseguir 12 lámparas de atril adicionales',
    detail: 'El proveedor de iluminación no tiene inventario; buscar renta con otro proveedor o comprar.',
    module: 'Iluminación',
    status: 'BLOCKED',
    dueAt: dueKey(0),
    seenAt: minutesAgo(300),
    to: [OCTAVIO, ANA],
    by: BETO,
    eventId: EVT1_ID,
  }),
  task({
    id: 'task-rich-6',
    title: 'Publicar el aviso de accesos y estacionamiento en redes',
    module: 'Campaña',
    status: 'OPEN',
    dueAt: dueKey(1),
    seenAt: null,
    rejectionNote: 'Falta el mapa del estacionamiento poniente y el horario de apertura de puertas.',
    rejectedBy: ref(ANA),
    to: [XIMENA],
    by: ANA,
    eventId: EVT1_ID,
  }),
  task({
    id: 'task-rich-7',
    title: 'Revisar la cortesía para medios',
    status: 'OPEN',
    dueAt: null,
    to: [],
    by: MARIELA,
    eventId: EVT1_ID,
  }),
  task({
    id: 'task-rich-8',
    title: 'Definir la logística de escenarios alternados del festival',
    module: 'Producción',
    status: 'OPEN',
    dueAt: dueKey(2),
    seenAt: daysAgo(1, 10),
    to: [RENATA],
    by: ANA,
    eventId: EVT2_ID,
  }),
  task({
    id: 'task-rich-9',
    title: 'Cotizar sonido para las tres funciones de comedia y comparar con el proveedor del año pasado',
    module: 'Audio',
    status: 'IN_PROGRESS',
    dueAt: dueKey(4),
    seenAt: daysAgo(2, 9),
    to: [OCTAVIO, ANA],
    by: ANA,
    eventId: 'evt-rich-4',
  }),
  task({
    id: 'task-rich-10',
    title: 'Actualizar el directorio de proveedores con los datos fiscales nuevos',
    detail: 'Petición de apoyo entre compañeros, sin evento.',
    status: 'OPEN',
    dueAt: dueKey(9),
    seenAt: null,
    to: [ANA],
    by: JOAQUIN,
  }),
  task({
    id: 'task-rich-11',
    title: 'Firmar el contrato del trío para el concierto de boleros',
    module: 'Contratos',
    status: 'PENDING_APPROVAL',
    dueAt: dueKey(3),
    seenAt: daysAgo(1, 11),
    submittedAt: minutesAgo(200),
    completionNote: 'Contrato firmado por el representante; falta firma de dirección.',
    to: [RENATA],
    by: ANA,
    eventId: 'evt-rich-5',
  }),
];

const tasksOfEvent = (id: string) =>
  TASKS.filter((t) => t.event?.id === id).map(({ event: _e, ...rest }) => rest);

/* ── detalle de evento ────────────────────────────────────────────────────── */

function eventDetail(e: EventRow) {
  const { _count: _c, updatedAt: _u, ...base } = e;
  return {
    ...base,
    notes: null as string | null,
    createdBy: ref(ANA),
    checklists: [] as unknown[],
    purchaseOrders: posOf(e.id) as unknown[],
    financeRuns: [] as unknown[],
    campaign: null as unknown,
    ticketingSetups: [] as unknown[],
    slots: [] as unknown[],
    files: [] as unknown[],
    tasks: tasksOfEvent(e.id) as unknown[],
    sponsors: [] as unknown[],
  };
}

const EVT1_DETAIL = {
  ...eventDetail(EVT1),
  notes:
    'Acuerdos de la junta del lunes: el promotor entrega la lista de invitados a las 12:00 del día del show; las cortesías se recogen en la taquilla 3. Pendiente confirmar si el coro necesita tarimas adicionales de 40 cm.',
  checklists: CHECKLISTS.map(checklistListRow),
  financeRuns: [
    {
      id: 'fin-rich-1',
      title: 'Corrida autorizada',
      locked: false,
      dataJson: {
        rows: [
          { concept: 'Taquilla estimada', type: 'income', amount: 6_874_000 },
          { concept: 'Patrocinios', type: 'income', amount: 250_000 },
          { concept: 'Producción', type: 'expense', amount: 2_726_812 },
        ],
        totalIncome: 7_124_000,
        totalExpense: 2_726_812,
      },
    },
  ],
  campaign: EVT1_CAMPAIGN,
  ticketingSetups: EVT1_TICKETING,
  slots: [
    { id: 'slot-rich-1', kind: 'CORRIDA', checklistTemplateId: null, status: 'INTERNAL', replacedByFileId: null, replacedAt: null, note: null },
    { id: 'slot-rich-2', kind: 'CAMPAIGN', checklistTemplateId: null, status: 'INTERNAL', replacedByFileId: null, replacedAt: null, note: null },
  ],
  files: EVT1_FILES,
  sponsors: EVT1_SPONSORS,
};

const EVT2_DETAIL = {
  ...eventDetail(EVT2),
  notes: 'El colectivo organizador trae su propia producción; aquí solo se coordinan accesos y limpieza.',
};

/* ── dashboard / analytics ────────────────────────────────────────────────── */

const daysTo = (iso: string | null) =>
  iso ? Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date(NOW).setHours(0, 0, 0, 0)) / 86_400_000) : null;

const HEALTH: Record<string, { avgProgress: number; risk: 'critical' | 'watch' | 'healthy' }> = {
  [EVT1_ID]: { avgProgress: 64, risk: 'critical' },
  'evt-rich-3': { avgProgress: 100, risk: 'healthy' },
  [EVT2_ID]: { avgProgress: 0, risk: 'watch' },
  'evt-rich-4': { avgProgress: 38, risk: 'critical' },
  'evt-rich-5': { avgProgress: 71, risk: 'watch' },
  'evt-rich-6': { avgProgress: 12, risk: 'healthy' },
};

const OVERVIEW = {
  generatedAt: NOW.toISOString(),
  kpis: {
    eventsTotal: EVENTS.length,
    eventsActive: EVENTS.filter((e) => e.status === 'ACTIVE').length,
    eventsDraft: 1,
    eventsClosed: 1,
    eventsAtRisk: 2,
    upcoming14d: 5,
    avgOpsProgress: 57,
    pendingDelivered: 2,
    pendingAuthorized: 3,
    openTasks: 23,
    blockedTasks: 2,
    overdueTasks: 4,
    poPipelineAmount: PURCHASE_ORDERS.filter((p) => ['PENDING_AUTH', 'DRAFT', 'AUTHORIZED'].includes(p.status)).reduce(
      (s, p) => s + p.amount,
      0,
    ),
    poPaidAmount: PURCHASE_ORDERS.filter((p) => p.status === 'PAID').reduce((s, p) => s + p.amount, 0),
    poAgingOver7: 2,
    portfolioIncome: 9_480_000,
    portfolioExpense: 6_115_400,
    portfolioNet: 3_364_600,
    advanceTotal: 186_750,
    activity90d: 412,
  },
  eventsByStatus: { ACTIVE: 5, DRAFT: 1, CLOSED: 1, CANCELLED: 1 },
  createdTrend: [
    { month: dayKey(-150).slice(0, 7), count: 2 },
    { month: dayKey(-120).slice(0, 7), count: 3 },
    { month: dayKey(-90).slice(0, 7), count: 1 },
    { month: dayKey(-60).slice(0, 7), count: 4 },
    { month: dayKey(-30).slice(0, 7), count: 2 },
    { month: dayKey(0).slice(0, 7), count: 3 },
  ],
  atRisk: [
    { id: EVT1_ID, name: EVT1.name, artist: EVT1.artist, avgProgress: 64, risk: 'critical', daysToShow: 0 },
    { id: 'evt-rich-4', name: evt('evt-rich-4').name, artist: evt('evt-rich-4').artist, avgProgress: 38, risk: 'watch', daysToShow: 6 },
  ],
  upcoming: [EVT1_ID, 'evt-rich-3', EVT2_ID, 'evt-rich-4', 'evt-rich-5'].map((id) => {
    const e = evt(id);
    return { id, name: e.name, artist: e.artist, startsAt: e.startsAt, avgProgress: HEALTH[id].avgProgress };
  }),
  eventHealth: EVENTS.filter((e) => HEALTH[e.id]).map((e) => ({
    id: e.id,
    name: e.name,
    artist: e.artist,
    status: e.status,
    startsAt: e.startsAt,
    avgProgress: HEALTH[e.id].avgProgress,
    risk: HEALTH[e.id].risk,
    daysToShow: daysTo(e.startsAt),
  })),
  topMargin: [
    { eventId: EVT1_ID, name: EVT1.name, net: 4_397_188, income: 7_124_000, expense: 2_726_812 },
    { eventId: 'evt-rich-4', name: evt('evt-rich-4').name, net: 182_000, income: 410_000, expense: 228_000 },
  ],
  bottomMargin: [{ eventId: 'evt-rich-5', name: evt('evt-rich-5').name, net: -18_500 }],
  checklistByTemplate: {
    'Producción técnica': { count: 4, avgProgress: 55, pendingAuth: 1 },
    'Seguridad, protección civil y servicios médicos': { count: 3, avgProgress: 35, pendingAuth: 1 },
    Hospedaje: { count: 3, avgProgress: 92, pendingAuth: 0 },
  },
  alerts: [
    {
      severity: 'critical',
      code: 'EVENT_RISK',
      message: `${EVT1.name} va al 64 % el día del show.`,
      href: `/events/${EVT1_ID}`,
    },
    { severity: 'warning', code: 'PO_AGING', message: '2 órdenes de compra llevan más de 7 días sin autorizar.', href: '/purchase-orders' },
    {
      severity: 'warning',
      code: 'TICKETING_HOLDS_PENDING',
      message:
        'La boletera del Concierto Acústico a la Luz de las Velas tiene 120 boletos retenidos para el promotor que vencen mañana a las 23:59 y todavía no hay instrucción de liberarlos ni de convertirlos en cortesías.',
      href: '/events/evt-rich-5?tab=ticketing',
    },
    {
      severity: 'critical',
      code: 'CAMPAIGN_NOT_AUTHORIZED',
      message: 'La campaña de la Noche de Comedia sigue sin autorizar a 6 días de la primera función.',
      href: '/events/evt-rich-4?tab=campaign',
    },
  ],
  recentActivity: [
    { id: 'act-rich-1', action: 'checklist.item.check', resource: 'Producción técnica', at: minutesAgo(48), user: OCTAVIO.fullName },
    { id: 'act-rich-2', action: 'po.create', resource: 'Taller de Pianos Hermanos Valdivia', at: minutesAgo(90), user: OCTAVIO.fullName },
    { id: 'act-rich-3', action: 'task.submit', resource: 'Programa interno de protección civil', at: daysAgo(1, 18), user: GERARDO.fullName },
  ],
};

/* ── anticipos ────────────────────────────────────────────────────────────── */

type AdvanceFixture = {
  id: string;
  eventId: string | null;
  label: string | null;
  amount: number;
  fileUrl: string | null;
  note: string | null;
  advanceStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  createdAt: string;
  decidedAt: string | null;
  rejectReason: string | null;
  paidAt: string | null;
  paidProofUrl: string | null;
  event: { id: string; name: string; entity: string } | null;
  uploadedBy: { id: string; fullName: string } | null;
  decidedBy: { id: string; fullName: string } | null;
  paidBy: { id: string; fullName: string } | null;
};

function advance(
  a: Pick<AdvanceFixture, 'id' | 'label' | 'amount' | 'advanceStatus' | 'createdAt'> &
    Partial<AdvanceFixture> & { eventId: string; by: Person },
): AdvanceFixture {
  const e = evt(a.eventId);
  return {
    id: a.id,
    eventId: e.id,
    label: a.label,
    amount: a.amount,
    fileUrl: a.fileUrl ?? null,
    note: a.note ?? null,
    advanceStatus: a.advanceStatus,
    createdAt: a.createdAt,
    decidedAt: a.decidedAt ?? null,
    rejectReason: a.rejectReason ?? null,
    paidAt: a.paidAt ?? null,
    paidProofUrl: a.paidProofUrl ?? null,
    event: { id: e.id, name: e.name, entity: e.entity },
    uploadedBy: ref(a.by),
    decidedBy: a.decidedBy ?? null,
    paidBy: a.paidBy ?? null,
  };
}

const ADV_PENDING = [
  advance({
    id: 'adv-rich-1',
    label: 'Anticipo de hospedaje para la banda y staff técnico',
    amount: 48_500,
    advanceStatus: 'PENDING',
    createdAt: minutesAgo(75),
    eventId: EVT1_ID,
    by: BETO,
    note: 'El hotel pide el 30 % para sostener la tarifa de grupo hasta el viernes.',
    fileUrl: '/uploads/advances/cotizacion-hotel.pdf',
  }),
  advance({
    id: 'adv-rich-2',
    label:
      'Anticipo para viáticos de traslado terrestre del equipo de producción técnica entre Puebla, Cholula y el aeropuerto durante la semana de montaje',
    amount: 12_380.5,
    advanceStatus: 'PENDING',
    createdAt: daysAgo(1, 17, 40),
    eventId: EVT1_ID,
    by: OCTAVIO,
  }),
  advance({
    id: 'adv-rich-3',
    label: 'Anticipo de catering',
    amount: 9_000,
    advanceStatus: 'APPROVED',
    createdAt: daysAgo(3, 9),
    decidedAt: daysAgo(2, 12),
    decidedBy: ref(ANA),
    eventId: EVT1_ID,
    by: BETO,
  }),
  advance({
    id: 'adv-rich-4',
    label: 'Anticipo de artes para lona',
    amount: 6_200,
    advanceStatus: 'APPROVED',
    createdAt: daysAgo(4, 15),
    decidedAt: daysAgo(3, 10),
    decidedBy: ref(RENATA),
    eventId: 'evt-rich-5',
    by: XIMENA,
  }),
];

const ADV_MINE = [
  advance({
    id: 'adv-rich-5',
    label: 'Anticipo de caja chica para el día del show',
    amount: 15_000,
    advanceStatus: 'PENDING',
    createdAt: minutesAgo(30),
    eventId: EVT1_ID,
    by: ANA,
    note: 'Propinas de carga y descarga, hielo y consumibles de último momento.',
  }),
  advance({
    id: 'adv-rich-6',
    label: 'Anticipo de permisos municipales para pendones',
    amount: 117_000,
    advanceStatus: 'PAID',
    createdAt: daysAgo(14, 10),
    decidedAt: daysAgo(13, 11),
    decidedBy: ref(JOAQUIN),
    paidAt: daysAgo(12, 13),
    paidBy: ref(JOAQUIN),
    paidProofUrl: '/uploads/advances/pago-permisos.pdf',
    eventId: EVT1_ID,
    by: ANA,
  }),
  advance({
    id: 'adv-rich-7',
    label: 'Anticipo para renta de mobiliario',
    amount: 22_400,
    advanceStatus: 'REJECTED',
    createdAt: daysAgo(6, 12),
    decidedAt: daysAgo(5, 10),
    decidedBy: ref(JOAQUIN),
    rejectReason:
      'El mobiliario ya está incluido en el contrato del venue (cláusula 7, anexo B). Si se necesitan sillas adicionales para el coro, pedirlas como orden de compra con la cotización del proveedor.',
    eventId: 'evt-rich-4',
    by: ANA,
  }),
  advance({
    id: 'adv-rich-8',
    label: null,
    amount: 3_150,
    advanceStatus: 'APPROVED',
    createdAt: daysAgo(2, 16),
    decidedAt: daysAgo(1, 9),
    decidedBy: ref(RENATA),
    eventId: EVT2_ID,
    by: ANA,
  }),
];

const advancesOfEvent = (id: string) => [...ADV_PENDING, ...ADV_MINE].filter((a) => a.eventId === id);

/* ── chat ─────────────────────────────────────────────────────────────────── */

type ChannelFixture = {
  id: string;
  kind: 'PUBLIC' | 'PRIVATE' | 'DIRECT';
  slug: string | null;
  name: string;
  topic: string | null;
  description?: string | null;
  eventId: string | null;
  peer: { id: string; fullName: string; title: string } | null;
  isMember: boolean;
  memberCount: number;
  postingRestricted: boolean;
  canPost: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  muted: boolean;
  mutedUntil: string | null;
  isGroupDm: boolean;
  entity: 'ARTA' | 'EXPLANADA' | null;
  members: Person[];
  lastReadAt: string | null;
};

const peer = (p: Person) => ({ id: p.id, fullName: p.fullName, title: p.title });

const CHANNELS: ChannelFixture[] = [
  {
    id: 'ch-rich-general',
    kind: 'PUBLIC',
    slug: 'general',
    name: 'general',
    topic: 'Todo el equipo de Arta: avisos del día, dudas rápidas y coordinación entre áreas',
    description: 'Canal de todo el equipo. Para temas de un evento usa su canal.',
    eventId: null,
    peer: null,
    isMember: true,
    memberCount: 24,
    postingRestricted: false,
    canPost: true,
    lastMessageAt: minutesAgo(4),
    lastMessagePreview:
      'Bernardo: Ya salió el autobús del aeropuerto con los 45 músicos; el camión de instrumentos va 20 minutos atrás por el tráfico de la autopista',
    unreadCount: 3,
    muted: false,
    mutedUntil: null,
    isGroupDm: false,
    entity: 'ARTA',
    members: PEOPLE.filter((p) => p.active),
    lastReadAt: minutesAgo(40),
  },
  {
    id: 'ch-rich-anuncios',
    kind: 'PUBLIC',
    slug: 'anuncios',
    name: 'anuncios',
    topic: 'Solo dirección publica aquí',
    eventId: null,
    peer: null,
    isMember: true,
    memberCount: 24,
    postingRestricted: true,
    canPost: true,
    lastMessageAt: daysAgo(1, 9),
    lastMessagePreview: 'Ana: A partir del lunes las órdenes de compra solo se cobran martes y jueves.',
    unreadCount: 0,
    muted: false,
    mutedUntil: null,
    isGroupDm: false,
    entity: 'ARTA',
    members: PEOPLE.filter((p) => p.active),
    lastReadAt: daysAgo(1, 9),
  },
  {
    id: 'ch-rich-evt1',
    kind: 'PRIVATE',
    slug: 'gira-latinoamericana-sinfonica-2026-edicion-especial',
    name: 'gira-latinoamericana-sinfonica-2026-edicion-especial-con-orquesta-filarmonica',
    topic: EVT1.name,
    eventId: EVT1_ID,
    peer: null,
    isMember: true,
    memberCount: 9,
    postingRestricted: false,
    canPost: true,
    lastMessageAt: minutesAgo(18),
    lastMessagePreview:
      'Octavio: El line array ya está volado; empezamos prueba de sonido con cuerdas a las 15:30 en punto, pido silencio en sala',
    unreadCount: 7,
    muted: false,
    mutedUntil: null,
    isGroupDm: false,
    entity: 'ARTA',
    members: [ANA, BETO, OCTAVIO, XIMENA, GERARDO, PAULINA, JOAQUIN, MARIELA, RENATA],
    lastReadAt: minutesAgo(120),
  },
  {
    id: 'ch-rich-produccion',
    kind: 'PRIVATE',
    slug: 'produccion-tecnica-y-montaje',
    name: 'produccion-tecnica-y-montaje',
    topic: 'Proveedores, horarios de carga y descarga',
    eventId: null,
    peer: null,
    isMember: true,
    memberCount: 6,
    postingRestricted: false,
    canPost: true,
    lastMessageAt: daysAgo(1, 22, 15),
    lastMessagePreview: 'Octavio: Mañana el tráiler entra por el andén 2.',
    unreadCount: 0,
    muted: true,
    mutedUntil: null,
    isGroupDm: false,
    entity: 'ARTA',
    members: [ANA, OCTAVIO, BETO, RENATA, GERARDO, XIMENA],
    lastReadAt: daysAgo(1, 22, 15),
  },
  {
    id: 'ch-rich-dm-beto',
    kind: 'DIRECT',
    slug: null,
    name: BETO.fullName,
    topic: null,
    eventId: null,
    peer: peer(BETO),
    isMember: true,
    memberCount: 2,
    postingRestricted: false,
    canPost: true,
    lastMessageAt: minutesAgo(9),
    lastMessagePreview:
      'Te dejo la cotización del segundo proveedor de transporte; es más cara pero incluye la camioneta de carga con rampa y seguro de instrumentos',
    unreadCount: 2,
    muted: false,
    mutedUntil: null,
    isGroupDm: false,
    entity: null,
    members: [ANA, BETO],
    lastReadAt: minutesAgo(60),
  },
  {
    id: 'ch-rich-dm-mariela',
    kind: 'DIRECT',
    slug: null,
    name: MARIELA.fullName,
    topic: null,
    eventId: null,
    peer: peer(MARIELA),
    isMember: true,
    memberCount: 2,
    postingRestricted: false,
    canPost: true,
    lastMessageAt: daysAgo(1, 15),
    lastMessagePreview: 'Tú: Perfecto, mándame el convenio firmado cuando lo tengas.',
    unreadCount: 0,
    muted: false,
    mutedUntil: null,
    isGroupDm: false,
    entity: null,
    members: [ANA, MARIELA],
    lastReadAt: daysAgo(1, 15),
  },
  {
    id: 'ch-rich-grupo',
    kind: 'PRIVATE',
    slug: null,
    name: 'Ana, Joaquín, Ximena y Octavio',
    topic: null,
    eventId: null,
    peer: null,
    isMember: true,
    memberCount: 4,
    postingRestricted: false,
    canPost: true,
    lastMessageAt: daysAgo(2, 11),
    lastMessagePreview: 'Joaquín: ¿Quién tiene la factura de la imprenta?',
    unreadCount: 1,
    muted: false,
    mutedUntil: null,
    isGroupDm: true,
    entity: null,
    members: [ANA, JOAQUIN, XIMENA, OCTAVIO],
    lastReadAt: daysAgo(2, 10),
  },
];

function channelSummary(c: ChannelFixture) {
  const { members: _m, lastReadAt: _l, description: _d, ...rest } = c;
  return rest;
}

function channelDetail(c: ChannelFixture) {
  return {
    id: c.id,
    kind: c.kind,
    slug: c.slug,
    name: c.name,
    topic: c.topic,
    description: c.description ?? null,
    eventId: c.eventId,
    peer: c.peer,
    postingRestricted: c.postingRestricted,
    canPost: c.canPost,
    canManage: true,
    muted: c.muted,
    mutedUntil: c.mutedUntil,
    lastReadAt: c.lastReadAt,
    memberCount: c.memberCount,
    isGroupDm: c.isGroupDm,
    members: c.members.map((p, i) => ({
      id: p.id,
      fullName: p.fullName,
      title: p.title,
      role: i === 0 ? 'OWNER' : 'MEMBER',
      lastReadAt: i === 0 ? c.lastReadAt : minutesAgo(5 + i * 20),
    })),
  };
}

const author = (p: Person) => ({ id: p.id, fullName: p.fullName, title: p.title });

function reaction(emoji: string, people: Person[]) {
  return { emoji, count: people.length, userIds: people.map((p) => p.id), users: people.map(ref) };
}

type MessageFixture = {
  id: string;
  channelId: string;
  parentId: string | null;
  kind: 'TEXT' | 'SYSTEM';
  body: string;
  attachment: { url: string; name: string; mime: string; size: number } | null;
  pinnedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  author: { id: string; fullName: string; title: string };
  replyCount: number;
  reactions: Array<ReturnType<typeof reaction>>;
  clientId: string | null;
  replyToId: string | null;
  replyTo: { id: string; authorId: string; authorName: string; excerpt: string; kind: string | null; attachmentName: string | null; deleted: boolean } | null;
  saved: boolean;
  deleted: boolean;
};

function msg(
  channelId: string,
  id: string,
  who: Person,
  createdAt: string,
  body: string,
  extra: Partial<MessageFixture> = {},
): MessageFixture {
  return {
    id,
    channelId,
    parentId: null,
    kind: 'TEXT',
    body,
    attachment: null,
    pinnedAt: null,
    editedAt: null,
    createdAt,
    author: author(who),
    replyCount: 0,
    reactions: [],
    clientId: null,
    replyToId: null,
    replyTo: null,
    saved: false,
    deleted: false,
    ...extra,
  };
}

const G = 'ch-rich-general';

const GENERAL_MESSAGES: MessageFixture[] = [
  msg(G, 'm-rich-g01', ANA, daysAgo(1, 8, 0), 'Ana Robles Villaseñor fijó el tema del canal', { kind: 'SYSTEM' }),
  msg(
    G,
    'm-rich-g02',
    OCTAVIO,
    daysAgo(1, 8, 12),
    '*Plan de montaje para mañana*\n- 06:00 llega la planta de luz\n- 07:00 entra el tráiler de audio por el andén 2\n- 10:00 iluminación y pantallas\n- 15:30 prueba de sonido con cuerdas\n- 16:00 ensayo general con coro',
    { reactions: [reaction('👍', [ANA, BETO, GERARDO]), reaction('🔥', [XIMENA])], pinnedAt: daysAgo(1, 8, 20) },
  ),
  msg(G, 'm-rich-g03', BETO, daysAgo(1, 9, 5), 'Confirmado el hospedaje: 62 habitaciones en la Casona, check-in desde las 13:00.', {
    reactions: [reaction('✅', [ANA, OCTAVIO]), reaction('🙏', [PAULINA])],
  }),
  msg(
    G,
    'm-rich-g04',
    MARIELA,
    daysAgo(1, 11, 30),
    '[@Ana Robles Villaseñor](user:usr-e2e-super) ¿me ayudas a revisar las cortesías de los convenios? Son 120 boletos repartidos en tres zonas y la boletera necesita la lista hoy.',
    { replyCount: 4 },
  ),
  msg(G, 'm-rich-g05', XIMENA, daysAgo(1, 13, 45), 'Les comparto las artes finales de la lona principal, ya aprobadas por el promotor.', {
    attachment: {
      url: '/uploads/chat/artes-finales-lona-principal.pdf',
      name: 'Artes finales — lona principal 12.90 × 7.20 m (versión aprobada por el promotor).pdf',
      mime: 'application/pdf',
      size: 4_812_330,
    },
  }),
  msg(
    G,
    'm-rich-g06',
    JOAQUIN,
    daysAgo(1, 16, 2),
    'Recordatorio: los días de cobro de órdenes de compra están en https://www.example.com/pagos/calendario-de-cobro',
  ),
  msg(G, 'm-rich-g07', ANA, daysAgo(1, 16, 30), 'Gracias, Beto. ¿El late check-out quedó para todos?', {
    editedAt: daysAgo(1, 16, 32),
    replyToId: 'm-rich-g03',
    replyTo: {
      id: 'm-rich-g03',
      authorId: BETO.id,
      authorName: BETO.fullName,
      excerpt: 'Confirmado el hospedaje: 62 habitaciones en la Casona, check-in desde las 13:00.',
      kind: 'TEXT',
      attachmentName: null,
      deleted: false,
    },
  }),
  msg(
    G,
    'm-rich-g08',
    GERARDO,
    minutesAgo(180),
    'Les cuento cómo quedó lo de protección civil: el municipio recibió el programa interno y lo selló como «recibido», pero el dictamen final depende del simulacro de mañana a las 10:00 con el personal del venue. Necesito que a esa hora estén en sala los jefes de piso, el responsable de seguridad privada y alguien de producción que conozca las rutas de evacuación del escenario. Si el simulacro sale bien nos entregan el dictamen el mismo día y podemos abrir puertas a las 19:30 sin problema; si no, nos piden repetirlo y el horario se complica muchísimo.',
    { reactions: [reaction('👀', [ANA, OCTAVIO, RENATA])] },
  ),
  msg(G, 'm-rich-g09', RENATA, minutesAgo(150), '👀'),
  msg(
    G,
    'm-rich-g10',
    PAULINA,
    minutesAgo(65),
    'Taquilla al corte de las 12:00: *3,772 boletos vendidos* de 4,570 (82.5 %). Platino _casi agotada_.',
    { pinnedAt: minutesAgo(60), reactions: [reaction('🎉', [ANA, MARIELA, XIMENA, BETO])] },
  ),
  msg(G, 'm-rich-g11', OCTAVIO, minutesAgo(20), '', { deleted: true }),
  msg(
    G,
    'm-rich-g12',
    BETO,
    minutesAgo(4),
    'Ya salió el autobús del aeropuerto con los 45 músicos; el camión de instrumentos va 20 minutos atrás por el tráfico de la autopista',
  ),
];

const DM = 'ch-rich-dm-beto';

const DM_BETO_MESSAGES: MessageFixture[] = [
  msg(DM, 'm-rich-d01', ANA, daysAgo(1, 10, 0), '¿Tienes otra cotización de transporte? La del Golfo no incluye la camioneta de carga.'),
  msg(DM, 'm-rich-d02', BETO, daysAgo(1, 10, 25), 'Sí, la busco hoy. Hay una empresa que también lleva el seguro de instrumentos.'),
  msg(DM, 'm-rich-d03', ANA, daysAgo(1, 10, 26), 'Perfecto 🙏'),
  msg(
    DM,
    'm-rich-d04',
    BETO,
    minutesAgo(12),
    'Te dejo la cotización del segundo proveedor de transporte; es más cara pero incluye la camioneta de carga con rampa y seguro de instrumentos',
    {
      attachment: {
        url: '/uploads/chat/cotizacion-transporte-proveedor-2.pdf',
        name: 'Cotización transporte — proveedor 2.pdf',
        mime: 'application/pdf',
        size: 312_004,
      },
    },
  ),
  msg(DM, 'm-rich-d05', BETO, minutesAgo(9), '¿La subo como orden de compra o primero la revisas tú?'),
];

const messagePage = (list: MessageFixture[]) => ({ messages: list, hasMore: false, hasNewer: false });

const CHAT_COLLEAGUES = PEOPLE.filter((p) => p.active && p.id !== ANA.id).map((p) => ({
  id: p.id,
  fullName: p.fullName,
  title: p.title,
  email: p.email,
}));

/* ── carpetas, calendario, plantillas, usuarios, organización ─────────────── */

const FOLDERS = [
  {
    id: 'fld-rich-1',
    name: 'Contratos firmados con artistas, promotores y proveedores principales — 2026',
    description: 'PDF firmados; los borradores van en la carpeta de jurídico.',
    allowedRoles: [] as string[],
    entity: 'ARTA',
    _count: { files: 6 },
  },
  {
    id: 'fld-rich-2',
    name: 'Planos del venue',
    description: 'Planos de escenario, rutas de evacuación y accesos de carga.',
    allowedRoles: [] as string[],
    entity: 'ARTA',
    _count: { files: 3 },
  },
  {
    id: 'fld-rich-3',
    name: 'Facturas y comprobantes fiscales',
    description: null,
    allowedRoles: ['dir_general', 'super_admin', 'enlace_gobierno'],
    entity: 'ARTA',
    _count: { files: 128 },
  },
  {
    id: 'fld-rich-4',
    name: 'Fotografía oficial',
    description: 'Fotos de prensa aprobadas para redes y medios, organizadas por evento y fecha de publicación.',
    allowedRoles: [] as string[],
    entity: 'ARTA',
    _count: { files: 54 },
  },
  {
    id: 'fld-rich-5',
    name: 'Manuales y políticas internas',
    description: null,
    allowedRoles: [] as string[],
    entity: 'ARTA',
    _count: { files: 0 },
  },
  {
    id: 'fld-rich-6',
    name: 'Permisos municipales y de protección civil',
    description: 'Oficios, dictámenes y pagos de derechos.',
    allowedRoles: [] as string[],
    entity: 'ARTA',
    _count: { files: 12 },
  },
];

const FOLDER_FILES: Record<string, Array<{ id: string; fileName: string; url: string; createdAt: string }>> = {
  'fld-rich-1': [
    { id: 'ff-rich-1', fileName: 'Contrato de prestación de servicios artísticos — Orquesta Filarmónica Metropolitana (firmado por ambas partes).pdf', url: '/uploads/folders/contrato-orquesta.pdf', createdAt: daysAgo(25, 11) },
    { id: 'ff-rich-2', fileName: 'Contrato de renta de audio.pdf', url: '/uploads/folders/contrato-audio.pdf', createdAt: daysAgo(12, 9) },
    { id: 'ff-rich-3', fileName: 'Calendario de pagos a proveedores 2026.xlsx', url: '/uploads/folders/calendario-pagos.xlsx', createdAt: daysAgo(40, 10) },
    { id: 'ff-rich-4', fileName: 'Convenio de patrocinio — Grupo Financiero Horizonte Andino.pdf', url: '/uploads/folders/convenio-patrocinio.pdf', createdAt: daysAgo(30, 16) },
    { id: 'ff-rich-5', fileName: 'Adenda.pdf', url: '/uploads/folders/adenda.pdf', createdAt: daysAgo(2, 12) },
    { id: 'ff-rich-6', fileName: 'Contrato de hospedaje de grupo con tarifa preferencial y condiciones de cancelación.pdf', url: '/uploads/folders/contrato-hotel.pdf', createdAt: daysAgo(15, 13) },
  ],
  'fld-rich-2': [
    { id: 'ff-rich-7', fileName: 'Plano general del Auditorio Metropolitano (planta y cortes).pdf', url: '/uploads/folders/plano-general.pdf', createdAt: daysAgo(90, 10) },
    { id: 'ff-rich-8', fileName: 'Rutas de evacuación.pdf', url: '/uploads/folders/rutas-evacuacion.pdf', createdAt: daysAgo(60, 10) },
    { id: 'ff-rich-9', fileName: 'Accesos de carga y andenes.pdf', url: '/uploads/folders/accesos-carga.pdf', createdAt: daysAgo(60, 11) },
  ],
};

function folderDetail(id: string) {
  const f = FOLDERS.find((x) => x.id === id)!;
  return { ...f, files: FOLDER_FILES[id] || [] };
}

const CALENDAR_NOTES = [
  { id: 'note-rich-1', date: dayKey(0), text: 'Simulacro de protección civil a las 10:00 — todos los jefes de piso en sala', createdBy: ref(GERARDO), updatedBy: null, createdAt: daysAgo(2, 9), updatedAt: daysAgo(2, 9) },
  { id: 'note-rich-2', date: dayKey(0), text: 'Corte de taquilla 12:00', createdBy: ref(PAULINA), updatedBy: null, createdAt: daysAgo(1, 9), updatedAt: daysAgo(1, 9) },
  { id: 'note-rich-3', date: dayKey(2), text: 'Junta de cierre con el promotor de la gira sinfónica para revisar liquidación, cortesías y reporte de patrocinadores', createdBy: ref(ANA), updatedBy: ref(MARIELA), createdAt: daysAgo(3, 12), updatedAt: daysAgo(1, 12) },
  { id: 'note-rich-4', date: dayKey(5), text: 'Entrega de lonas para la Noche de Comedia', createdBy: ref(XIMENA), updatedBy: null, createdAt: daysAgo(1, 15), updatedAt: daysAgo(1, 15) },
  { id: 'note-rich-5', date: dayKey(-3), text: 'Pago de permisos', createdBy: ref(JOAQUIN), updatedBy: null, createdAt: daysAgo(5, 10), updatedAt: daysAgo(5, 10) },
];

function templateSchema(sections: Array<[string, string, Array<[string, string, string?]>]>) {
  return {
    sections: sections.map(([id, title, items]) => ({
      id,
      title,
      items: items.map(([itemId, label, type]) => ({ id: itemId, label, type: type || 'check' })),
    })),
  };
}

const TEMPLATE_VERSIONS = [
  { id: 'tplv-rich-3', version: 3, note: 'Se agregan condiciones de entrega del escenario', createdAt: daysAgo(10, 10), editedBy: nameOnly(ANA) },
  { id: 'tplv-rich-2', version: 2, note: null, createdAt: daysAgo(40, 10), editedBy: nameOnly(OCTAVIO) },
];

const TEMPLATES = [
  {
    id: 'tpl-rich-produccion',
    key: 'PRODUCCION_TECNICA',
    name: 'Producción técnica — Rider de audio, iluminación, backline y requerimientos de escenario',
    description: 'Formato estándar para shows en venue cerrado con producción completa.',
    entities: [] as string[],
    active: true,
    version: 3,
    excelTemplateUrl: null,
    versions: TEMPLATE_VERSIONS,
    schemaJson: templateSchema([
      ['audio', 'Audio', [['consola', 'Consola de sala', 'select'], ['sistema', 'Sistema de PA', 'text'], ['inear', 'Monitoreo in-ear', 'yesno']]],
      ['input', 'Lista de entradas', [['input', 'Lista de entradas', 'table']]],
      ['condiciones', 'Condiciones', [['condicion_1', 'El proveedor de audio entrega el sistema probado y ecualizado…', 'paragraph']]],
      ['firmas', 'Firmas digitales', [['firma_entregado', 'Producción técnica', 'signature'], ['firma_autorizado', 'Dirección', 'signature']]],
    ]),
  },
  {
    id: 'tpl-rich-transporte',
    key: 'TRANSPORTE',
    name: 'Transporte terrestre del aeropuerto al hotel y del hotel al venue (traslados de staff, banda y producción)',
    description: null,
    entities: ['ARTA'],
    active: true,
    version: 1,
    excelTemplateUrl: null,
    versions: [],
    schemaJson: templateSchema([['aeropuerto', 'Aeropuerto → hotel', [['a1', 'Autobús ejecutivo'], ['a2', 'Camioneta de carga']]]]),
  },
  {
    id: 'tpl-rich-seguridad',
    key: 'SEGURIDAD',
    name: 'Seguridad, protección civil y servicios médicos',
    description: 'Incluye programa interno, ambulancia y paramédicos.',
    entities: [] as string[],
    active: true,
    version: 2,
    excelTemplateUrl: null,
    versions: [],
    schemaJson: templateSchema([['pc', 'Protección civil', [['pc1', 'Programa interno sellado'], ['pc2', 'Rutas de evacuación']]]]),
  },
  {
    id: 'tpl-rich-camerinos',
    key: 'CAMERINOS',
    name: 'Camerinos, catering y hospitalidad del artista',
    description: null,
    entities: [] as string[],
    active: true,
    version: 4,
    excelTemplateUrl: '/uploads/templates/camerinos.xlsx',
    versions: [],
    schemaJson: templateSchema([['camerinos', 'Camerinos', [['c1', 'Camerino del artista'], ['c2', 'Toallas y agua']]]]),
  },
  {
    id: 'tpl-rich-hospedaje',
    key: 'HOSPEDAJE',
    name: 'Hospedaje',
    description: 'Hotel, habitaciones y rooming list.',
    entities: [] as string[],
    active: true,
    version: 2,
    excelTemplateUrl: null,
    versions: [],
    schemaJson: templateSchema([['hotel', 'Hotel', [['h1', 'Nombre del hotel', 'text'], ['h2', 'Incluye desayuno', 'yesno']]]]),
  },
  {
    id: 'tpl-rich-compromiso',
    key: 'COMPROMISO_HORARIOS',
    name: 'Compromiso de horarios — Día del show',
    description: 'Documento con texto fijo y firmas de las dos partes.',
    entities: [] as string[],
    active: true,
    version: 1,
    excelTemplateUrl: null,
    versions: [],
    schemaJson: templateSchema([['horarios', 'Horarios y condiciones operativas', [['horarios', 'Horarios', 'table']]]]),
  },
  {
    id: 'tpl-rich-pendones',
    key: 'DISTRIBUCION_PENDONES',
    name: 'Distribución de pendones por municipio, colonia y vialidad con permisos y fechas de retiro',
    description: 'Formato heredado; se reemplazó por la campaña.',
    entities: ['ARTA'],
    active: false,
    version: 6,
    excelTemplateUrl: null,
    versions: [],
    schemaJson: templateSchema([['pendones', 'Pendones', [['p1', 'Puntos de colocación', 'table']]]]),
  },
  {
    id: 'tpl-rich-auditorio',
    key: 'ENTREGA_ESCENARIO_AUDITORIO',
    name: 'Entrega y recepción del escenario del Auditorio',
    description: null,
    entities: ['EXPLANADA'],
    active: true,
    version: 1,
    excelTemplateUrl: null,
    versions: [],
    schemaJson: templateSchema([['entrega', 'Entrega', [['e1', 'Escenario limpio'], ['e2', 'Tomas de corriente probadas']]]]),
  },
];

const ROLES = [
  { key: 'super_admin', label: 'Administración de plataforma', hint: 'Todo, incluida la configuración de la plataforma.', defaultEntities: ['ARTA', 'EXPLANADA'], permissions: ['everything'] },
  { key: 'dir_general', label: 'Dirección general', hint: 'Todo lo de la organización.', defaultEntities: ['ARTA', 'EXPLANADA'], permissions: ['everything'] },
  { key: 'dir_adjunta', label: 'Dirección adjunta', hint: 'Autoriza y da de alta gente nueva.', defaultEntities: ['ARTA', 'EXPLANADA'], permissions: ['users.create', 'po.authorize'] },
  { key: 'gerente_arta', label: 'Gerencia Arta', defaultEntities: ['ARTA'], permissions: ['campaign.edit', 'po.authorize'] },
  { key: 'dir_auditorio', label: 'Dirección Auditorio', defaultEntities: ['EXPLANADA', 'ARTA'], permissions: ['po.authorize'] },
  { key: 'logistica', label: 'Logística y producción', defaultEntities: ['ARTA', 'EXPLANADA'], permissions: ['checklist.edit'] },
  { key: 'convenios', label: 'Convenios y patrocinios', defaultEntities: ['ARTA', 'EXPLANADA'], permissions: ['campaign.view'] },
  { key: 'enlace_gobierno', label: 'Enlace gobierno y pagos', defaultEntities: ['ARTA', 'EXPLANADA'], permissions: ['po.mark_paid', 'finance.edit'] },
  { key: 'solo_carpetas', label: 'Solo carpetas', defaultEntities: ['ARTA', 'EXPLANADA'], permissions: [] },
];

const PERMISSION_CATALOG = [
  { key: 'finance.view', label: 'Ver finanzas' },
  { key: 'finance.edit', label: 'Editar finanzas / corrida' },
  { key: 'campaign.view', label: 'Ver campaña' },
  { key: 'campaign.edit', label: 'Editar campaña' },
  { key: 'po.authorize', label: 'Autorizar órdenes de compra' },
  { key: 'po.mark_paid', label: 'Marcar OC como pagada' },
  { key: 'event.create', label: 'Crear eventos' },
  { key: 'event.close', label: 'Cerrar eventos' },
  { key: 'checklist.edit', label: 'Editar checklists' },
  { key: 'ticketing.edit', label: 'Editar boletera' },
  { key: 'folders.edit', label: 'Editar carpetas' },
  { key: 'vendor.pin', label: 'PINs de proveedor' },
  { key: 'users.manage', label: 'Gestionar usuarios' },
  { key: 'users.create', label: 'Dar de alta usuarios' },
];

const USERS = PEOPLE.map((p, i) => ({
  id: p.id,
  email: p.email,
  fullName: p.fullName,
  title: p.title,
  roleKey: p.roleKey,
  entities: p.entities,
  permissions: p.roleKey === 'super_admin' ? ['everything'] : i % 3 === 0 ? ['vendor.pin', 'folders.edit'] : [],
  active: p.active,
  lastLoginAt: p.active ? minutesAgo(15 + i * 190) : daysAgo(64, 9),
}));

const USERS_GOV = {
  kpis: { total: 10, active: 9, inactive: 1, neverLoggedIn: 1, inactive30d: 1, lockedNow: 1, highRisk: 1, loggedIn7d: 8 },
  byRole: USERS.reduce<Record<string, number>>((acc, u) => ({ ...acc, [u.roleKey]: (acc[u.roleKey] || 0) + 1 }), {}),
  users: USERS.map((u, i) => ({
    ...u,
    roleLabel: ROLES.find((r) => r.key === u.roleKey)?.label,
    activity30d: u.active ? 220 - i * 19 : 0,
    checklistEdits30d: u.active ? 60 - i * 5 : 0,
    activeSessions: u.active ? (i % 3) + 1 : 0,
    inactive30: !u.active,
    locked: u.id === GERARDO.id,
    risk: u.id === GERARDO.id ? 'high' : !u.active ? 'medium' : 'low',
    riskScore: u.id === GERARDO.id ? 78 : !u.active ? 41 : 8 + i,
    failedLoginCount: u.id === GERARDO.id ? 6 : 0,
  })),
};

const ORG_ID = TEST_USER.organizationId || 'org-e2e';

const INVITES = [
  {
    id: 'inv-rich-1',
    email: 'nueva.coordinadora.de.produccion.auditorio@example.com',
    roleKey: 'logistica',
    entities: ['EXPLANADA'],
    expiresAt: at(5, 23, 59),
    acceptedAt: null,
    revokedAt: null,
    createdAt: daysAgo(2, 10),
  },
  {
    id: 'inv-rich-2',
    email: 'apoyo.taquilla@example.com',
    roleKey: 'convenios',
    entities: ['ARTA', 'EXPLANADA'],
    expiresAt: at(1, 12),
    acceptedAt: null,
    revokedAt: null,
    createdAt: daysAgo(6, 10),
  },
];

const ORG_ME = {
  id: ORG_ID,
  slug: 'arta-producciones',
  name: 'Arta Producciones y Auditorio Explanada (organización de prueba)',
  plan: 'OPS',
  active: true,
  settingsJson: { require2fa: true },
  _count: { users: 10, events: EVENTS.length, memberships: 10 },
};

/* ── avisos ───────────────────────────────────────────────────────────────── */

const NOTIFICATIONS = [
  {
    id: 'ntf-rich-1',
    type: 'task.assigned',
    title: 'Joaquín Esparza Villalobos te asignó: Actualizar el directorio de proveedores con los datos fiscales nuevos',
    body: 'Vence en 9 días. Petición de apoyo entre compañeros, sin evento.',
    linkUrl: '/tasks',
    readAt: null,
    createdAt: minutesAgo(6),
    actor: ref(JOAQUIN),
    entity: 'ARTA',
  },
  {
    id: 'ntf-rich-2',
    type: 'po.pending',
    title: 'Nueva orden de compra por autorizar: Audio Profesional del Centro y Renta de Equipo Escénico, S.A. de C.V.',
    body: `${EVT1.name} · ${PURCHASE_ORDERS[0].amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} · Transferencia`,
    linkUrl: `/events/${EVT1_ID}?tab=ocs`,
    readAt: null,
    createdAt: minutesAgo(52),
    actor: ref(OCTAVIO),
    entity: 'ARTA',
  },
  {
    id: 'ntf-rich-3',
    type: 'chat.mention',
    title: 'Mariela Fuentes de la Garza Montoya te mencionó en #general',
    body: '¿me ayudas a revisar las cortesías de los convenios? Son 120 boletos repartidos en tres zonas y la boletera necesita la lista hoy.',
    linkUrl: '/chat?channel=ch-rich-general&msg=m-rich-g04',
    readAt: null,
    createdAt: minutesAgo(140),
    actor: ref(MARIELA),
    entity: 'ARTA',
  },
  {
    id: 'ntf-rich-4',
    type: 'checklist.delivered',
    title: 'Formato entregado para autorizar: Seguridad, protección civil y servicios médicos',
    body: 'Gerardo Treviño Salcedo lo mandó a revisión con 35 % de avance.',
    linkUrl: `/events/${EVT1_ID}?tab=checklists&checklist=chk-rich-seguridad`,
    readAt: null,
    createdAt: daysAgo(1, 17, 25),
    actor: ref(GERARDO),
    entity: 'ARTA',
  },
  {
    id: 'ntf-rich-5',
    type: 'advance.pending',
    title: 'Anticipo por aprobar: Anticipo de hospedaje para la banda y staff técnico',
    body: '$48,500.00 · solicitado por Bernardo Sandoval Echeverría',
    linkUrl: '/advances?advance=adv-rich-1',
    readAt: minutesAgo(30),
    createdAt: minutesAgo(75),
    actor: ref(BETO),
    entity: 'ARTA',
  },
  {
    id: 'ntf-rich-6',
    type: 'task.rejected',
    title: 'Pediste corrección en: Publicar el aviso de accesos y estacionamiento en redes',
    body: 'Falta el mapa del estacionamiento poniente y el horario de apertura de puertas.',
    linkUrl: '/tasks',
    readAt: daysAgo(1, 9),
    createdAt: daysAgo(2, 18),
    actor: ref(ANA),
    entity: null,
  },
];

/* ── boletera y campañas del portafolio ───────────────────────────────────── */

const pickEvent = (e: EventRow) => ({
  id: e.id,
  name: e.name,
  entity: e.entity,
  status: e.status,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  venue: e.venue,
  city: e.city,
  promoter: e.promoter,
  schedule: e.schedule,
  functions: e.functions,
  description: e.description,
});

const TICKETING_LIST = [
  { ...EVT1_TICKETING[0], event: pickEvent(EVT1) },
  {
    id: 'tix-rich-2',
    boletera: 'eTicket',
    logoUrl: null,
    holdUntil: at(11, 23, 59),
    venue: evt('evt-rich-5').venue,
    artsUrl: null,
    dateLabel: null,
    functions: 1,
    schedule: '20:30',
    description: null,
    holdArtist: 10,
    holdPromoter: 120,
    holdVenue: null,
    zonesJson: [
      { zona: 'Mesa preferente (4 personas)', aforo: 120, precio: 1800, sold: 64 },
      { zona: 'Mesa general', aforo: 200, precio: 950, sold: 81 },
    ],
    createdAt: daysAgo(12, 10),
    updatedAt: daysAgo(2, 10),
    event: pickEvent(evt('evt-rich-5')),
  },
  {
    id: 'tix-rich-3',
    boletera: 'Boletera de la Universidad (externa)',
    logoUrl: null,
    holdUntil: null,
    venue: null,
    artsUrl: 'artes en el drive del promotor',
    dateLabel: 'Tres funciones el mismo día',
    functions: 3,
    schedule: evt('evt-rich-4').schedule,
    description: null,
    holdArtist: null,
    holdPromoter: null,
    holdVenue: null,
    zonesJson: [{ zona: 'General', aforo: 600, precio: 450, sold: 212 }],
    createdAt: daysAgo(9, 10),
    updatedAt: daysAgo(4, 10),
    event: pickEvent(evt('evt-rich-4')),
  },
];

const CAMPAIGNS_LIST = [
  { id: EVT1_CAMPAIGN.id, eventId: EVT1_ID, status: 'DRAFT', authorized: false, dataJson: EVT1_CAMPAIGN.dataJson, event: pickEvent(EVT1) },
  {
    id: 'camp-rich-4',
    eventId: 'evt-rich-4',
    status: 'REVIEW',
    authorized: false,
    dataJson: {
      concepts: [
        { concept: 'IMPRESIÓN PENDÓN CHOLULA', qty: 150, from: dayKey(-2), to: dayKey(-1), precioInterno: 105, precioExterno: 125 },
        { concept: 'COLOCACIÓN PENDÓN CHOLULA', qty: 150, from: dayKey(-1), to: dayKey(6), precioInterno: 38, precioExterno: 45 },
      ],
    },
    event: pickEvent(evt('evt-rich-4')),
  },
  {
    id: 'camp-rich-6',
    eventId: 'evt-rich-6',
    status: 'AUTHORIZED',
    authorized: true,
    dataJson: {
      concepts: [
        { concept: 'RENTA PANTALLA ATLIXCAYOTL', qty: 2, from: dayKey(20), to: dayKey(40), precioInterno: 12000, precioExterno: 15000 },
        { concept: 'IMPRESIONES CENTRO COMERCIAL ANGELÓPOLIS', qty: 1, from: dayKey(25), to: dayKey(40), precioInterno: 8622, precioExterno: 10000 },
      ],
    },
    event: pickEvent(evt('evt-rich-6')),
  },
  {
    id: 'camp-rich-7',
    eventId: 'evt-rich-7',
    status: 'PAID',
    authorized: true,
    dataJson: {
      concepts: [
        { concept: 'RENTA VALLA MÓVIL', qty: 2, from: dayKey(-30), to: dayKey(-21), precioInterno: 13800, precioExterno: 20000 },
      ],
    },
    event: pickEvent(evt('evt-rich-7')),
  },
  {
    id: 'camp-rich-5',
    eventId: 'evt-rich-5',
    status: 'REVIEW',
    authorized: false,
    dataJson: {
      concepts: [{ concept: 'IMPRESIÓN POSTERS', qty: 400, from: dayKey(1), to: dayKey(11), precioInterno: 15, precioExterno: 20 }],
    },
    event: pickEvent(evt('evt-rich-5')),
  },
];

/* ── tabla de stubs ───────────────────────────────────────────────────────── */

const otherEventStubs: ApiStubs = {};
for (const e of EVENTS) {
  if (e.id === EVT1_ID || e.id === EVT2_ID) continue;
  otherEventStubs[`/events/${e.id}`] = eventDetail(e);
  otherEventStubs[`/purchase-orders/event/${e.id}`] = posOf(e.id);
  otherEventStubs[`/finance/advances/event/${e.id}`] = advancesOfEvent(e.id);
}

const checklistStubs: ApiStubs = {};
for (const c of CHECKLISTS) checklistStubs[`/checklists/${c.id}`] = checklistFull(c);

const chatStubs: ApiStubs = {};
for (const c of CHANNELS) {
  chatStubs[`/chat/channels/${c.id}`] = channelDetail(c);
  chatStubs[`/chat/channels/${c.id}/messages`] = messagePage(
    c.id === G ? GENERAL_MESSAGES : c.id === DM ? DM_BETO_MESSAGES : [],
  );
  chatStubs[`/chat/channels/${c.id}/pins`] = c.id === G ? GENERAL_MESSAGES.filter((m) => m.pinnedAt) : [];
  // POST al abrir la conversación (marcar leído).
  chatStubs[`/chat/channels/${c.id}/read`] = { ok: true };
}

const folderStubs: ApiStubs = {};
for (const f of FOLDERS) folderStubs[`/folders/${f.id}`] = folderDetail(f.id);

export const RICH_STUBS: ApiStubs = {
  '/auth/me': { user: RICH_USER },

  // Inicio, eventos, calendario
  '/analytics/overview': OVERVIEW,
  '/events': eventsHandler,
  '/calendar/notes': CALENDAR_NOTES,

  // Hub del evento rico (todas las pestañas)
  [`/events/${EVT1_ID}`]: EVT1_DETAIL,
  [`/documents/event/${EVT1_ID}`]: EVT1_DOCUMENTS,
  [`/vendor/event/${EVT1_ID}`]: [
    { id: 'pin-rich-1', label: 'Audio Profesional del Centro — ingenieros de sala y monitores', scopes: ['files', 'checklists'], active: true, expiresAt: at(1, 23, 59) },
    { id: 'pin-rich-2', label: 'Hotel Casona', scopes: ['hospitality'], active: false, expiresAt: daysAgo(2, 23, 59) },
  ],
  [`/uploads/event/${EVT1_ID}/deleted`]: [
    { id: 'file-rich-del-1', fileName: 'Corrida financiera — borrador anterior con montos de la gira 2025 (no usar).xlsx', deletedAt: daysAgo(4, 18) },
  ],
  [`/purchase-orders/event/${EVT1_ID}`]: posOf(EVT1_ID),
  [`/finance/advances/event/${EVT1_ID}`]: advancesOfEvent(EVT1_ID),
  '/audit': [
    { id: 'aud-rich-1', action: 'campaign.update', createdAt: daysAgo(1, 12), user: nameOnly(XIMENA), metaJson: null },
    { id: 'aud-rich-2', action: 'campaign.convenios.submit', createdAt: daysAgo(1, 12, 5), user: nameOnly(MARIELA), metaJson: null },
    { id: 'aud-rich-3', action: 'campaign.export', createdAt: daysAgo(2, 13, 5), user: nameOnly(XIMENA), metaJson: null },
    { id: 'aud-rich-4', action: 'event.update', createdAt: daysAgo(3, 9), user: nameOnly(ANA), metaJson: null },
  ],
  ...checklistStubs,

  // Archivos que el hub abre solo (corrida y Excel de campaña) y PDFs para la vista previa
  '/files/file-rich-corrida/inline': xlsxFile(corridaWorkbook),
  '/files/file-rich-campana/inline': xlsxFile(campaignWorkbook),
  '/files/file-rich-convenios/inline': xlsxFile(campaignWorkbook),
  '/uploads/file-rich-corrida/layout': { sheets: {} },
  '/uploads/file-rich-campana/layout': { sheets: {} },
  '/files/file-rich-rider/inline': pdfFile('Rider técnico — Orquesta Filarmónica Metropolitana', [
    '84 músicos en escena, coro de 40 voces.',
    'Consola de sala digital de 64 canales.',
    'Monitoreo in-ear para 40 mezclas.',
    'Afinación del piano a 442 Hz antes del ensayo general.',
  ]),
  '/files/file-rich-campana-pdf/inline': pdfFile('Campaña interna', ['Conceptos, fechas y precios internos.']),
  '/files/file-rich-corrida-v1/inline': pdfFile('Corrida preliminar', ['Versión 1 (sustituida por la autorizada).']),
  '/files/file-rich-proof/inline': pdfFile('Comprobante de transferencia', ['Hotel Boutique Casona de los Ángeles', 'Importe: $245,300.00']),
  '/files/file-rich-contrato/inline': pdfFile('Contrato de prestación de servicios artísticos', ['Documento de prueba sin validez.']),

  // Evento sin formatos (Auditorio)
  [`/events/${EVT2_ID}`]: EVT2_DETAIL,
  [`/documents/event/${EVT2_ID}`]: [],
  [`/vendor/event/${EVT2_ID}`]: [],
  [`/purchase-orders/event/${EVT2_ID}`]: [],
  [`/finance/advances/event/${EVT2_ID}`]: advancesOfEvent(EVT2_ID),

  // Resto de eventos: detalle mínimo para que cualquier enlace abra
  ...otherEventStubs,

  // Órdenes de compra y anticipos
  '/analytics/purchase-orders': PO_ANALYTICS,
  '/finance/advances/pending': ADV_PENDING,
  '/finance/advances/mine': ADV_MINE,

  // Tareas
  '/tasks/mine': TASKS.filter((t) => t.assigneeIds.includes(ANA.id) || (t.createdById === ANA.id && t.status === 'PENDING_APPROVAL')),
  '/tasks/requested': TASKS.filter((t) => t.createdById === ANA.id),
  '/tasks/workload': TASKS,
  '/tasks': TASKS,
  '/users/directory': DIRECTORY,

  // Chat
  '/chat/channels': CHANNELS.map(channelSummary),
  ...chatStubs,
  '/chat/unread': { total: CHANNELS.filter((c) => !c.muted).reduce((s, c) => s + c.unreadCount, 0) },
  '/chat/presence': { online: [BETO.id, OCTAVIO.id, PAULINA.id, MARIELA.id] },
  '/chat/prefs': { dndUntil: null },
  '/chat/colleagues': CHAT_COLLEAGUES,
  '/chat/saved': [
    {
      savedAt: minutesAgo(55),
      message: GENERAL_MESSAGES[9],
      channel: { id: G, name: 'general', kind: 'PUBLIC', isGroupDm: false },
    },
  ],
  '/chat/link-preview': {
    url: 'https://www.example.com/pagos/calendario-de-cobro',
    title: 'Calendario de cobro de órdenes de compra — segundo semestre',
    description: 'Martes y jueves de 10:00 a 14:00. Las órdenes autorizadas después del corte pasan al siguiente día de cobro.',
    image: null,
    siteName: 'example.com',
  },

  // Carpetas
  '/folders': FOLDERS,
  ...folderStubs,

  // Plantillas de formatos
  '/checklists/templates': TEMPLATES,

  // Usuarios y organización
  '/users': USERS,
  '/users/roles': ROLES,
  '/users/permissions/catalog': PERMISSION_CATALOG,
  '/analytics/users': USERS_GOV,
  '/organizations/me': ORG_ME,
  '/organizations': [
    ORG_ME,
    { id: 'org-rich-demo', slug: 'demo-producciones', name: 'Demo Producciones', plan: 'TRIAL', active: true, settingsJson: null, _count: { users: 3, events: 2 } },
    { id: 'org-rich-old', slug: 'cuenta-de-pruebas-antigua-sin-uso', name: 'Cuenta de pruebas antigua sin uso', plan: 'ENTERPRISE', active: false, settingsJson: null, _count: { users: 0, events: 0 } },
  ],
  '/billing/status': { configured: false, plan: 'OPS', billingStatus: 'active', stripeCustomerId: null },
  [`/organizations/${ORG_ID}/stats`]: { users: 10, events: EVENTS.length, activeEvents: 5 },
  [`/organizations/${ORG_ID}/members`]: USERS.map(({ title: _t, permissions: _p, ...m }) => m),
  [`/organizations/${ORG_ID}/invites`]: INVITES,

  // Seguridad
  '/auth/sessions': [
    { id: 'ses-rich-1', deviceLabel: 'Chrome en Windows — esta sesión', ip: '203.0.113.24', createdAt: daysAgo(3, 8), lastSeenAt: minutesAgo(1) },
    { id: 'ses-rich-2', deviceLabel: 'App Arta en iPhone (versión 2.4.1, notificaciones activas)', ip: '198.51.100.77', createdAt: daysAgo(12, 19), lastSeenAt: minutesAgo(42) },
    { id: 'ses-rich-3', deviceLabel: 'Safari en macOS', ip: '203.0.113.150', createdAt: daysAgo(20, 10), lastSeenAt: daysAgo(6, 17) },
    { id: 'ses-rich-4', deviceLabel: null, ip: null, createdAt: daysAgo(30, 10), lastSeenAt: daysAgo(29, 10) },
  ],

  // Campañas y boletera del portafolio
  '/campaigns': CAMPAIGNS_LIST,
  '/ticketing': TICKETING_LIST,

  // Avisos (campana del AppShell)
  '/notifications': NOTIFICATIONS,
  '/notifications/unread-count': { count: NOTIFICATIONS.filter((n) => !n.readAt).length },
};

/* ── rutas ────────────────────────────────────────────────────────────────── */

const E1 = `/events/${EVT1_ID}`;

export const RICH_ROUTES: Array<{ name: string; path: string; note?: string }> = [
  { name: 'dashboard', path: '/dashboard', note: 'Dos shows HOY (09:30 y 21:00), tres en 14 días, 2 en riesgo y avisos largos.' },
  {
    name: 'notifications',
    path: '/dashboard',
    note: 'Abrir la campana: botón con aria-label «Avisos (4 sin leer)». 6 avisos, 4 sin leer.',
  },
  { name: 'events', path: '/events', note: 'Eventos actuales: 6 tarjetas Arta/Auditorio, nombres largos, avance y «Urgente».' },
  { name: 'events-past', path: '/events?scope=past', note: 'Pasados: uno cerrado y uno cancelado.' },
  { name: 'event-overview', path: E1, note: 'Resumen del show de hoy: mosaicos, datos, notas y formatos más atrasados.' },
  { name: 'event-formats', path: `${E1}?tab=checklists`, note: '6 formatos: 0 %, 35 % en revisión, 83 %, 88 %, 100 % aprobado y 100 % sellado.' },
  {
    name: 'event-format-sheet',
    path: `${E1}?tab=checklists&checklist=chk-rich-produccion`,
    note: 'Hoja del formato: encabezado, select, SÍ/NO, tablas, casillas a dos columnas, adjuntos, texto fijo y firmas.',
  },
  {
    name: 'event-format-sealed',
    path: `${E1}?tab=checklists&checklist=chk-rich-compromiso`,
    note: 'Compromiso de horarios sellado (solo lectura).',
  },
  { name: 'event-ocs', path: `${E1}?tab=ocs`, note: '6 OC: por autorizar, por pagar, pagada con comprobante, borrador, rechazada.' },
  { name: 'event-finance', path: `${E1}?tab=finance`, note: 'Corrida: Excel real abierto en el editor de hoja + archivo anterior.' },
  { name: 'event-campaign', path: `${E1}?tab=campaign`, note: 'Campaña en borrador: 8 conceptos editables y Excel de campaña abierto.' },
  { name: 'event-sponsors', path: `${E1}?tab=sponsors`, note: 'Convenios en revisión (3 filas por zona) y 3 patrocinadores plegados.' },
  { name: 'event-ticketing', path: `${E1}?tab=ticketing`, note: 'Boletera Arema con 5 zonas, holds y descripción.' },
  { name: 'event-tasks', path: `${E1}?tab=tasks`, note: '7 tareas: vencida, en curso, por aprobar, bloqueada, hecha, sin asignar.' },
  { name: 'event-files', path: `${E1}?tab=files`, note: '2 escritos y 8 archivos de todas las secciones, nombres largos.' },
  { name: 'event-no-formats', path: `/events/${EVT2_ID}`, note: 'Show del Auditorio sin formatos, OC ni archivos (estado vacío).' },
  { name: 'purchase-orders', path: '/purchase-orders', note: '10 OC de 3 eventos; arranca en «Por autorizar».' },
  { name: 'advances', path: '/advances', note: 'Por resolver (2 por aprobar, 2 por pagar) y mis solicitudes con rechazo largo.' },
  { name: 'tasks', path: '/tasks', note: 'Abre en «Mis tareas» (6: vencida por aprobar, hoy, bloqueada, semana, más adelante); «Que pedí» y «Todas las tareas» traen 8 y 11.' },
  { name: 'chat', path: '/chat', note: 'Escritorio abre #general sola: 12 mensajes (lista, mención, adjunto, enlace, citado, borrado).' },
  { name: 'chat-dm', path: '/chat?channel=ch-rich-dm-beto', note: 'Directo con Bernardo: 5 mensajes con adjunto.' },
  { name: 'chat-event', path: '/chat?channel=ch-rich-evt1', note: 'Canal del evento con nombre larguísimo (sin mensajes: estado vacío).' },
  { name: 'folders', path: '/folders', note: '6 carpetas; clic en la primera tarjeta para ver 6 archivos de nombre largo.' },
  { name: 'calendar', path: '/calendar', note: 'Mes actual con los shows y 5 notas (dos hoy).' },
  { name: 'users', path: '/users', note: '10 personas con nombres/correos/puestos largos, riesgos, 2 invitaciones.' },
  { name: 'settings', path: '/settings', note: 'Días de cobro de OC (stub por defecto de mock-api).' },
  { name: 'checklists', path: '/checklists', note: '8 plantillas, una inactiva, nombres largos.' },
  { name: 'campaigns', path: '/campaigns', note: '4 campañas Arta en todos los estados (la del Auditorio se filtra).' },
  { name: 'ticketing', path: '/ticketing', note: 'Eventos actuales con su boletera (3 configuradas).' },
  { name: 'security', path: '/security', note: '4 sesiones, una sin dispositivo ni IP.' },
  { name: 'organizations', path: '/organizations', note: 'Organización con plan, miembros, invitaciones y 3 organizaciones.' },
];
