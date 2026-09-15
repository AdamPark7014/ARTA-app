-- Junta 11-09-2026 (correcciones del dashboard):
--   · Evento: descripción, horario y funciones.
--   · OC: machote (proveedor/otro, IVA) y pago con cheque.
--   · Campaña y convenios con estado propio (borrador → revisión → autorizada → pagada).
--   · Boletera: artes, fecha, funciones, horario, descripción y hold.
--   · Chat interno: canal general y mensajes personales.

-- AlterEnum
ALTER TYPE "PoPaymentMethod" ADD VALUE 'CHEQUE';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "description" TEXT,
ADD COLUMN     "functions" INTEGER,
ADD COLUMN     "schedule" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "payeeType" TEXT NOT NULL DEFAULT 'PROVEEDOR',
ADD COLUMN     "withIva" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "convenioStatus" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "convenioSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- Las campañas que ya estaban autorizadas conservan su estado.
UPDATE "Campaign" SET "status" = 'AUTHORIZED' WHERE "authorized" = true;

-- AlterTable
ALTER TABLE "TicketingSetup" ADD COLUMN     "artsUrl" TEXT,
ADD COLUMN     "dateLabel" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "functions" INTEGER,
ADD COLUMN     "holdArtist" INTEGER,
ADD COLUMN     "holdPromoter" INTEGER,
ADD COLUMN     "holdVenue" INTEGER,
ADD COLUMN     "schedule" TEXT;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadMarker" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReadMarker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_organizationId_recipientId_createdAt_idx" ON "ChatMessage"("organizationId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_recipientId_createdAt_idx" ON "ChatMessage"("senderId", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_recipientId_senderId_createdAt_idx" ON "ChatMessage"("recipientId", "senderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReadMarker_userId_threadKey_key" ON "ChatReadMarker"("userId", "threadKey");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadMarker" ADD CONSTRAINT "ChatReadMarker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
