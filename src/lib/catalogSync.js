const CATALOG_SYNC_STORAGE_KEY = 'mf_catalog_sync_tick';
const CATALOG_SYNC_EVENT = 'mf:catalog-sync';

function safeNow() {
  return Date.now();
}

/**
 * AM: Notifica cambios operativos del catalogo (servicios/paquetes) para refresco en vivo.
 * Dispara evento local (misma pestaña) y storage event (otras pestañas).
 */
export function emitCatalogSync(reason = 'catalog-update') {
  const payload = { reason, ts: safeNow() };

  try {
    localStorage.setItem(CATALOG_SYNC_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // AM: En modo privado/localStorage restringido no se interrumpe la accion principal.
  }

  try {
    window.dispatchEvent(new CustomEvent(CATALOG_SYNC_EVENT, { detail: payload }));
  } catch {
    // AM: Fallback seguro si CustomEvent no esta disponible en el runtime actual.
  }
}

/**
 * AM: Suscribe refresh del catalogo cuando otro flujo admin modifica servicios/paquetes.
 */
export function subscribeCatalogSync(onSync) {
  if (typeof onSync !== 'function') return () => {};

  const handleStorage = (event) => {
    if (event?.key !== CATALOG_SYNC_STORAGE_KEY) return;
    onSync();
  };

  const handleLocal = () => onSync();

  window.addEventListener('storage', handleStorage);
  window.addEventListener(CATALOG_SYNC_EVENT, handleLocal);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(CATALOG_SYNC_EVENT, handleLocal);
  };
}

