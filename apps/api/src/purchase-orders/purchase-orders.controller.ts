import {
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
import { PoStatus, Prisma } from '@prisma/client';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { hasPermission, canAccessEventOps, PERMISSIONS, type EntityKey, type RoleKey } from '../common/rbac/roles';

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
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines?: PoLineDto[];
}

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard)
export class PurchaseOrdersController {
  constructor(private prisma: PrismaService) {}

  private async assertEventOps(user: { entities: string[]; roleKey: string }, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Evento no encontrado');
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
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
    @Req() req: { user: { id: string; entities: string[]; roleKey: string } },
    @Body() dto: CreatePoDto,
  ) {
    await this.assertEventOps(req.user, dto.eventId);
    const lines = dto.lines?.length ? dto.lines : undefined;
    const amount = lines ? this.sumLines(lines) : Number(dto.amount || 0);
    return this.prisma.purchaseOrder.create({
      data: {
        eventId: dto.eventId,
        rubro: dto.rubro,
        vendorName: dto.vendorName,
        description: dto.description,
        amount,
        status: 'PENDING_AUTH',
        createdById: req.user.id,
        lines: lines ? { create: this.lineCreates(lines) } : undefined,
      },
      include: { lines: true },
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
      lines?: PoLineDto[];
    },
  ) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('OC no encontrada');
    await this.assertEventOps(req.user, order.eventId);
    if (order.status === 'PAID' || order.status === 'AUTHORIZED') {
      throw new ForbiddenException('OC autorizada/pagada no se edita');
    }

    const data: Prisma.PurchaseOrderUpdateInput = {
      rubro: body.rubro,
      vendorName: body.vendorName,
      description: body.description,
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
      include: { lines: true },
    });
  }

  @Post(':id/proofs')
  async addProof(
    @Req()
    req: {
      user: { id: string; roleKey: string; permissions: string[]; entities: string[] };
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
      user: { id: string; roleKey: string; permissions: string[]; entities: string[] };
    },
    @Param('id') id: string,
    @Body() body: { status: PoStatus },
  ) {
    const role = req.user.roleKey as RoleKey;
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!order) throw new NotFoundException('OC no encontrada');

    if (body.status === 'AUTHORIZED') {
      if (!hasPermission(role, req.user.permissions, PERMISSIONS.PO_AUTHORIZE)) {
        throw new ForbiddenException('No puedes autorizar OC');
      }
      if (role === 'gerente_arta' && order.event.entity !== 'ARTA') {
        throw new ForbiddenException('Melissa solo autoriza OC de Arta');
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
        },
        include: { lines: true },
      });
    }
    if (body.status === 'PAID') {
      if (!hasPermission(role, req.user.permissions, PERMISSIONS.PO_MARK_PAID)) {
        throw new ForbiddenException('No puedes marcar pagado');
      }
      return this.prisma.purchaseOrder.update({
        where: { id },
        data: { status: 'PAID', paidAt: new Date() },
        include: { lines: true },
      });
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: body.status },
      include: { lines: true },
    });
  }

  @Delete(':id')
  async remove(
    @Req() req: { user: { id: string; roleKey: string; permissions: string[] } },
    @Param('id') id: string,
  ) {
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('OC no encontrada');
    if (order.status === 'AUTHORIZED' || order.status === 'PAID') {
      throw new ForbiddenException('No se puede eliminar OC autorizada/pagada');
    }
    await this.prisma.purchaseOrder.delete({ where: { id } });
    return { ok: true };
  }
}
