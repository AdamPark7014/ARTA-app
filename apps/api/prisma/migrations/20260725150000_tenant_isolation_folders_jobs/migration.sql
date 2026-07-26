-- W7: tenant isolation for SharedFolder, JobRun, NotificationOutbox

-- Shared folders become org-scoped (backfill legacy rows to internal tenant)
ALTER TABLE "SharedFolder" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
UPDATE "SharedFolder" SET "organizationId" = 'org_arta_internal' WHERE "organizationId" IS NULL;
ALTER TABLE "SharedFolder" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "SharedFolder" ALTER COLUMN "organizationId" SET DEFAULT 'org_arta_internal';

ALTER TABLE "SharedFolder" DROP CONSTRAINT IF EXISTS "SharedFolder_organizationId_fkey";
ALTER TABLE "SharedFolder"
  ADD CONSTRAINT "SharedFolder_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "SharedFolder_organizationId_entity_idx"
  ON "SharedFolder"("organizationId", "entity");

-- Jobs / outbox: nullable org column for admin UI filtering (workers still flush globally)
ALTER TABLE "JobRun" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
CREATE INDEX IF NOT EXISTS "JobRun_organizationId_createdAt_idx"
  ON "JobRun"("organizationId", "createdAt");

ALTER TABLE "NotificationOutbox" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
CREATE INDEX IF NOT EXISTS "NotificationOutbox_organizationId_createdAt_idx"
  ON "NotificationOutbox"("organizationId", "createdAt");

-- Backfill from JSON payloads written by digests / invites
UPDATE "JobRun"
SET "organizationId" = "payloadJson"->>'organizationId'
WHERE "organizationId" IS NULL
  AND "payloadJson" IS NOT NULL
  AND "payloadJson"->>'organizationId' IS NOT NULL;

UPDATE "NotificationOutbox"
SET "organizationId" = "metaJson"->>'organizationId'
WHERE "organizationId" IS NULL
  AND "metaJson" IS NOT NULL
  AND "metaJson"->>'organizationId' IS NOT NULL;
