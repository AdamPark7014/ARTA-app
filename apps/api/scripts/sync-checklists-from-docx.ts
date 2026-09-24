/**
 * Sincroniza las plantillas de checklist con sus Word originales del cliente.
 *
 * Lee los .docx en apps/api/assets/format-sources/CHECKLIST_*.docx,
 * construye un esquema heurístico (encabezados → secciones; "Etiqueta:" →
 * campos; listas → casillas; tablas → tabla) y:
 *  - crea snapshot de la versión actual,
 *  - actualiza la plantilla con el nuevo esquema,
 *  - migra instancias en borrador/revisión (no selladas/autorizadas) con carryFormatValues,
 *  - registra auditoría.
 *
 * Uso:
 *   ts-node --transpile-only apps/api/scripts/sync-checklists-from-docx.ts [--dry] [--confirm-produccion]
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as mammoth from 'mammoth';
import { carryFormatValues, type FormatData, type FormatItem, type FormatSection } from '../src/common/format-schema';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry');
const CONFIRM = process.argv.includes('--confirm-produccion');
const ASSETS = join(process.cwd(), 'apps', 'api', 'assets', 'format-sources');

const MAP: Record<string, { file: string }> = {
  EVENTO_GENERAL: { file: 'CHECKLIST_EVENTO_GENERAL.docx' },
  PRODUCCION: { file: 'CHECKLIST_PRODUCCION.docx' },
  HOSPEDAJE: { file: 'CHECKLIST_HOSPEDAJE.docx' },
  TRANSPORTACION: { file: 'CHECKLIST_TRANSPORTACION.docx' },
  RUEDA_PRENSA: { file: 'CHECKLIST_RUEDA_DE_PRENSA.docx' },
  ARTES_SHOWS: { file: 'CHECKLIST_INFO_ARTES_SHOWS.docx' },
};

function slug(label: string, fallback: string): string {
  const s = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return s || fallback;
}

function htmlToSchema(html: string): FormatData {
  const sections: FormatSection[] = [];
  let current: FormatSection | null = null;

  const textFrom = (frag: string) =>
    frag
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

  // Recoger encabezados y bloques entre ellos
  const parts: Array<{ type: 'heading' | 'p' | 'ul' | 'table'; html: string }> = [];
  const headingRe = /<(h1|h2)[^>]*>([\s\S]*?)<\/\1>|<(ul|ol|table)[^>]*>[\s\S]*?<\/(ul|ol|table)>/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html))) {
    const before = html.slice(last, m.index);
    if (before.trim()) parts.push({ type: 'p', html: before });
    if (m[1]) parts.push({ type: 'heading', html: m[0] });
    else parts.push({ type: m[3] as any, html: m[0] });
    last = headingRe.lastIndex;
  }
  const tail = html.slice(last);
  if (tail.trim()) parts.push({ type: 'p', html: tail });

  for (const b of parts) {
    if (b.type === 'heading') {
      const title = textFrom(b.html);
      const id = slug(title, `sec_${sections.length + 1}`);
      current = { id, title, items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { id: 'sec_1', title: 'Sección', items: [] };
      sections.push(current);
    }
    if (b.type === 'ul') {
      const items = Array.from(b.html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)).map((x) => textFrom(x[1] || ''));
      for (const label of items.filter(Boolean)) {
        current.items.push({ id: slug(label, `item_${current.items.length + 1}`), label, type: 'check', done: false });
      }
      continue;
    }
    if (b.type === 'table') {
      const rows = Array.from(b.html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((x) => x[1] || '');
      const headers = rows[0]
        ? Array.from(rows[0].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi)).map((x) => textFrom(x[2] || '')).filter(Boolean)
        : [];
      if (headers.length) {
        const cols = headers.map((h, i) => ({ id: slug(h, `col_${i + 1}`), label: h }));
        current.items.push({
          id: `tbl_${current.items.length + 1}`,
          label: headers.join(' / '),
          type: 'table',
          columns: cols,
          rows: [],
          minRows: 6,
        });
      }
      continue;
    }
    // Párrafos → "Etiqueta:" a campo texto
    const lines = textFrom(b.html)
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of lines) {
      const mcol = line.match(/^(.{3,80}?):\s*(.*)$/);
      const label = mcol ? mcol[1] : line;
      current.items.push({ id: slug(label, `item_${current.items.length + 1}`), label, type: 'text', value: '' } as FormatItem);
    }
  }

  return { sections };
}

async function main() {
  const templates = await prisma.checklistTemplate.findMany({
    where: { key: { in: Object.keys(MAP) as any } },
  });
  for (const t of templates) {
    const src = join(ASSETS, MAP[t.key as keyof typeof MAP].file);
    try {
      const res = await mammoth.convertToHtml({ buffer: readFileSync(src) });
      const html = res.value || '';
      const next = htmlToSchema(html);
      console.log(`${DRY ? '· DRY ' : ''}${t.key}: actualizar plantilla y migrar instancias`);
      if (DRY) continue;
      // Snapshot plantilla
      await prisma.checklistTemplateVersion.create({
        data: {
          templateId: t.id,
          schemaJson: (t.schemaJson || {}) as Prisma.InputJsonValue,
          version: t.version,
          note: 'Snapshot antes de docx sync',
        },
      });
      await prisma.checklistTemplate.update({
        where: { id: t.id },
        data: { schemaJson: next as unknown as Prisma.InputJsonValue, version: t.version + 1 },
      });
      // Migrar instancias no selladas/autorizadas
      const instances = await prisma.checklistInstance.findMany({
        where: { templateId: t.id, AND: [{ authorizedAt: null }] },
        select: { id: true, dataJson: true, eventId: true },
      });
      for (const inst of instances) {
        const migrated = carryFormatValues(next, inst.dataJson);
        await prisma.checklistInstance.update({
          where: { id: inst.id },
          data: { dataJson: migrated as Prisma.InputJsonValue },
        });
      }
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'template.sync.docx',
          resource: 'ChecklistTemplate',
          resourceId: t.id,
          metaJson: { key: t.key, version: t.version + 1, instancesMigrated: instances.length },
        },
      });
    } catch (e) {
      console.warn(`· ${t.key}: no se pudo leer ${src} — skip (${(e as Error).message})`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

