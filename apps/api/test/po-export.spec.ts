import { PrismaClient } from '@prisma/client';
import { PurchaseOrdersController } from '../src/purchase-orders/purchase-orders.controller';
import { NotificationsService } from '../src/notifications/notifications.service';
import { PurchaseOrderExcelService } from '../src/purchase-orders/po-excel.service';
import { ExcelPdfService } from '../src/uploads/excel-pdf.service';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import { uploadRoot } from '../src/uploads/upload-storage';

// Solo corre con DB real en CI. En local (sin Postgres), se omite.
const hasDb = !!process.env.CI;

describe('PurchaseOrdersController export (Excel/PDF) smoke', () => {
  const prisma = new PrismaClient();
  let controller: PurchaseOrdersController;

  beforeAll(async () => {
    controller = new PurchaseOrdersController(
      prisma as never,
      { notifyMany: async () => undefined } as unknown as NotificationsService,
      new PurchaseOrderExcelService(),
      new ExcelPdfService(),
    );
    mkdirSync(uploadRoot, { recursive: true });
    // Minimal OC template: headers row for CANTIDAD | DESCRIPCIÓN | PRECIO | SUBTOTAL
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('OC');
    ws.getCell('B8').value = 'FECHA DE SOLICITUD:';
    ws.getCell('B9').value = 'SOLICITANTE:';
    ws.getCell('B10').value = 'EVENTO:';
    ws.getCell('B11').value = 'NOMBRE DE PROVEEDOR:';
    ws.getRow(14).values = [null, 'CANTIDAD', 'DESCRIPCIÓN DEL PRODUCTO', 'PRECIO', 'SUBTOTAL'];
    const bufPath = join(uploadRoot, 'format-oc.xlsx');
    await wb.xlsx.writeFile(bufPath);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  (hasDb ? it : it.skip)('exports a simple order', async () => {
    const ev = await prisma.event.create({
      data: { entity: 'ARTA', name: 'Show Test', status: 'ACTIVE' },
    });
    const user = await prisma.user.create({
      data: {
        email: `t-${Date.now()}@x.test`,
        passwordHash: 'x',
        fullName: 'Tester',
        roleKey: 'gerente_arta',
        entities: { set: ['ARTA'] as any },
      },
    });
    const dir = await prisma.user.create({
      data: {
        email: `dir-${Date.now()}@x.test`,
        passwordHash: 'x',
        fullName: 'Dir',
        roleKey: 'dir_general',
        entities: { set: ['ARTA'] as any },
      },
    });
    const po = await prisma.purchaseOrder.create({
      data: {
        eventId: ev.id,
        rubro: 'audio',
        vendorName: 'Proveedor X',
        amount: 1234,
        withIva: false,
        status: 'PENDING_AUTH',
        createdAt: new Date(),
        createdById: user.id,
        lines: { create: [{ concept: 'Servicio A', qty: 1, unitPrice: 1234, total: 1234 }] },
      },
      include: { lines: true, createdBy: true },
    });
    const res = await controller.exportExcelPdf(
      { user: { id: dir.id, roleKey: 'dir_general', permissions: [], entities: ['ARTA'], fullName: 'Dir' } } as never,
      po.id,
      {},
    );
    expect(res.url).toMatch(/\/uploads\/sheet-pdfs\//);
  });
});

