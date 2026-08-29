-- Documentos editables dentro del evento (Excel/PDF que se guardan en el sitio
-- y documento tipo Word que se descarga en PDF).

-- ─── EventFile: versión y autor del último guardado ──────────────────────────
ALTER TABLE "EventFile" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "EventFile" ADD COLUMN "updatedById" TEXT;
ALTER TABLE "EventFile" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Los archivos que ya existen no se han editado nunca: su updatedAt es su alta.
UPDATE "EventFile" SET "updatedAt" = "createdAt";

ALTER TABLE "EventFile"
  ADD CONSTRAINT "EventFile_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── EventDocument ───────────────────────────────────────────────────────────
CREATE TABLE "EventDocument" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "module" TEXT,
    "title" TEXT NOT NULL,
    "blocksJson" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "pdfUrl" TEXT,
    "pdfVersion" INTEGER,
    "sourceFileId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventDocument_eventId_module_idx" ON "EventDocument"("eventId", "module");

ALTER TABLE "EventDocument"
  ADD CONSTRAINT "EventDocument_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventDocument"
  ADD CONSTRAINT "EventDocument_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventDocument"
  ADD CONSTRAINT "EventDocument_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
