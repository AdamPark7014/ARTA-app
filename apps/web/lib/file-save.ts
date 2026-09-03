import { api } from '@/lib/api';

/**
 * Cómo persiste un editor lo que produce.
 *
 * Los editores (hoja de cálculo y PDF) solo saben construir el archivo nuevo;
 * dónde se guarda lo decide quien los usa, porque no es lo mismo un adjunto del
 * evento, un archivo de carpetas generales o el PDF generado de un checklist.
 */
export type SaveFile = (blob: Blob, fileName: string) => Promise<void>;

/** Reemplaza el contenido de un adjunto del evento sin cambiar su id. */
export function replaceEventFile(fileId: string): SaveFile {
  return async (blob, fileName) => {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    await api(`/uploads/${fileId}/content`, { method: 'PUT', body: fd });
  };
}

/** Reemplaza un archivo de carpetas generales. */
export function replaceFolderFile(fileId: string): SaveFile {
  return async (blob, fileName) => {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    await api(`/folders/files/${fileId}/content`, { method: 'PUT', body: fd });
  };
}

/**
 * Crea un adjunto NUEVO en el evento.
 *
 * Se usa para anotar documentos que el sistema regenera solo (el PDF de un
 * checklist): si se guardara encima, el siguiente guardado del formato borraría
 * lo escrito sin avisar.
 */
export function createEventFile(opts: {
  eventId: string;
  checklistId?: string;
  module?: string;
}): SaveFile {
  return async (blob, fileName) => {
    const fd = new FormData();
    fd.append('file', blob, fileName);
    fd.append('eventId', opts.eventId);
    if (opts.checklistId) fd.append('checklistId', opts.checklistId);
    if (opts.module) fd.append('module', opts.module);
    await api('/uploads', { method: 'POST', body: fd });
  };
}

/**
 * Guardado por celdas de una hoja del evento.
 *
 * Manda solo el delta; el servidor lo aplica con ExcelJS sobre el archivo real.
 * Es lo que evita que cada guardado destruya estilos, formato condicional y
 * validaciones del libro entero.
 */
export function patchEventFileCells(fileId: string) {
  return async (patch: { cells: Array<Record<string, unknown>> }) => {
    await api(`/uploads/${fileId}/cells`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  };
}
