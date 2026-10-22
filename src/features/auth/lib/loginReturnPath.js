const AUTH_PATHS = new Set(['/login', '/register', '/auth/callback', '/forgot-password', '/reset-password']);

function hasControlCharacters(value) {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
}

export function getSafeLoginReturnPath(rawPath) {
  const raw = String(rawPath || '');
  if (hasControlCharacters(raw)) return '';
  const value = raw.trim();
  let decoded = value;
  for (let pass = 0; pass < 4; pass += 1) {
    if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\') || hasControlCharacters(decoded)) return '';
    try {
      const url = new URL(decoded, 'https://masterfade.invalid');
      if (url.origin !== 'https://masterfade.invalid' || url.pathname.startsWith('//') || AUTH_PATHS.has(url.pathname.toLowerCase().replace(/\/+$/, ''))) return '';
      const next = decodeURIComponent(decoded);
      if (next === decoded) return value;
      decoded = next;
    } catch {
      return '';
    }
  }
  return '';
}
