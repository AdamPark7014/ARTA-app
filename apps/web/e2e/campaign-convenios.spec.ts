import { expect, test } from '@playwright/test';
import {
  campaignTotals,
  cleanConvenioRows,
  cleanFinalNotes,
  conceptsWithOnePrice,
  convenioLineTotal,
  convenioZones,
  conveniosTotal,
  finalNoteWhen,
  normalizeConvenioRow,
} from '@/lib/campaign-concepts';
import { buildCampaignPdf, buildConveniosPdf, conveniosPdfColumns } from '@/lib/campaign-pdf';
import type { CampaignConceptRow, ConvenioRow } from '@/components/events/event-detail.types';

/**
 * Junta 23-10-2026 (campaña y convenios). Sin navegador: lógica pura y los
 * PDFs generados con pdf-lib, leídos de vuelta con pdf.js.
 *
 * - Ahorro = total externo − total interno (negativo se ve, no se esconde).
 * - Convenios con varias zonas; lo guardado con una zona se lee igual.
 * - PDF externo de convenios: convenio, descripción, zona y cantidad, sin un
 *   solo monto. Interno: además precio y total.
 * - Notas finales con fecha al pie de los PDFs; el ahorro solo en la interna.
 */

const EVENT = {
  name: 'Granja Maldita',
  startsAt: '2026-10-29T02:00:00.000Z',
  endsAt: '2026-11-02T02:00:00.000Z',
  venue: 'Explanada Puebla',
  city: 'Puebla',
  schedule: '20:00 HRS',
  promoter: 'ARTA PRODUCCIONES',
};

const CONCEPTS: CampaignConceptRow[] = [
  { concept: 'META (FACEBOOK E INSTAGRAM)', qty: 1, precioInterno: 10000, precioExterno: 14500 },
  { concept: 'IMPRESIÓN VALLAS', qty: 4, from: '2026-10-01', to: '2026-10-28', precioInterno: 1200, precioExterno: 1500 },
];

const CONVENIOS: ConvenioRow[] = [
  {
    concept: 'RADIO ORO',
    description: 'SPOT DE 20" 7 IMPACTOS POR DÍA DE LUNES A VIERNES',
    zonas: [
      { zona: 'Oro', qty: 10, price: 1234.5 },
      { zona: 'Plata', qty: 20, price: 650 },
    ],
  },
  // Formato anterior: una sola zona en el renglón.
  { concept: 'TV AZTECA', description: 'Difusión en Hechos', zona: 'Oro', qty: 4, price: 800 },
];

/** Con `PDF_SAMPLES_DIR` los PDFs de prueba se guardan para revisarlos a ojo. */
async function sample(name: string, blob: Blob): Promise<Blob> {
  const dir = process.env.PDF_SAMPLES_DIR;
  if (dir) {
    const { writeFileSync, mkdirSync } = await import('fs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${name}.pdf`, new Uint8Array(await blob.arrayBuffer()));
  }
  return blob;
}

async function pdfText(blob: Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await blob.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join('\n'));
  }
  await doc.destroy();
  return pages.join('\n');
}

test.describe('Campaña: ahorro y notas finales', () => {
  test('el ahorro es el total externo menos el interno', () => {
    const t = campaignTotals(CONCEPTS);
    expect(t.interno).toBe(10000 + 4 * 1200);
    expect(t.externo).toBe(14500 + 4 * 1500);
    expect(t.ahorro).toBe(t.externo - t.interno);
    expect(t.ahorro).toBe(5700);
  });

  test('un ahorro negativo se conserva con su signo', () => {
    const t = campaignTotals([{ concept: 'PANTALLAS', qty: 2, precioInterno: 900, precioExterno: 700 }]);
    expect(t.ahorro).toBe(-400);
  });

  test('avisa cuántos conceptos traen un solo precio', () => {
    expect(
      conceptsWithOnePrice([
        ...CONCEPTS,
        { concept: 'POSTERS', qty: 1, precioInterno: 500, precioExterno: null },
        { concept: 'SIN PRECIO', qty: 1, precioInterno: null, precioExterno: null },
      ]),
    ).toBe(1);
  });

  test('las notas finales se limpian y su fecha se lee en español', () => {
    const notes = cleanFinalNotes([
      { from: '2026-11-15', to: '2026-11-01', text: ' Propuesta válida ' },
      { from: null, to: null, text: '' },
      { from: '2026-12-20', to: '2027-01-05', text: 'Pauta de fin de año' },
      { from: null, to: '2026-11-10', text: 'Fecha límite de pago' },
    ]);
    expect(notes).toHaveLength(3);
    expect(finalNoteWhen(notes[0])).toBe('Del 1 de noviembre al 15 de noviembre de 2026');
    expect(finalNoteWhen(notes[1])).toBe('Del 20 de diciembre de 2026 al 5 de enero de 2027');
    expect(finalNoteWhen(notes[2])).toBe('Hasta el 10 de noviembre de 2026');
  });

  test('PDF interna: lleva total externo, ahorro y notas finales', async () => {
    const text = await pdfText(
      await sample(
        'campana-interna',
        await buildCampaignPdf({
          event: EVENT,
          rows: CONCEPTS,
          kind: 'interna',
          finalNotes: [
            { from: '2026-11-01', to: '2026-11-15', text: 'Propuesta válida para venta a terceros' },
            { from: null, to: '2026-11-10', text: 'Fecha límite de pago: 50 % al firmar y 50 % antes del show.' },
          ],
        }),
      ),
    );
    expect(text).toContain('AHORRO (EXTERNO - INTERNO)');
    expect(text).toContain('$5,700.00');
    expect(text).toContain('TOTAL EXTERNO');
    expect(text).toContain('NOTAS FINALES');
    expect(text).toContain('Del 1 de noviembre al 15 de noviembre de 2026');
    expect(text).toContain('Propuesta válida para venta a terceros');
  });

  test('PDF interna: un ahorro negativo sale con signo', async () => {
    const text = await pdfText(
      await buildCampaignPdf({
        event: EVENT,
        rows: [{ concept: 'PANTALLAS', qty: 2, precioInterno: 900, precioExterno: 700 }],
        kind: 'interna',
      }),
    );
    expect(text).toContain('-$400.00');
  });

  test('PDF externa: sin ahorro ni precio interno, con las notas finales', async () => {
    const text = await pdfText(
      await sample(
        'campana-externa',
        await buildCampaignPdf({
          event: EVENT,
          rows: CONCEPTS,
          kind: 'externa',
          finalNotes: [
            { from: '2026-11-01', to: null, text: 'Vigencia de la propuesta' },
            { from: '2026-10-01', to: '2026-10-28', text: 'Fechas de pauta en vía pública' },
          ],
        }),
      ),
    );
    expect(text).not.toMatch(/AHORRO/i);
    expect(text).not.toContain('TOTAL EXTERNO');
    expect(text).not.toContain('$10,000.00');
    expect(text).toContain('$14,500.00');
    expect(text).toContain('NOTAS FINALES');
    expect(text).toContain('1 de noviembre de 2026');
    expect(text).toContain('Vigencia de la propuesta');
  });
});

test.describe('Convenios: varias zonas y PDF interno/externo', () => {
  test('una fila con una sola zona (formato anterior) se lee como convenio de una zona', () => {
    expect(normalizeConvenioRow(CONVENIOS[1])).toEqual({
      concept: 'TV AZTECA',
      description: 'Difusión en Hechos',
      zonas: [{ zona: 'Oro', qty: 4, price: 800 }],
    });
  });

  test('totales con varias zonas: por convenio, general y por zona', () => {
    const clean = cleanConvenioRows(CONVENIOS);
    expect(clean[0].zonas).toHaveLength(2);
    expect(convenioLineTotal(clean[0])).toBe(10 * 1234.5 + 20 * 650);
    expect(convenioLineTotal(clean[1])).toBe(3200);
    expect(conveniosTotal(clean)).toBe(12345 + 13000 + 3200);
    expect(convenioZones(clean)).toEqual([
      { zona: 'Oro', qty: 14, total: 12345 + 3200 },
      { zona: 'Plata', qty: 20, total: 13000 },
    ]);
  });

  test('al limpiar se quitan zonas vacías y se escribe la forma nueva', () => {
    const [c] = cleanConvenioRows([
      { concept: ' ULTRA ', description: '', zonas: [{ zona: ' Lila ', qty: 2, price: null }, { zona: '', qty: null, price: null }] },
    ]);
    expect(c).toEqual({ concept: 'ULTRA', description: '', zonas: [{ zona: 'Lila', qty: 2, price: null }] });
    expect('zona' in c).toBe(false);
  });

  test('el PDF externo no lleva columnas ni cifras de dinero', async () => {
    expect(conveniosPdfColumns('externo').map((c) => c.title)).toEqual(['CONVENIO', 'DESCRIPCIÓN', 'ZONA', 'CANT.']);
    const text = await pdfText(
      await sample('convenios-externo', await buildConveniosPdf({ event: EVENT, rows: CONVENIOS, kind: 'externo' })),
    );
    expect(text).toContain('RADIO ORO');
    expect(text).toContain('TV AZTECA');
    expect(text).toContain('PLATA');
    expect(text).toContain('Convenios externos');
    expect(text).not.toContain('$');
    expect(text).not.toMatch(/PRECIO|VALOR|\bTOTAL\b/);
    expect(text).not.toMatch(/1,?234\.5|650|800/);
  });

  test('el PDF interno lleva precio, total por renglón y total general', async () => {
    const text = await pdfText(
      await sample('convenios-interno', await buildConveniosPdf({ event: EVENT, rows: CONVENIOS, kind: 'interno' })),
    );
    expect(text).toContain('PRECIO');
    expect(text).toContain('$1,234.50');
    expect(text).toContain('$12,345.00');
    expect(text).toContain('$13,000.00');
    expect(text).toContain('$3,200.00');
    expect(text).toContain('$28,545.00');
    expect(text).toContain('Convenios internos');
  });

  test('un convenio con muchas zonas se parte entre hojas y repite su nombre', async () => {
    const many: ConvenioRow[] = [
      {
        concept: 'INFLUENCERS',
        description: 'Menciones en redes',
        zonas: Array.from({ length: 40 }, (_, i) => ({ zona: `Zona ${i + 1}`, qty: 1, price: 100 })),
      },
    ];
    const text = await pdfText(
      await sample('convenios-interno-largo', await buildConveniosPdf({ event: EVENT, rows: many, kind: 'interno' })),
    );
    expect(text).toContain('INFLUENCERS (cont.)');
    expect(text).toContain('ZONA 40');
    expect(text).toContain('$4,000.00');
  });
});
