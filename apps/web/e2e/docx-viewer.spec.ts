import { expect, test } from '@playwright/test';
import JSZip from 'jszip';
import { seedSession } from './support/mock-api';

async function docxWithText(text: string): Promise<Buffer> {
  const zip = new JSZip();
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:body>
</w:document>`;
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels')!.file('.rels', rels);
  zip.folder('word')!.file('document.xml', doc);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf as Buffer;
}

test('FileViewer renderiza .docx y muestra texto conocido', async ({ page, baseURL }) => {
  await seedSession(page, baseURL!);
  const buf = await docxWithText('CHECKLIST PRODUCCIÓN');
  await page.route('**/api/files/prod/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: buf,
    }),
  );
  await page.goto('/dev/sheet-snap?title=Checklist%20Producción&fileId=prod&fileName=CHECKLIST_PRODUCCION.docx&viewer=1');
  await expect(page.getByText(/CHECKLIST PRODUCCIÓN/i)).toBeVisible();
});

