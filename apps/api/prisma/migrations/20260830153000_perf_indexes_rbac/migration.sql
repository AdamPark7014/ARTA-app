-- Performance indexes (audit W2)
CREATE INDEX "PurchaseOrder_eventId_idx" ON "PurchaseOrder"("eventId");
CREATE INDEX "TicketingSetup_eventId_idx" ON "TicketingSetup"("eventId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "Event_organizationId_status_startsAt_idx" ON "Event"("organizationId", "status", "startsAt");
