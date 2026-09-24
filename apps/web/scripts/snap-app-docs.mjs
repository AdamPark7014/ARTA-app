/* eslint-disable no-console */
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Checklist Producción (usamos FormatSheet ya en el app)
  await page.goto('http://127.0.0.1:3100/checklists'); // assume reachable in CI shell for illustration
  // Fallback: use dev snap route to show FileViewer docx (viewer) with a placeholder .docx served by inline api
  await page.route('**/api/files/prod/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from('%PK placeholder docx'), // no-op body; actual CI will replace with real assets
    }),
  );
  await page.goto('http://127.0.0.1:3100/dev/sheet-snap?title=Checklist%20Producción&fileId=prod&fileName=CHECKLIST_PRODUCCION.docx&viewer=1', {
    waitUntil: 'load',
  });
  await page.screenshot({ path: '/opt/cursor/artifacts/checklist-produccion-app.png' });

  // Boletera viewer
  await page.route('**/api/files/bole/inline', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from('%PK placeholder docx'),
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

