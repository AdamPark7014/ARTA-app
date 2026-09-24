import type { Prisma } from '@prisma/client';

/**
 * Qué formatos de un evento se enseñan.
 *
 * Al retirar las plantillas que duplicaban un módulo (Orden de compra,
 * Boletera, Corrida, Campaña, Anticipos) quedaron en cada evento sus formatos
 * vacíos, creados en el alta: la lista decía «13 formatos» y la mitad eran
 * casillas sin sentido. Un formato de plantilla retirada se sigue enseñando
 * solo si alguien lo empezó: avance, estado distinto de borrador, firma o
 * adjuntos. Lo vacío se oculta; no se borra, por si la plantilla se reactiva.
 */
export const VISIBLE_CHECKLIST_WHERE: Prisma.ChecklistInstanceWhereInput = {
  OR: [
    { template: { active: true } },
    { progressPct: { gt: 0 } },
    { status: { not: 'DRAFT' } },
    { deliveredAt: { not: null } },
    { authorizedAt: { not: null } },
    { files: { some: {} } },
  ],
};
