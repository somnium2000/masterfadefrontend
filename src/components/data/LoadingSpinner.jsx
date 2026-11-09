// src/components/data/LoadingSpinner.jsx
// Indicador de carga centralizado reutilizable.

/**
 * @param {{ size?: number, className?: string, label?: string }} props
 */
export default function LoadingSpinner({
  size = 96,
  className = '',
  label = 'Cargando...',
}) {
  const containerSize = Math.max(48, size);

  return (
    <div
      className={`flex items-center justify-center py-16 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="inline-flex flex-col items-center gap-4">
        <div
          className="relative grid place-items-center"
          style={{ width: `${containerSize}px`, height: `${containerSize}px` }}
          aria-hidden="true"
        >
          <div className="absolute inset-0 rounded-full border-2 border-zinc-400/25 dark:border-zinc-500/35" />
          <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--mf-accent)] border-r-[var(--mf-accent)]/45" />
          <div className="absolute inset-[18%] rounded-full border border-[var(--mf-accent)]/20 bg-[var(--mf-bg-surface)]/75" />
          <span className="relative h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--mf-accent)] shadow-[0_0_14px_rgba(244,189,68,0.7)]" />
        </div>
        {label ? (
          <p className="text-sm font-medium tracking-wide text-[var(--mf-text-muted)]">{label}</p>
        ) : (
          <span className="sr-only">Cargando...</span>
        )}
      </div>
    </div>
  );
}
