import {
  calcProgress,
  captureCount,
  formatProgress,
  isFormatSent,
  isItemComplete,
  scoringItems,
} from './checklist-progress';

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

  it('tablas, SÍ/NO y adjuntos cuentan como cualquier otro campo', () => {
    const data = {
      sections: [
        {
          id: 's',
          title: 'S',
          items: [
            { id: 't', label: 'Rooming', type: 'table', columns: [{ id: 'n', label: 'N' }], rows: [{ n: 'Ana' }] },
            { id: 'y', label: 'Desayuno', type: 'yesno', value: 'NO' },
            { id: 'a', label: 'Rider', type: 'attachment', value: '', fileId: null },
            { id: 'h', label: 'Hora', type: 'time', value: '' },
          ],
        },
      ],
    };
    expect(calcProgress(data)).toBe(50);
  });

  it('un ítem opcional vacío no resta; lleno sí suma', () => {
    const items = [
      { id: 'a', label: 'Audio', type: 'check', done: true },
      { id: 'o', label: 'Observaciones', type: 'longtext', value: '', optional: true },
    ];
    expect(calcProgress({ sections: [{ id: 's', title: 'S', items }] })).toBe(100);
    items[1].value = 'algo';
    expect(calcProgress({ sections: [{ id: 's', title: 'S', items }] })).toBe(100);
    items[0].done = false;
    expect(calcProgress({ sections: [{ id: 's', title: 'S', items }] })).toBe(50);
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

/**
 * Junta del 23-10-2026: cada evento usa solo parte de cada checklist, así que
 * un formato terminado y mandado vale 100 % aunque no se haya palomeado todo.
 */
describe('formatProgress · formato mandado = 100 %', () => {
  // 1 de 4 casillas: lo que deja un evento que no usa la mitad del checklist.
  const data = {
    sections: [
      {
        id: 'produccion',
        title: 'Producción',
        items: [
          { id: 'a', label: 'Audio', type: 'check', done: true },
          { id: 'b', label: 'Luces', type: 'check', done: false },
          { id: 'c', label: 'Pantallas', type: 'check', done: false },
          { id: 'd', label: 'Planta de luz', type: 'check', done: false },
        ],
      },
      FIRMAS_SECTION,
    ],
  };

  it('en borrador y sin firma cuenta lo capturado', () => {
    expect(formatProgress(data, { status: 'DRAFT', deliveredAt: null, authorizedAt: null })).toBe(25);
    expect(formatProgress(data, null)).toBe(25);
    expect(isFormatSent({ status: 'DRAFT' })).toBe(false);
  });

  it('con la firma de entrega cuenta 100 % aunque falten casillas', () => {
    expect(formatProgress(data, { status: 'DRAFT', deliveredAt: new Date('2026-10-23T18:00:00Z') })).toBe(100);
    // Llega como ISO desde la API o como Date desde Prisma: los dos valen.
    expect(formatProgress(data, { deliveredAt: '2026-10-23T18:00:00.000Z' })).toBe(100);
  });

  it('con la firma de autorización también', () => {
    expect(formatProgress(data, { status: 'DRAFT', authorizedAt: new Date() })).toBe(100);
  });

  it('mandar a revisión, aprobar o sellar es mandarlo', () => {
    for (const status of ['REVIEW', 'APPROVED', 'SEALED']) {
      expect(formatProgress(data, { status })).toBe(100);
      expect(isFormatSent({ status })).toBe(true);
    }
  });

  it('una firma guardada sin fecha (datos viejos) cuenta como mandado', () => {
    expect(formatProgress(data, { authorizedSignature: { signerName: 'Dirección', imageDataUrl: 'data:image/png;base64,AA' } })).toBe(100);
    expect(formatProgress(data, { deliveredSignature: null, authorizedSignature: null })).toBe(25);
  });

  it('volver a borrador sin firma regresa a lo capturado; con firma de entrega se queda en 100 %', () => {
    expect(formatProgress(data, { status: 'DRAFT', deliveredAt: null })).toBe(25);
    expect(formatProgress(data, { status: 'DRAFT', deliveredAt: new Date() })).toBe(100);
  });

  it('lo capturado de verdad se sigue pudiendo enseñar aparte', () => {
    expect(captureCount(data)).toEqual({ done: 1, total: 4 });
    expect(calcProgress(data)).toBe(25);
  });
});
