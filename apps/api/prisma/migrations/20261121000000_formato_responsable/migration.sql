-- Responsable y fecha límite por formato (21-11-2026): la app dice quién debe qué. Aditiva e idempotente.
ALTER TABLE "ChecklistInstance" ADD COLUMN IF NOT EXISTS "ownerId" TEXT;
ALTER TABLE "ChecklistInstance" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "ChecklistInstance"
    ADD CONSTRAINT "ChecklistInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ChecklistInstance_ownerId_idx" ON "ChecklistInstance"("ownerId");
