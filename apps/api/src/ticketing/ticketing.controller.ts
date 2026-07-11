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
import { IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  canAccessEventOps,
  eventOpsEntities,
  hasPermission,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';

type AuthUser = { id: string; roleKey: string; entities: string[]; permissions: string[] };

class TicketingDto {
  @IsString() boletera!: string;
  @IsOptional() @IsString() holdUntil?: string;
  @IsOptional() @IsString() artist?: string;
  @IsOptional() @IsString() promoter?: string;
  @IsOptional() @IsString() venue?: string;
  @IsOptional() zonesJson?: unknown;
  @IsOptional() @IsString() notes?: string;
}

@Controller('ticketing')
@UseGuards(JwtAuthGuard)
export class TicketingController {
  constructor(private prisma: PrismaService) {}

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
      where: { event: { entity: { in: allowed } } },
      include: { event: { select: { id: true, name: true, entity: true, artist: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
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
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }

    const zones =
      dto.zonesJson ??
      [
        { zona: 'Diamante', aforo: 0, precio: 0 },
        { zona: 'Oro', aforo: 0, precio: 0 },
        { zona: 'Plata', aforo: 0, precio: 0 },
        { zona: 'Bronce', aforo: 0, precio: 0 },
      ];

    return this.prisma.ticketingSetup.create({
      data: {
        eventId,
        boletera: dto.boletera,
        holdUntil: dto.holdUntil ? new Date(dto.holdUntil) : undefined,
        artist: dto.artist ?? event.artist,
        promoter: dto.promoter ?? event.promoter,
        venue: dto.venue ?? event.venue,
        zonesJson: zones as object,
        notes: dto.notes,
      },
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: Partial<TicketingDto>,
  ) {
    this.assertEdit(req.user);
    const existing = await this.prisma.ticketingSetup.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new NotFoundException();
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        existing.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.ticketingSetup.update({
      where: { id },
      data: {
        boletera: dto.boletera,
        holdUntil: dto.holdUntil === null || dto.holdUntil === '' ? null : dto.holdUntil ? new Date(dto.holdUntil) : undefined,
        artist: dto.artist,
        promoter: dto.promoter,
        venue: dto.venue,
        zonesJson: dto.zonesJson as object | undefined,
        notes: dto.notes,
      },
    });
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.assertEdit(req.user);
    const existing = await this.prisma.ticketingSetup.findUnique({
      where: { id },
      include: { event: true },
    });
    if (!existing) throw new NotFoundException();
    if (
      !canAccessEventOps(
        req.user.entities as EntityKey[],
        req.user.roleKey as RoleKey,
        existing.event.entity as EntityKey,
      )
    ) {
      throw new ForbiddenException();
    }
    await this.prisma.ticketingSetup.delete({ where: { id } });
    return { ok: true };
  }
}
