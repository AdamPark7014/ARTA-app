import { api } from '@/lib/api';

export type PoWindowConfig = {
  enabled: boolean;
  /** 0 = domingo … 6 = sábado */
  days: number[];
  start: string;
  end: string;
  timeZone: string;
  note?: string;
};

export type PoWindowState = {
  config: PoWindowConfig;
  open: boolean;
  scheduleLabel: string;
  nextOpenLabel: string | null;
  nowMinutes: number;
  /** El usuario puede capturar OC ahora (ventana abierta o dirección) */
  canRequestNow: boolean;
  bypass?: boolean;
  canEdit?: boolean;
};

export const DAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;

export function fetchPoWindow() {
  return api<PoWindowState>('/purchase-orders/window');
}

export function savePoWindow(config: PoWindowConfig) {
  return api<PoWindowState>('/purchase-orders/window', {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}
