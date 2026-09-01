import { calcProgress, isItemComplete, scoringItems } from './checklist-progress';

/**
 * El bug que motivó extraer esto: el seed añade una sección `firmas` a TODAS
 * las plantillas con dos ítems de texto ya rellenados, que el servidor contaba
 * como completados y la pantalla no. El porcentaje del panel y el de la lista
 * lateral no coincidían nunca.
 */
const FIRMAS_SECTION = {
  id: 'firmas',
  title: 'Firmas digitales',
  items: [
    { id: 'firma_entregado_nota', label: 'Entregado', type: 'text', value: 'Usar botón Firmar entregado' },
    { id: 'firma_autorizado_nota', label: 'Autorizado', type: 'text', value: 'Usar botón Firmar autorizado' },
  ],
};

describe('checklist-progress', () => {
  it('no cuenta la sección de firmas', () => {
    const data = {
      sections: [
        {
          id: 'produccion',
          title: 'Producción',
          items: [
            { id: 'a', label: 'Audio', type: 'check', done: true },
            { id: 'b', label: 'Luces', type: 'check', done: false },
          ],
        },
        FIRMAS_SECTION,
      ],
    };
    // 1 de 2 ítems reales. Con la sección firmas dentro salía 3/4 = 75 %.
    expect(calcProgress(data)).toBe(50);
    expect(scoringItems(data)).toHaveLength(2);
  });

  it('un formato vacío queda en 0 aunque traiga la sección de firmas', () => {
    const data = {
      sections: [
        {
          id: 'produccion',
          title: 'Producción',
          items: [
            { id: 'a', label: 'Audio', type: 'check', done: false },
            { id: 'b', label: 'Luces', type: 'check', done: false },
          ],
        },
        FIRMAS_SECTION,
      ],
    };
    expect(calcProgress(data)).toBe(0);
  });

  it('un ítem sin tipo se trata como casilla', () => {
    expect(isItemComplete({ id: 'x', label: 'x', done: true })).toBe(true);
    expect(isItemComplete({ id: 'x', label: 'x', done: false })).toBe(false);
  });

  it('los campos de valor cuentan cuando tienen algo escrito', () => {
    expect(isItemComplete({ type: 'text', value: 'Auditorio Arema' })).toBe(true);
    expect(isItemComplete({ type: 'text', value: '   ' })).toBe(false);
    expect(isItemComplete({ type: 'text', value: '' })).toBe(false);
    expect(isItemComplete({ type: 'number', value: 0 })).toBe(true);
    expect(isItemComplete({ type: 'text', value: null })).toBe(false);
    expect(isItemComplete({ type: 'text' })).toBe(false);
  });

  it('los ítems de tipo firma no puntúan', () => {
    const data = {
      sections: [
        {
          id: 's',
          title: 'S',
          items: [
            { id: 'a', label: 'Audio', type: 'check', done: true },
            { id: 'f', label: 'Firma', type: 'signature' },
          ],
        },
      ],
    };
    expect(calcProgress(data)).toBe(100);
  });

  it('aguanta datos corruptos sin reventar', () => {
    expect(calcProgress(null)).toBe(0);
    expect(calcProgress(undefined)).toBe(0);
    expect(calcProgress('no soy un objeto')).toBe(0);
    expect(calcProgress({})).toBe(0);
    expect(calcProgress({ sections: [] })).toBe(0);
    expect(calcProgress({ sections: [{ id: 's', title: 'S' }] })).toBe(0);
  });

  it('redondea al entero más cercano', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      id: `i${i}`,
      label: `i${i}`,
      type: 'check',
      done: i === 0,
    }));
    // 1/3 = 33.33 → 33
    expect(calcProgress({ sections: [{ id: 's', title: 'S', items }] })).toBe(33);
  });
});
