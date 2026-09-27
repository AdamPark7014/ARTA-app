-- Chat tipo Slack (canales, directos, hilos, reacciones, fijados) + teléfonos para push.
-- El chat de la junta 11-09 (General + mensajes personales) se convierte en canales
-- sin perder mensajes ni lo que cada quien ya había leído.

-- CreateEnum
CREATE TYPE "ChatChannelKind" AS ENUM ('PUBLIC', 'PRIVATE', 'DIRECT');

-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('TEXT', 'SYSTEM', 'FILE');

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "ChatChannelKind" NOT NULL DEFAULT 'PUBLIC',
    "slug" TEXT,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "dmKey" TEXT,
    "eventId" TEXT,
    "postingRestricted" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "lastMessagePreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannelMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "lastReadAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatChannelMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPushEndpoint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT,
    "fcmToken" TEXT,
    "deviceName" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPushEndpoint_pkey" PRIMARY KEY ("id")
);

-- AlterTable (channelId entra nulo; se vuelve obligatorio tras el backfill)
ALTER TABLE "ChatMessage" ADD COLUMN     "attachmentMime" TEXT,
ADD COLUMN     "attachmentName" TEXT,
ADD COLUMN     "attachmentSize" INTEGER,
ADD COLUMN     "attachmentUrl" TEXT,
ADD COLUMN     "channelId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "kind" "ChatMessageKind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "pinnedAt" TIMESTAMP(3),
ADD COLUMN     "pinnedById" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill 1: #general por organización con mensajes del canal General.
INSERT INTO "ChatChannel" ("id", "organizationId", "kind", "slug", "name", "topic", "description", "createdAt", "updatedAt")
SELECT 'chgen_' || substr(md5(o.org), 1, 20), o.org, 'PUBLIC', 'general', 'general',
       'Conversación del equipo', 'Canal abierto para toda la organización', now(), now()
FROM (
  SELECT DISTINCT COALESCE("organizationId", 'org_arta_internal') AS org
  FROM "ChatMessage" WHERE "recipientId" IS NULL
) o;

-- Backfill 2: un directo por pareja (dmKey = ids ordenados como en JS, colación C).
INSERT INTO "ChatChannel" ("id", "organizationId", "kind", "name", "topic", "dmKey", "createdAt", "updatedAt")
SELECT 'chdm_' || substr(md5(p.org || ':' || p.a || ':' || p.b), 1, 20), p.org, 'DIRECT',
       'Mensaje directo', 'Mensaje directo', p.a || ':' || p.b, now(), now()
FROM (
  SELECT DISTINCT
    COALESCE("organizationId", 'org_arta_internal') AS org,
    LEAST("senderId" COLLATE "C", "recipientId" COLLATE "C") AS a,
    GREATEST("senderId" COLLATE "C", "recipientId" COLLATE "C") AS b
  FROM "ChatMessage" WHERE "recipientId" IS NOT NULL
) p;

-- Backfill 3: cada mensaje a su canal.
UPDATE "ChatMessage"
SET "channelId" = 'chgen_' || substr(md5(COALESCE("organizationId", 'org_arta_internal')), 1, 20)
WHERE "recipientId" IS NULL;

UPDATE "ChatMessage"
SET "channelId" = 'chdm_' || substr(md5(
      COALESCE("organizationId", 'org_arta_internal') || ':' ||
      LEAST("senderId" COLLATE "C", "recipientId" COLLATE "C") || ':' ||
      GREATEST("senderId" COLLATE "C", "recipientId" COLLATE "C")
    ), 1, 20)
WHERE "recipientId" IS NOT NULL;

-- Backfill 4: miembros de #general (gente activa de la organización) con su marcador de lectura.
-- Sin marcador, joinedAt = ahora: el historial viejo no aparece como pendiente.
INSERT INTO "ChatChannelMember" ("id", "channelId", "userId", "role", "lastReadAt", "joinedAt")
SELECT 'chm_' || substr(md5(c."id" || ':' || u."id"), 1, 24), c."id", u."id", 'member', r."lastReadAt", now()
FROM "ChatChannel" c
JOIN "User" u ON COALESCE(u."organizationId", 'org_arta_internal') = c."organizationId" AND u."active" = true
LEFT JOIN "ChatReadMarker" r ON r."userId" = u."id" AND r."threadKey" = 'general'
WHERE c."kind" = 'PUBLIC' AND c."slug" = 'general';

-- Backfill 5: las dos personas de cada directo.
INSERT INTO "ChatChannelMember" ("id", "channelId", "userId", "role", "lastReadAt", "joinedAt")
SELECT 'chm_' || substr(md5(c."id" || ':' || x.uid), 1, 24), c."id", x.uid, 'member', r."lastReadAt", now()
FROM "ChatChannel" c
CROSS JOIN LATERAL unnest(string_to_array(c."dmKey", ':')) AS x(uid)
LEFT JOIN "ChatReadMarker" r ON r."userId" = x.uid AND r."threadKey" = 'dm:' || (
  CASE WHEN x.uid = split_part(c."dmKey", ':', 1) THEN split_part(c."dmKey", ':', 2)
       ELSE split_part(c."dmKey", ':', 1) END
)
WHERE c."kind" = 'DIRECT';

-- Backfill 6: último mensaje por canal para ordenar la lista.
UPDATE "ChatChannel" c
SET "lastMessageAt" = s."createdAt",
    "lastMessagePreview" = left(regexp_replace(s."body", '\s+', ' ', 'g'), 140)
FROM (
  SELECT DISTINCT ON ("channelId") "channelId", "createdAt", "body"
  FROM "ChatMessage"
  ORDER BY "channelId", "createdAt" DESC
) s
WHERE s."channelId" = c."id";

ALTER TABLE "ChatMessage" ALTER COLUMN "channelId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_eventId_key" ON "ChatChannel"("eventId");

-- CreateIndex
CREATE INDEX "ChatChannel_organizationId_lastMessageAt_idx" ON "ChatChannel"("organizationId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_organizationId_slug_key" ON "ChatChannel"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_organizationId_dmKey_key" ON "ChatChannel"("organizationId", "dmKey");

-- CreateIndex
CREATE INDEX "ChatChannelMember_userId_lastReadAt_idx" ON "ChatChannelMember"("userId", "lastReadAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannelMember_channelId_userId_key" ON "ChatChannelMember"("channelId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageReaction_messageId_userId_emoji_key" ON "ChatMessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "UserPushEndpoint_fcmToken_key" ON "UserPushEndpoint"("fcmToken");

-- CreateIndex
CREATE INDEX "UserPushEndpoint_userId_idx" ON "UserPushEndpoint"("userId");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_createdAt_idx" ON "ChatMessage"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_parentId_createdAt_idx" ON "ChatMessage"("parentId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_pinnedAt_idx" ON "ChatMessage"("channelId", "pinnedAt");

-- AddForeignKey
ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannelMember" ADD CONSTRAINT "ChatChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPushEndpoint" ADD CONSTRAINT "UserPushEndpoint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
