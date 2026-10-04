-- Anticipos con aprobación: solicitar → aprobar o rechazar → pagado. Solo aditiva.

-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');

-- Un anticipo se puede solicitar sin archivo (los comprobantes de OC siguen trayéndolo).
ALTER TABLE "PaymentProof" ALTER COLUMN "fileUrl" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PaymentProof" ADD COLUMN "advanceStatus" "AdvanceStatus",
ADD COLUMN "note" TEXT,
ADD COLUMN "decidedById" TEXT,
ADD COLUMN "decidedAt" TIMESTAMP(3),
ADD COLUMN "rejectReason" TEXT,
ADD COLUMN "paidById" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paidProofUrl" TEXT;

-- CreateIndex
CREATE INDEX "PaymentProof_advanceStatus_idx" ON "PaymentProof"("advanceStatus");

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los anticipos que ya existen se registraron con su comprobante: quedan pagados.
UPDATE "PaymentProof" SET "advanceStatus" = 'PAID' WHERE "purchaseOrderId" IS NULL;
