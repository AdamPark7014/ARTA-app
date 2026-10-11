-- ARTA y Auditorio separados (docs/entidades-arta-auditorio.md): entidad en canales de chat, tareas y
-- anticipos. Lo que tiene evento hereda la entidad del evento; lo demás era todo de ARTA (Adam, 11-10-2026).

ALTER TABLE "ChatChannel" ADD COLUMN "entity" "EntityKey";
ALTER TABLE "TaskAssignment" ADD COLUMN "entity" "EntityKey";
ALTER TABLE "PaymentProof" ADD COLUMN "entity" "EntityKey";

CREATE INDEX "ChatChannel_organizationId_entity_idx" ON "ChatChannel"("organizationId", "entity");
CREATE INDEX "TaskAssignment_organizationId_entity_idx" ON "TaskAssignment"("organizationId", "entity");
CREATE INDEX "PaymentProof_entity_idx" ON "PaymentProof"("entity");

-- Canales: los de evento, la del evento; los demás que no son directos ni grupos de directos, ARTA.
UPDATE "ChatChannel" c SET "entity" = e."entity" FROM "Event" e WHERE c."eventId" = e."id";
UPDATE "ChatChannel" SET "entity" = 'ARTA' WHERE "entity" IS NULL AND "dmKey" IS NULL;

-- Tareas.
UPDATE "TaskAssignment" t SET "entity" = e."entity" FROM "Event" e WHERE t."eventId" = e."id";
UPDATE "TaskAssignment" SET "entity" = 'ARTA' WHERE "entity" IS NULL;

-- Anticipos y comprobantes: su evento, o el evento de su orden de compra.
UPDATE "PaymentProof" p SET "entity" = e."entity" FROM "Event" e WHERE p."eventId" = e."id";
UPDATE "PaymentProof" p SET "entity" = e."entity"
  FROM "PurchaseOrder" po JOIN "Event" e ON e."id" = po."eventId"
  WHERE p."entity" IS NULL AND p."purchaseOrderId" = po."id";
UPDATE "PaymentProof" SET "entity" = 'ARTA' WHERE "entity" IS NULL;
