// src/components/data/LoadingSpinner.jsx
// Spinner centralizado reutilizable basado en branding Masterfade.

/**
 * @param {{ size?: number, className?: string, label?: string }} props
 */
export default function LoadingSpinner({
  size = 96,
  className = '',
  label = 'Cargando...',
}) {
  const containerSize = Math.max(48, size);
  const logoSize = Math.round(containerSize * 0.78);

  return (
    <div className={`flex items-center justify-center py-16 ${className}`}>
      <div className="inline-flex flex-col items-center gap-4">
        <div
          className="relative grid place-items-center"
          style={{ width: `${containerSize}px`, height: `${containerSize}px` }}
          aria-hidden="true"
        >
          <div className="absolute inset-0 rounded-full border border-zinc-400/30 border-t-[var(--mf-accent)] dark:border-zinc-500/40 animate-spin" />
          <div className="absolute inset-[10%] rounded-full bg-[var(--mf-bg-surface)] opacity-70 backdrop-blur-sm" />
          <div
            className="relative z-10 overflow-hidden rounded-full border border-[var(--mf-accent)]/50 animate-pulse drop-shadow-[0_0_10px_rgba(244,189,68,0.55)]"
            style={{ width: `${logoSize}px`, height: `${logoSize}px` }}
          >
            <img
              src="/mf-logo.png"
              alt="Masterfade cargando"
              className="h-full w-full object-cover"
              loading="eager"
              decoding="async"
              draggable="false"
            />
          </div>
        </div>
        {label ? (
          <p className="text-sm font-medium tracking-wide text-[var(--mf-text-muted)]">{label}</p>
        ) : null}
      </div>
    </div>
  );
}
