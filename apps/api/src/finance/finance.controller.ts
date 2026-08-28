import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, canAccessEventOps, PERMISSIONS, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant } from '../common/tenant';

type FinancePayload = {
  rows?: Array<{ type?: string; amount?: number; concept?: string }>;
  totalIncome?: number;
  totalExpense?: number;
};

type AuthUser = {
  id: string;
  roleKey: string;
  permissions: string[];
  entities: string[];
  organizationId?: string | null;
};

function totals(dataJson: FinancePayload) {
  const rows = dataJson.rows || [];
  const income = rows.filter((r) => r.type === 'income').reduce((s, r) => s + Number(r.amount || 0), 0);
  const expense = rows.filter((r) => r.type === 'expense').reduce((s, r) => s + Number(r.amount || 0), 0);
  return {
    ...dataJson,
    rows,
    totalIncome: income,
    totalExpense: expense,
  };
}

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(private prisma: PrismaService) {}

  private async assertEventOps(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new ForbiddenException('Evento no encontrado');
    assertSameTenant(user, event.organizationId);
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    return event;
  }

  /** Mirror FinanceRun into CORRIDA_FINANCIERA checklist checks */
  private async syncCorridaChecklist(eventId: string, data: FinancePayload, locked: boolean) {
    const instance = await this.prisma.checklistInstance.findFirst({
      where: { eventId, template: { key: 'CORRIDA_FINANCIERA' } },
      include: { template: true },
    });
    if (!instance) return;

    const income = Number(data.totalIncome || 0);
    const expense = Number(data.totalExpense || 0);
    const rows = data.rows || [];
    const flags: Record<string, boolean> = {
      'Presupuesto cargado': rows.length > 0,
      'Ingresos capturados': income > 0,
      'Egresos capturados': expense > 0,
      'Cierre cuadrado': locked || (rows.length > 0 && income >= 0 && expense >= 0),
    };

    const root = (instance.dataJson || { sections: [] }) as {
      sections?: Array<{
        id: string;
        title: string;
        items?: Array<{ id: string; label: string; type?: string; done?: boolean; value?: unknown }>;
      }>;
    };

    const sections = (root.sections || []).map((s) => ({
      ...s,
      items: (s.items || []).map((it) => {
        if (it.label in flags) return { ...it, done: flags[it.label] };
        return it;
      }),
    }));

    // ensure summary section with live totals
    let nextSections = sections;
    const summaryIdx = nextSections.findIndex((s) => s.id === 'resumen_corrida');
    const summarySection = {
      id: 'resumen_corrida',
      title: 'Resumen (sync corrida)',
      items: [
        { id: 'total_ingreso', label: 'Total ingresos', type: 'number', value: income },
        { id: 'total_egreso', label: 'Total egresos', type: 'number', value: expense },
        { id: 'neto', label: 'Neto', type: 'number', value: income - expense },
        { id: 'filas', label: 'Filas en corrida', type: 'number', value: rows.length },
      ],
    };
    if (summaryIdx >= 0) nextSections[summaryIdx] = summarySection;
    else nextSections = [...nextSections, summarySection];

    const items = nextSections.flatMap((s) => s.items || []);
    const scored = items.filter((i) => {
      if (i.type === 'check' || !i.type) return !!i.done;
      return i.value !== null && i.value !== undefined && String(i.value).trim() !== '';
    }).length;
    const progressPct = items.length ? Math.round((scored / items.length) * 100) : 0;

    await this.prisma.checklistInstance.update({
      where: { id: instance.id },
      data: {
        dataJson: { sections: nextSections } as Prisma.InputJsonValue,
        progressPct,
        lastEditedAt: new Date(),
      },
    });
  }

  @Get('event/:eventId')
  async list(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    await this.assertEventOps(req.user, eventId);
    return this.prisma.financeRun.findMany({ where: { eventId } });
  }

  @Post('advances')
  async createAdvance(
    @Req() req: { user: AuthUser },
    @Body() body: { eventId: string; label?: string; amount?: number; fileUrl: string },
  ) {
    await this.assertEventOps(req.user, body.eventId);
    return this.prisma.paymentProof.create({
      data: {
        eventId: body.eventId,
        label: body.label || 'Anticipo',
        amount: body.amount,
        fileUrl: body.fileUrl,
        uploadedById: req.user.id,
      },
    });
  }

  @Get('advances/event/:eventId')
  async advances(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    await this.assertEventOps(req.user, eventId);
    return this.prisma.paymentProof.findMany({
      where: { eventId, purchaseOrderId: null },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { fullName: true } } },
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: { dataJson?: object; title?: string; locked?: boolean },
  ) {
    const role = req.user.roleKey as RoleKey;
    if (!hasPermission(role, req.user.permissions, PERMISSIONS.FINANCE_EDIT)) {
      throw new ForbiddenException(
        'Solo gerencia de Arta y dirección general pueden editar corrida financiera',
      );
    }
    const existing = await this.prisma.financeRun.findUnique({ where: { id } });
    if (!existing) throw new ForbiddenException('Corrida no encontrada');
    await this.assertEventOps(req.user, existing.eventId);
    if (existing.locked && body.locked !== false) {
      throw new ForbiddenException('Corrida bloqueada');
    }

    let dataJson = body.dataJson as FinancePayload | undefined;
    if (dataJson?.rows) dataJson = totals(dataJson);

    const updated = await this.prisma.financeRun.update({
      where: { id },
      data: {
        dataJson: dataJson as Prisma.InputJsonValue | undefined,
        title: body.title,
        locked: body.locked,
      },
    });

    const payload = (dataJson || updated.dataJson) as FinancePayload;
    await this.syncCorridaChecklist(updated.eventId, totals(payload), updated.locked);

    return updated;
  }
}
