import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PoPaymentMethod, PoStatus, Prisma } from '@prisma/client';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, canAccessEventOps, PERMISSIONS, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import {
  DEFAULT_PO_WINDOW,
  describeSchedule,
  evaluatePoWindow,
  readPoWindow,
  sanitizePoWindow,
  type PoWindowConfig,
} from './po-window';

class PoLineDto {
  @IsString() concept!: string;
  @IsNumber() qty!: number;
  @IsNumber() unitPrice!: number;
}

class CreatePoDto {
  @IsString() eventId!: string;
  @IsString() rubro!: string;
  @IsOptional() @IsString() vendorName?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(PoPaymentMethod) paymentMethod?: PoPaymentMethod;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines?: PoLineDto[];
}

type WindowUser = {
  id: string;
  roleKey: string;
  permissions?: string[];
  organizationId?: string | null;
};

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard)
export class PurchaseOrdersController {
  constructor(private prisma: PrismaService) {}

  /** Config de la ventana de OC del tenant (con defaults de Arta). */
  private async loadWindow(user: WindowUser): Promise<PoWindowConfig> {
    const org = await this.prisma.organization.findUnique({
      where: { id: tenantIdOf(user) },
      select: { settingsJson: true },
    });
    if (!org) return { ...DEFAULT_PO_WINDOW };
    return readPoWindow(org.settingsJson);
  }

  /** Dirección configura la ventana, así que no puede quedar encerrada por ella. */
  private bypassesWindow(user: WindowUser) {
    return user.roleKey === 'super_admin' || user.roleKey === 'dir_general';
  }

  /**
   * Estado de la ventana: si se puede solicitar OC ahora mismo y cuándo vuelve
   * a abrir. El panel lo consulta para avisar antes de que el usuario capture.
   */
  @Get('window')
  async window(@Req() req: { user: WindowUser }) {
    const config = await this.loadWindow(req.user);
    const state = evaluatePoWindow(config);
    const canEdit = hasPermission(
      req.user.roleKey as RoleKey,
      req.user.permissions || [],
      PERMISSIONS.USERS_MANAGE,
    );
    return {
      ...state,
      canRequestNow: state.open || this.bypassesWindow(req.user),
      bypass: this.bypassesWindow(req.user),
      canEdit,
    };
  }

  @Patch('window')
  async setWindow(@Req() req: { user: WindowUser }, @Body() body: Partial<PoWindowConfig>) {
    if (
      !hasPermission(
        req.user.roleKey as RoleKey,
        req.user.permissions || [],
        PERMISSIONS.USERS_MANAGE,
      )
    ) {
      throw new ForbiddenException('Solo dirección configura la ventana de órdenes de compra');
    }
    const orgId = tenantIdOf(req.user);
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { settingsJson: true },
    });
    if (!org) throw new NotFoundException('Organización no encontrada');

    const poWindow = sanitizePoWindow(body || {});
    await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        settingsJson: {
          ...((org.settingsJson as Record<string, unknown>) || {}),
          poWindow,
        },
      },
    });
    return { ...evaluatePoWindow(poWindow), canRequestNow: true, canEdit: true };
  }

  /** Bloquea la captura de OC fuera de los días/horas configurados. */
  private async assertWindowOpen(user: WindowUser) {
    if (this.bypassesWindow(user)) return;
    const config = await this.loadWindow(user);
    const state = evaluatePoWindow(config);
    if (state.open) return;
    const next = state.nextOpenLabel ? ` Vuelve a abrir ${state.nextOpenLabel}.` : '';
    const note = config.note ? ` ${config.note}` : '';
    throw new ForbiddenException(
      `Fuera de la ventana para solicitar órdenes de compra (${describeSchedule(config)}).${next}${note}`,
    );
  }

  private async assertEventOps(
    user: { entities: string[]; roleKey: string; organizationId?: string | null },
    eventId: string,
  ) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    assertSameTenant(user, event.organizationId);
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    return event;
  }

  private async assertEventOpsOpen(
    user: { entities: string[]; roleKey: string; organizationId?: string | null },
    eventId: string,
  ) {
    const event = await this.assertEventOps(user, eventId);
    assertEventNotClosed(event.status);
    return event;
  }

  private sumLines(lines: PoLineDto[]) {
    return lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
  }

  private lineCreates(lines: PoLineDto[]) {
    return lines.map((l) => {
      const qty = Number(l.qty || 0);
      const unitPrice = Number(l.unitPrice || 0);
      return {
        concept: l.concept,
        qty,
        unitPrice,
        total: qty * unitPrice,
      };
    });
  }

  @Get('event/:eventId')
  async list(
    @Req() req: { user: { entities: string[]; roleKey: string } },
    @Param('eventId') eventId: string,
  ) {
    await this.assertEventOps(req.user, eventId);
    return this.prisma.purchaseOrder.findMany({
      where: { eventId },
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: { select: { fullName: true } },
        authorizedBy: { select: { fullName: true } },
        lines: true,
        proofs: true,
      },
    });
  }

  @Get(':id')
  async one(@Req() req: { user: { entities: string[]; roleKey: string } }, @Param('id') id: string) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        event: { select: { id: true, name: true, entity: true, status: true } },
        createdBy: { select: { fullName: true } },
        authorizedBy: { select: { fullName: true } },
        lines: true,
        proofs: true,
      },
    });
    if (!order) throw new NotFoundException('OC no encontrada');
    await this.assertEventOps(req.user, order.eventId);
    return order;
  }

  @Post()
  async create(
    @Req()
    req: {
      user: {
        id: string;
        entities: string[];
        roleKey: string;
        permissions?: string[];
        organizationId?: string | null;
      };
    },
    @Body() dto: CreatePoDto,
  ) {
    if (
      !hasPermission(
        req.user.roleKey as RoleKey,
        req.user.permissions || [],
        PERMISSIONS.CHECKLIST_EDIT,
      )
    ) {
      throw new ForbiddenException('Sin permiso para crear órdenes de compra');
    }
    await this.assertEventOpsOpen(req.user, dto.eventId);
    await this.assertWindowOpen(req.user);
    const lines = dto.lines?.length ? dto.lines : undefined;
    const amount = lines ? this.sumLines(lines) : Number(dto.amount || 0);
    return this.prisma.purchaseOrder.create({
      data: {
        eventId: dto.eventId,
        rubro: dto.rubro,
        vendorName: dto.vendorName,
        description: dto.description,
        paymentMethod: dto.paymentMethod || 'TRANSFERENCIA',
        amount,
        status: 'PENDING_AUTH',
        createdById: req.user.id,
        lines: lines ? { create: this.lineCreates(lines) } : undefined,
      },
      include: { lines: true, proofs: true },
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user: { id: string; roleKey: string; permissions: string[]; entities: string[] } },
    @Param('id') id: string,
    @Body()
    body: {
      rubro?: string;
      vendorName?: string;
      description?: string;
      paymentMethod?: PoPaymentMethod;
      lines?: PoLineDto[];
    },
  ) {
    if (
      !hasPermission(
        req.user.roleKey as RoleKey,
        req.user.permissions,
        PERMISSIONS.CHECKLIST_EDIT,
      )
    ) {
      throw new ForbiddenException('Sin permiso para editar órdenes de compra');
    }
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('OC no encontrada');
    await this.assertEventOpsOpen(req.user, order.eventId);
    if (order.status === 'PAID' || order.status === 'AUTHORIZED') {
      throw new ForbiddenException('OC autorizada/pagada no se edita');
    }

    const data: Prisma.PurchaseOrderUpdateInput = {
      rubro: body.rubro,
      vendorName: body.vendorName,
      description: body.description,
      paymentMethod: body.paymentMethod,
    };

    if (body.lines) {
      const amount = this.sumLines(body.lines);
      await this.prisma.purchaseOrderLine.deleteMany({ where: { orderId: id } });
      data.amount = amount;
      data.lines = { create: this.lineCreates(body.lines) };
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data,
      include: { lines: true, proofs: true },
    });
  }

  @Post(':id/proofs')
  async addProof(
    @Req()
    req: {
      user: {
        id: string;
        roleKey: string;
        permissions: string[];
        entities: string[];
        organizationId?: string | null;
      };
    },
    @Param('id') id: string,
    @Body() body: { fileUrl: string; label?: string; amount?: number },
  ) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!order) throw new NotFoundException('OC no encontrada');
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        order.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, order.event.organizationId);
    assertEventNotClosed(order.event.status);
    if (order.paymentMethod === 'EFECTIVO') {
      throw new BadRequestException(
        'Esta OC es en efectivo: no se adjuntan comprobantes',
      );
    }
    return this.prisma.paymentProof.create({
      data: {
        purchaseOrderId: id,
        eventId: order.eventId,
        fileUrl: body.fileUrl,
        label: body.label || `Comprobante OC ${order.rubro}`,
        amount: body.amount ?? order.amount,
        uploadedById: req.user.id,
      },
    });
  }

  @Patch(':id/status')
  async setStatus(
    @Req()
    req: {
      user: {
        id: string;
        roleKey: string;
        permissions: string[];
        entities: string[];
        organizationId?: string | null;
      };
    },
    @Param('id') id: string,
    @Body() body: { status: PoStatus; paymentMethod?: PoPaymentMethod },
  ) {
    const role = req.user.roleKey as RoleKey;
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { event: true, proofs: true },
    });
    if (!order) throw new NotFoundException('OC no encontrada');
    if (!canAccessEventOps(req.user.entities as EntityKey[], role, order.event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, order.event.organizationId);
    assertEventNotClosed(order.event.status);

    if (body.status === 'AUTHORIZED') {
      if (!hasPermission(role, req.user.permissions, PERMISSIONS.PO_AUTHORIZE)) {
        throw new ForbiddenException('No puedes autorizar OC');
      }
      if (role === 'gerente_arta' && order.event.entity !== 'ARTA') {
        throw new ForbiddenException('La gerencia de Arta solo autoriza OC de Arta');
      }
      if (role === 'dir_auditorio' && order.event.entity !== 'EXPLANADA') {
        throw new ForbiddenException('Rodrigo solo autoriza OC del Auditorio');
      }
      return this.prisma.purchaseOrder.update({
        where: { id },
        data: {
          status: 'AUTHORIZED',
          authorizedById: req.user.id,
          authorizedAt: new Date(),
          ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
        },
        include: { lines: true, proofs: true },
      });
    }
    if (body.status === 'PAID') {
      if (!hasPermission(role, req.user.permissions, PERMISSIONS.PO_MARK_PAID)) {
        throw new ForbiddenException('No puedes marcar pagado');
      }
      const method = body.paymentMethod || order.paymentMethod;
      const needsProof = method !== 'EFECTIVO';
      if (needsProof && !(order.proofs?.length > 0)) {
        throw new BadRequestException(
          'Para transferencias y otros pagos no en efectivo, adjunta el comprobante antes de marcar pagado',
        );
      }
      return this.prisma.purchaseOrder.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentMethod: method,
        },
        include: { lines: true, proofs: true },
      });
    }
    // Any other transition (REJECTED/CANCELLED/DRAFT/PENDING_AUTH) is still an
    // authorization-flow action — gate it the same as approving, not left open.
    if (!hasPermission(role, req.user.permissions, PERMISSIONS.PO_AUTHORIZE)) {
      throw new ForbiddenException('No puedes cambiar el estatus de esta OC');
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
      },
      include: { lines: true, proofs: true },
    });
  }

  @Delete(':id')
  async remove(
    @Req()
    req: {
      user: {
        id: string;
        roleKey: string;
        permissions: string[];
        entities: string[];
        organizationId?: string | null;
      };
    },
    @Param('id') id: string,
  ) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('OC no encontrada');
    await this.assertEventOpsOpen(req.user, order.eventId);
    if (order.status === 'AUTHORIZED' || order.status === 'PAID') {
      throw new ForbiddenException('No se puede eliminar OC autorizada/pagada');
    }
    await this.prisma.purchaseOrder.delete({ where: { id } });
    return { ok: true };
  }
}
