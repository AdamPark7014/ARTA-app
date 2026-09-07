-- Forma de pago en OC: efectivo no pide comprobante.
CREATE TYPE "PoPaymentMethod" AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'OTRO');

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "paymentMethod" "PoPaymentMethod" NOT NULL DEFAULT 'TRANSFERENCIA';
