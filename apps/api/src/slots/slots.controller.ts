import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { canAccessEventOps, isDirectionRole, type EntityKey, type RoleKey } from '../common/rbac/roles';
import { assertSameTenant } from '../common/tenant';
import { extname } from 'path';
import { DirectionService } from '../common/rbac/direction.service';

type AuthUser = { id: string; roleKey: string; permissions: string[]; entities: string[]; organizationId?: string | null };

@Controller('slots')
@UseGuards(JwtAuthGuard)
export class SlotsController {
  constructor(private prisma: PrismaService, private dirService: DirectionService) {}

  private async assertEvent(user: AuthUser, eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new BadRequestException('Evento no encontrado');
    assertSameTenant(user, event.organizationId);
    if (!canAccessEventOps(user.entities as EntityKey[], user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    return event;
  }

  @Get('event/:eventId')
  async byEvent(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.assertEvent(req.user, eventId);
    return this.prisma.eventDocumentSlot.findMany({ where: { eventId: event.id } });
  }

  /**
   * Marca un slot como «Reemplazado por documento externo». Reglas:
   * - CHECKLIST: archivo .docx
   * - CAMPAÑA/CORRIDA: archivo .xlsx/.xls
   * - PENDONES/OC/BOLETERA: .pdf o el tipo que use cada módulo (se acepta cualquiera por ahora)
   */
  @Post('event/:eventId/replace')
  async replace(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('eventId') eventId: string,
    @Body()
    body: {
      kind: 'CHECKLIST' | 'CAMPAIGN' | 'CORRIDA' | 'PENDONES' | 'OC' | 'BOLETERA';
      checklistTemplateId?: string | null;
      fileId: string;
      note?: string;
    },
  ) {
    const event = await this.assertEvent(req.user, eventId);
    const file = await this.prisma.eventFile.findUnique({ where: { id: body.fileId } });
    if (!file || file.eventId !== event.id) throw new BadRequestException('Archivo no encontrado en el evento');
    const ext = extname(file.fileName).toLowerCase();
    if (body.kind === 'CHECKLIST' && ext !== '.docx') throw new BadRequestException('Un checklist se reemplaza con .docx');
    if ((body.kind === 'CAMPAIGN' || body.kind === 'CORRIDA') && !['.xlsx', '.xls'].includes(ext))
      throw new BadRequestException('Campaña/Corrida se reemplaza con Excel');

    const slot = await this.prisma.eventDocumentSlot.upsert({
      where: {
        eventId_kind_checklistTemplateId: {
          eventId: event.id,
          kind: body.kind,
          checklistTemplateId: body.checklistTemplateId ?? undefined,
        } as never,
      },
      create: {
        eventId: event.id,
        kind: body.kind,
        checklistTemplateId: body.checklistTemplateId ?? null,
        status: 'REPLACED',
        replacedByFileId: file.id,
        replacedById: req.user.id,
        replacedAt: new Date(),
        note: body.note,
      },
      update: {
        status: 'REPLACED',
        replacedByFileId: file.id,
        replacedById: req.user.id,
        replacedAt: new Date(),
        note: body.note,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: event.organizationId,
        action: 'slot.replace',
        resource: 'Event',
        resourceId: event.id,
        metaJson: { kind: body.kind, checklistTemplateId: body.checklistTemplateId || null, fileId: file.id, fileName: file.fileName },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });
    return slot;
  }

  /** Restaurar generación interna (dirección únicamente). */
  @Post('event/:eventId/restore')
  async restore(
    @Req() req: { user: AuthUser; ip?: string; headers?: Record<string, string> },
    @Param('eventId') eventId: string,
    @Body() body: { kind: 'CHECKLIST' | 'CAMPAIGN' | 'CORRIDA' | 'PENDONES' | 'OC' | 'BOLETERA'; checklistTemplateId?: string | null; note?: string },
  ) {
    const event = await this.assertEvent(req.user, eventId);
    const ok = await this.dirService.isDirection(req.user, event.organizationId ?? req.user.organizationId ?? null);
    if (!ok) throw new ForbiddenException('Solo dirección restaura internos');
    const slot = await this.prisma.eventDocumentSlot.upsert({
      where: {
        eventId_kind_checklistTemplateId: {
          eventId: event.id,
          kind: body.kind,
          checklistTemplateId: body.checklistTemplateId ?? undefined,
        } as never,
      },
      create: {
        eventId: event.id,
        kind: body.kind,
        checklistTemplateId: body.checklistTemplateId ?? null,
        status: 'INTERNAL',
      },
      update: {
        status: 'INTERNAL',
        replacedByFileId: null,
        replacedById: null,
        replacedAt: null,
        note: null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: event.organizationId,
        action: 'slot.restore',
        resource: 'Event',
        resourceId: event.id,
        metaJson: { kind: body.kind, checklistTemplateId: body.checklistTemplateId || null, note: body.note || null },
        ip: req.ip,
        userAgent: req.headers?.['user-agent']?.slice(0, 300),
      },
    });
    return slot;
  }
}

