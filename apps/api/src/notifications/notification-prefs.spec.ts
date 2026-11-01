import { inQuietHours, normalizePrefs, pushAllowed } from './notification-prefs';

/** Hora de Puebla (UTC-6 en noviembre) como instante. */
const puebla = (hhmm: string) => new Date(`2026-11-03T${hhmm}:00-06:00`);

describe('preferencias de avisos', () => {
  it('sin nada guardado todo llega, siempre', () => {
    expect(normalizePrefs(null)).toEqual({
      muted: [],
      quietHours: { enabled: false, start: '22:00', end: '07:00' },
    });
    expect(pushAllowed(null, { channel: 'documents', priority: 'normal' }, puebla('03:00'))).toBe(true);
  });

  it('tira lo que no conoce: categorías inventadas y horas mal escritas', () => {
    const prefs = normalizePrefs({ muted: ['chat', 'nada'], quietHours: { enabled: true, start: '25:00', end: '6am' } });
    expect(prefs.muted).toEqual(['chat']);
    expect(prefs.quietHours).toEqual({ enabled: true, start: '22:00', end: '07:00' });
  });

  it('una categoría apagada no llega, por urgente que sea', () => {
    expect(pushAllowed({ muted: ['approvals'] }, { channel: 'approvals', priority: 'high' })).toBe(false);
    expect(pushAllowed({ muted: ['approvals'] }, { channel: 'tasks', priority: 'high' })).toBe(true);
  });

  describe('horario silencioso', () => {
    const night = { quietHours: { enabled: true, start: '22:00', end: '07:00' } };

    it('cruza la medianoche y se mide en la hora de Puebla', () => {
      const quiet = normalizePrefs(night).quietHours;
      expect(inQuietHours(quiet, puebla('23:30'))).toBe(true);
      expect(inQuietHours(quiet, puebla('06:59'))).toBe(true);
      expect(inQuietHours(quiet, puebla('07:00'))).toBe(false);
      expect(inQuietHours(quiet, puebla('21:59'))).toBe(false);
    });

    it('de noche solo lo urgente; el chat y lo informativo esperan a la mañana', () => {
      const at = puebla('23:30');
      expect(pushAllowed(night, { channel: 'approvals', priority: 'high' }, at)).toBe(true);
      expect(pushAllowed(night, { channel: 'tasks', priority: 'high' }, at)).toBe(true);
      expect(pushAllowed(night, { channel: 'chat', priority: 'high' }, at)).toBe(false);
      expect(pushAllowed(night, { channel: 'documents', priority: 'normal' }, at)).toBe(false);
    });

    it('de día no cambia nada', () => {
      expect(pushAllowed(night, { channel: 'chat', priority: 'high' }, puebla('12:00'))).toBe(true);
    });
  });
});
