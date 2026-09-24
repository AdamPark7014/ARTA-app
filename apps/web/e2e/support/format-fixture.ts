/**
 * Un formato estándar pequeño (Hospedaje, catálogo v2) para los e2e del panel:
 * encabezado enlazado al evento, texto, SÍ/NO, texto largo, tabla y casillas.
 * Misma forma que `apps/api/src/checklists/format-catalog.ts`.
 */
export const FORMAT_DATA = {
  formatVersion: 2,
  sections: [
    {
      id: 'encabezado',
      title: 'Datos del show',
      layout: 'header',
      items: [
        { id: 'show', label: 'Nombre del show', type: 'text', value: 'ANDRES PARRA', bind: 'event.name', cols: 6 },
        { id: 'fecha', label: 'Fecha', type: 'date', value: '2026-09-19', bind: 'event.date', cols: 3 },
        { id: 'hora', label: 'Hora', type: 'text', value: '20:00', bind: 'event.time', cols: 3 },
        { id: 'ciudad', label: 'Ciudad', type: 'text', value: 'Puebla', bind: 'event.city', cols: 6 },
        { id: 'venue', label: 'Venue', type: 'text', value: 'Auditorio Arema', bind: 'event.venue', cols: 6 },
      ],
    },
    {
      id: 'hotel',
      title: 'Hotel',
      items: [
        { id: 'nombre', label: 'Nombre del hotel', type: 'text', value: '' },
        { id: 'contacto', label: 'Nombre y contacto del enlace con el hotel', type: 'text', value: '' },
        { id: 'desayuno', label: 'Incluye desayuno', type: 'yesno', value: null },
        { id: 'observaciones', label: 'Observaciones', type: 'longtext', value: '', optional: true },
      ],
    },
    {
      id: 'party_a',
      title: 'Party A',
      items: [
        {
          id: 'party_a',
          label: 'Party A',
          type: 'table',
          columns: [
            { id: 'nombre', label: 'Nombre', width: 3 },
            { id: 'habitacion', label: 'Habitación', width: 1 },
          ],
          rows: [],
          minRows: 4,
        },
      ],
    },
    {
      id: 'checks',
      title: 'Confirmaciones',
      items: [
        { id: 'c1', label: 'Reservación confirmada', type: 'check', done: true, note: '' },
        { id: 'c2', label: 'Late check-out pedido', type: 'check', done: false, note: '' },
      ],
    },
    { id: 'firmas', title: 'Firmas digitales', items: [{ id: 'f1', label: 'Entregado', type: 'signature' }] },
  ],
};

export const FORMAT_CHECKLIST = {
  id: 'chk-demo',
  title: 'Checklist Hospedaje',
  progressPct: 40,
  status: 'DRAFT',
  revision: 3,
  dataJson: FORMAT_DATA,
  pdfUrl: '/uploads/checklists/chk-demo-r3.pdf',
  pdfGeneratedAt: '2026-09-23T00:00:00.000Z',
  template: { key: 'HOSPEDAJE' },
  versions: [],
};

export const FORMAT_EVENT = {
  id: 'evt-e2e-1',
  name: 'ANDRES PARRA',
  artist: 'Andrés Parra',
  venue: 'Auditorio Arema',
  city: 'Puebla',
  status: 'ACTIVE',
  entity: 'ARTA',
  campaignType: 'INTERNAL',
  startsAt: '2026-09-20T02:00:00.000Z',
  checklists: [FORMAT_CHECKLIST],
  purchaseOrders: [],
  financeRuns: [],
  campaign: null,
  ticketingSetups: [],
  files: [],
  tasks: [],
  sponsors: [],
};

/** Stubs del API para abrir el evento con el formato ya seleccionado. */
export const FORMAT_STUBS = {
  '/events/evt-e2e-1': FORMAT_EVENT,
  '/documents/event/evt-e2e-1': [],
  '/vendor/event/evt-e2e-1': [],
  '/checklists/chk-demo': FORMAT_CHECKLIST,
};

export const FORMAT_URL = '/events/evt-e2e-1?tab=checklists&checklist=chk-demo';
