-- Reglas del cliente (01-11-2026): adendum como forma de pago, boletera embebida, testigos de
-- publicidad, formatos de barra y merch, y perfiles de practicante con vigencia.
ALTER TYPE "PoPaymentMethod" ADD VALUE IF NOT EXISTS 'ADENDUM';
ALTER TYPE "ChecklistTemplateKey" ADD VALUE IF NOT EXISTS 'BARRA';
ALTER TYPE "ChecklistTemplateKey" ADD VALUE IF NOT EXISTS 'MERCH';

ALTER TABLE "PurchaseOrder" ADD COLUMN "adendumPerson" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "adendumAccount" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "adendumFileUrl" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "adendumFileName" TEXT;

ALTER TABLE "Event" ADD COLUMN "boleteraUrl" TEXT;

ALTER TABLE "User" ADD COLUMN "accessExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "accessLabel" TEXT;

CREATE TABLE "PublicityProof" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "medium" TEXT NOT NULL DEFAULT 'OTRO',
    "title" TEXT NOT NULL,
    "note" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "link" TEXT,
    "publishedAt" TIMESTAMP(3),
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicityProof_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PublicityProof_eventId_createdAt_idx" ON "PublicityProof"("eventId", "createdAt");

ALTER TABLE "PublicityProof" ADD CONSTRAINT "PublicityProof_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicityProof" ADD CONSTRAINT "PublicityProof_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
