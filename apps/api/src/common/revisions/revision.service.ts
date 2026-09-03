import { ConflictException, Injectable } from '@nestjs/common';
import { DocStatus, DocType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DocDiff } from '../doc-diff';

/**
 * Historial de documentos: una revisión por guardado explícito o por cambio de
 * estado. **El autoguardado NO crea revisión** — escribe el documento y sube el
 * contador, pero no deja snapshot. Si snapshoteara cada tecleo, la tabla
 * crecería sola y el historial sería ilegible.
 *
 * Nadie escribe `DocRevision` directamente: todo pasa por aquí, que es lo que
 * sostiene la integridad de una tabla polimórfica sin FK hacia cada documento.
 */

export type RevisionActor = {
  id: string;
  ip?: string | null;
  userAgent?: string | null;
};

export type RecordRevisionInput = {
  organizationId: string;
  eventId: string;
  docType: DocType;
  docId: string;
  /** El número que acaba de asignar el UPDATE atómico del documento. */
  revision: number;
  snapshotJson?: unknown;
  diff?: DocDiff | null;
  fileUrl?: string | null;
  fileHash?: string | null;
  sizeBytes?: number | null;
  fromStatus?: DocStatus | null;
  toStatus?: DocStatus | null;
  note?: string | null;
  actor: RevisionActor;
};

/** Cliente Prisma o transacción: la revisión se escribe con el mismo. */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * Choque de edición concurrente.
 *
 * Devuelve 409 con lo necesario para que la persona decida sin perder lo
 * tecleado: en qué revisión va el servidor, qué cambió mientras tanto, y el
 * contenido de la otra versión.
 */
export class RevisionConflictException extends ConflictException {
  constructor(payload: { currentRevision: number; diff: DocDiff | null; theirs?: unknown; author?: string | null }) {
    super({
      code: 'REVISION_CONFLICT',
      message: payload.author
        ? `${payload.author} guardó cambios mientras editabas`
        : 'Alguien guardó cambios mientras editabas',
      ...payload,
    });
  }
}

@Injectable()
export class RevisionService {
  constructor(private prisma: PrismaService) {}

  /**
   * Guarda la revisión. `db` permite escribirla dentro de la transacción que
   * actualizó el documento, para que no exista una sin el otro.
   */
  async record(input: RecordRevisionInput, db: Db = this.prisma) {
    return db.docRevision.create({
      data: {
        organizationId: input.organizationId,
        eventId: input.eventId,
        docType: input.docType,
        docId: input.docId,
        revision: input.revision,
        snapshotJson: (input.snapshotJson ?? undefined) as Prisma.InputJsonValue | undefined,
        diffJson: (input.diff ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        fileUrl: input.fileUrl ?? undefined,
        fileHash: input.fileHash ?? undefined,
        sizeBytes: input.sizeBytes ?? undefined,
        fromStatus: input.fromStatus ?? undefined,
        toStatus: input.toStatus ?? undefined,
        note: input.note ?? undefined,
        authorId: input.actor.id,
        ip: input.actor.ip ?? undefined,
        userAgent: input.actor.userAgent?.slice(0, 300) ?? undefined,
      },
    });
  }

  /** Historial de un documento, del más reciente al más antiguo. */
  history(docType: DocType, docId: string, take = 40) {
    return this.prisma.docRevision.findMany({
      where: { docType, docId },
      orderBy: { revision: 'desc' },
      take,
      select: {
        id: true,
        revision: true,
        diffJson: true,
        note: true,
        fromStatus: true,
        toStatus: true,
        fileUrl: true,
        sizeBytes: true,
        createdAt: true,
        author: { select: { id: true, fullName: true } },
      },
    });
  }

  /** Una revisión concreta, con su snapshot, para comparar dos versiones. */
  one(docType: DocType, docId: string, revision: number) {
    return this.prisma.docRevision.findUnique({
      where: { docType_docId_revision: { docType, docId, revision } },
      include: { author: { select: { id: true, fullName: true } } },
    });
  }
}

/** Datos del actor a partir de la petición, para no repetirlo en cada endpoint. */
export function actorFrom(req: {
  user: { id: string };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): RevisionActor {
  const ua = req.headers?.['user-agent'];
  return {
    id: req.user.id,
    ip: req.ip ?? null,
    userAgent: Array.isArray(ua) ? ua[0] : (ua ?? null),
  };
}
