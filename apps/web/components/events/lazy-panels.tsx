'use client';

import dynamic from 'next/dynamic';

/**
 * Los paneles del evento, cargados al abrir su pestaña.
 *
 * El detalle del evento importaba los nueve de golpe, y con ellos todo lo que
 * arrastran: `xlsx` por las plantillas de corrida, campaña y convenios, más los
 * editores embebidos. Se veía en el build — `/events/[id]` pesaba **317 kB de
 * First Load contra ~117 kB de cualquier otra pantalla** — y lo pagaba entero
 * quien solo entraba a mirar el avance del show.
 *
 * Solo se pinta una pestaña a la vez, así que solo hace falta una. Resumen se
 * queda estático: es lo primero que se ve y no debe parpadear.
 */
function Cargando({ que }: { que: string }) {
  return (
    <p className="muted kpi-sub" role="status">
      Abriendo {que}…
    </p>
  );
}

export const EventChecklistsPanel = dynamic(
  () => import('./EventChecklistsPanel').then((m) => m.EventChecklistsPanel),
  { loading: () => <Cargando que="los formatos" /> },
);

export const EventPurchaseOrdersPanel = dynamic(
  () => import('./EventPurchaseOrdersPanel').then((m) => m.EventPurchaseOrdersPanel),
  { loading: () => <Cargando que="las órdenes de compra" /> },
);

export const EventFinancePanel = dynamic(
  () => import('./EventFinancePanel').then((m) => m.EventFinancePanel),
  { loading: () => <Cargando que="la corrida" /> },
);

export const EventCampaignPanel = dynamic(
  () => import('./EventCampaignPanel').then((m) => m.EventCampaignPanel),
  { loading: () => <Cargando que="la campaña" /> },
);

export const EventTicketingPanel = dynamic(
  () => import('./EventTicketingPanel').then((m) => m.EventTicketingPanel),
  { loading: () => <Cargando que="la boletera" /> },
);

export const EventTasksPanel = dynamic(
  () => import('./EventTasksPanel').then((m) => m.EventTasksPanel),
  { loading: () => <Cargando que="las tareas" /> },
);

export const EventSponsorsPanel = dynamic(
  () => import('./EventSponsorsPanel').then((m) => m.EventSponsorsPanel),
  { loading: () => <Cargando que="los convenios" /> },
);

export const EventFilesPanel = dynamic(
  () => import('./EventFilesPanel').then((m) => m.EventFilesPanel),
  { loading: () => <Cargando que="los documentos" /> },
);
