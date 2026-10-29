-- Inventario semanal de insumos de limpieza del Auditorio (junta 23-10-2026).
-- Tabla nueva; no toca nada existente. Ver docs/INVENTARIO-LIMPIEZA.md.

-- CreateTable
CREATE TABLE "CleaningInventory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entity" "EntityKey" NOT NULL,
    "weekStart" TEXT NOT NULL,
    "responsible" TEXT,
    "notes" TEXT,
    "itemsJson" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "pdfUrl" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleaningInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CleaningInventory_organizationId_entity_weekStart_key" ON "CleaningInventory"("organizationId", "entity", "weekStart");

-- AddForeignKey
ALTER TABLE "CleaningInventory" ADD CONSTRAINT "CleaningInventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningInventory" ADD CONSTRAINT "CleaningInventory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningInventory" ADD CONSTRAINT "CleaningInventory_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
