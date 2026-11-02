-- Sitio público administrado desde Studio: historias, galería y aliados, orden manual de noticias,
-- datos de cartelera y encuadre de la foto de portada. Todo aditivo e idempotente.
ALTER TABLE "HeroSlide" ADD COLUMN IF NOT EXISTS "focus" TEXT;

ALTER TABLE "NewsPost" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NewsPost" ADD COLUMN IF NOT EXISTS "venue" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN IF NOT EXISTS "eventTime" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN IF NOT EXISTS "showStatus" TEXT;

CREATE TABLE IF NOT EXISTS "SiteItem" (
    "id" TEXT NOT NULL,
    "entity" "EntityKey" NOT NULL DEFAULT 'ARTA',
    "kind" TEXT NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "mediaUrl" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL DEFAULT 'image',
    "focus" TEXT,
    "linkLabel" TEXT,
    "linkHref" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "reviewRequestedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SiteItem_entity_kind_sortOrder_idx" ON "SiteItem"("entity", "kind", "sortOrder");
