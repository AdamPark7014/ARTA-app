/**
 * Sincroniza plantillas con sus .docx de origen — modo seguro.
 *
 * Objetivo: conservar IDs CURADOS como verdad, proponiendo SOLO cambios de
 * etiquetas y orden de secciones/ítems mapeados a esos IDs. No borra campos
 * con datos ni agrega nuevos sin intervención.
 *
 * - --dry (default): imprime un diff detallado por plantilla (secciones movidas/renombradas,
 *   ítems movidos/renombrados, nuevos en .docx, sobrantes en plantilla). NO escribe.
 * - --confirm-produccion: aplica cambios seguros:
 *     · snapshot de plantilla
 *     · actualiza SOLO títulos/orden conservando IDs
 *     · migra instancias en estado DRAFT con carryFormatValues
 *     · auditoría
 *
 * Uso:
 *   ts-node --transpile-only apps/api/scripts/sync-checklists-from-docx.ts [--dry] [--confirm-produccion]
 */
import { PrismaClient, Prisma, DocStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as mammoth from 'mammoth';
import {
  carryFormatValues,
  normalizeFormatData,
  type FormatData,
  type FormatItem,
  type FormatSection,
} from '../src/common/format-schema';

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry') || !process.argv.includes('--confirm-produccion');
const CONFIRM = process.argv.includes('--confirm-produccion');
// Resolver relativo al archivo (robusto en /app)
const ASSETS = join(__dirname, '..', 'assets', 'format-sources');

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

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

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

function proposeFromDocx(existingRaw: unknown, docx: FormatData): {
  proposed: FormatData;
  diff: {
    sectionTitleChanges: Array<{ from: string; to: string }>;
    sectionOrderBefore: string[];
    sectionOrderAfter: string[];
    itemTitleChanges: Array<{ sectionId: string; from: string; to: string }>;
    itemMoves: Array<{ sectionId: string; id: string; from: number; to: number }>;
    newInDocx: Array<{ sectionTitle: string; label: string }>;
    leftoverInTemplate: Array<{ sectionTitle: string; label: string }>;
  };
} {
  const existing = normalizeFormatData(existingRaw);
  const existingSections = existing.sections ?? [];

  // Map existing sections by normalized title
  const byTitle = new Map(existingSections.map((s) => [norm(s.title), s] as const));
  const docOrderMatched: FormatSection[] = [];
  const sectionTitleChanges: Array<{ from: string; to: string }> = [];
  const newInDocx: Array<{ sectionTitle: string; label: string }> = [];
  const leftoverInTemplate: Array<{ sectionTitle: string; label: string }> = [];

  // First: matched sections in docx order (rename titles if changed)
  for (const ds of docx.sections ?? []) {
    const match = byTitle.get(norm(ds.title));
    if (match) {
      if (match.title !== ds.title) {
        sectionTitleChanges.push({ from: match.title, to: ds.title });
      }
      // Reorder items within this section to follow docx order by label
      const existingItems = match.items ?? [];
      const byItemLabel = new Map(existingItems.map((i) => [norm(i.label), i] as const));
      const taken = new Set<FormatItem>();
      const itemTitleChanges: Array<{ sectionId: string; from: string; to: string }> = [];
      const itemMoves: Array<{ sectionId: string; id: string; from: number; to: number }> = [];
      const reordered: FormatItem[] = [];
      for (const dItem of ds.items ?? []) {
        const found = byItemLabel.get(norm(dItem.label));
        if (found) {
          // Keep ID and type; update label if changed
          if (found.label !== dItem.label) {
            itemTitleChanges.push({ sectionId: match.id, from: found.label, to: dItem.label });
          }
          reordered.push({ ...found, label: dItem.label });
          taken.add(found);
        } else {
          // Item exists in docx but not in template: report only
          newInDocx.push({ sectionTitle: ds.title, label: dItem.label });
        }
      }
      // Append leftover template items not present in docx (kept as-is)
      for (const it of existingItems) {
        if (!taken.has(it)) {
          leftoverInTemplate.push({ sectionTitle: ds.title, label: it.label });
          reordered.push(it);
        }
      }
      // Track moves
      const beforeIndex = new Map(existingItems.map((it, idx) => [it.id, idx] as const));
      reordered.forEach((it, newIdx) => {
        const oldIdx = beforeIndex.get(it.id);
        if (oldIdx != null && oldIdx !== newIdx) {
          itemMoves.push({ sectionId: match.id, id: it.id, from: oldIdx, to: newIdx });
        }
      });
      docOrderMatched.push({ ...match, title: ds.title, items: reordered });
    } else {
      // Unknown section present in .docx — just report; do not add
      for (const it of ds.items ?? []) newInDocx.push({ sectionTitle: ds.title, label: it.label });
    }
  }
  // Append sections from template not present in docx, unchanged order
  const matchedSet = new Set(docOrderMatched.map((s) => s.id));
  const tail = existingSections.filter((s) => !matchedSet.has(s.id));
  const proposed: FormatData = { ...existing, sections: [...docOrderMatched, ...tail] };

  const sectionOrderBefore = existingSections.map((s) => s.title);
  const sectionOrderAfter = proposed.sections.map((s) => s.title);

  return {
    proposed,
    diff: {
      sectionTitleChanges,
      sectionOrderBefore,
      sectionOrderAfter,
      itemTitleChanges: [], // filled per-section above, but flatten here
      itemMoves: [], // flatten
      newInDocx,
      leftoverInTemplate,
    },
  };
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
      const parsed = htmlToSchema(html);

      const { proposed, diff } = proposeFromDocx(t.schemaJson, parsed);
      // Section diffs already computed; collect item diffs by comparing items
      const flattenItemChanges = () => {
        const outChanges: Array<{ sectionId: string; from: string; to: string }> = [];
        const outMoves: Array<{ sectionId: string; id: string; from: number; to: number }> = [];
        const existing = normalizeFormatData(t.schemaJson);
        for (const sec of proposed.sections) {
          const prev = existing.sections.find((s) => s.id === sec.id);
          if (!prev) continue;
          const byId = new Map((prev.items ?? []).map((i) => [i.id, i] as const));
          const beforeIndex = new Map((prev.items ?? []).map((i, idx) => [i.id, idx] as const));
          sec.items?.forEach((it, newIdx) => {
            const old = byId.get(it.id);
            if (old && old.label !== it.label) {
              outChanges.push({ sectionId: sec.id, from: old.label, to: it.label });
            }
            const oldIdx = beforeIndex.get(it.id);
            if (oldIdx != null && oldIdx !== newIdx) {
              outMoves.push({ sectionId: sec.id, id: it.id, from: oldIdx, to: newIdx });
            }
          });
        }
        return { changes: outChanges, moves: outMoves };
      };
      const { changes, moves } = flattenItemChanges();

      // Report
      console.log(`${DRY ? '· DRY ' : ''}${t.key} (${t.name}):`);
      if (diff.sectionTitleChanges.length) {
        console.log(`  · Secciones renombradas: ${diff.sectionTitleChanges.length}`);
        diff.sectionTitleChanges.slice(0, 10).forEach((c) => console.log(`    - "${c.from}" → "${c.to}"`));
      }
      const movedSections =
        JSON.stringify(diff.sectionOrderBefore) !== JSON.stringify(diff.sectionOrderAfter);
      if (movedSections) {
        console.log('  · Reorden de secciones propuesto');
      }
      if (changes.length) {
        console.log(`  · Ítems renombrados: ${changes.length}`);
        changes.slice(0, 10).forEach((c) => console.log(`    - [${c.sectionId}] "${c.from}" → "${c.to}"`));
      }
      if (moves.length) {
        console.log(`  · Ítems reordenados: ${moves.length}`);
      }
      if (diff.newInDocx.length) {
        console.log(`  · Nuevos en .docx (no se agregan): ${diff.newInDocx.length}`);
      }
      if (diff.leftoverInTemplate.length) {
        console.log(`  · Ítems existentes sin correspondencia en .docx: ${diff.leftoverInTemplate.length}`);
      }

      if (DRY) continue;
      // Snapshot plantilla
      await prisma.checklistTemplateVersion.create({
        data: {
          templateId: t.id,
          schemaJson: (t.schemaJson || {}) as Prisma.InputJsonValue,
          version: t.version,
          note: 'Snapshot antes de docx sync (seguro)',
        },
      });
      // Aplicar cambios seguros (mismos IDs)
      await prisma.checklistTemplate.update({
        where: { id: t.id },
        data: { schemaJson: proposed as unknown as Prisma.InputJsonValue, version: t.version + 1 },
      });
      // Migrar SOLO instancias DRAFT
      const instances = await prisma.checklistInstance.findMany({
        where: { templateId: t.id, status: DocStatus.DRAFT },
        select: { id: true, dataJson: true },
      });
      let migratedCount = 0;
      for (const inst of instances) {
        const migrated = carryFormatValues(proposed, inst.dataJson);
        await prisma.checklistInstance.update({
          where: { id: inst.id },
          data: { dataJson: migrated as Prisma.InputJsonValue },
        });
        migratedCount += 1;
      }
      await prisma.auditLog.create({
        data: {
          userId: null,
          action: 'template.sync.docx',
          resource: 'ChecklistTemplate',
          resourceId: t.id,
          metaJson: {
            key: t.key,
            version: t.version + 1,
            migratedDrafts: migratedCount,
            sectionRenames: diff.sectionTitleChanges.length,
            itemRenames: changes.length,
            itemMoves: moves.length,
          },
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

