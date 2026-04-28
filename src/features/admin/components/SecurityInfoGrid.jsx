function normalizeDisplayValue(value) {
  if (value === undefined || value === null) return '-';
  if (typeof value === 'boolean') return value ? 'Si' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '-';
  const normalized = String(value).trim();
  return normalized || '-';
}

export default function SecurityInfoGrid({ items = [] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <article
          key={item.key}
          className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3"
        >
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-accent)]">
            {item.label}
          </p>
          <p className="mt-1 break-all text-sm text-[var(--mf-text)]">
            {normalizeDisplayValue(item.value)}
          </p>
        </article>
      ))}
    </div>
  );
}
