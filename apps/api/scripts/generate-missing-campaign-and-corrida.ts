/**
 * Genera campaña y/o corrida estándar para eventos que todavía no tienen archivo.
 *
 * Uso:
 *   ts-node --transpile-only apps/api/scripts/generate-missing-campaign-and-corrida.ts [--dry] [--confirm-produccion]
 *
 * Política:
 * - NUNCA sobrescribe: solo cuando no hay EventFile (module 'campaign' o 'finance').
 * - La campaña toma conceptos de Campaign.dataJson.concepts si existen; si no, hoja vacía.
 * - La corrida solo pega el nombre del evento en el machote.
 */
import { PrismaClient } from '@prisma/client';
import { join } from 'path';
import { uploadRoot } from '../src/uploads/upload-storage';
import { CampaignExcelService, type CampaignRow } from '../src/campaigns/campaign-excel.service';
import { FinanceExcelService } from '../src/finance/finance-excel.service';
import { ExcelPdfService } from '../src/uploads/excel-pdf.service';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';

function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const prisma = new PrismaClient();
  const DRY = has('dry');
  const CONFIRM = has('confirm-produccion');
  if (!DRY && !CONFIRM) {
    console.log('Modo seguro: agrega --dry para simulación o --confirm-produccion para ejecutar.');
    process.exit(2);
  }

  const campaignSrc = join(uploadRoot, 'format-campaign.xlsx');
  const corridaSrc = join(uploadRoot, 'format-corrida.xlsx');
  const campaignSvc = new CampaignExcelService();
  const corridaSvc = new FinanceExcelService();
  const pdfSvc = new ExcelPdfService();

  let madeCampaign = 0;
  let madeCorrida = 0;

  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      entity: true,
      organizationId: true,
      startsAt: true,
      venue: true,
      city: true,
      promoter: true,
    },
  });
  for (const event of events) {
    const files = await prisma.eventFile.findMany({
      where: { eventId: event.id, deletedAt: null },
      select: { id: true, module: true },
    });
    const hasCampaign = files.some((f) => f.module === 'campaign');
    const hasCorrida = files.some((f) => f.module === 'finance');

    // Campaña
    if (!hasCampaign) {
      const campaign = await prisma.campaign.findUnique({ where: { eventId: event.id } });
      const rows = Array.isArray((campaign?.dataJson as any)?.concepts)
        ? ((campaign?.dataJson as any).concepts as CampaignRow[])
        : [];
      console.log(`${DRY ? '· DRY ' : ''}Generar campaña para «${event.name}» (${rows.length} conceptos)`);
      if (!DRY) {
        const { excelPath } = await campaignSvc.buildFromTemplate(
          campaignSrc,
          {
            eventName: event.name,
            venue: event.venue || '',
            city: event.city || '',
            date: event.startsAt ? new Date(event.startsAt).toLocaleDateString('es-MX') : '',
            schedule: '',
            promoter: event.promoter || '',
          },
          rows,
        );
        const buf = readFileSync(excelPath);
        const name = `CAMPANA ${event.name}.xlsx`;
        const file = await prisma.eventFile.create({
          data: {
            eventId: event.id,
            fileName: name,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            url: `/uploads/${excelPath.split('/').pop()}`,
            kind: 'excel',
            module: 'campaign',
            updatedById: null,
            sha256: createHash('sha256').update(buf).digest('hex'),
          },
        });
        await pdfSvc.generate(file.id, file.version, excelPath, {
          eventName: event.name,
          entity: event.entity,
          fileName: name,
          exportedBy: null,
        });
      }
      madeCampaign += 1;
    }

    // Corrida
    if (!hasCorrida) {
      console.log(`${DRY ? '· DRY ' : ''}Generar corrida para «${event.name}»`);
      if (!DRY) {
        const { excelPath } = await corridaSvc.buildFromTemplate(corridaSrc, event.name);
        const buf = readFileSync(excelPath);
        const name = `CORRIDA ${event.name}.xlsx`;
        const excelFile = await prisma.eventFile.create({
          data: {
            eventId: event.id,
            fileName: name,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            url: `/uploads/${excelPath.split('/').pop()}`,
            kind: 'excel',
            module: 'finance',
            updatedById: null,
            sha256: createHash('sha256').update(buf).digest('hex'),
          },
        });
        await pdfSvc.generate(excelFile.id, excelFile.version, excelPath, {
          eventName: event.name,
          entity: event.entity,
          fileName: name,
          exportedBy: null,
        });
      }
      madeCorrida += 1;
    }
  }

  console.log(`Listo. Campañas creadas: ${madeCampaign}. Corridas creadas: ${madeCorrida}.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

