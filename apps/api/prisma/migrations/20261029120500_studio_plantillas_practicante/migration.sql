-- Junta 23-10-2026: plantillas de publicación en Studio para los practicantes de Montse
-- («Publicación / noticia» y «Evento destacado») y su revisión antes de publicar. Columnas nuevas y
-- opcionales: las noticias que ya existen no cambian.

ALTER TABLE "NewsPost" ADD COLUMN "template" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN "eventDate" TIMESTAMP(3);
ALTER TABLE "NewsPost" ADD COLUMN "ctaLabel" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN "ctaHref" TEXT;
ALTER TABLE "NewsPost" ADD COLUMN "reviewRequestedAt" TIMESTAMP(3);
