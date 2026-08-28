import {
  DEFAULT_PO_WINDOW,
  describeSchedule,
  evaluatePoWindow,
  formatHhMm,
  parseHhMm,
  readPoWindow,
  sanitizePoWindow,
} from './po-window';

/**
 * Junta 2026-08-28: la ventana para solicitar OC es configurable y arranca con
 * la política vigente de Arta — lunes y jueves de 10:00 a 14:00, hora de CDMX.
 */
describe('ventana de órdenes de compra', () => {
  describe('lectura de configuración', () => {
    it('sin nada guardado cae en lunes y jueves de 10:00 a 14:00', () => {
      expect(readPoWindow(null)).toEqual(DEFAULT_PO_WINDOW);
      expect(readPoWindow({})).toEqual(DEFAULT_PO_WINDOW);
    });

    it('conserva otras claves de settingsJson intactas al sanear', () => {
      const cfg = readPoWindow({ require2fa: true, poWindow: { days: [2], start: '08:30' } });
      expect(cfg.days).toEqual([2]);
      expect(cfg.start).toBe('08:30');
    });

    it('descarta días fuera de rango y ordena sin duplicados', () => {
      const cfg = sanitizePoWindow({ days: [4, 1, 1, 9, -3] as number[] });
      expect(cfg.days).toEqual([1, 4]);
    });

    it('una ventana sin días válidos vuelve al default en vez de bloquear a todos', () => {
      expect(sanitizePoWindow({ days: [] }).days).toEqual([1, 4]);
    });

    it('un cierre anterior a la apertura se corrige a la hora de apertura', () => {
      const cfg = sanitizePoWindow({ start: '12:00', end: '09:00' });
      expect(cfg.end).toBe('12:00');
    });

    it('horas basura no rompen la configuración', () => {
      expect(parseHhMm('99:99', 600)).toBe(600);
      expect(parseHhMm(undefined, 600)).toBe(600);
      expect(formatHhMm(600)).toBe('10:00');
    });
  });

  describe('evaluación', () => {
    /** Un instante UTC concreto, para que la zona horaria sea la que decide. */
    const at = (iso: string) => new Date(iso);

    it('abre dentro del horario en día habilitado', () => {
      // Lunes 2026-08-31, 11:00 en CDMX (UTC-6) = 17:00 UTC
      const state = evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-08-31T17:00:00.000Z'));
      expect(state.open).toBe(true);
      expect(state.nextOpenLabel).toBeNull();
    });

    it('cierra antes de la hora de apertura y dice que abre hoy', () => {
      // Lunes 2026-08-31, 08:00 en CDMX = 14:00 UTC
      const state = evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-08-31T14:00:00.000Z'));
      expect(state.open).toBe(false);
      expect(state.nextOpenLabel).toBe('hoy a las 10:00');
    });

    it('cierra al llegar la hora de fin', () => {
      // Lunes 2026-08-31, 14:00 en CDMX = 20:00 UTC — el límite ya no admite OC
      const state = evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-08-31T20:00:00.000Z'));
      expect(state.open).toBe(false);
    });

    it('en día no habilitado apunta al siguiente día de la ventana', () => {
      // Martes 2026-09-01, 11:00 en CDMX = 17:00 UTC → toca esperar al jueves
      const state = evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-09-01T17:00:00.000Z'));
      expect(state.open).toBe(false);
      expect(state.nextOpenLabel).toContain('jueves');
    });

    it('desactivada deja pasar cualquier momento', () => {
      const state = evaluatePoWindow(
        { ...DEFAULT_PO_WINDOW, enabled: false },
        at('2026-09-01T04:00:00.000Z'),
      );
      expect(state.open).toBe(true);
    });

    it('describe el horario en palabras para el mensaje del panel', () => {
      expect(describeSchedule(DEFAULT_PO_WINDOW)).toBe('lunes y jueves de 10:00 a 14:00');
      expect(describeSchedule({ ...DEFAULT_PO_WINDOW, days: [3] })).toBe(
        'miércoles de 10:00 a 14:00',
      );
      expect(describeSchedule({ ...DEFAULT_PO_WINDOW, days: [1, 3, 5] })).toBe(
        'lunes, miércoles y viernes de 10:00 a 14:00',
      );
    });

    it('una zona horaria inválida no tumba la petición', () => {
      const state = evaluatePoWindow(
        { ...DEFAULT_PO_WINDOW, timeZone: 'No/Existe' },
        at('2026-08-31T17:00:00.000Z'),
      );
      expect(typeof state.open).toBe('boolean');
    });
  });
});
