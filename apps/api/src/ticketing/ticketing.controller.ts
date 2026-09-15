import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  BadRequestException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import {
  canAccessEventOps,
  eventOpsEntities,
  hasPermission,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';
import { TicketingSyncService } from './ticketing-sync.service';
import { ChecklistPdfService } from '../checklists/checklist-pdf.service';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

/** Campos comunes a crear y editar. `null` en PATCH limpia el valor. */
class TicketingFieldsDto {
  @IsOptional() @IsString() logoUrl?: string | null;
  @IsOptional() @IsString() holdUntil?: string | null;
  @IsOptional() @IsString() artist?: string | null;
  @IsOptional() @IsString() promoter?: string | null;
  @IsOptional() @IsString() venue?: string | null;
  @IsOptional() zonesJson?: unknown;
  @IsOptional() @IsString() notes?: string | null;
  /** Junta 11-09-2026 — «Creación de boletera». */
  @IsOptional() @IsString() @MaxLength(2048) artsUrl?: string | null;
  @IsOptional() @IsString() @MaxLength(200) dateLabel?: string | null;
  @IsOptional() @IsString() @MaxLength(200) schedule?: string | null;
  @IsOptional() @IsString() @MaxLength(8000) description?: string | null;
  @IsOptional() @IsInt() @Min(0) functions?: number | null;
  @IsOptional() @IsInt() @Min(0) holdArtist?: number | null;
  @IsOptional() @IsInt() @Min(0) holdPromoter?: number | null;
  @IsOptional() @IsInt() @Min(0) holdVenue?: number | null;
}

class TicketingDto extends TicketingFieldsDto {
  @IsString() boletera!: string;
}

class TicketingPatchDto extends TicketingFieldsDto {
  @IsOptional() @IsString() boletera?: string;
}

type ZoneRow = Record<string, unknown> & { zona: string; aforo: number; precio: number; sold: number };

/** '' y espacios → null; `undefined` se queda `undefined` (no tocar). */
function cleanText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const t = value.trim();
  return t ? t : null;
}

function positive(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Zonas limpias. Si una zona llega sin `sold` (lo llena la integración, no el
 * formulario), se conserva el de la zona con el mismo nombre que ya existía.
 */
function normalizeZones(raw: unknown, previous?: unknown): ZoneRow[] {
  if (!Array.isArray(raw)) throw new BadRequestException('Zonas inválidas');
  const soldByName = new Map<string, number>();
  if (Array.isArray(previous)) {
    for (const row of previous) {
      if (row && typeof row === 'object') {
        const r = row as Record<string, unknown>;
        soldByName.set(String(r.zona ?? '').trim().toLowerCase(), positive(r.sold));
      }
    }
  }
  return raw
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map((row) => {
      const zona = String(row.zona ?? '').trim();
      const sold =
        row.sold === undefined || row.sold === null
          ? (soldByName.get(zona.toLowerCase()) ?? 0)
          : positive(row.sold);
      return {
        ...row,
        zona,
        aforo: Math.round(positive(row.aforo)),
        precio: positive(row.precio),
        sold: Math.round(sold),
      };
    })
    .filter((row) => row.zona.length > 0);
}

@Controller('ticketing')
@UseGuards(JwtAuthGuard)
export class TicketingController {
  constructor(
    private prisma: PrismaService,
    private sync: TicketingSyncService,
    private checklistPdfs: ChecklistPdfService,
  ) {}

  private assertEdit(user: AuthUser) {
    if (!hasPermission(user.roleKey as RoleKey, user.permissions, PERMISSIONS.TICKETING_EDIT)) {
      throw new ForbiddenException();
    }
  }

  @Get()
  async list(@Req() req: { user: AuthUser }) {
    const allowed = eventOpsEntities(req.user.entities as EntityKey[], req.user.roleKey as RoleKey);
    if (!allowed.length) return [];
    return this.prisma.ticketingSetup.findMany({
      where: { event: { entity: { in: allowed }, organizationId: tenantIdOf(req.user) } },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            entity: true,
            artist: true,
            promoter: true,
            venue: true,
            city: true,
            startsAt: true,
            endsAt: true,
            schedule: true,
            functions: true,
            description: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Post('sync')
  async syncSold(@Req() req: { user: AuthUser }) {
    this.assertEdit(req.user);
    return this.sync.syncAll(tenantIdOf(req.user));
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    assertSameTenant(req.user, event.organizationId);
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    return this.prisma.ticketingSetup.findMany({
      where: { eventId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Post('event/:eventId')
  async create(
    @Req() req: { user: AuthUser },
    @Param('eventId') eventId: string,
    @Body() dto: TicketingDto,
  ) {
    this.assertEdit(req.user);
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    assertSameTenant(req.user, event.organizationId);
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertEventNotClosed(event.status);

    const zones =
      dto.zonesJson !== undefined && dto.zonesJson !== null
        ? normalizeZones(dto.zonesJson)
        : [
            { zona: 'Diamante', aforo: 0, precio: 0, sold: 0 },
            { zona: 'Oro', aforo: 0, precio: 0, sold: 0 },
            { zona: 'Plata', aforo: 0, precio: 0, sold: 0 },
            { zona: 'Bronce', aforo: 0, precio: 0, sold: 0 },
          ];

    const boletera = dto.boletera.trim();
    if (!boletera || boletera.toLowerCase() === 'otra') {
      throw new BadRequestException('Indica el nombre de la boletera');
    }

    const created = await this.prisma.ticketingSetup.create({
      data: {
        eventId,
        boletera,
        logoUrl: dto.logoUrl || undefined,
        holdUntil: dto.holdUntil ? new Date(dto.holdUntil) : undefined,
        artist: cleanText(dto.artist) ?? event.artist,
        promoter: cleanText(dto.promoter) ?? event.promoter,
        venue: cleanText(dto.venue) ?? event.venue,
        zonesJson: zones as object,
        notes: cleanText(dto.notes),
        artsUrl: cleanText(dto.artsUrl),
        dateLabel: cleanText(dto.dateLabel),
        // Del evento cuando no vienen; `null` explícito se respeta.
        schedule: dto.schedule !== undefined ? cleanText(dto.schedule) : event.schedule,
        description: dto.description !== undefined ? cleanText(dto.description) : event.description,
        functions: dto.functions !== undefined ? dto.functions : event.functions,
        holdArtist: dto.holdArtist ?? null,
        holdPromoter: dto.holdPromoter ?? null,
        holdVenue: dto.holdVenue ?? null,
      },
    });
    await this.checklistPdfs.regenerateForEvent(eventId);
    return created;
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: TicketingPatchDto,
  ) {
    this.assertEdit(req.user);
    const existing = await this.prisma.ticketingSetup.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new NotFoundException();
    assertSameTenant(req.user, existing.event.organizationId);
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        existing.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    assertEventNotClosed(existing.event.status);
    if (dto.boletera !== undefined) {
      const boletera = dto.boletera.trim();
      if (!boletera || boletera.toLowerCase() === 'otra') {
        throw new BadRequestException('Indica el nombre de la boletera');
      }
    }

    const updated = await this.prisma.ticketingSetup.update({
      where: { id },
      data: {
        boletera: dto.boletera?.trim(),
        logoUrl: dto.logoUrl === '' || dto.logoUrl === null ? null : dto.logoUrl,
        holdUntil: dto.holdUntil === null || dto.holdUntil === '' ? null : dto.holdUntil ? new Date(dto.holdUntil) : undefined,
        artist: cleanText(dto.artist),
        promoter: cleanText(dto.promoter),
        venue: cleanText(dto.venue),
        zonesJson:
          dto.zonesJson !== undefined && dto.zonesJson !== null
            ? (normalizeZones(dto.zonesJson, existing.zonesJson) as object)
            : undefined,
        notes: cleanText(dto.notes),
        artsUrl: cleanText(dto.artsUrl),
        dateLabel: cleanText(dto.dateLabel),
        schedule: cleanText(dto.schedule),
        description: cleanText(dto.description),
        functions: dto.functions,
        holdArtist: dto.holdArtist,
        holdPromoter: dto.holdPromoter,
        holdVenue: dto.holdVenue,
      },
    });
    await this.checklistPdfs.regenerateForEvent(existing.eventId);
    return updated;
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.assertEdit(req.user);
    const existing = await this.prisma.ticketingSetup.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new NotFoundException();
    assertSameTenant(req.user, existing.event.organizationId);
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        existing.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    assertEventNotClosed(existing.event.status);
    await this.prisma.ticketingSetup.delete({ where: { id } });
    return { ok: true };
  }
}
