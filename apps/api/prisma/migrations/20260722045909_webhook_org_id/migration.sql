-- AlterTable
ALTER TABLE "WebhookEndpoint" ADD COLUMN     "organizationId" TEXT NOT NULL DEFAULT 'org_arta_internal';

-- CreateIndex
CREATE INDEX "WebhookEndpoint_organizationId_active_idx" ON "WebhookEndpoint"("organizationId", "active");

-- AddForeignKey
ALTER TABLE "WebhookEndpoint" ADD CONSTRAINT "WebhookEndpoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
