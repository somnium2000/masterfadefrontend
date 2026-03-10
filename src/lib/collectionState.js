// AM: Utilidades para mutar colecciones en UI sin recarga visible tras acciones CRUD.

function safeResolveId(item, resolveId) {
  if (!item || typeof resolveId !== 'function') return '';
  const value = resolveId(item);
  return value == null ? '' : String(value);
}

export function replaceItemById(list, nextItem, resolveId) {
  const targetId = safeResolveId(nextItem, resolveId);
  if (!targetId) return Array.isArray(list) ? list : [];

  let matched = false;
  const updated = (Array.isArray(list) ? list : []).map((entry) => {
    if (safeResolveId(entry, resolveId) !== targetId) return entry;
    matched = true;
    return nextItem;
  });

  return matched ? updated : [nextItem, ...updated];
}

export function removeItemById(list, targetId, resolveId) {
  const normalized = targetId == null ? '' : String(targetId);
  if (!normalized) return Array.isArray(list) ? list : [];
  return (Array.isArray(list) ? list : []).filter(
    (entry) => safeResolveId(entry, resolveId) !== normalized
  );
}
