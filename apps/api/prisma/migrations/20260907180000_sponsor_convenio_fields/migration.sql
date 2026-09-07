-- Campos de convenio comercial para patrocinadores.
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "tier" TEXT;
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PROPOSED';
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "benefits" TEXT;
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "deliverables" TEXT;
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT;
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "validFrom" TIMESTAMP(3);
ALTER TABLE "Sponsor" ADD COLUMN IF NOT EXISTS "validUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Sponsor_eventId_status_idx" ON "Sponsor"("eventId", "status");
