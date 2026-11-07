import { DEFAULT_RISK_RULES, eventRisk, riskRulesOf } from './event-risk';
import { eventDoneWhere, formatProgress, isEventDone, startOfPueblaDay } from './checklist-progress';

/** Adam, 07-11-2026: riesgo solo a una o dos semanas del evento, y al 100 % lo que ya terminó. */
describe('riesgo de un evento', () => {
  it('lejos del evento no hay riesgo aunque el avance sea bajo', () => {
    expect(eventRisk({ avg: 10, days: 111 })).toBe('healthy');
    expect(eventRisk({ avg: 10, days: 15 })).toBe('healthy');
  });

  it('a dos semanas pide revisar; a una, es urgente', () => {
    expect(eventRisk({ avg: 55, days: 14 })).toBe('watch');
    expect(eventRisk({ avg: 65, days: 14 })).toBe('healthy');
    expect(eventRisk({ avg: 75, days: 7 })).toBe('critical');
    expect(eventRisk({ avg: 85, days: 3 })).toBe('healthy');
  });

  it('sin fecha, ya empezado o terminado, no hay riesgo', () => {
    expect(eventRisk({ avg: 0, days: null })).toBe('healthy');
    expect(eventRisk({ avg: 0, days: -2 })).toBe('healthy');
    expect(eventRisk({ avg: 0, days: 3, done: true })).toBe('healthy');
  });

  it('cada organización ajusta los umbrales, con límites sanos', () => {
    const rules = riskRulesOf({ riesgo: { urgente: { dias: 10, minimo: 90 }, revisar: { dias: '21', minimo: 70 } } });
    expect(rules).toEqual({ urgente: { dias: 10, minimo: 90 }, revisar: { dias: 21, minimo: 70 } });
    expect(eventRisk({ avg: 85, days: 9 }, rules)).toBe('critical');
    expect(riskRulesOf(null)).toEqual(DEFAULT_RISK_RULES);
    expect(riskRulesOf({ riesgo: { urgente: { dias: 0, minimo: 500 } } }).urgente).toEqual({ dias: 1, minimo: 100 });
    // «Revisar» nunca queda más cerca del evento que «Urgente».
    expect(riskRulesOf({ riesgo: { urgente: { dias: 20 }, revisar: { dias: 5 } } }).revisar.dias).toBe(20);
  });
});

describe('evento terminado = 100 %', () => {
  const now = new Date('2026-11-07T18:00:00Z'); // 12:00 en Puebla

  it('cerrado cuenta 100 % aunque el formato esté a medias', () => {
    const data = { sections: [{ id: 's', items: [{ id: 'a', type: 'text', value: 'x' }, { id: 'b', type: 'text' }] }] };
    expect(formatProgress(data, { status: 'DRAFT' }, { status: 'ACTIVE' }, now)).toBe(50);
    expect(formatProgress(data, { status: 'DRAFT' }, { status: 'CLOSED' }, now)).toBe(100);
  });

  it('la fecha pasa al día siguiente de la última función, en hora de Puebla', () => {
    // El show de anoche a las 21:00 de Puebla (03:00 UTC de hoy) ya pasó.
    expect(isEventDone({ status: 'ACTIVE', startsAt: '2026-11-07T03:00:00Z' }, now)).toBe(true);
    // El de hoy a las 21:00 todavía no.
    expect(isEventDone({ status: 'ACTIVE', startsAt: '2026-11-08T03:00:00Z' }, now)).toBe(false);
    // Un festival que sigue mañana manda la fecha de fin.
    expect(isEventDone({ status: 'ACTIVE', startsAt: '2026-11-01T18:00:00Z', endsAt: '2026-11-08T05:00:00Z' }, now)).toBe(false);
    expect(isEventDone({ status: 'CANCELLED', startsAt: '2026-10-01T18:00:00Z' }, now)).toBe(false);
    expect(isEventDone({ status: 'DRAFT', startsAt: null }, now)).toBe(false);
  });

  it('el filtro de la base usa la misma medianoche', () => {
    expect(startOfPueblaDay(now).toISOString()).toBe('2026-11-07T06:00:00.000Z');
    const where = eventDoneWhere(now) as { OR: Array<Record<string, unknown>> };
    expect(where.OR[0]).toEqual({ status: 'CLOSED' });
    expect(where.OR[1]).toMatchObject({ endsAt: { lt: new Date('2026-11-07T06:00:00.000Z') } });
  });
});
