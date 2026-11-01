import { ForbiddenException } from '@nestjs/common';
import { DocumentsController, htmlToBlocks } from './documents.controller';
import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DocumentPdfService, normalizeBlocks } from './document-pdf.service';

describe('DocumentsController · PDF → editable solo dirección', () => {
  const ORG = 'org_arta_internal';
  const event = { id: 'ev1', name: 'Show', entity: 'ARTA', status: 'ACTIVE', organizationId: ORG };
  const user = (roleKey: string) => ({
    id: `u-${roleKey}`,
    roleKey,
    entities: ['ARTA'],
    fullName: 'Tester',
    permissions: [] as string[],
    organizationId: ORG,
  });

  function setup() {
    const prisma = {
      event: { findUnique: async () => event },
      eventDocument: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'd1', ...data, version: 1 }),
      },
    };
    const pdfs = { generate: async () => ({ url: '/uploads/x.pdf' }) };
    const revisions = { record: async () => ({}) };
    const controller = new DocumentsController(prisma as never, pdfs as never, revisions as never);
    return { controller };
  }

  it('bloquea a no-dirección cuando viene sourceFileId', async () => {
    const { controller } = setup();
    await expect(
      controller.create(
        { user: user('logistica') } as never,
        { eventId: 'ev1', title: 'Doc', sourceFileId: 'f1', blocks: [] },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite a dirección volverlo editable', async () => {
    const { controller } = setup();
    const created = await controller.create(
      { user: user('dir_general') } as never,
      { eventId: 'ev1', title: 'Doc', sourceFileId: 'f1', blocks: [] },
    );
    expect(created).toHaveProperty('id');
    expect(created).toHaveProperty('title', 'Doc');
  });
});


describe('Word → documento editable', () => {
  const HTML =
    '<p><img src="x" /></p><p><strong>CREACIÓN BOLETERA</strong></p>' +
    '<table><thead><tr><th><p><strong>ZONA</strong></p></th><th><p>AFORO</p></th></tr>' +
    '<tr><th><p>DIAMANTE</p></th><th><p> 545 </p></th></tr></thead></table>' +
    '<p>+ CXS</p>';

  it('la tabla sobrevive y queda donde estaba en el Word', () => {
    expect(htmlToBlocks(HTML)).toEqual([
      { type: 'p', text: 'CREACIÓN BOLETERA' },
      {
        type: 'table',
        rows: [
          ['ZONA', 'AFORO'],
          ['DIAMANTE', '545'],
        ],
      },
      { type: 'p', text: '+ CXS' },
    ]);
  });

  it('guardar el documento no se come la tabla', () => {
    const blocks = [{ type: 'table', rows: [['ZONA', 'AFORO']] }, { type: 'p', text: 'nota' }];
    expect(normalizeBlocks(blocks)).toEqual(blocks);
  });

  it('una tabla mal formada del cliente se sanea, no truena', () => {
    expect(normalizeBlocks([{ type: 'table', rows: [null, ['a', 5, null]] }])).toEqual([
      { type: 'table', rows: [[], ['a', '5', '']] },
    ]);
  });
});

describe('PDF de un documento', () => {
  const pagesOf = (file: string) => Number(readFileSync(file).toString('latin1').match(/\/Count (\d+)/)?.[1] ?? 0);

  async function generate(rows: string[][]) {
    process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'arta-doc-'));
    const { filePath } = await new DocumentPdfService().generate('d1', 1, {
      title: 'Boletera',
      eventName: 'Noche de Boleros',
      entity: 'ARTA',
      blocks: [{ type: 'p', text: 'Antes' }, { type: 'table', rows }, { type: 'p', text: 'Después' }],
    });
    return filePath;
  }

  it('lo corto cabe en una sola página: la primera no sale en blanco', async () => {
    expect(pagesOf(await generate([['ZONA', 'AFORO'], ['ORO', '268']]))).toBe(1);
  });

  it('una tabla larga sigue en la página siguiente', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => [`Zona ${i}`, String(i)]);
    expect(pagesOf(await generate(rows))).toBe(2);
  });
});
