import { Injectable, Logger } from '@nestjs/common';
import { EntityKey } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

export type NotifyInput = {
  /** Destinatario. Si es el propio actor, no se crea nada. */
  userId: string;
  organizationId?: string | null;
  /** task.assigned | task.reassigned | task.unassigned | task.done | task.reopened */
  type: string;
  title: string;
  body?: string | null;
  /** Ruta interna del panel, p. ej. /tasks o /events/<id>?tab=tasks */
  linkUrl?: string | null;
  actorId?: string | null;
  entity?: EntityKey | null;
};

/**
 * Avisos dentro de la plataforma (junta 2026-08-28: "la persona a quien se le
 * asigne una tarea deberá recibir una notificación dentro de la plataforma").
 *
 * Nunca lanza: un aviso que falla no puede tumbar la operación que lo originó.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService) {}

  async notify(input: NotifyInput) {
    if (!input.userId) return null;
    // No te avisas a ti mismo de lo que tú acabas de hacer.
    if (input.actorId && input.actorId === input.userId) return null;
    try {
      return await this.prisma.notification.create({
        data: {
          userId: input.userId,
          organizationId: input.organizationId || undefined,
          type: input.type,
          title: input.title,
          body: input.body || undefined,
          linkUrl: input.linkUrl || undefined,
          actorId: input.actorId || undefined,
          entity: input.entity || undefined,
        },
      });
    } catch (err) {
      this.logger.warn(`No se pudo crear la notificación ${input.type}: ${String(err)}`);
      return null;
    }
  }

  async notifyMany(inputs: NotifyInput[]) {
    return Promise.all(inputs.map((i) => this.notify(i)));
  }
}
