function normalizeDisplayValue(value) {
  if (value === undefined || value === null) return '-';
  const normalized = String(value).trim();
  return normalized || '-';
}

export default function SecurityResponsiveCard({
  title,
  subtitle,
  rows = [],
  actions = null,
}) {
  return (
    <article className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
      <header className="mb-3 border-b border-[var(--mf-nav-border)] pb-2">
        <p className="text-sm font-semibold text-[var(--mf-text)]">{normalizeDisplayValue(title)}</p>
        {subtitle ? <p className="text-xs text-[var(--mf-text-2)]">{normalizeDisplayValue(subtitle)}</p> : null}
      </header>

      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start justify-between gap-3 text-xs">
            <span className="uppercase tracking-[0.08em] text-[var(--mf-accent)]">{row.label}</span>
            <span className="max-w-[65%] text-right text-[var(--mf-text)]">
              {normalizeDisplayValue(row.value)}
            </span>
          </div>
        ))}
      </div>

      {actions ? <div className="mt-4 border-t border-[var(--mf-nav-border)] pt-3">{actions}</div> : null}
    </article>
  );
}
