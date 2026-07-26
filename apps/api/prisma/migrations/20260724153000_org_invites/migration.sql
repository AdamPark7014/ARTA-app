-- Org invites for multi-tenant onboarding
CREATE TABLE IF NOT EXISTS "OrgInvite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "entities" "EntityKey"[],
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgInvite_tokenHash_key" ON "OrgInvite"("tokenHash");
CREATE INDEX IF NOT EXISTS "OrgInvite_organizationId_email_idx" ON "OrgInvite"("organizationId", "email");
CREATE INDEX IF NOT EXISTS "OrgInvite_email_idx" ON "OrgInvite"("email");

ALTER TABLE "OrgInvite" DROP CONSTRAINT IF EXISTS "OrgInvite_organizationId_fkey";
ALTER TABLE "OrgInvite"
  ADD CONSTRAINT "OrgInvite_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
