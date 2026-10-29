import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import {
  PERMISSIONS,
  canAccessEventOps,
  hasPermission,
  isDirectionRole,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';
import { ChecklistPdfService } from '../checklists/checklist-pdf.service';
import {
  carryOverItems,
  inventoryStats,
  inventoryToFormat,
  isIsoDate,
  mondayOf,
  sanitizeItems,
  todayInMexico,
  weekLabel,
  type InventoryItem,
} from './cleaning-inventory';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions?: string[];
  fullName?: string;
  organizationId?: string | null;
};

type Req_ = { user: AuthUser; ip?: string; headers?: Record<string, string> };

class OpenWeekDto {
  @IsString()
  entity!: EntityKey;

  /** Cualquier día de la semana (`YYYY-MM-DD`); se toma su lunes. Vacío = esta semana. */
  @IsOptional()
  @IsString()
  date?: string;
}

class UpdateInventoryDto {
  @IsOptional()
  @IsArray()
  items?: unknown[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsible?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  /** La revisión que tenía quien guarda: si otro guardó antes, 409 en vez de pisarlo. */
  @IsOptional()
  @IsInt()
  baseRevision?: number;
}

const PEOPLE = {
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} as const;

/** Por ahora el inventario es del Auditorio; Arta no lo pidió. */
const INVENTORY_ENTITIES: EntityKey[] = ['EXPLANADA'];

/**
 * Inventario de limpieza semanal del Auditorio (junta 23-10-2026).
 *
 * Lo ve quien opera eventos del Auditorio y lo captura quien además puede
 * editar formatos (`checklist.edit`): dirección, dirección adjunta del
 * Auditorio (Rodrigo, Will, JP) y `dir_auditorio`. Borrar una semana, solo
 * dirección. Cada semana sale en PDF con el motor de los formatos.
 */
@Controller('cleaning-inventory')
@UseGuards(JwtAuthGuard)
export class CleaningInventoryController {
  constructor(
    private prisma: PrismaService,
    private pdfs: ChecklistPdfService,
  ) {}

  private assertView(user: AuthUser, entity: EntityKey) {
    if (!INVENTORY_ENTITIES.includes(entity)) {
      throw new BadRequestException('El inventario de limpieza es del Auditorio');
    }
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, entity)) {
      throw new ForbiddenException('Sin acceso al Auditorio');
    }
  }

  private canEdit(user: AuthUser): boolean {
    return hasPermission(user.roleKey as RoleKey, user.permissions ?? [], PERMISSIONS.CHECKLIST_EDIT);
  }

  private assertEdit(user: AuthUser, entity: EntityKey) {
    this.assertView(user, entity);
    if (!this.canEdit(user)) throw new ForbiddenException('Sin permiso para capturar el inventario');
  }

  private async load(user: AuthUser, id: string) {
    const row = await this.prisma.cleaningInventory.findUnique({ where: { id }, include: PEOPLE });
    if (!row) throw new NotFoundException('Semana no encontrada');
    assertSameTenant(user, row.organizationId);
    this.assertView(user, row.entity as EntityKey);
    return row;
  }

  private shape(row: Prisma.CleaningInventoryGetPayload<{ include: typeof PEOPLE }>, user: AuthUser) {
    const items = sanitizeItems(row.itemsJson);
    return {
      id: row.id,
      entity: row.entity,
      weekStart: row.weekStart,
      label: weekLabel(row.weekStart),
      responsible: row.responsible,
      notes: row.notes,
      items,
      stats: inventoryStats(items),
      revision: row.revision,
      pdfUrl: row.pdfUrl,
      pdfGeneratedAt: row.pdfGeneratedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      canEdit: this.canEdit(user),
    };
  }

  private async audit(req: Req_, action: string, row: { id: string; organizationId: string; weekStart: string }, meta: object = {}) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: req.user.id,
          organizationId: row.organizationId,
          action,
          resource: 'CleaningInventory',
          resourceId: row.id,
          metaJson: { weekStart: row.weekStart, ...meta },
          ip: req.ip,
          userAgent: req.headers?.['user-agent']?.slice(0, 300),
        },
      });
    } catch {
      /* la bitácora no tumba la captura */
    }
  }

  /** Historial: las semanas, de la más reciente a la más vieja. */
  @Get()
  async list(@Req() req: Req_, @Query('entity') entity: EntityKey, @Query('limit') limit?: string) {
    if (!entity) throw new BadRequestException('Falta la entidad');
    this.assertView(req.user, entity);
    const take = Math.min(Math.max(Number(limit) || 60, 1), 260);
    const rows = await this.prisma.cleaningInventory.findMany({
      where: { organizationId: tenantIdOf(req.user), entity },
      orderBy: { weekStart: 'desc' },
      take,
      include: PEOPLE,
    });
    return {
      canEdit: this.canEdit(req.user),
      currentWeek: mondayOf(todayInMexico()),
      weeks: rows.map((row) => {
        const { items: _items, ...rest } = this.shape(row, req.user);
        return rest;
      }),
    };
  }

  @Get(':id')
  async get(@Req() req: Req_, @Param('id') id: string) {
    return this.shape(await this.load(req.user, id), req.user);
  }

  /**
   * Abre la semana de una fecha (por defecto, la actual). Si ya existe la
   * regresa tal cual; si no, nace con los insumos y mínimos de la semana
   * anterior y su existencia final como inicial.
   */
  @Post()
  async open(@Req() req: Req_, @Body() body: OpenWeekDto) {
    this.assertEdit(req.user, body.entity);
    const day = body.date ? body.date : todayInMexico();
    if (!isIsoDate(day)) throw new BadRequestException('Fecha inválida (AAAA-MM-DD)');
    const weekStart = mondayOf(day);
    const organizationId = tenantIdOf(req.user);
    const where = { organizationId_entity_weekStart: { organizationId, entity: body.entity, weekStart } };

    const existing = await this.prisma.cleaningInventory.findUnique({ where, include: PEOPLE });
    if (existing) return { ...this.shape(existing, req.user), created: false };

    const previous = await this.prisma.cleaningInventory.findFirst({
      where: { organizationId, entity: body.entity, weekStart: { lt: weekStart } },
      orderBy: { weekStart: 'desc' },
    });
    const items = carryOverItems(previous ? sanitizeItems(previous.itemsJson) : null);
    try {
      const row = await this.prisma.cleaningInventory.create({
        data: {
          organizationId,
          entity: body.entity,
          weekStart,
          itemsJson: items as unknown as Prisma.InputJsonValue,
          createdById: req.user.id,
          updatedById: req.user.id,
        },
        include: PEOPLE,
      });
      await this.audit(req, 'cleaning_inventory.create', row, { from: previous?.weekStart ?? null });
      return { ...this.shape(row, req.user), created: true };
    } catch (e) {
      // Dos personas abrieron la misma semana a la vez: gana la primera.
      if ((e as { code?: string })?.code === 'P2002') {
        const row = await this.prisma.cleaningInventory.findUnique({ where, include: PEOPLE });
        if (row) return { ...this.shape(row, req.user), created: false };
      }
      throw e;
    }
  }

  @Patch(':id')
  async update(@Req() req: Req_, @Param('id') id: string, @Body() body: UpdateInventoryDto) {
    const current = await this.load(req.user, id);
    this.assertEdit(req.user, current.entity as EntityKey);
    if (body.baseRevision !== undefined && body.baseRevision !== current.revision) {
      throw new ConflictException({
        message: `${current.updatedBy?.fullName || 'Alguien'} guardó esta semana mientras la editabas; recarga para ver sus cambios`,
        currentRevision: current.revision,
      });
    }
    const items: InventoryItem[] | null = body.items !== undefined ? sanitizeItems(body.items) : null;
    const data: Prisma.CleaningInventoryUncheckedUpdateManyInput = {
      revision: { increment: 1 },
      updatedById: req.user.id,
    };
    if (items) data.itemsJson = items as unknown as Prisma.InputJsonValue;
    if (body.responsible !== undefined) data.responsible = body.responsible?.trim() || null;
    if (body.notes !== undefined) data.notes = body.notes?.trim() || null;

    // La revisión va en el filtro: dos guardados simultáneos no se pisan.
    const res = await this.prisma.cleaningInventory.updateMany({ where: { id, revision: current.revision }, data });
    if (!res.count) {
      throw new ConflictException({ message: 'Otra persona guardó esta semana; recarga para ver sus cambios' });
    }
    const row = await this.prisma.cleaningInventory.findUniqueOrThrow({ where: { id }, include: PEOPLE });
    await this.audit(req, 'cleaning_inventory.update', row, {
      revision: row.revision,
      items: items ? items.length : undefined,
    });
    return this.shape(row, req.user);
  }

  /** PDF de la semana con la marca del Auditorio (mismo motor que los formatos). */
  @Post(':id/pdf')
  async pdf(@Req() req: Req_, @Param('id') id: string) {
    const row = await this.load(req.user, id);
    const items = sanitizeItems(row.itemsJson);
    const data = inventoryToFormat({ weekStart: row.weekStart, responsible: row.responsible, notes: row.notes, items });
    const { url } = await this.pdfs.generate(
      `inventario-limpieza-${row.weekStart}-${row.id.slice(-6)}`,
      {
        title: 'Inventario de limpieza semanal',
        eventName: weekLabel(row.weekStart),
        entity: row.entity,
        venue: 'Auditorio Arema Explanada',
        city: 'Puebla',
        data,
        delivered: null,
        authorized: null,
        editedBy: row.updatedBy?.fullName ?? null,
        editedAt: row.updatedAt,
        statusLabel: null,
        // Sin flujo de aprobación: el inventario no lleva la marca de agua BORRADOR.
        watermark: false,
        folio: `AUD-INV-${row.weekStart.replace(/-/g, '')}-V${row.revision}`,
      },
      row.revision,
    );
    await this.prisma.cleaningInventory.update({
      where: { id },
      data: { pdfUrl: url, pdfGeneratedAt: new Date() },
    });
    await this.audit(req, 'cleaning_inventory.pdf', row, { revision: row.revision });
    return { url };
  }

  /** Borrar una semana abierta por error: solo dirección, con bitácora. */
  @Delete(':id')
  async remove(@Req() req: Req_, @Param('id') id: string) {
    const row = await this.load(req.user, id);
    if (!isDirectionRole(req.user.roleKey)) throw new ForbiddenException('Solo dirección puede borrar una semana');
    await this.prisma.cleaningInventory.delete({ where: { id } });
    await this.audit(req, 'cleaning_inventory.delete', row, {
      responsible: row.responsible,
      items: sanitizeItems(row.itemsJson),
    });
    return { ok: true };
  }
}
