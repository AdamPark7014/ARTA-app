import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma/prisma.service';
import { canSeeTeamLocation, isLocationTracked, LOCATION_EXEMPT_ROLES } from '../common/rbac/roles';
import { tenantIdOf } from '../common/tenant';
import {
  ANTIGUEDAD_MAXIMA_MS,
  CADENCIA_MINUTOS,
  diaDe,
  enHorario,
  esDiaValido,
  estadoDePersona,
  HORA_FIN,
  HORA_INICIO,
  limitesDelDia,
  puntosAGuardar,
  UBICACION_TZ,
} from './horario';

type AuthUser = {
  id: string;
  roleKey: string;
  organizationId?: string | null;
};

class PuntoDto {
  @IsNumber() @Min(-90) @Max(90) lat!: number;
  @IsNumber() @Min(-180) @Max(180) lng!: number;
  @IsOptional() @IsNumber() @Min(0) accuracyM?: number;
  @IsDateString() capturedAt!: string;
}

class PuntosDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PuntoDto)
  points!: PuntoDto[];

  @IsOptional() @IsIn(['ios', 'android']) platform?: string;
}

class EstadoDto {
  @IsIn(['ok', 'sin_permiso', 'apagada']) state!: string;
}

/**
 * Ubicación del equipo en las apps, de 10:00 a 18:00 (docs/UBICACION.md). Se mide a todos menos a
 * Chacho y Arturo, que son los únicos que la ven. El candado del horario y de quién se mide vive
 * aquí, no en el teléfono.
 */
@Controller('ubicacion')
@UseGuards(JwtAuthGuard)
export class UbicacionController {
  constructor(private readonly prisma: PrismaService) {}

  private assertMedible(user: AuthUser) {
    if (!isLocationTracked(user.roleKey)) {
      throw new ForbiddenException('Tu ubicación no se registra');
    }
  }

  private assertDireccion(user: AuthUser) {
    if (!canSeeTeamLocation(user.roleKey)) {
      throw new ForbiddenException('La ubicación del equipo solo la ve dirección general');
    }
  }

  /** Lo que la app pregunta al abrir: si le toca medir, en qué horario y si la persona ya aceptó. */
  @Get('estado')
  async estado(@Req() req: { user: AuthUser }) {
    const row = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { locationConsentAt: true },
    });
    const ahora = new Date();
    return {
      tracked: isLocationTracked(req.user.roleKey),
      consentAt: row?.locationConsentAt ?? null,
      inWindow: enHorario(ahora),
      startHour: HORA_INICIO,
      endHour: HORA_FIN,
      timeZone: UBICACION_TZ,
      intervalMinutes: CADENCIA_MINUTOS,
      serverTime: ahora,
    };
  }

  /** La persona leyó de qué se trata y aceptó. Sin esto la app no mide. */
  @Post('consentimiento')
  async consentimiento(@Req() req: { user: AuthUser }) {
    this.assertMedible(req.user);
    const updated = await this.prisma.user.update({
      where: { id: req.user.id },
      data: { locationConsentAt: new Date() },
      select: { locationConsentAt: true },
    });
    return { consentAt: updated.locationConsentAt };
  }

  /** Permiso negado o GPS apagado: dirección ve el motivo en vez de un hueco sin explicación. */
  @Post('estado')
  async guardarEstado(@Req() req: { user: AuthUser }, @Body() dto: EstadoDto) {
    this.assertMedible(req.user);
    await this.prisma.user.update({
      where: { id: req.user.id },
      data: { locationState: dto.state, locationStateAt: new Date() },
    });
    return { ok: true };
  }

  @Post('puntos')
  async puntos(@Req() req: { user: AuthUser }, @Body() dto: PuntosDto) {
    this.assertMedible(req.user);
    const ahora = new Date();
    const previos = await this.prisma.locationPoint.findMany({
      where: { userId: req.user.id, capturedAt: { gte: new Date(ahora.getTime() - 2 * ANTIGUEDAD_MAXIMA_MS) } },
      select: { capturedAt: true },
    });
    const validos = puntosAGuardar(
      dto.points,
      previos.map((p) => p.capturedAt),
      ahora,
    );
    if (validos.length) {
      await this.prisma.locationPoint.createMany({
        data: validos.map((p) => ({ ...p, userId: req.user.id, platform: dto.platform ?? null })),
      });
      // Si llegó un punto, el permiso y el GPS funcionan.
      await this.prisma.user.update({
        where: { id: req.user.id },
        data: { locationState: 'ok', locationStateAt: ahora },
      });
    }
    return { saved: validos.length, ignored: dto.points.length - validos.length };
  }

  /** Quién está dónde en un día: una fila por persona con su último punto y su estado. */
  @Get('equipo')
  async equipo(@Req() req: { user: AuthUser }, @Query('date') date?: string) {
    this.assertDireccion(req.user);
    const ahora = new Date();
    const dia = date || diaDe(ahora);
    if (!esDiaValido(dia)) throw new BadRequestException('Fecha inválida');
    const { desde, hasta } = limitesDelDia(dia);
    const personas = await this.prisma.user.findMany({
      where: {
        organizationId: tenantIdOf(req.user),
        active: true,
        roleKey: { notIn: [...LOCATION_EXEMPT_ROLES] },
      },
      select: {
        id: true,
        fullName: true,
        title: true,
        roleKey: true,
        locationConsentAt: true,
        locationState: true,
        locationStateAt: true,
      },
      orderBy: { fullName: 'asc' },
    });
    const puntos = await this.prisma.locationPoint.findMany({
      where: { userId: { in: personas.map((p) => p.id) }, capturedAt: { gte: desde, lt: hasta } },
      orderBy: { capturedAt: 'asc' },
      select: { userId: true, lat: true, lng: true, accuracyM: true, capturedAt: true },
    });
    const porPersona = new Map<string, typeof puntos>();
    for (const p of puntos) porPersona.set(p.userId, [...(porPersona.get(p.userId) ?? []), p]);
    return {
      date: dia,
      inWindow: enHorario(ahora),
      startHour: HORA_INICIO,
      endHour: HORA_FIN,
      people: personas.map((p) => {
        const suyos = porPersona.get(p.id) ?? [];
        const ultimo = suyos[suyos.length - 1] ?? null;
        return {
          id: p.id,
          fullName: p.fullName,
          title: p.title,
          roleKey: p.roleKey,
          consentAt: p.locationConsentAt,
          stateAt: p.locationStateAt,
          status: estadoDePersona({
            consentAt: p.locationConsentAt,
            state: p.locationState,
            ultimoPunto: ultimo?.capturedAt ?? null,
            dia,
            ahora,
          }),
          count: suyos.length,
          last: ultimo && { lat: ultimo.lat, lng: ultimo.lng, accuracyM: ultimo.accuracyM, capturedAt: ultimo.capturedAt },
        };
      }),
    };
  }

  /** El recorrido de una persona en un día. Queda en la auditoría quién lo abrió. */
  @Get('persona/:id')
  async persona(@Req() req: { user: AuthUser }, @Param('id') id: string, @Query('date') date?: string) {
    this.assertDireccion(req.user);
    const dia = date || diaDe(new Date());
    if (!esDiaValido(dia)) throw new BadRequestException('Fecha inválida');
    const persona = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, fullName: true, title: true, roleKey: true, organizationId: true },
    });
    if (!persona || persona.organizationId !== tenantIdOf(req.user) || !isLocationTracked(persona.roleKey)) {
      throw new NotFoundException('Persona no encontrada');
    }
    const { desde, hasta } = limitesDelDia(dia);
    const points = await this.prisma.locationPoint.findMany({
      where: { userId: id, capturedAt: { gte: desde, lt: hasta } },
      orderBy: { capturedAt: 'asc' },
      select: { id: true, lat: true, lng: true, accuracyM: true, capturedAt: true, platform: true },
    });
    await this.prisma.auditLog.create({
      data: {
        userId: req.user.id,
        organizationId: persona.organizationId,
        action: 'ubicacion.view',
        resource: 'User',
        resourceId: id,
        metaJson: { date: dia },
      },
    });
    return { date: dia, person: { id: persona.id, fullName: persona.fullName, title: persona.title }, points };
  }
}
