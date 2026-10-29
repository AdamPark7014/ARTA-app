-- Formatos de seguridad del Auditorio Arema Explanada (junta con el cliente, 23-10-2026):
-- Recorrido de seguridad (durante y post evento, con fotos y videos), Seguridad interna
-- y Seguridad del promotor. Ver docs/FORMATOS.md.

-- AlterEnum
ALTER TYPE "ChecklistTemplateKey" ADD VALUE 'RECORRIDO_SEGURIDAD';
ALTER TYPE "ChecklistTemplateKey" ADD VALUE 'SEGURIDAD_INTERNA';
ALTER TYPE "ChecklistTemplateKey" ADD VALUE 'SEGURIDAD_PROMOTOR';
