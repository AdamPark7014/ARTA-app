/* eslint-disable no-console */
import { chromium } from 'playwright';
import JSZip from 'jszip';

async function docxWithText(text) {
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
  zip.folder('_rels').file('.rels', rels);
  zip.folder('word').file('document.xml', doc);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return buf;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Checklist Producción (usamos FormatSheet ya en el app)
  await page.goto('http://127.0.0.1:3100/checklists'); // assume reachable in CI shell for illustration
  // Fallback: use dev snap route to show FileViewer docx (viewer) with a placeholder .docx served by inline api
  await page.route('**/api/files/prod/inline', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: await docxWithText('CHECKLIST PRODUCCIÓN — Demo'),
    }),
  );
  await page.goto('http://127.0.0.1:3100/dev/sheet-snap?title=Checklist%20Producción&fileId=prod&fileName=CHECKLIST_PRODUCCION.docx&viewer=1', {
    waitUntil: 'load',
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/checklist-produccion-app.png' });

  // Boletera viewer
  await page.route('**/api/files/bole/inline', async (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: await docxWithText('CREACIÓN BOLETERA — Demo'),
    }),
  );
  await page.goto('http://127.0.0.1:3100/dev/sheet-snap?title=Boletera&fileId=bole&fileName=CREACION_BOLETERA.docx&viewer=1', {
    waitUntil: 'load',
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/boletera-app.png' });

  // Doc editing (DocEditor)
  await page.goto('http://127.0.0.1:3100/dev/sheet-snap?title=Documento%20editable&fileName=Documento.docx&edit=1', {
    waitUntil: 'load',
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/doc-editando.png' });

  await browser.close();
  console.log('ARTIFACTS', [
    '/opt/cursor/artifacts/checklist-produccion-app.png',
    '/opt/cursor/artifacts/boletera-app.png',
    '/opt/cursor/artifacts/doc-editando.png',
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

