import {
  DEFAULT_PO_WINDOW,
  PAY_DAYS_KIND,
  describeSchedule,
  evaluatePoWindow,
  formatHhMm,
  parseHhMm,
  readPoWindow,
  sanitizePoWindow,
} from './po-window';

/**
 * Revisión 11-09-2026: la OC se crea cualquier día; lo que se limita es el
 * registro del pago — «LOS PAGOS DE CAMPAÑAS ÚNICAMENTE SE REALIZARÁN LUNES,
 * MIÉRCOLES Y VIERNES». Se evalúa por día, en la zona de la organización.
 */
describe('días de cobro de órdenes de compra', () => {
  describe('lectura de configuración', () => {
    it('sin nada guardado cae en lunes, miércoles y viernes', () => {
      expect(readPoWindow(null)).toEqual(DEFAULT_PO_WINDOW);
      expect(readPoWindow({})).toEqual(DEFAULT_PO_WINDOW);
      expect(DEFAULT_PO_WINDOW.days).toEqual([1, 3, 5]);
    });

    it('la ventana de captura vieja (lunes y jueves) no se vuelve días de cobro', () => {
      const cfg = readPoWindow({
        poWindow: { enabled: true, days: [1, 4], start: '10:00', end: '14:00', timeZone: 'America/Cancun' },
      });
      expect(cfg.days).toEqual([1, 3, 5]);
      expect(cfg.timeZone).toBe('America/Cancun');
      expect(cfg.kind).toBe(PAY_DAYS_KIND);
    });

    it('lo guardado como días de cobro se respeta y convive con otras claves', () => {
      const cfg = readPoWindow({ require2fa: true, poWindow: { kind: PAY_DAYS_KIND, days: [2], note: 'Caja' } });
      expect(cfg.days).toEqual([2]);
      expect(cfg.note).toBe('Caja');
    });

    it('descarta días fuera de rango y ordena sin duplicados', () => {
      const cfg = sanitizePoWindow({ days: [5, 1, 1, 9, -3] as number[] });
      expect(cfg.days).toEqual([1, 5]);
      expect(cfg.kind).toBe(PAY_DAYS_KIND);
    });

    it('sin días válidos vuelve al default en vez de bloquear todos los pagos', () => {
      expect(sanitizePoWindow({ days: [] }).days).toEqual([1, 3, 5]);
    });

    it('horas basura no rompen la configuración', () => {
      expect(parseHhMm('99:99', 600)).toBe(600);
      expect(parseHhMm(undefined, 600)).toBe(600);
      expect(formatHhMm(600)).toBe('10:00');
      expect(() => sanitizePoWindow({ start: 'x', end: 'y' })).not.toThrow();
    });
  });

  describe('evaluación por día', () => {
    /** Un instante UTC concreto, para que la zona horaria sea la que decide. */
    const at = (iso: string) => new Date(iso);

    it('un lunes es día de cobro a cualquier hora', () => {
      // Lunes 2026-09-14: 07:00 y 23:30 en CDMX (UTC-6)
      expect(evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-09-14T13:00:00.000Z')).open).toBe(true);
      const late = evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-09-15T05:30:00.000Z'));
      expect(late.open).toBe(true);
      expect(late.nextOpenLabel).toBeNull();
    });

    it('el día lo decide la zona de la organización, no UTC', () => {
      // 2026-09-15 03:00 UTC ya es martes en UTC, pero en CDMX sigue siendo lunes.
      expect(evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-09-15T03:00:00.000Z')).open).toBe(true);
    });

    it('un martes no es día de cobro y apunta a mañana miércoles', () => {
      const state = evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-09-15T17:00:00.000Z'));
      expect(state.open).toBe(false);
      expect(state.nextOpenLabel).toBe('mañana (miércoles)');
    });

    it('un sábado apunta al lunes', () => {
      const state = evaluatePoWindow(DEFAULT_PO_WINDOW, at('2026-09-19T17:00:00.000Z'));
      expect(state.open).toBe(false);
      expect(state.nextOpenLabel).toBe('el lunes');
    });

    it('desactivada deja registrar pagos cualquier día', () => {
      const state = evaluatePoWindow(
        { ...DEFAULT_PO_WINDOW, enabled: false },
        at('2026-09-15T17:00:00.000Z'),
      );
      expect(state.open).toBe(true);
      expect(state.scheduleLabel).toBe('cualquier día');
    });

    it('describe los días en palabras, sin horas', () => {
      expect(describeSchedule(DEFAULT_PO_WINDOW)).toBe('lunes, miércoles y viernes');
      expect(describeSchedule({ ...DEFAULT_PO_WINDOW, days: [3] })).toBe('miércoles');
      expect(describeSchedule({ ...DEFAULT_PO_WINDOW, days: [1, 4] })).toBe('lunes y jueves');
    });

    it('una zona horaria inválida no tumba la petición', () => {
      const state = evaluatePoWindow(
        { ...DEFAULT_PO_WINDOW, timeZone: 'No/Existe' },
        at('2026-09-14T17:00:00.000Z'),
      );
      expect(typeof state.open).toBe('boolean');
    });
  });
});
