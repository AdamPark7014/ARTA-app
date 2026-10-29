import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ChecklistPdfService } from '../checklists/checklist-pdf.service';
import { HEADER_SECTION_ID, SIGNATURES_SECTION_ID, signatureLabels } from '../common/format-schema';
import {
  DEFAULT_INVENTORY_ITEMS,
  addDays,
  carryOverItems,
  inventoryStats,
  inventoryToFormat,
  isIsoDate,
  mondayOf,
  resolveItem,
  sanitizeItems,
  toQty,
  todayInMexico,
  weekLabel,
} from './cleaning-inventory';

describe('inventario de limpieza semanal · semanas', () => {
  it('cualquier día cae en su lunes', () => {
    expect(mondayOf('2026-10-26')).toBe('2026-10-26'); // lunes
    expect(mondayOf('2026-10-29')).toBe('2026-10-26'); // jueves
    expect(mondayOf('2026-11-01')).toBe('2026-10-26'); // domingo
    expect(mondayOf('2027-01-01')).toBe('2026-12-28'); // cruza de año
  });

  it('etiqueta legible, también cuando la semana cruza de mes o de año', () => {
    expect(weekLabel('2026-10-26')).toBe('Semana del 26 oct al 1 nov 2026');
    expect(weekLabel('2026-12-28')).toBe('Semana del 28 dic 2026 al 3 ene 2027');
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01');
  });

  it('solo fechas reales AAAA-MM-DD', () => {
    expect(isIsoDate('2026-10-29')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('29/10/2026')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });

  it('hoy es el día de Puebla, no el de UTC', () => {
    // 29-oct 23:30 en Puebla = 30-oct 05:30 UTC.
    expect(todayInMexico(new Date('2026-10-30T05:30:00Z'))).toBe('2026-10-29');
  });
});

describe('inventario de limpieza semanal · cuentas', () => {
  it('existencia final = inicial + entradas − consumo, y faltantes contra el mínimo', () => {
    const r = resolveItem({ id: 'a', insumo: 'Cloro', inicial: 10, entradas: 5, consumo: 12, minimo: 8 });
    expect(r.finalCalc).toBe(3);
    expect(r.faltantesCalc).toBe(5);
  });

  it('lo que la persona escribe manda sobre la cuenta', () => {
    const r = resolveItem({ id: 'a', insumo: 'Cloro', inicial: 10, entradas: 5, consumo: 12, final: 2, minimo: 8, faltantes: 10 });
    expect(r.finalCalc).toBe(2);
    expect(r.faltantesCalc).toBe(10);
  });

  it('sin mínimo no hay faltantes calculados; sin números, no hay existencia final', () => {
    expect(resolveItem({ id: 'a', insumo: 'Jergas', inicial: 4, consumo: 1 }).faltantesCalc).toBeNull();
    expect(resolveItem({ id: 'a', insumo: 'Jergas' }).finalCalc).toBeNull();
    // Con más de lo mínimo no falta nada (nunca negativo).
    expect(resolveItem({ id: 'a', insumo: 'Jergas', inicial: 20, minimo: 5 }).faltantesCalc).toBe(0);
  });

  it('cantidades del panel: coma decimal, texto vacío y basura', () => {
    expect(toQty('2,5')).toBe(2.5);
    expect(toQty('')).toBeNull();
    expect(toQty('abc')).toBeNull();
    expect(toQty(3)).toBe(3);
    expect(resolveItem({ id: 'a', insumo: 'Jabón', inicial: 0.3, entradas: 0.1 }).finalCalc).toBe(0.4);
  });

  it('limpia lo que llega: sin renglones vacíos, textos recortados, ids únicos', () => {
    const items = sanitizeItems([
      { id: 'x', insumo: '  Cloro  ', unidad: 'litros', inicial: '10', consumo: '2' },
      { id: 'x', insumo: 'Escobas' },
      { insumo: '', unidad: '' },
      null,
      'texto',
      { insumo: 'a'.repeat(500) },
    ]);
    expect(items.map((i) => i.insumo.length)).toEqual([5, 7, 120]);
    expect(items[0]).toMatchObject({ insumo: 'Cloro', inicial: 10, consumo: 2 });
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
    expect(sanitizeItems('nada')).toEqual([]);
  });

  it('cuenta insumos con faltantes', () => {
    const stats = inventoryStats([
      { id: '1', insumo: 'Cloro', inicial: 1, minimo: 5 },
      { id: '2', insumo: 'Jabón', inicial: 9, minimo: 5, consumo: 1 },
      { id: '3', insumo: 'Escobas' },
    ]);
    expect(stats).toEqual({ items: 3, faltantes: 1, capturados: 1 });
  });
});

describe('inventario de limpieza semanal · semana nueva', () => {
  it('la primera semana nace con la lista de insumos y sin cantidades', () => {
    const items = carryOverItems(null);
    expect(items.map((i) => i.insumo)).toEqual(DEFAULT_INVENTORY_ITEMS.map((d) => d.insumo));
    expect(items.every((i) => i.inicial === null && i.consumo === null)).toBe(true);
  });

  it('la siguiente copia insumos, unidades y mínimos, y la existencia final pasa a inicial', () => {
    const next = carryOverItems([
      { id: '1', insumo: 'Cloro', unidad: 'litros', inicial: 10, entradas: 5, consumo: 12, minimo: 8, observaciones: 'pedir' },
      { id: '2', insumo: 'Escobas', unidad: 'piezas', final: 4 },
      { id: '3', insumo: '' },
    ]);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ insumo: 'Cloro', unidad: 'litros', inicial: 3, minimo: 8, entradas: null, consumo: null, observaciones: null });
    expect(next[1]).toMatchObject({ insumo: 'Escobas', inicial: 4, minimo: null });
  });
});

describe('inventario de limpieza semanal · PDF con el motor de formatos', () => {
  const week = {
    weekStart: '2026-10-26',
    responsible: 'Rodrigo López',
    notes: 'Se pidió cloro al proveedor.',
    items: [
      { id: '1', insumo: 'Cloro', unidad: 'litros', inicial: 10, entradas: 5, consumo: 12, minimo: 8 },
      { id: '2', insumo: 'Papel higiénico (rollo jumbo)', unidad: 'rollos', inicial: 24, consumo: 10, minimo: 12 },
    ],
  };

  it('encabezado de la semana, tabla con las cuentas hechas y firmas al final', () => {
    const data = inventoryToFormat(week);
    expect(data.sections[0].id).toBe(HEADER_SECTION_ID);
    expect(data.sections[0].items.find((i) => i.id === 'semana')!.value).toBe('Semana del 26 oct al 1 nov 2026');
    expect(data.sections[0].items.find((i) => i.id === 'resumen')!.value).toBe('1 de 2');
    const table = data.sections[1].items[0];
    expect(table.columns!.map((c) => c.label)).toEqual([
      'Insumo',
      'Unidad',
      'Existencia inicial',
      'Entradas',
      'Consumo',
      'Existencia final',
      'Mínimo',
      'Faltantes',
      'Observaciones',
    ]);
    expect(table.rows![0]).toMatchObject({ insumo: 'Cloro', final: 3, faltantes: 5 });
    expect(table.rows![1]).toMatchObject({ final: 14, faltantes: 0 });
    expect(data.sections[data.sections.length - 1].id).toBe(SIGNATURES_SECTION_ID);
    expect(signatureLabels(data)).toEqual({ delivered: 'Responsable de limpieza', authorized: 'Auditorio Explanada Puebla' });
  });

  it('el generador real lo imprime sin marca de agua de borrador', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'arta-inventario-'));
    const previous = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = dir;
    try {
      const { filePath } = await new ChecklistPdfService(null as never).generate(
        'inventario-test',
        {
          title: 'Inventario de limpieza semanal',
          eventName: weekLabel(week.weekStart),
          entity: 'EXPLANADA',
          data: inventoryToFormat(week),
          watermark: false,
          folio: 'AUD-INV-20261026-V1',
        },
        1,
      );
      const bytes = readFileSync(filePath);
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(2000);
    } finally {
      process.env.UPLOAD_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
