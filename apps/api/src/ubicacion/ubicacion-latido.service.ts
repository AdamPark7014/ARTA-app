import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { LOCATION_EXEMPT_ROLES } from '../common/rbac/roles';
import { PushDispatchService } from '../devices/push-dispatch.service';
import { enHorario, LATIDO_SIN_PUNTO_MS, RECORDATORIO_IOS_MS, RETENCION_MS } from './horario';

/**
 * Pide un punto a quien lleva más de 35 minutos sin mandar uno dentro del horario. Android mide con
 * un push de datos, sin molestar. iOS sin «Siempre» no puede medir con la app cerrada (Apple rechazó
 * el modo de fondo en NEXARA por 2.5.4), así que recibe un recordatorio visible, a lo más uno por hora.
 *
 * El registro vive en memoria: si el API se reinicia, a lo más se repite uno.
 */
@Injectable()
export class UbicacionLatidoService {
  private readonly logger = new Logger(UbicacionLatidoService.name);
  private readonly ultimoRecordatorio = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly push?: PushDispatchService,
  ) {}

  @Cron('*/5 * * * *', { name: 'ubicacion-latido' })
  async revisar(): Promise<void> {
    try {
      const enviados = await this.revisarAhora(new Date());
      if (enviados) this.logger.log(`Latidos de ubicación: ${enviados}`);
    } catch (error) {
      this.logger.warn(`Latido de ubicación falló: ${String(error)}`);
    }
  }

  /** Separado del cron para probarlo con una hora fija. */
  async revisarAhora(ahora: Date): Promise<number> {
    if (!this.push || !enHorario(ahora)) return 0;
    const personas = await this.prisma.user.findMany({
      where: {
        active: true,
        locationConsentAt: { not: null },
        roleKey: { notIn: [...LOCATION_EXEMPT_ROLES] },
      },
      select: { id: true },
    });
    if (!personas.length) return 0;
    const ids = personas.map((p) => p.id);
    const puntos = await this.prisma.locationPoint.groupBy({
      by: ['userId'],
      where: { userId: { in: ids }, capturedAt: { gte: new Date(ahora.getTime() - LATIDO_SIN_PUNTO_MS) } },
    });
    const conPunto = new Set(puntos.map((p) => p.userId));
    let enviados = 0;
    for (const id of ids) {
      if (conPunto.has(id)) continue;
      const previo = this.ultimoRecordatorio.get(id) ?? 0;
      const recordatorio = ahora.getTime() - previo >= RECORDATORIO_IOS_MS;
      const n = await this.push.sendLocationPing(id, recordatorio);
      if (recordatorio && n > 0) this.ultimoRecordatorio.set(id, ahora.getTime());
      enviados += n > 0 ? 1 : 0;
    }
    return enviados;
  }

  /** Es dato personal: pasados 90 días se borra solo. */
  @Cron('20 3 * * *', { name: 'ubicacion-retencion' })
  async purgar(): Promise<void> {
    try {
      const { count } = await this.prisma.locationPoint.deleteMany({
        where: { capturedAt: { lt: new Date(Date.now() - RETENCION_MS) } },
      });
      if (count) this.logger.log(`Puntos de ubicación vencidos borrados: ${count}`);
    } catch (error) {
      this.logger.warn(`Limpieza de ubicación falló: ${String(error)}`);
    }
  }
}
