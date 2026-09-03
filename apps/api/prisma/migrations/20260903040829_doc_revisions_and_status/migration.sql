-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'SEALED');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('CHECKLIST', 'FINANCE', 'DOCUMENT', 'FILE');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ip" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "userAgent" TEXT;

-- AlterTable
ALTER TABLE "ChecklistInstance" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "reopenReason" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sealedAt" TIMESTAMP(3),
ADD COLUMN     "sealedById" TEXT,
ADD COLUMN     "status" "DocStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "EventDocument" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status" "DocStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "FinanceRun" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "lastEditedAt" TIMESTAMP(3),
ADD COLUMN     "lastEditedById" TEXT,
ADD COLUMN     "reopenReason" TEXT,
ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sealedAt" TIMESTAMP(3),
ADD COLUMN     "sealedById" TEXT,
ADD COLUMN     "status" "DocStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "DocRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "docType" "DocType" NOT NULL,
    "docId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshotJson" JSONB,
    "diffJson" JSONB,
    "fileUrl" TEXT,
    "fileHash" TEXT,
    "sizeBytes" INTEGER,
    "fromStatus" "DocStatus",
    "toStatus" "DocStatus",
    "note" TEXT,
    "authorId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocRevision_organizationId_createdAt_idx" ON "DocRevision"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "DocRevision_eventId_createdAt_idx" ON "DocRevision"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "DocRevision_authorId_createdAt_idx" ON "DocRevision"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "DocRevision_docType_docId_createdAt_idx" ON "DocRevision"("docType", "docId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocRevision_docType_docId_revision_key" ON "DocRevision"("docType", "docId", "revision");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChecklistInstance" ADD CONSTRAINT "ChecklistInstance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRun" ADD CONSTRAINT "FinanceRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceRun" ADD CONSTRAINT "FinanceRun_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocRevision" ADD CONSTRAINT "DocRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocRevision" ADD CONSTRAINT "DocRevision_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- Migración de datos
--
-- Va aquí y no en un script aparte para que la base quede consistente en el
-- instante del despliegue, sin depender de que alguien se acuerde de correrlo.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Estado de los checklists que ya existen.
--    NO se pone todo en DRAFT: eso des-aprobaría trabajo ya firmado y el
--    equipo lo notaría en el primer minuto.
UPDATE "ChecklistInstance" SET "status" = 'SEALED'  WHERE "authorizedAt" IS NOT NULL;
UPDATE "ChecklistInstance" SET "status" = 'REVIEW'  WHERE "authorizedAt" IS NULL AND "deliveredAt" IS NOT NULL;

UPDATE "ChecklistInstance" ci
   SET "sealedAt"   = ci."authorizedAt",
       "sealedById" = ci."authorizedById"
 WHERE ci."authorizedAt" IS NOT NULL;

UPDATE "ChecklistInstance" ci
   SET "submittedAt"   = ci."deliveredAt",
       "submittedById" = ci."deliveredById"
 WHERE ci."deliveredAt" IS NOT NULL;

-- 2. El contador de revisiones arranca por encima del historial migrado, para
--    que la primera revisión nueva no choque con el `@@unique`.
UPDATE "ChecklistInstance" ci
   SET "revision" = COALESCE(
     (SELECT COUNT(*) FROM "ChecklistVersion" cv WHERE cv."instanceId" = ci."id"), 0);

-- 3. Autor original: la versión más antigua sabe quién lo tocó primero.
--    Si no hay historial, el último editor. Nunca se inventa un autor.
UPDATE "ChecklistInstance" ci
   SET "createdById" = COALESCE(
     (SELECT cv."editedById"
        FROM "ChecklistVersion" cv
       WHERE cv."instanceId" = ci."id" AND cv."editedById" IS NOT NULL
       ORDER BY cv."createdAt" ASC
       LIMIT 1),
     ci."lastEditedById");

-- 4. El historial de checklists pasa a `DocRevision`.
--    Se COPIA, no se mueve: `ChecklistVersion` queda intacta como respaldo y
--    se elimina en una migración posterior, tras confirmar que los conteos
--    cuadran. `diffJson` va NULL — calcular el diff de todo el histórico es
--    lento y no aporta; la UI muestra «versión histórica» y compara snapshots
--    a demanda.
--
--    Los eventos sin organización usan un centinela que jamás puede coincidir
--    con un id real: esas filas quedan invisibles para las consultas por
--    tenant, que es el modo de fallo seguro.
INSERT INTO "DocRevision" (
  "id", "organizationId", "eventId", "docType", "docId", "revision",
  "snapshotJson", "note", "authorId", "createdAt"
)
SELECT
  cv."id",
  COALESCE(e."organizationId", '(sin-organizacion)'),
  ci."eventId",
  'CHECKLIST'::"DocType",
  cv."instanceId",
  ROW_NUMBER() OVER (PARTITION BY cv."instanceId" ORDER BY cv."createdAt" ASC, cv."id" ASC),
  cv."dataJson",
  cv."note",
  cv."editedById",
  cv."createdAt"
FROM "ChecklistVersion" cv
JOIN "ChecklistInstance" ci ON ci."id" = cv."instanceId"
JOIN "Event" e             ON e."id"  = ci."eventId";

-- 5. Corridas: quedan selladas si su evento está cerrado o si ya estaban
--    bloqueadas. `locked` sigue siendo la fuente hasta que el guard de estado
--    lo sustituya.
UPDATE "FinanceRun" fr
   SET "status" = 'SEALED'
  FROM "Event" e
 WHERE e."id" = fr."eventId"
   AND (fr."locked" = true OR e."status" IN ('CLOSED', 'CANCELLED'));

-- 6. AuditLog: organización propia, tomada del autor. Los registros de
--    sistema (`userId` nulo) se quedan sin ella — antes eran invisibles para
--    todos salvo super_admin y así se puede arreglar sin adivinar.
UPDATE "AuditLog" al
   SET "organizationId" = u."organizationId"
  FROM "User" u
 WHERE u."id" = al."userId" AND al."organizationId" IS NULL;
