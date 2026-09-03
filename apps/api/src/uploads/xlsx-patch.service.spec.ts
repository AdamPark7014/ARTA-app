import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { XlsxPatchService } from './xlsx-patch.service';

/**
 * La razón de ser de este servicio: hoy, guardar un Excel desde el panel
 * DESTRUYE su formato. SheetJS Community lee estilos pero al escribir emite una
 * fuente fija Calibri 12, y formato condicional y validación de datos están sin
 * implementar en su writer. Colores, bordes y anchos se van en cada guardado.
 *
 * Estas pruebas construyen un libro con formato real, le aplican un parche de
 * celda, y comprueban que lo que nadie tocó sigue ahí.
 */
describe('XlsxPatchService', () => {
  const service = new XlsxPatchService();

  /** Libro de corrida con estilos, fórmulas, anchos y dos hojas. */
  async function buildWorkbook(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ingresos = wb.addWorksheet('Ingresos');
    const notas = wb.addWorksheet('Notas');

    ingresos.columns = [
      { header: 'CONCEPTO', key: 'concepto', width: 32 },
      { header: 'MONTO', key: 'monto', width: 18 },
    ];

    const head = ingresos.getRow(1);
    head.font = { bold: true, size: 13, color: { argb: 'FFC9A962' } };
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF18181B' } };

    ingresos.getCell('A2').value = 'Taquilla';
    ingresos.getCell('B2').value = 100000;
    ingresos.getCell('B2').numFmt = '"$"#,##0.00';
    ingresos.getCell('B2').border = { bottom: { style: 'thin' } };

    ingresos.getCell('A3').value = 'Patrocinios';
    ingresos.getCell('B3').value = 50000;
    ingresos.getCell('B3').numFmt = '"$"#,##0.00';

    ingresos.getCell('A5').value = 'TOTAL';
    ingresos.getCell('B5').value = { formula: 'SUM(B2:B4)', result: 150000 };

    notas.getCell('A1').value = 'Ojo con el acceso por la puerta 3';

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async function read(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    return wb;
  }

  describe('applyCellPatch — fidelidad', () => {
    it('cambia solo la celda del parche', async () => {
      const out = await service.applyCellPatch(await buildWorkbook(), {
        cells: [{ sheet: 'Ingresos', ref: 'B2', value: 175000 }],
      });
      const wb = await read(out);
      const ws = wb.getWorksheet('Ingresos')!;
      expect(ws.getCell('B2').value).toBe(175000);
      expect(ws.getCell('B3').value).toBe(50000);
      expect(ws.getCell('A2').value).toBe('Taquilla');
    });

    it('CONSERVA el formato de las celdas que nadie tocó', async () => {
      const out = await service.applyCellPatch(await buildWorkbook(), {
        cells: [{ sheet: 'Ingresos', ref: 'A3', value: 'Patrocinios y convenios' }],
      });
      const ws = (await read(out)).getWorksheet('Ingresos')!;

      const head = ws.getRow(1);
      expect(head.font?.bold).toBe(true);
      expect(head.font?.color?.argb).toBe('FFC9A962');
      expect((head.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe('FF18181B');

      expect(ws.getCell('B2').numFmt).toBe('"$"#,##0.00');
      expect(ws.getCell('B2').border?.bottom?.style).toBe('thin');
    });

    it('CONSERVA los anchos de columna', async () => {
      const out = await service.applyCellPatch(await buildWorkbook(), {
        cells: [{ sheet: 'Ingresos', ref: 'B2', value: 1 }],
      });
      const ws = (await read(out)).getWorksheet('Ingresos')!;
      expect(ws.getColumn(1).width).toBe(32);
      expect(ws.getColumn(2).width).toBe(18);
    });

    it('CONSERVA las fórmulas que no se tocaron', async () => {
      const out = await service.applyCellPatch(await buildWorkbook(), {
        cells: [{ sheet: 'Ingresos', ref: 'B2', value: 200000 }],
      });
      const ws = (await read(out)).getWorksheet('Ingresos')!;
      expect((ws.getCell('B5').value as ExcelJS.CellFormulaValue).formula).toBe('SUM(B2:B4)');
    });

    it('CONSERVA las demás hojas', async () => {
      const out = await service.applyCellPatch(await buildWorkbook(), {
        cells: [{ sheet: 'Ingresos', ref: 'B2', value: 1 }],
      });
      const wb = await read(out);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Ingresos', 'Notas']);
      expect(wb.getWorksheet('Notas')!.getCell('A1').value).toBe('Ojo con el acceso por la puerta 3');
    });

    it('escribe una fórmula nueva como fórmula viva, no como texto', async () => {
      const out = await service.applyCellPatch(await buildWorkbook(), {
        cells: [{ sheet: 'Ingresos', ref: 'B4', formula: '=B2*0.16' }],
      });
      const cell = (await read(out)).getWorksheet('Ingresos')!.getCell('B4');
      expect((cell.value as ExcelJS.CellFormulaValue).formula).toBe('B2*0.16');
    });

    it('vaciar una celda la deja vacía, no con la cadena vacía', async () => {
      const out = await service.applyCellPatch(await buildWorkbook(), {
        cells: [{ sheet: 'Ingresos', ref: 'A3', value: '' }],
      });
      expect((await read(out)).getWorksheet('Ingresos')!.getCell('A3').value).toBeNull();
    });

    it('aplica varias celdas en distintas hojas de una sola vez', async () => {
      const out = await service.applyCellPatch(await buildWorkbook(), {
        cells: [
          { sheet: 'Ingresos', ref: 'A2', value: 'Taquilla general' },
          { sheet: 'Notas', ref: 'A2', value: 'Segunda nota' },
        ],
      });
      const wb = await read(out);
      expect(wb.getWorksheet('Ingresos')!.getCell('A2').value).toBe('Taquilla general');
      expect(wb.getWorksheet('Notas')!.getCell('A2').value).toBe('Segunda nota');
    });
  });

  describe('applyCellPatch — validación', () => {
    it('rechaza un parche vacío', async () => {
      await expect(service.applyCellPatch(await buildWorkbook(), { cells: [] })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rechaza una hoja que no existe', async () => {
      await expect(
        service.applyCellPatch(await buildWorkbook(), {
          cells: [{ sheet: 'Fantasma', ref: 'A1', value: 1 }],
        }),
      ).rejects.toThrow(/no existe/);
    });

    it('rechaza una referencia inventada', async () => {
      await expect(
        service.applyCellPatch(await buildWorkbook(), {
          cells: [{ sheet: 'Ingresos', ref: 'A1; DROP TABLE', value: 1 }],
        }),
      ).rejects.toThrow(/inválida/);
    });

    it('rechaza un parche desmesurado', async () => {
      const cells = Array.from({ length: 5001 }, (_, i) => ({
        sheet: 'Ingresos',
        ref: `A${i + 1}`,
        value: i,
      }));
      await expect(service.applyCellPatch(await buildWorkbook(), { cells })).rejects.toThrow(
        /Demasiadas celdas/,
      );
    });
  });

  describe('inspectWorkbook — guarda de compatibilidad', () => {
    it('un libro normal es editable en el panel', async () => {
      expect(service.inspectWorkbook(await buildWorkbook())).toEqual({ editable: true, reason: null });
    });

    it('lo que no es un .xlsx no se edita', () => {
      const result = service.inspectWorkbook(Buffer.from('%PDF-1.7', 'latin1'));
      expect(result.editable).toBe(false);
      expect(result.reason).toContain('.xlsx');
    });

    it('un libro con gráficas se marca como solo lectura, y se explica por qué', async () => {
      // Se inyecta el nombre de la parte como lo llevaría el directorio del zip.
      const base = await buildWorkbook();
      const conGrafica = Buffer.concat([base, Buffer.from('xl/charts/chart1.xml', 'latin1')]);
      const result = service.inspectWorkbook(conGrafica);
      expect(result.editable).toBe(false);
      expect(result.reason).toContain('gráficas');
      expect(result.reason).toContain('Excel');
    });

    it('nombra varias incompatibilidades en una sola frase', async () => {
      const base = await buildWorkbook();
      const cargado = Buffer.concat([
        base,
        Buffer.from('xl/charts/chart1.xml', 'latin1'),
        Buffer.from('xl/pivotCache/pivotCacheDefinition1.xml', 'latin1'),
        Buffer.from('vbaProject.bin', 'latin1'),
      ]);
      const result = service.inspectWorkbook(cargado);
      expect(result.editable).toBe(false);
      expect(result.reason).toContain('gráficas');
      expect(result.reason).toContain('tablas dinámicas');
      expect(result.reason).toContain('macros');
    });
  });
});
