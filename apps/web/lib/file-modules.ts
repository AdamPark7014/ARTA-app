/**
 * Etiquetas de `EventFile.module` — cada archivo vive en su sección del evento.
 * Documentos muestra el inventario completo agrupado por estas claves.
 */
export const CAMPAIGN_FILE_MODULE = 'campaign';
export const FINANCE_FILE_MODULE = 'finance';
export const CHECKLIST_FILE_MODULE = 'checklist';
export const GENERAL_FILE_MODULE = 'general';
export const OC_PROOF_FILE_MODULE = 'oc';

export type FileModuleKey =
  | typeof CAMPAIGN_FILE_MODULE
  | typeof FINANCE_FILE_MODULE
  | typeof CHECKLIST_FILE_MODULE
  | typeof GENERAL_FILE_MODULE
  | typeof OC_PROOF_FILE_MODULE
  | string;

export function fileModuleLabel(module?: string | null, checklistTitle?: string | null): string {
  if (module === CAMPAIGN_FILE_MODULE) return 'Campaña';
  if (module === FINANCE_FILE_MODULE) return 'Corrida financiera';
  if (module === CHECKLIST_FILE_MODULE) {
    return checklistTitle ? `Checklist · ${checklistTitle}` : 'Checklists';
  }
  if (module === OC_PROOF_FILE_MODULE || module === 'proof') return 'Órdenes de compra';
  if (module === GENERAL_FILE_MODULE) return 'Documentos generales';
  if (!module) return 'Sin sección';
  return module;
}

export function fileKindLabel(kind?: string | null, fileName?: string) {
  if (kind === 'excel' || (fileName && /\.(xlsx?|csv)$/i.test(fileName))) return 'Excel';
  if (kind === 'pdf' || (fileName && /\.pdf$/i.test(fileName))) return 'PDF';
  if (kind === 'image' || (fileName && /\.(png|jpe?g|gif|webp)$/i.test(fileName))) return 'Imagen';
  if (kind === 'proof') return 'Comprobante';
  return kind || 'Archivo';
}
