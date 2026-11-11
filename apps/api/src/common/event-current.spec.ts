import { eventCurrentWhere, eventPastWhere, isEventCurrent } from './checklist-progress';

/**
 * Inicio («Eventos activos») y Eventos → Actuales deben contar lo mismo. En producción Inicio decía 8
 * (todo `status=ACTIVE`, incluidos shows pasados sin cerrar) y la lista 3.
 */
describe('isEventCurrent', () => {
  // 11-nov-2026, 10:00 en Puebla (UTC-6).
  const now = new Date('2026-11-11T16:00:00Z');

  it('show futuro activo o en borrador: cuenta', () => {
    expect(isEventCurrent({ status: 'ACTIVE', startsAt: new Date('2026-12-09T02:00:00Z'), endsAt: null }, now)).toBe(true);
    expect(isEventCurrent({ status: 'DRAFT', startsAt: new Date('2027-02-01T02:00:00Z'), endsAt: null }, now)).toBe(true);
  });

  it('show activo que ya pasó y nadie cerró: no cuenta', () => {
    expect(isEventCurrent({ status: 'ACTIVE', startsAt: new Date('2026-10-01T02:00:00Z'), endsAt: null }, now)).toBe(false);
  });

  it('show de varios días que empezó ayer y termina mañana: cuenta', () => {
    expect(
      isEventCurrent(
        { status: 'ACTIVE', startsAt: new Date('2026-11-10T02:00:00Z'), endsAt: new Date('2026-11-13T05:00:00Z') },
        now,
      ),
    ).toBe(true);
  });

  it('show de hoy en la noche (ya es otro día en UTC): cuenta', () => {
    expect(isEventCurrent({ status: 'ACTIVE', startsAt: new Date('2026-11-12T03:00:00Z'), endsAt: null }, now)).toBe(true);
  });

  it('cerrado o cancelado: no cuenta aunque sea futuro', () => {
    const startsAt = new Date('2026-12-01T02:00:00Z');
    expect(isEventCurrent({ status: 'CLOSED', startsAt, endsAt: null }, now)).toBe(false);
    expect(isEventCurrent({ status: 'CANCELLED', startsAt, endsAt: null }, now)).toBe(false);
  });

  it('sin fecha: cuenta (sigue siendo trabajo vivo)', () => {
    expect(isEventCurrent({ status: 'DRAFT', startsAt: null, endsAt: null }, now)).toBe(true);
  });

  it('los filtros de base excluyen cerrados/cancelados y cortan en el día de Puebla', () => {
    const cur = eventCurrentWhere(now) as any;
    expect(cur.status).toEqual({ notIn: ['CLOSED', 'CANCELLED'] });
    const cutoff = cur.OR[0].endsAt.gte as Date;
    expect(cutoff.toISOString()).toBe('2026-11-11T06:00:00.000Z');
    const past = eventPastWhere(now) as any;
    expect(past.OR[1].endsAt.lt).toEqual(cutoff);
  });
});
