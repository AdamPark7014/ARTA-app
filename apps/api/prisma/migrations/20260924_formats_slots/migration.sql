-- Create enums for slot kind and slot status
CREATE TYPE "DocumentSlotKind" AS ENUM ('CHECKLIST', 'CAMPAIGN', 'CORRIDA', 'PENDONES', 'OC', 'BOLETERA');
CREATE TYPE "DocumentSlotStatus" AS ENUM ('INTERNAL', 'REPLACED');

-- Table for slot replacement state per event
CREATE TABLE "EventDocumentSlot" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  "eventId" TEXT NOT NULL,
  "kind" "DocumentSlotKind" NOT NULL,
  "checklistTemplateId" TEXT,
  "status" "DocumentSlotStatus" NOT NULL DEFAULT 'INTERNAL',
  "replacedByFileId" TEXT,
  "replacedById" TEXT,
  "replacedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

-- FKs
ALTER TABLE "EventDocumentSlot"
  ADD CONSTRAINT "EventDocumentSlot_event_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE;
ALTER TABLE "EventDocumentSlot"
  ADD CONSTRAINT "EventDocumentSlot_template_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL;
ALTER TABLE "EventDocumentSlot"
  ADD CONSTRAINT "EventDocumentSlot_file_fkey" FOREIGN KEY ("replacedByFileId") REFERENCES "EventFile"("id") ON DELETE SET NULL;
ALTER TABLE "EventDocumentSlot"
  ADD CONSTRAINT "EventDocumentSlot_user_fkey" FOREIGN KEY ("replacedById") REFERENCES "User"("id") ON DELETE SET NULL;

-- Indices and uniqueness
CREATE INDEX "EventDocumentSlot_event_idx" ON "EventDocumentSlot" ("eventId");
CREATE INDEX "EventDocumentSlot_event_kind_idx" ON "EventDocumentSlot" ("eventId", "kind");
CREATE UNIQUE INDEX "EventDocumentSlot_event_kind_template_uniq" ON "EventDocumentSlot" ("eventId", "kind", "checklistTemplateId");

-- Trigger to update updatedAt
CREATE OR REPLACE FUNCTION touch_event_document_slot_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_touch_event_document_slot_updated
BEFORE UPDATE ON "EventDocumentSlot"
FOR EACH ROW
EXECUTE FUNCTION touch_event_document_slot_updated_at();
