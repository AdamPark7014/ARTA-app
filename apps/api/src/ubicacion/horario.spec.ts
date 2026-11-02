import { diaDe, enHorario, estadoDePersona, limitesDelDia, puntosAGuardar } from './horario';

const puebla = (hora: string, dia = '2026-11-03') => new Date(`${dia}T${hora}:00.000-06:00`);

describe('horario de la ubicación', () => {
  it('cuenta de 10:00 a 17:59 en Puebla, sin importar la zona del servidor', () => {
    expect(enHorario(puebla('09:59'))).toBe(false);
    expect(enHorario(puebla('10:00'))).toBe(true);
    expect(enHorario(puebla('17:59'))).toBe(true);
    expect(enHorario(puebla('18:00'))).toBe(false);
  });

  it('el día es el de Puebla: las 23:00 de Puebla ya son mañana en UTC', () => {
    expect(diaDe(puebla('23:00'))).toBe('2026-11-03');
    const { desde, hasta } = limitesDelDia('2026-11-03');
    expect(desde.toISOString()).toBe('2026-11-03T06:00:00.000Z');
    expect(hasta.toISOString()).toBe('2026-11-04T06:00:00.000Z');
  });
});

describe('puntosAGuardar', () => {
  const ahora = puebla('12:00');
  const punto = (hora: string, dia?: string) => ({ lat: 19, lng: -98, capturedAt: puebla(hora, dia).toISOString() });

  it('no guarda nada fuera del horario, aunque el teléfono lo mande', () => {
    expect(puntosAGuardar([punto('09:30'), punto('18:30', '2026-11-02')], [], ahora)).toEqual([]);
  });

  it('un punto cada 20 minutos o más: las ráfagas se quedan en uno', () => {
    const guardados = puntosAGuardar([punto('11:00'), punto('11:05'), punto('11:30')], [], ahora);
    expect(guardados.map((p) => p.capturedAt.toISOString())).toEqual([
      puebla('11:00').toISOString(),
      puebla('11:30').toISOString(),
    ]);
  });

  it('respeta lo que ya estaba guardado, antes y después', () => {
    expect(puntosAGuardar([punto('11:10')], [puebla('11:00'), puebla('11:25')], ahora)).toEqual([]);
  });

  it('un punto que esperó sin conexión entra en su hora', () => {
    const [p] = puntosAGuardar([punto('10:15')], [], ahora);
    expect(p.capturedAt.toISOString()).toBe(puebla('10:15').toISOString());
  });

  it('nada del futuro ni de hace más de un día', () => {
    expect(puntosAGuardar([punto('13:00')], [], ahora)).toEqual([]);
    expect(puntosAGuardar([punto('11:00', '2026-11-01')], [], ahora)).toEqual([]);
  });

  it('una fecha que no es fecha no tumba el resto', () => {
    const guardados = puntosAGuardar([{ lat: 1, lng: 1, capturedAt: 'ayer' }, punto('11:00')], [], ahora);
    expect(guardados).toHaveLength(1);
  });
});

describe('estadoDePersona', () => {
  const base = { consentAt: puebla('10:00'), state: 'ok', ultimoPunto: puebla('11:40'), dia: '2026-11-03', ahora: puebla('12:00') };

  it('al día con un punto reciente; atrasada si pasó el margen', () => {
    expect(estadoDePersona(base)).toBe('al_dia');
    expect(estadoDePersona({ ...base, ultimoPunto: puebla('10:30') })).toBe('atrasada');
  });

  it('el permiso negado o el GPS apagado se dicen tal cual', () => {
    expect(estadoDePersona({ ...base, state: 'sin_permiso' })).toBe('sin_permiso');
    expect(estadoDePersona({ ...base, state: 'apagada' })).toBe('apagada');
  });

  it('sin haber aceptado no se confunde con sin datos', () => {
    expect(estadoDePersona({ ...base, consentAt: null, ultimoPunto: null })).toBe('sin_aceptar');
    expect(estadoDePersona({ ...base, ultimoPunto: null })).toBe('sin_datos');
  });

  it('antes de las 10 no hay nada que reclamar', () => {
    expect(estadoDePersona({ ...base, ultimoPunto: null, ahora: puebla('09:00') })).toBe('fuera_de_horario');
  });

  it('un día pasado no se marca atrasado', () => {
    expect(estadoDePersona({ ...base, dia: '2026-11-02', ultimoPunto: puebla('17:30', '2026-11-02') })).toBe('al_dia');
  });
});
