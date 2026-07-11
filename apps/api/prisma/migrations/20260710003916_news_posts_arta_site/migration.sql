-- AlterTable
ALTER TABLE "HeroSlide" ALTER COLUMN "entity" SET DEFAULT 'ARTA';

-- CreateTable
CREATE TABLE "NewsPost" (
    "id" TEXT NOT NULL,
    "entity" "EntityKey" NOT NULL DEFAULT 'ARTA',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT,
    "coverUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsPost_entity_published_idx" ON "NewsPost"("entity", "published");

-- CreateIndex
CREATE UNIQUE INDEX "NewsPost_entity_slug_key" ON "NewsPost"("entity", "slug");
