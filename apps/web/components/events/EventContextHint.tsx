import type { Tab } from './event-detail.types';
import { TAB_LABELS } from './useEventTab';

const TAB_HINTS: Record<Tab, string> = {
  overview: 'Panorama del show: avance global, disciplinas y notas del equipo.',
  checklists: 'Marca ítems, guarda, genera PDF y firma entregado / autorizado por formato.',
  ocs: 'Órdenes de compra: crea partidas, autoriza y marca pagado cuando corresponda.',
  finance: 'Corrida financiera del evento. Importa Excel o edita ingresos y egresos.',
  campaign: 'Plan de campaña, creativos y autorización comercial.',
  ticketing: 'Configura boletera, zonas, aforo y ventas por zona.',
  tasks: 'Asigna pendientes al equipo con módulo, responsable y fecha.',
  sponsors: 'Patrocinios, aportes y contactos del evento.',
  files: 'Archivos Excel y PDF ligados al show.',
};

type Props = {
  tab: Tab;
};

export function EventContextHint({ tab }: Props) {
  return (
    <div className="event-hint" role="note">
      <span className="event-hint__label">{TAB_LABELS[tab]}</span>
      <span className="event-hint__text">{TAB_HINTS[tab]}</span>
    </div>
  );
}
