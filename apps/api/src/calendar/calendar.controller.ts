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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant, tenantIdOf } from '../common/tenant';
import { canAccessEventOps, type EntityKey, type RoleKey } from '../common/rbac/roles';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  fullName: string;
  organizationId?: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class CreateNoteDto {
  @IsString()
  entity!: EntityKey;

  @IsString()
  date!: string;

  @IsString()
  @MaxLength(500)
  text!: string;
}

class UpdateNoteDto {
  @IsString()
  @MaxLength(500)
  text!: string;
}

const NOTE_INCLUDE = {
  createdBy: { select: { id: true, fullName: true } },
  updatedBy: { select: { id: true, fullName: true } },
} as const;

/**
 * Notas libres del equipo sobre el calendario.
 *
 * Pedido de Adam (27-09-2026): «que el equipo pueda escribir sobre el
 * calendario». No es una tarea ni un show: es texto corto que cualquiera con
 * acceso a la entidad puede dejar en un día y que todo el equipo ve y puede
 * editar entre sí — un recordatorio compartido, no un pendiente con flujo de
 * aprobación (eso ya lo cubre Tareas).
 */
@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private prisma: PrismaService) {}

  private assertEntity(user: AuthUser, entity: EntityKey) {
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, entity)) {
      throw new ForbiddenException(`Sin acceso a ${entity}`);
    }
  }

  private assertDate(date: string) {
    if (!DATE_RE.test(date)) throw new BadRequestException('Fecha inválida (usa AAAA-MM-DD)');
  }

  /** Notas de un mes (o del rango `from`/`to` si se dan) para una entidad. */
  @Get('notes')
  async list(
    @Req() req: { user: AuthUser },
    @Query('entity') entity: EntityKey,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!entity) throw new BadRequestException('Falta la entidad');
    this.assertEntity(req.user, entity);
    const where: { organizationId: string; entity: EntityKey; date?: { gte?: string; lte?: string } } = {
      organizationId: tenantIdOf(req.user),
      entity,
    };
    if (from || to) {
      if (from) this.assertDate(from);
      if (to) this.assertDate(to);
      where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }
    return this.prisma.calendarNote.findMany({
      where,
      include: NOTE_INCLUDE,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
  }

  @Post('notes')
  async create(@Req() req: { user: AuthUser }, @Body() body: CreateNoteDto) {
    this.assertEntity(req.user, body.entity);
    this.assertDate(body.date);
    const text = body.text.trim();
    if (!text) throw new BadRequestException('La nota no puede quedar vacía');
    return this.prisma.calendarNote.create({
      data: {
        organizationId: tenantIdOf(req.user),
        entity: body.entity,
        date: body.date,
        text,
        createdById: req.user.id,
        updatedById: req.user.id,
      },
      include: NOTE_INCLUDE,
    });
  }

  private async findOwn(req: { user: AuthUser }, id: string) {
    const note = await this.prisma.calendarNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Nota no encontrada');
    assertSameTenant(req.user, note.organizationId);
    this.assertEntity(req.user, note.entity as EntityKey);
    return note;
  }

  @Patch('notes/:id')
  async update(@Req() req: { user: AuthUser }, @Param('id') id: string, @Body() body: UpdateNoteDto) {
    await this.findOwn(req, id);
    const text = body.text.trim();
    if (!text) throw new BadRequestException('La nota no puede quedar vacía');
    return this.prisma.calendarNote.update({
      where: { id },
      data: { text, updatedById: req.user.id },
      include: NOTE_INCLUDE,
    });
  }

  @Delete('notes/:id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    await this.findOwn(req, id);
    await this.prisma.calendarNote.delete({ where: { id } });
    return { ok: true };
  }
}
