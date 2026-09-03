import {
  describeDiff,
  diffBinary,
  diffChecklistData,
  diffDocBlocks,
  diffFinanceRows,
} from './doc-diff';

const checklist = (sections: unknown) => ({ sections });

describe('diffChecklistData', () => {
  const base = checklist([
    {
      id: 'datos',
      title: 'Datos del show',
      items: [
        { id: 'recinto', label: 'Recinto', type: 'text', value: 'Auditorio Arema' },
        { id: 'aforo', label: 'Aforo autorizado', type: 'number', value: 4200 },
        { id: 'audio', label: 'Audio confirmado', type: 'check', done: false },
      ],
    },
  ]);

  it('no ve cambios cuando nada cambió', () => {
    const diff = diffChecklistData(base, base);
    expect(diff.changes).toEqual([]);
    expect(describeDiff(diff)).toBe('Sin cambios');
  });

  it('detecta una casilla marcada, con nombres legibles', () => {
    const after = checklist([
      {
        id: 'datos',
        title: 'Datos del show',
        items: [
          { id: 'recinto', label: 'Recinto', type: 'text', value: 'Auditorio Arema' },
          { id: 'aforo', label: 'Aforo autorizado', type: 'number', value: 4200 },
          { id: 'audio', label: 'Audio confirmado', type: 'check', done: true },
        ],
      },
    ]);
    const diff = diffChecklistData(base, after);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      scope: 'Datos del show',
      label: 'Audio confirmado',
      kind: 'changed',
      before: 'No',
      after: 'Sí',
    });
  });

  it('detecta un valor cambiado', () => {
    const after = checklist([
      {
        id: 'datos',
        title: 'Datos del show',
        items: [
          { id: 'recinto', label: 'Recinto', type: 'text', value: 'Auditorio Arema' },
          { id: 'aforo', label: 'Aforo autorizado', type: 'number', value: 3800 },
          { id: 'audio', label: 'Audio confirmado', type: 'check', done: false },
        ],
      },
    ]);
    const diff = diffChecklistData(base, after);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({ label: 'Aforo autorizado', before: '4200', after: '3800' });
    expect(describeDiff(diff)).toBe('1 cambiado');
  });

  it('vaciar un campo cuenta como quitado', () => {
    const after = checklist([
      {
        id: 'datos',
        title: 'Datos del show',
        items: [
          { id: 'recinto', label: 'Recinto', type: 'text', value: '' },
          { id: 'aforo', label: 'Aforo autorizado', type: 'number', value: 4200 },
          { id: 'audio', label: 'Audio confirmado', type: 'check', done: false },
        ],
      },
    ]);
    const diff = diffChecklistData(base, after);
    expect(diff.changes[0]).toMatchObject({ kind: 'removed', before: 'Auditorio Arema', after: null });
  });

  it('REORDENAR una sección no es un cambio', () => {
    const reordered = checklist([
      {
        id: 'datos',
        title: 'Datos del show',
        items: [
          { id: 'audio', label: 'Audio confirmado', type: 'check', done: false },
          { id: 'aforo', label: 'Aforo autorizado', type: 'number', value: 4200 },
          { id: 'recinto', label: 'Recinto', type: 'text', value: 'Auditorio Arema' },
        ],
      },
    ]);
    expect(diffChecklistData(base, reordered).changes).toEqual([]);
  });

  it('una sección nueva vacía no ensucia el historial', () => {
    const after = checklist([
      ...(base.sections as unknown[]),
      {
        id: 'extra',
        title: 'Extra',
        items: [
          { id: 'nota', label: 'Nota', type: 'text', value: '' },
          { id: 'ok', label: 'Revisado', type: 'check', done: false },
        ],
      },
    ]);
    expect(diffChecklistData(base, after).changes).toEqual([]);
  });

  it('una sección nueva con contenido sí aparece', () => {
    const after = checklist([
      ...(base.sections as unknown[]),
      { id: 'extra', title: 'Extra', items: [{ id: 'nota', label: 'Nota', type: 'text', value: 'Ojo con el acceso' }] },
    ]);
    const diff = diffChecklistData(base, after);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({ kind: 'added', scope: 'Extra', after: 'Ojo con el acceso' });
  });

  it('borrar un campo que tenía valor se registra', () => {
    const after = checklist([
      { id: 'datos', title: 'Datos del show', items: [{ id: 'audio', label: 'Audio confirmado', type: 'check', done: false }] },
    ]);
    const diff = diffChecklistData(base, after);
    expect(diff.summary.removed).toBe(2);
  });

  it('aguanta datos corruptos', () => {
    expect(diffChecklistData(null, null).changes).toEqual([]);
    expect(diffChecklistData(undefined, {}).changes).toEqual([]);
    expect(diffChecklistData('texto', { sections: null }).changes).toEqual([]);
    expect(diffChecklistData({ sections: [null] }, { sections: [{ items: [null] }] }).changes).toEqual([]);
  });
});

describe('diffFinanceRows', () => {
  const base = {
    rows: [
      { type: 'income', concept: 'Taquilla', amount: 100000 },
      { type: 'expense', concept: 'Audio', amount: 20000 },
    ],
  };

  it('detecta un monto cambiado con formato de moneda', () => {
    const after = {
      rows: [
        { type: 'income', concept: 'Taquilla', amount: 150000 },
        { type: 'expense', concept: 'Audio', amount: 20000 },
      ],
    };
    const diff = diffFinanceRows(base, after);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0].scope).toBe('Ingresos');
    expect(diff.changes[0].label).toBe('Taquilla');
    expect(diff.changes[0].before).toContain('100,000');
    expect(diff.changes[0].after).toContain('150,000');
  });

  it('un renglón nuevo y uno borrado', () => {
    const after = {
      rows: [
        { type: 'income', concept: 'Taquilla', amount: 100000 },
        { type: 'income', concept: 'Patrocinios', amount: 50000 },
      ],
    };
    const diff = diffFinanceRows(base, after);
    expect(diff.summary).toMatchObject({ added: 1, removed: 1, changed: 0 });
  });

  it('reordenar renglones no es un cambio', () => {
    const reordered = { rows: [base.rows[1], base.rows[0]] };
    expect(diffFinanceRows(base, reordered).changes).toEqual([]);
  });

  it('el concepto casa sin importar mayúsculas ni espacios', () => {
    const after = { rows: [{ type: 'income', concept: '  taquilla ', amount: 100000 }, base.rows[1]] };
    expect(diffFinanceRows(base, after).changes).toEqual([]);
  });

  it('aguanta payloads corruptos', () => {
    expect(diffFinanceRows(null, {}).changes).toEqual([]);
    expect(diffFinanceRows({ rows: 'no soy lista' }, { rows: [] }).changes).toEqual([]);
  });
});

describe('diffDocBlocks', () => {
  it('detecta texto editado en un bloque', () => {
    const before = [{ id: 'b1', type: 'p', text: 'Hola' }];
    const after = [{ id: 'b1', type: 'p', text: 'Hola equipo' }];
    const diff = diffDocBlocks(before, after);
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({ before: 'Hola', after: 'Hola equipo', kind: 'changed' });
  });

  it('bloque añadido y bloque quitado', () => {
    const diff = diffDocBlocks([{ id: 'b1', text: 'uno' }], [{ id: 'b2', text: 'dos' }]);
    expect(diff.summary).toMatchObject({ added: 1, removed: 1 });
  });

  it('aguanta entradas que no son listas', () => {
    expect(diffDocBlocks(null, undefined).changes).toEqual([]);
  });
});

describe('diffBinary', () => {
  it('la primera versión es un alta', () => {
    const diff = diffBinary(null, { fileName: 'corrida.xlsx', hash: 'abc123', sizeBytes: 2048 });
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({ kind: 'added', after: 'corrida.xlsx' });
  });

  it('mismo archivo, contenido distinto', () => {
    const diff = diffBinary(
      { fileName: 'corrida.xlsx', hash: 'aaaaaaaaaaaaaaaa', sizeBytes: 2048 },
      { fileName: 'corrida.xlsx', hash: 'bbbbbbbbbbbbbbbb', sizeBytes: 4096 },
    );
    const keys = diff.changes.map((c) => c.key);
    expect(keys).toContain('hash');
    expect(keys).toContain('sizeBytes');
    expect(keys).not.toContain('fileName');
  });

  it('guardar el mismo contenido no genera cambios', () => {
    const meta = { fileName: 'a.xlsx', hash: 'zzz', sizeBytes: 10 };
    expect(diffBinary(meta, meta).changes).toEqual([]);
  });
});

describe('describeDiff', () => {
  it('resume en lenguaje natural', () => {
    expect(describeDiff(null)).toBe('Sin cambios');
    expect(
      describeDiff({
        changes: [
          { scope: 's', key: 'a', label: 'a', kind: 'changed', before: '1', after: '2' },
          { scope: 's', key: 'b', label: 'b', kind: 'added', before: null, after: '2' },
        ],
        summary: { added: 1, removed: 0, changed: 1 },
      }),
    ).toBe('1 cambiado · 1 añadido');
  });
});
