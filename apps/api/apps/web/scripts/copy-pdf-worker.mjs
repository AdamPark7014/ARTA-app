/**
 * Copia el worker de pdf.js a public/.
 *
 * El visor de PDF lo carga desde `/pdf.worker.min.mjs`. Se copia en cada build
 * en vez de versionarlo para que worker y librería sean SIEMPRE de la misma
 * versión de pdfjs-dist: si se desfasan, pdf.js falla en runtime con "The API
 * version does not match the Worker version".
 */
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const src = join(dirname(require.resolve('pdfjs-dist/package.json')), 'build', 'pdf.worker.min.mjs');
const destDir = join(here, '..', 'public');
const dest = join(destDir, 'pdf.worker.min.mjs');

if (!existsSync(src)) {
  console.error(`[copy-pdf-worker] no encuentro el worker en ${src}`);
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log('[copy-pdf-worker] public/pdf.worker.min.mjs actualizado');
