import { convenioZonesOf, normalizeCampaignData, normalizeConvenios, normalizeFinalNotes } from './campaign-data';

/**
 * Correcciones 23-10-2026: convenios con varias zonas y notas finales con
 * fecha. Lo guardado con el formato anterior (una zona por renglón) se lee
 * igual, como un convenio de una zona.
 */
describe('campaign-data · convenios con varias zonas', () => {
  it('una fila del formato anterior se vuelve un convenio de una zona, con los mismos datos', () => {
    const [c] = normalizeConvenios([
      { concept: 'TV AZTECA', description: 'Difusión en Hechos', zona: 'Oro', qty: 4, price: 800 },
    ]);
    expect(c).toEqual({
      concept: 'TV AZTECA',
      description: 'Difusión en Hechos',
      zonas: [{ zona: 'Oro', qty: 4, price: 800 }],
    });
  });

  it('conserva varias zonas, cada una con su cantidad y su precio', () => {
    const [c] = normalizeConvenios([
      {
        concept: 'RADIO ORO',
        description: 'Spots',
        zonas: [
          { zona: 'Oro', qty: 10, price: 1200 },
          { zona: 'Plata', qty: '20', price: '650.5' },
          { zona: '', qty: null, price: null },
        ],
        // Con `zonas` presente, las llaves viejas no se mezclan.
        zona: 'Vieja',
        qty: 99,
        price: 1,
      },
    ]);
    expect(c.zonas).toEqual([
      { zona: 'Oro', qty: 10, price: 1200 },
      { zona: 'Plata', qty: 20, price: 650.5 },
    ]);
  });

  it('un convenio sin zona todavía se guarda (se captura en partes)', () => {
    expect(convenioZonesOf({ concept: 'ULTRA', description: 'x' })).toEqual([]);
    expect(normalizeConvenios([{ concept: 'ULTRA' }])).toEqual([{ concept: 'ULTRA', description: '', zonas: [] }]);
  });

  it('descarta renglones sin convenio y basura que no es objeto', () => {
    expect(normalizeConvenios([{ concept: '  ' }, 'x', null, 4])).toEqual([]);
    expect(normalizeConvenios('no es lista')).toEqual([]);
  });
});

describe('campaign-data · notas finales', () => {
  it('limpia fechas, voltea un rango al revés y quita notas vacías', () => {
    expect(
      normalizeFinalNotes([
        { from: '2026-11-15', to: '2026-11-01', text: '  Válida para venta a terceros ' },
        { from: 'mañana', to: null, text: 'Pago antes del show' },
        { from: null, to: null, text: '' },
      ]),
    ).toEqual([
      { from: '2026-11-01', to: '2026-11-15', text: 'Válida para venta a terceros' },
      { from: null, to: null, text: 'Pago antes del show' },
    ]);
  });

  it('solo toca las llaves que conoce; lo demás de la campaña pasa igual', () => {
    const out = normalizeCampaignData({ channels: 'Radio', finalNotes: [{ text: 'Hola', extra: 1 }] });
    expect(out).toEqual({ channels: 'Radio', finalNotes: [{ from: null, to: null, text: 'Hola' }] });
    expect('convenios' in out).toBe(false);
  });
});
