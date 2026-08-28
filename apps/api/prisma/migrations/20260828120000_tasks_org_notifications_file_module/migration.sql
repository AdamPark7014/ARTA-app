-- Correcciones junta 2026-08-28
-- 1) Archivos del evento etiquetados por sección (campaña, finanzas, general…)
-- 2) Tareas asignables entre cualquier integrante de la organización, con o sin evento
-- 3) Notificaciones dentro de la plataforma

-- ─── EventFile.module ────────────────────────────────────────────────────────
ALTER TABLE "EventFile" ADD COLUMN "module" TEXT;
CREATE INDEX "EventFile_eventId_module_idx" ON "EventFile"("eventId", "module");

-- ─── TaskAssignment: evento opcional + tenant + solicitante ──────────────────
ALTER TABLE "TaskAssignment" ALTER COLUMN "eventId" DROP NOT NULL;
ALTER TABLE "TaskAssignment" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "TaskAssignment" ADD COLUMN "createdById" TEXT;
ALTER TABLE "TaskAssignment" ADD COLUMN "detail" TEXT;

-- Las tareas que ya existen heredan el tenant de su evento
UPDATE "TaskAssignment" t
   SET "organizationId" = e."organizationId"
  FROM "Event" e
 WHERE t."eventId" = e."id";

ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaskAssignment"
  ADD CONSTRAINT "TaskAssignment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TaskAssignment_assigneeId_status_idx" ON "TaskAssignment"("assigneeId", "status");
CREATE INDEX "TaskAssignment_organizationId_status_idx" ON "TaskAssignment"("organizationId", "status");
CREATE INDEX "TaskAssignment_eventId_idx" ON "TaskAssignment"("eventId");

-- ─── Notification ────────────────────────────────────────────────────────────
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkUrl" TEXT,
    "actorId" TEXT,
    "entity" "EntityKey",
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
