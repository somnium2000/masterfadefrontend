function normalizeVersion(value) {
  if (!value) return '';
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return String(asDate.getTime());
  const raw = String(value).trim();
  return raw || '';
}

export function withImageVersion(url, version) {
  const baseUrl = String(url || '').trim();
  if (!baseUrl) return '';

  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) return baseUrl;

  try {
    const parsed = new URL(baseUrl, window.location.origin);
    parsed.searchParams.set('v', normalizedVersion);
    const isAbsolute = /^https?:\/\//i.test(baseUrl);
    if (isAbsolute) return parsed.toString();
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}v=${encodeURIComponent(normalizedVersion)}`;
  }
}
