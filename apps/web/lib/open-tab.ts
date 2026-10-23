/**
 * Pestañas para archivos que el servidor genera al momento (PDF de la OC, de
 * la boletera, de un documento o de una hoja).
 *
 * Safari solo deja abrir pestañas dentro del clic. Con `await api(...)` de por
 * medio —y generar un PDF tarda— el `window.open` del final cae en su
 * bloqueador de ventanas y no pasa nada: ni pestaña ni aviso en la página.
 * Por eso la pestaña se abre en blanco al hacer clic, ANTES del primer `await`,
 * y se le da destino cuando ya hay URL. Si algo falla, se cierra.
 */
export type PendingTab = {
  /** Lleva la pestaña al archivo (o abre una nueva si el navegador no dio ninguna). */
  go: (url: string) => void;
  /** Cierra la pestaña en blanco: la operación falló. */
  close: () => void;
};

export function openPendingTab(message = 'Generando el archivo…'): PendingTab {
  const tab = typeof window === 'undefined' ? null : window.open('', '_blank');
  if (tab) {
    try {
      tab.document.title = message;
      tab.document.body.style.font = '15px -apple-system, system-ui, sans-serif';
      tab.document.body.style.padding = '24px';
      tab.document.body.textContent = message;
    } catch {
      /* sin acceso al documento de la pestaña: basta con que exista */
    }
  }
  return {
    go(url) {
      const abs = new URL(url, window.location.href).toString();
      if (tab && !tab.closed) {
        // La abrimos sin `noopener` (si no, no habría a quién darle destino): se corta aquí.
        tab.opener = null;
        tab.location.replace(abs);
      } else {
        window.open(abs, '_blank', 'noopener');
      }
    },
    close() {
      if (tab && !tab.closed) tab.close();
    },
  };
}

/**
 * Atajo: abre la pestaña ya, espera la URL y la carga. Hay que llamarla antes
 * de cualquier `await` del manejador del clic. Devuelve la URL.
 */
export async function openGeneratedTab(produce: () => Promise<string>, message?: string): Promise<string> {
  const tab = openPendingTab(message);
  try {
    const url = await produce();
    tab.go(url);
    return url;
  } catch (e) {
    tab.close();
    throw e;
  }
}
