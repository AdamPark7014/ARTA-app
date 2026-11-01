-- Acuse de visto: cuándo abrió la campana quien recibió el aviso.
ALTER TABLE "Notification" ADD COLUMN "seenAt" TIMESTAMP(3);

-- Lo que ya se leyó, ya se vio. Lo que sigue sin leer se queda sin ver: su acuse sale cuando abran la campana.
UPDATE "Notification" SET "seenAt" = "readAt" WHERE "readAt" IS NOT NULL;

CREATE INDEX "Notification_actorId_createdAt_idx" ON "Notification"("actorId", "createdAt");
