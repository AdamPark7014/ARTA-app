-- W3 Prisma indexes round 2
CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "Event_entity_startsAt_idx" ON "Event"("entity", "startsAt");
CREATE INDEX IF NOT EXISTS "ChecklistInstance_templateId_idx" ON "ChecklistInstance"("templateId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_eventId_status_idx" ON "PurchaseOrder"("eventId", "status");
CREATE INDEX IF NOT EXISTS "PurchaseOrderLine_orderId_idx" ON "PurchaseOrderLine"("orderId");
CREATE INDEX IF NOT EXISTS "PaymentProof_eventId_idx" ON "PaymentProof"("eventId");
CREATE INDEX IF NOT EXISTS "PaymentProof_purchaseOrderId_idx" ON "PaymentProof"("purchaseOrderId");
