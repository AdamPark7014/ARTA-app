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
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { assertSameTenant } from '../common/tenant';
import { assertEventNotClosed } from '../common/event-guards';
import {
  canAccessEventOps,
  hasPermission,
  PERMISSIONS,
  type EntityKey,
  type RoleKey,
} from '../common/rbac/roles';

type AuthUser = {
  id: string;
  roleKey: string;
  entities: string[];
  permissions: string[];
  organizationId?: string | null;
};

class SponsorDto {
  @IsString() eventId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() tier?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsString() contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() contribution?: string;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() benefits?: string;
  @IsOptional() @IsString() deliverables?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsString() notes?: string;
}

function dateOrUndef(v?: string | null) {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

@Controller('sponsors')
@UseGuards(JwtAuthGuard)
export class SponsorsController {
  constructor(private prisma: PrismaService) {}

  private assertSponsorEdit(user: AuthUser) {
    if (
      !hasPermission(
        user.roleKey as RoleKey,
        user.permissions || [],
        PERMISSIONS.CHECKLIST_EDIT,
      )
    ) {
      throw new ForbiddenException('Sin permiso para editar patrocinadores');
    }
  }

  private sponsorData(body: Partial<SponsorDto>) {
    return {
      name: body.name,
      tier: body.tier,
      status: body.status,
      contact: body.contact,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      contribution: body.contribution,
      amount: body.amount,
      benefits: body.benefits,
      deliverables: body.deliverables,
      paymentTerms: body.paymentTerms,
      validFrom: dateOrUndef(body.validFrom),
      validUntil: dateOrUndef(body.validUntil),
      notes: body.notes,
    };
  }

  @Get('event/:eventId')
  async list(@Req() req: { user: AuthUser }, @Param('eventId') eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);
    return this.prisma.sponsor.findMany({
      where: { eventId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
  }

  @Post()
  async create(@Req() req: { user: AuthUser }, @Body() dto: SponsorDto) {
    this.assertSponsorEdit(req.user);
    const event = await this.prisma.event.findUnique({ where: { id: dto.eventId } });
    if (!event) throw new NotFoundException();
    if (!canAccessEventOps(req.user.entities as EntityKey[], req.user.roleKey as RoleKey, event.entity as EntityKey)) {
      throw new ForbiddenException();
    }
    assertSameTenant(req.user, event.organizationId);
    assertEventNotClosed(event.status);
    const data = this.sponsorData(dto);
    return this.prisma.sponsor.create({
      data: {
        eventId: dto.eventId,
        name: dto.name,
        tier: data.tier,
        status: data.status || 'PROPOSED',
        contact: data.contact,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        contribution: data.contribution,
        amount: data.amount,
        benefits: data.benefits,
        deliverables: data.deliverables,
        paymentTerms: data.paymentTerms,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        notes: data.notes,
        createdById: req.user.id,
      },
    });
  }

  @Patch(':id')
  async update(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() body: Partial<SponsorDto>,
  ) {
    this.assertSponsorEdit(req.user);
    const existing = await this.prisma.sponsor.findUnique({
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
    assertSameTenant(req.user, existing.event.organizationId);
    assertEventNotClosed(existing.event.status);
    const data = this.sponsorData(body);
    return this.prisma.sponsor.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.tier !== undefined ? { tier: body.tier } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.contact !== undefined ? { contact: body.contact } : {}),
        ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
        ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone } : {}),
        ...(body.contribution !== undefined ? { contribution: body.contribution } : {}),
        ...(body.amount !== undefined ? { amount: body.amount } : {}),
        ...(body.benefits !== undefined ? { benefits: body.benefits } : {}),
        ...(body.deliverables !== undefined ? { deliverables: body.deliverables } : {}),
        ...(body.paymentTerms !== undefined ? { paymentTerms: body.paymentTerms } : {}),
        ...(body.validFrom !== undefined ? { validFrom: data.validFrom ?? null } : {}),
        ...(body.validUntil !== undefined ? { validUntil: data.validUntil ?? null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });
  }

  @Delete(':id')
  async remove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    this.assertSponsorEdit(req.user);
    const existing = await this.prisma.sponsor.findUnique({
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
    assertSameTenant(req.user, existing.event.organizationId);
    assertEventNotClosed(existing.event.status);
    await this.prisma.sponsor.delete({ where: { id } });
    return { ok: true };
  }
}
