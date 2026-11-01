-- Avisos: qué llega al teléfono por persona (categorías y horario silencioso) y
-- tarjetas que juntan una ráfaga de avisos iguales. Solo columnas nuevas, con valor por omisión.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "notificationPrefs" JSONB;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "bundleCount" INTEGER NOT NULL DEFAULT 1;
