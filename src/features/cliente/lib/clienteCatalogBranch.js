const CLIENTE_CATALOG_BRANCH_STORAGE_KEY = 'mf_cliente_catalog_sucursal';

function safeStorageRead(key) {
  try {
    return String(window.localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function safeStorageWrite(key, value) {
  try {
    if (!value) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  } catch {
    // no-op
  }
}

export function getStoredClienteCatalogBranchId() {
  return safeStorageRead(CLIENTE_CATALOG_BRANCH_STORAGE_KEY);
}

export function setStoredClienteCatalogBranchId(idSucursal) {
  safeStorageWrite(CLIENTE_CATALOG_BRANCH_STORAGE_KEY, String(idSucursal || '').trim());
}

export function resolveValidClienteBranchId(candidateId, branches = []) {
  const normalizedCandidate = String(candidateId || '').trim();
  if (!Array.isArray(branches) || !branches.length) return '';

  if (normalizedCandidate && branches.some((branch) => branch?.id_sucursal === normalizedCandidate)) {
    return normalizedCandidate;
  }

  const firstBranchId = String(branches[0]?.id_sucursal || '').trim();
  return firstBranchId || '';
}
