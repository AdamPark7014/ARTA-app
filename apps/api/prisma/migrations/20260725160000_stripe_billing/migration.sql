-- W9: Stripe billing fields on Organization
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "stripePriceId" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "billingStatus" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_stripeCustomerId_key"
  ON "Organization"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_stripeSubscriptionId_key"
  ON "Organization"("stripeSubscriptionId");
