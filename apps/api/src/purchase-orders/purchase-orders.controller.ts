import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Optional,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PoPaymentMethod, PoStatus, Prisma } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  canSeeModule,
  hasPermission,
  canAccessEventOps,
  isDirectionRole,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import { NotificationsService } from '../notifications/notifications.service';
import { ChatRefsService } from '../chat/chat-refs.service';
import { PurchaseOrderExcelService } from './po-excel.service';
import { ExcelPdfService } from '../uploads/excel-pdf.service';
import { uploadRoot } from '../uploads/upload-storage';
import { createHash } from 'crypto';
import { join } from 'path';
import { readFileSync } from 'fs';
import { poNotice, type PoNoticeKind } from '../notifications/notification-text';
import { payDayOf, payWindowFor, withPoState } from './po-state';
import {
  DEFAULT_PO_WINDOW,
  describeSchedule,
  evaluatePoWindow,
  readPoWindow,
  sanitizePoWindow,
  type PoWindowConfig,
} from './po-window';

/** Machote: a quién se le paga. */
export const PO_PAYEE_TYPES = ['PROVEEDOR', 'OTRO'] as const;
export type PoPayeeType = (typeof PO_PAYEE_TYPES)[number];

/** IVA que se suma al subtotal cuando la orden lo lleva. */
export const PO_IVA_RATE = 0.16;

type AdendumFields = {
  adendumPerson?: string | null;
  adendumAccount?: string | null;
  adendumFileUrl?: string | null;
  adendumFileName?: string | null;
};

/** Los datos del adendum, limpios; en otra forma de pago no se guardan. */
function adendumData(method: string | null | undefined, body: AdendumFields) {
  if (method !== 'ADENDUM') {
    return { adendumPerson: null, adendumAccount: null, adendumFileUrl: null, adendumFileName: null };
  }
  const person = body.adendumPerson?.trim();
  const account = body.adendumAccount?.trim();
  if (!person || !account) {
    throw new BadRequestException('El adendum necesita el nombre de la persona y su cuenta');
  }
  const fileUrl = body.adendumFileUrl?.trim() || null;
  if (fileUrl && !/^\/uploads\/[\w./-]+$/.test(fileUrl)) {
    throw new BadRequestException('Archivo del adendum no válido');
  }
  return {
    adendumPerson: person.slice(0, 160),
    adendumAccount: account.slice(0, 80),
    adendumFileUrl: fileUrl,
    adendumFileName: body.adendumFileName?.trim().slice(0, 200) || null,
  };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

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
  @IsOptional() @IsIn(PO_PAYEE_TYPES as unknown as string[]) payeeType?: PoPayeeType;
  @IsOptional() @IsBoolean() withIva?: boolean;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() adendumPerson?: string;
  @IsOptional() @IsString() adendumAccount?: string;
  @IsOptional() @IsString() adendumFileUrl?: string;
  @IsOptional() @IsString() adendumFileName?: string;
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
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private poExcel: PurchaseOrderExcelService = new PurchaseOrderExcelService(),
    private excelPdf: ExcelPdfService = new ExcelPdfService(),
    @Optional() private refs?: ChatRefsService,
  ) {}

  /**
   * Una OC nueva le llega a quien la puede autorizar en esa entidad. Antes se
   * quedaba «Por autorizar» hasta que dirección entrara a la torre de OC.
   * El texto dice qué OC, de quién, cuánto, en qué evento y qué se espera.
   */
  private async notifyAuthorizers(
    user: { id: string; fullName?: string },
    event: { id: string; name: string; entity: string; organizationId: string | null; startsAt?: Date | null },
    order: { id: string; vendorName: string | null; amount: Prisma.Decimal | number },
    kind: 'po.requested' | 'po.updated' | 'po.deleted' = 'po.requested',
    previousAmount?: Prisma.Decimal | number | null,
  ) {
    const organizationId = event.organizationId ?? null;
    const recipients = await this.authorizersOf(event);
    const text = poNotice(
      kind === 'po.requested' ? 'requested' : kind === 'po.updated' ? 'updated' : 'deleted',
      {
        actor: user.fullName,
        order: { id: order.id, vendorName: order.vendorName, amount: order.amount },
        event,
        previousAmount: previousAmount == null ? null : Number(previousAmount),
      },
    );
    await this.notifications.notifyMany(
      recipients.map((p) => ({
        userId: p.id,
        organizationId,
        actorId: user.id,
        type: kind,
        title: text.title,
        body: text.body,
        // Con acción pendiente, la app abre Aprobaciones nativas.
        linkUrl: kind === 'po.deleted' ? `/events/${event.id}?tab=ocs` : `/purchase-orders?po=${order.id}`,
        entity: event.entity as EntityKey,
      })),
    );
  }

  /** Quien puede autorizar OC en la entidad del evento (mismas reglas que `setStatus`). */
  private async authorizersOf(event: { entity: string; organizationId: string | null }) {
    const organizationId = event.organizationId ?? null;
    const people = await this.prisma.user.findMany({
      where: { active: true, ...(organizationId ? { organizationId } : {}) },
      select: { id: true, roleKey: true, entities: true, permissions: true },
    });
    const entity = event.entity as EntityKey;
    return people.filter((p) => {
      const role = p.roleKey as RoleKey;
      if (!hasPermission(role, p.permissions, PERMISSIONS.PO_AUTHORIZE)) return false;
      if (!canAccessEventOps(p.entities as EntityKey[], role, entity)) return false;
      if (role === 'gerente_arta' && entity !== 'ARTA') return false;
      if (role === 'dir_auditorio' && entity !== 'EXPLANADA') return false;
      return true;
    });
  }

  /**
   * Cada cambio de estatus le avisa a quien pidió la OC; al autorizarse, además
   * a quien la puede pagar en esa entidad. Nunca al que hizo el cambio. Cada
   * aviso dice qué sigue: el comprobante, el día de cobro o nada.
   */
  private async notifyStatusChange(
    actor: { id: string; fullName?: string },
    event: { id: string; name: string; entity: string; organizationId: string | null; startsAt?: Date | null },
    order: {
      id: string;
      createdById: string | null;
      vendorName: string | null;
      amount: Prisma.Decimal | number;
      paymentMethod?: string | null;
      proofs?: unknown[] | null;
    },
    status: PoStatus,
  ) {
    const organizationId = event.organizationId ?? null;
    const linkUrl = `/events/${event.id}?tab=ocs`;
    const entity = event.entity as EntityKey;
    const kinds: Partial<Record<PoStatus, { type: string; kind: PoNoticeKind }>> = {
      AUTHORIZED: { type: 'po.authorized', kind: 'authorized' },
      PAID: { type: 'po.paid', kind: 'paid' },
      REJECTED: { type: 'po.rejected', kind: 'rejected' },
      CANCELLED: { type: 'po.cancelled', kind: 'cancelled' },
      PENDING_AUTH: { type: 'po.reverted', kind: 'reverted' },
      DRAFT: { type: 'po.reverted', kind: 'reverted_draft' },
    };
    const msg = kinds[status];
    if (!msg) return;
    const payDay = payDayOf(await payWindowFor(this.prisma, organizationId));
    const input = {
      actor: actor.fullName,
      order: {
        id: order.id,
        vendorName: order.vendorName,
        amount: order.amount,
        paymentMethod: order.paymentMethod,
        proofCount: order.proofs?.length ?? 0,
      },
      event,
      payDay,
    };
    const items: Parameters<NotificationsService['notifyMany']>[0] = [];
    if (order.createdById && order.createdById !== actor.id) {
      const text = poNotice(msg.kind, input);
      items.push({ userId: order.createdById, organizationId, actorId: actor.id, type: msg.type, title: text.title, body: text.body, linkUrl, entity });
    }
    if (status === 'AUTHORIZED') {
      const people = await this.prisma.user.findMany({
        where: { active: true, ...(organizationId ? { organizationId } : {}) },
        select: { id: true, roleKey: true, entities: true, permissions: true },
      });
      // Transferencia o adendum: le toca a contabilidad pagar y subir el comprobante (01-11-2026).
      // Dirección también puede pagar, pero no le suena cada OC que acaba de autorizar.
      const wired = order.paymentMethod === 'TRANSFERENCIA' || order.paymentMethod === 'ADENDUM';
      // Si contabilidad no lleva este negocio, el aviso sigue a quien puede pagar: que no se pierda.
      const accounting = people.filter(
        (p) =>
          p.roleKey === 'contabilidad' &&
          p.id !== actor.id &&
          canAccessEventOps(p.entities as EntityKey[], p.roleKey as RoleKey, entity),
      );
      const toPay = poNotice(wired ? 'to_transfer' : 'to_pay', input);
      for (const p of people) {
        const role = p.roleKey as RoleKey;
        if (p.id === actor.id || p.id === order.createdById) continue;
        if (!hasPermission(role, p.permissions, PERMISSIONS.PO_MARK_PAID)) continue;
        if (!canAccessEventOps(p.entities as EntityKey[], role, entity)) continue;
        if (wired && accounting.length && role !== 'contabilidad') continue;
        items.push({
          userId: p.id,
          organizationId,
          actorId: actor.id,
          type: wired ? 'po.to_transfer' : 'po.to_pay',
          title: toPay.title,
          body: toPay.body,
          linkUrl: `/purchase-orders?po=${order.id}`,
          entity,
        });
      }
    }
    // Ya quedó pagada: quien la hizo (arriba) y quienes la autorizan se enteran.
    if (status === 'PAID') {
      const paid = poNotice('paid', input);
      for (const p of await this.authorizersOf(event)) {
        if (p.id === actor.id || p.id === order.createdById) continue;
        items.push({
          userId: p.id,
          organizationId,
          actorId: actor.id,
          type: 'po.paid',
          title: paid.title,
          body: paid.body,
          linkUrl: `/purchase-orders?po=${order.id}`,
          entity,
        });
      }
    }
    if (items.length) await this.notifications.notifyMany(items);
  }

  /** Días de cobro de hoy para pegar el estado preciso a las órdenes. */
  private async stateWindow(organizationId: string | null | undefined) {
    return payWindowFor(this.prisma, organizationId);
  }

  /** Días de cobro del tenant (con los defaults de Arta: lunes, miércoles y viernes). */
  private async loadWindow(user: WindowUser): Promise<PoWindowConfig> {
    const org = await this.prisma.organization.findUnique({
      where: { id: tenantIdOf(user) },
      select: { settingsJson: true },
    });
    if (!org) return { ...DEFAULT_PO_WINDOW, days: [...DEFAULT_PO_WINDOW.days] };
    return readPoWindow(org.settingsJson);
  }

  /** Dirección configura los días de cobro, así que no puede quedar encerrada por ellos. */
  private bypassesWindow(user: WindowUser) {
    return isDirectionRole(user.roleKey);
  }

  /**
   * Días de cobro: si hoy se pueden registrar pagos y cuál es el siguiente día.
   * Crear órdenes ya no depende de esto (`canRequestNow` siempre es true).
   */
  @Get('window')
  async window(@Req() req: { user: WindowUser }) {
    const config = await this.loadWindow(req.user);
    const state = evaluatePoWindow(config);
    const bypass = this.bypassesWindow(req.user);
    const canEdit = hasPermission(
      req.user.roleKey as RoleKey,
      req.user.permissions || [],
      PERMISSIONS.EVERYTHING,
    );
    return {
      ...state,
      canRequestNow: true,
      canPayNow: state.open || bypass,
      bypass,
      canEdit,
    };
  }

  @Patch('window')
  async setWindow(@Req() req: { user: WindowUser }, @Body() body: Partial<PoWindowConfig>) {
    if (
      !hasPermission(
        req.user.roleKey as RoleKey,
        req.user.permissions || [],
        PERMISSIONS.EVERYTHING,
      )
    ) {
      throw new ForbiddenException('Solo dirección configura los días de cobro');
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
    const state = evaluatePoWindow(poWindow);
    const bypass = this.bypassesWindow(req.user);
    return { ...state, canRequestNow: true, canPayNow: state.open || bypass, bypass, canEdit: true };
  }

  /**
   * Revisión 11-09-2026: «La orden de compra se puede crear el día que sea.
   * SOLO SE DEJARÁ LOS DÍAS DE COBRO». El pago se registra solo en esos días.
   */
  private async assertPaymentDay(user: WindowUser) {
    if (this.bypassesWindow(user)) return;
    const config = await this.loadWindow(user);
    const state = evaluatePoWindow(config);
    if (state.open) return;
    const note = config.note ? ` ${config.note}` : '';
    throw new ForbiddenException(
      `Los pagos se registran solo los ${describeSchedule(config)}. Hoy no es día de cobro.${note}`,
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

  /** Las OC las ven Juan Pablo, quien las autoriza, quien las paga, y Leida y Sol en Arta. */
  private async assertPoView(user: { entities: string[]; roleKey: string; permissions?: string[] | null; organizationId?: string | null }, eventId: string) {
    const event = await this.assertEventOps(user, eventId);
    if (!canSeeModule(user, event.entity, 'po')) {
      throw new ForbiddenException('Las órdenes de compra no están a tu alcance');
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

  /**
   * Toda decisión de dinero deja rastro.
   *
   * Hasta aquí este módulo no escribía una sola línea de auditoría: autorizar
   * una OC —la firma que compromete el gasto— y marcarla pagada eran acciones
   * anónimas. `createdBy`/`authorizedBy` guardan el último estado, no la
   * historia: si alguien rechaza y vuelve a autorizar, el rastro desaparece.
   */
  private async audit(
    user: { id: string; organizationId?: string | null },
    organizationId: string | null,
    action: string,
    orderId: string,
    meta: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        organizationId: organizationId ?? user.organizationId ?? null,
        action,
        resource: 'PurchaseOrder',
        resourceId: orderId,
        metaJson: meta as Prisma.InputJsonValue,
      },
    });
  }

  private sumLines(lines: Array<{ qty: unknown; unitPrice: unknown }>) {
    return round2(lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0));
  }

  /** Total de la orden: subtotal de partidas, más 16 % si lleva IVA. */
  private amountFor(subtotal: number, withIva: boolean) {
    return round2(subtotal * (withIva ? 1 + PO_IVA_RATE : 1));
  }

  /** PROVEEDOR por defecto; cualquier otra cosa que no esté en el machote se rechaza. */
  private payeeTypeOf(value: unknown, fallback: PoPayeeType = 'PROVEEDOR'): PoPayeeType {
    if (value === undefined || value === null || value === '') return fallback;
    if ((PO_PAYEE_TYPES as readonly unknown[]).includes(value)) return value as PoPayeeType;
    throw new BadRequestException('Tipo de beneficiario inválido: usa PROVEEDOR u OTRO');
  }

  private lineCreates(lines: PoLineDto[]) {
    return lines.map((l) => {
      const qty = Number(l.qty || 0);
      const unitPrice = Number(l.unitPrice || 0);
      return {
        concept: l.concept,
        qty,
        unitPrice,
        total: round2(qty * unitPrice),
      };
    });
  }

  @Get('event/:eventId')
  async list(
    @Req() req: { user: { entities: string[]; roleKey: string } },
    @Param('eventId') eventId: string,
  ) {
    const event = await this.assertPoView(req.user, eventId);
    const [orders, win] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where: { eventId },
        orderBy: { updatedAt: 'desc' },
        include: {
          createdBy: { select: { fullName: true } },
          authorizedBy: { select: { fullName: true } },
          lines: true,
          proofs: true,
        },
      }),
      this.stateWindow(event.organizationId),
    ]);
    // `state`: qué le falta a cada orden, el mismo texto en panel y apps.
    return orders.map((o) => withPoState(o, win, event.status));
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
    const event = await this.assertPoView(req.user, order.eventId);
    return withPoState(order, await this.stateWindow(event.organizationId), order.event.status);
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
        fullName?: string;
      };
    },
    @Body() dto: CreatePoDto,
  ) {
    if (
      !hasPermission(
        req.user.roleKey as RoleKey,
        req.user.permissions || [],
        PERMISSIONS.PO_EDIT,
      )
    ) {
      throw new ForbiddenException('Las órdenes de compra las hace Juan Pablo');
    }
    const event = await this.assertEventOpsOpen(req.user, dto.eventId);
    // Sin ventana de captura: la orden se crea el día que sea (revisión 11-09-2026).
    const payeeType = this.payeeTypeOf(dto.payeeType);
    const withIva = dto.withIva === true;
    const lines = dto.lines?.length ? dto.lines : undefined;
    const subtotal = lines ? this.sumLines(lines) : round2(Number(dto.amount || 0));
    const amount = this.amountFor(subtotal, withIva);
    // Una OC de cero pesos no es una orden de compra: es una fila vacía que
    // alguien tiene que autorizar. Se colaban al pulsar «Crear» sin capturar
    // nada, y el panel respondía «OC creada» tan contento.
    if (!(amount > 0)) {
      throw new BadRequestException(
        'La orden necesita un monto: captura al menos una partida con cantidad y precio',
      );
    }
    const created = await this.prisma.purchaseOrder.create({
      data: {
        eventId: dto.eventId,
        rubro: dto.rubro,
        vendorName: dto.vendorName,
        description: dto.description,
        paymentMethod: dto.paymentMethod || 'TRANSFERENCIA',
        ...adendumData(dto.paymentMethod, dto),
        payeeType,
        withIva,
        amount,
        status: 'PENDING_AUTH',
        createdById: req.user.id,
        lines: lines ? { create: this.lineCreates(lines) } : undefined,
      },
      include: { lines: true, proofs: true },
    });
    await this.audit(req.user, event.organizationId, 'po.create', created.id, {
      eventId: dto.eventId,
      rubro: dto.rubro,
      vendorName: dto.vendorName ?? null,
      amount,
      subtotal,
      withIva,
      payeeType,
      paymentMethod: created.paymentMethod,
    });
    // Un aviso que falla no deshace la orden.
    await this.notifyAuthorizers(req.user, event, created).catch(() => undefined);
    return withPoState(created, await this.stateWindow(event.organizationId), event.status);
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
      payeeType?: PoPayeeType;
      withIva?: boolean;
      lines?: PoLineDto[];
      adendumPerson?: string;
      adendumAccount?: string;
      adendumFileUrl?: string;
      adendumFileName?: string;
    },
  ) {
    if (
      !hasPermission(
        req.user.roleKey as RoleKey,
        req.user.permissions,
        PERMISSIONS.PO_EDIT,
      )
    ) {
      throw new ForbiddenException('Las órdenes de compra las edita Juan Pablo');
    }
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!order) throw new NotFoundException('OC no encontrada');
    const event = await this.assertEventOpsOpen(req.user, order.eventId);
    if (order.status === 'PAID' || order.status === 'AUTHORIZED') {
      throw new ForbiddenException('OC autorizada/pagada no se edita');
    }

    const wasWithIva = !!order.withIva;
    const withIva = typeof body.withIva === 'boolean' ? body.withIva : wasWithIva;
    const withIvaChanged = withIva !== wasWithIva;
    const payeeType =
      body.payeeType !== undefined ? this.payeeTypeOf(body.payeeType) : undefined;

    const data: Prisma.PurchaseOrderUpdateInput = {
      rubro: body.rubro,
      vendorName: body.vendorName,
      description: body.description,
      paymentMethod: body.paymentMethod,
      ...(body.paymentMethod !== undefined || body.adendumPerson !== undefined || body.adendumAccount !== undefined
        ? adendumData(body.paymentMethod ?? order.paymentMethod, {
            adendumPerson: body.adendumPerson ?? order.adendumPerson,
            adendumAccount: body.adendumAccount ?? order.adendumAccount,
            adendumFileUrl: body.adendumFileUrl ?? order.adendumFileUrl,
            adendumFileName: body.adendumFileName ?? order.adendumFileName,
          })
        : {}),
      ...(payeeType ? { payeeType } : {}),
      ...(typeof body.withIva === 'boolean' ? { withIva } : {}),
    };

    if (body.lines) {
      const amount = this.amountFor(this.sumLines(body.lines), withIva);
      if (!(amount > 0)) {
        throw new BadRequestException(
          'La orden necesita un monto: captura al menos una partida con cantidad y precio',
        );
      }
      await this.prisma.purchaseOrderLine.deleteMany({ where: { orderId: id } });
      data.amount = amount;
      data.lines = { create: this.lineCreates(body.lines) };
    } else if (withIvaChanged) {
      // Solo cambió el IVA: el subtotal sale de las partidas guardadas o, en
      // órdenes viejas sin partidas, del monto sin el IVA que ya traía.
      const saved = order.lines ?? [];
      const subtotal = saved.length
        ? this.sumLines(saved)
        : round2(Number(order.amount || 0) / (wasWithIva ? 1 + PO_IVA_RATE : 1));
      data.amount = this.amountFor(subtotal, withIva);
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data,
      include: { lines: true, proofs: true },
    });
    await this.audit(req.user, event.organizationId, 'po.update', id, {
      amountBefore: Number(order.amount),
      amountAfter: Number(updated.amount),
      ...(body.paymentMethod && body.paymentMethod !== order.paymentMethod
        ? { paymentMethodFrom: order.paymentMethod, paymentMethodTo: body.paymentMethod }
        : {}),
      ...(withIvaChanged ? { withIvaFrom: wasWithIva, withIvaTo: withIva } : {}),
      ...(payeeType && payeeType !== (order.payeeType ?? 'PROVEEDOR')
        ? { payeeTypeFrom: order.payeeType ?? 'PROVEEDOR', payeeTypeTo: payeeType }
        : {}),
      linesReplaced: !!body.lines,
    });
    // Lo que autorizan ya no es lo que pidieron: quien autoriza debe volver a verla.
    const relevant =
      Number(order.amount) !== Number(updated.amount) ||
      (body.vendorName !== undefined && body.vendorName !== order.vendorName) ||
      (body.paymentMethod !== undefined && body.paymentMethod !== order.paymentMethod);
    if (order.status === 'PENDING_AUTH' && relevant) {
      await this.notifyAuthorizers(req.user, event, updated, 'po.updated', order.amount).catch(() => undefined);
    }
    void this.refs?.touched('po', id);
    return withPoState(updated, await this.stateWindow(event.organizationId), event.status);
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
    if (
      !hasPermission(req.user.roleKey as RoleKey, (req.user as { permissions?: string[] }).permissions, PERMISSIONS.PO_MARK_PAID) &&
      !hasPermission(req.user.roleKey as RoleKey, (req.user as { permissions?: string[] }).permissions, PERMISSIONS.PO_EDIT)
    ) {
      throw new ForbiddenException('El comprobante lo sube quien paga');
    }
    if (order.paymentMethod === 'EFECTIVO') {
      throw new BadRequestException(
        'Esta OC es en efectivo: no se adjuntan comprobantes',
      );
    }
    const proof = await this.prisma.paymentProof.create({
      data: {
        purchaseOrderId: id,
        eventId: order.eventId,
        fileUrl: body.fileUrl,
        label: body.label || `Comprobante OC ${order.rubro}`,
        amount: body.amount ?? order.amount,
        uploadedById: req.user.id,
      },
    });
    await this.audit(req.user, order.event.organizationId, 'po.proof.add', id, {
      proofId: proof.id,
      fileUrl: proof.fileUrl,
      amount: Number(proof.amount ?? 0),
    });
    if (order.createdById && order.createdById !== req.user.id) {
      const text = poNotice('proof', {
        actor: (req.user as { fullName?: string }).fullName,
        order,
        event: order.event,
        proofAmount: proof.amount ?? order.amount,
        payDay: payDayOf(await this.stateWindow(order.event.organizationId)),
      });
      await this.notifications.notify({
        userId: order.createdById,
        organizationId: order.event.organizationId,
        actorId: req.user.id,
        type: 'po.proof',
        title: text.title,
        body: text.body,
        linkUrl: `/events/${order.eventId}?tab=ocs`,
        entity: order.event.entity as EntityKey,
      });
    }
    return proof;
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
      const authorized = await this.prisma.purchaseOrder.update({
        where: { id },
        data: {
          status: 'AUTHORIZED',
          authorizedById: req.user.id,
          authorizedAt: new Date(),
          ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
        },
        include: { lines: true, proofs: true },
      });
      await this.audit(req.user, order.event.organizationId, 'po.authorize', id, {
        eventId: order.eventId,
        rubro: order.rubro,
        vendorName: order.vendorName ?? null,
        amount: Number(order.amount),
        paymentMethod: authorized.paymentMethod,
      });
      await this.notifyStatusChange(req.user, order.event, { ...order, paymentMethod: authorized.paymentMethod }, 'AUTHORIZED').catch(
        () => undefined,
      );
      void this.refs?.touched('po', id);
      return withPoState(authorized, await this.stateWindow(order.event.organizationId), order.event.status);
    }
    if (body.status === 'PAID') {
      if (!hasPermission(role, req.user.permissions, PERMISSIONS.PO_MARK_PAID)) {
        throw new ForbiddenException('No puedes marcar pagado');
      }
      const method = body.paymentMethod || order.paymentMethod;
      const needsProof = method !== 'EFECTIVO';
      const proofCount = order.proofs?.length ?? 0;
      if (needsProof && proofCount === 0) {
        throw new BadRequestException(
          'Para transferencias, cheques y otros pagos no en efectivo, adjunta el comprobante antes de marcar pagado',
        );
      }
      // El comprobante se puede subir cualquier día; el pago, solo en día de cobro.
      await this.assertPaymentDay(req.user);

      /**
       * Cambiar la forma de pago EN LA MISMA petición que marca pagado es la
       * única vía para saltarse el comprobante: mandar `EFECTIVO` apaga la
       * exigencia. Es legítimo —al final se pagó en efectivo y hay que poder
       * registrarlo— pero no puede pasar callado, que es justo la forma del
       * bug que ya costó caro en la corrida (`locked: false` en el mismo
       * update que editaba). Lleva su propia línea de auditoría para que la
       * supervisión lo vea sin abrir el detalle.
       */
      const switchedToCash =
        !!body.paymentMethod &&
        body.paymentMethod !== order.paymentMethod &&
        body.paymentMethod === 'EFECTIVO';
      if (switchedToCash && proofCount === 0) {
        await this.audit(
          req.user,
          order.event.organizationId,
          'po.payment_method.cash_at_payment',
          id,
          {
            from: order.paymentMethod,
            to: 'EFECTIVO',
            amount: Number(order.amount),
            skippedProof: true,
          },
        );
      }

      const paid = await this.prisma.purchaseOrder.update({
        where: { id },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paymentMethod: method,
        },
        include: { lines: true, proofs: true },
      });
      await this.audit(req.user, order.event.organizationId, 'po.pay', id, {
        eventId: order.eventId,
        rubro: order.rubro,
        vendorName: order.vendorName ?? null,
        amount: Number(order.amount),
        withIva: !!order.withIva,
        paymentMethod: method,
        proofCount,
      });
      await this.notifyStatusChange(req.user, order.event, { ...order, paymentMethod: method }, 'PAID').catch(() => undefined);
      void this.refs?.touched('po', id);
      return withPoState(paid, await this.stateWindow(order.event.organizationId), order.event.status);
    }
    // Any other transition (REJECTED/CANCELLED/DRAFT/PENDING_AUTH) is still an
    // authorization-flow action — gate it the same as approving, not left open.
    if (!hasPermission(role, req.user.permissions, PERMISSIONS.PO_AUTHORIZE)) {
      throw new ForbiddenException('No puedes cambiar el estatus de esta OC');
    }
    const moved = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.paymentMethod ? { paymentMethod: body.paymentMethod } : {}),
      },
      include: { lines: true, proofs: true },
    });
    await this.audit(req.user, order.event.organizationId, 'po.status', id, {
      from: order.status,
      to: body.status,
      amount: Number(order.amount),
    });
    await this.notifyStatusChange(req.user, order.event, order, body.status).catch(() => undefined);
    void this.refs?.touched('po', id);
    return withPoState(moved, await this.stateWindow(order.event.organizationId), order.event.status);
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
    if (
      !hasPermission(
        req.user.roleKey as RoleKey,
        req.user.permissions,
        PERMISSIONS.PO_EDIT,
      )
    ) {
      throw new ForbiddenException('Sin permiso para eliminar órdenes de compra');
    }
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('OC no encontrada');
    const event = await this.assertEventOpsOpen(req.user, order.eventId);
    if (order.status === 'AUTHORIZED' || order.status === 'PAID') {
      throw new ForbiddenException('No se puede eliminar OC autorizada/pagada');
    }
    await this.prisma.purchaseOrder.delete({ where: { id } });
    await this.audit(req.user, event.organizationId, 'po.delete', id, {
      eventId: order.eventId,
      rubro: order.rubro,
      vendorName: order.vendorName ?? null,
      amount: Number(order.amount),
      withIva: !!order.withIva,
      status: order.status,
    });
    const text = poNotice('deleted_mine', {
      actor: (req.user as { fullName?: string }).fullName,
      order,
      event,
    });
    await this.notifications.notifyUsers([order.createdById], {
      organizationId: event.organizationId,
      actorId: req.user.id,
      type: 'po.deleted',
      title: text.title,
      body: text.body,
      linkUrl: `/events/${event.id}?tab=ocs`,
      entity: event.entity as EntityKey,
    });
    if (order.status === 'PENDING_AUTH') {
      await this.notifyAuthorizers(req.user, event, order, 'po.deleted').catch(() => undefined);
    }
    return { ok: true };
  }

  /**
   * Genera salida Excel + PDF de la OC a partir del machote base /uploads/format-oc.xlsx.
   * Devuelve URL del PDF. La copia Excel queda registrada como EventFile (module 'oc').
   */
  @Post(':id/export')
  async exportExcelPdf(
    @Req()
    req: {
      user: {
        id: string;
        roleKey: string;
        permissions: string[];
        entities: string[];
        organizationId?: string | null;
        fullName?: string | null;
      };
    },
    @Param('id') id: string,
    @Body() body?: { variant?: 'default' | 'variant2' },
  ) {
    const order = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        event: true,
        createdBy: { select: { fullName: true } },
        authorizedBy: { select: { fullName: true } },
        lines: true,
      },
    });
    if (!order) throw new NotFoundException('OC no encontrada');
    await this.assertPoView(req.user, order.eventId);
    assertEventNotClosed(order.event.status);

    const src = body?.variant === 'variant2' ? 'format-oc-variant.xlsx' : 'format-oc.xlsx';
    const srcPath = join(uploadRoot, src);
    const { excelPath } = await this.poExcel.buildFromTemplate(srcPath, order as never, {
      name: order.event.name,
      entity: order.event.entity,
    });

    // Registrar Excel como archivo del evento (editable)
    const buf = readFileSync(excelPath);
    const excelFile = await this.prisma.eventFile.create({
      data: {
        eventId: order.eventId,
        fileName: `OC ${order.id}.xlsx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        url: `/uploads/${excelPath.split('/').pop()}`,
        kind: 'excel',
        module: 'oc',
        // Robust: if the acting user isn't a real User row (tests, system), leave null
        updatedById:
          (await this.prisma.user
            .findUnique({ where: { id: req.user.id }, select: { id: true } })
            .then((u) => u?.id)
            .catch(() => null)) || null,
        sha256: createHash('sha256').update(buf).digest('hex'),
      },
      include: { event: { select: { organizationId: true } } },
    });

    // PDF de salida con encabezado estándar (no reescribe celdas)
    const { url } = await this.excelPdf.generate(excelFile.id, excelFile.version, excelPath, {
      eventName: order.event.name,
      entity: order.event.entity,
      fileName: excelFile.fileName,
      exportedBy: req.user.fullName || null,
    });

    await this.audit(req.user, order.event.organizationId, 'po.export', id, {
      excelFileId: excelFile.id,
      pdfUrl: url,
    });

    return { url, fileId: excelFile.id, excelUrl: excelFile.url };
  }
}
