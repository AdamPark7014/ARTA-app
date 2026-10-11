-- Formatos propios del Auditorio Arema Explanada (11-10-2026): Checklist Auditorio,
-- Checklist Limpieza y Compromiso de horarios. Ver docs/FORMATOS.md.

-- AlterEnum
ALTER TYPE "ChecklistTemplateKey" ADD VALUE 'CHECKLIST_AUDITORIO';
ALTER TYPE "ChecklistTemplateKey" ADD VALUE 'LIMPIEZA';
ALTER TYPE "ChecklistTemplateKey" ADD VALUE 'COMPROMISO_HORARIOS';
