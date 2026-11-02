-- Ubicación del equipo en las apps, de 10:00 a 18:00 (docs/UBICACION.md). Aditiva e idempotente.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locationConsentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locationState" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locationStateAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "LocationPoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "platform" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationPoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LocationPoint_userId_capturedAt_idx" ON "LocationPoint"("userId", "capturedAt");
CREATE INDEX IF NOT EXISTS "LocationPoint_capturedAt_idx" ON "LocationPoint"("capturedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LocationPoint_userId_fkey') THEN
    ALTER TABLE "LocationPoint"
      ADD CONSTRAINT "LocationPoint_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Testigos de publicidad que se mandan a la galería del sitio.
ALTER TABLE "PublicityProof" ADD COLUMN IF NOT EXISTS "siteItemId" TEXT;
