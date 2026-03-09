import { cn } from '../../lib/utils.js';

const TONE_STYLES = {
  default: 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] hover:text-[var(--mf-accent)]',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20',
  danger: 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20',
};

export default function HoverActionButton({
  icon,
  label,
  onClick,
  disabled = false,
  tone = 'default',
  className = '',
  title = '',
}) {
  const toneClass = TONE_STYLES[tone] || TONE_STYLES.default;
  return (
    <button
      type="button"
      aria-label={label}
      title={title || label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // AM: Patrón visual de Servicios + expansión en desktop para mostrar leyenda de acción.
        'group/btn inline-flex h-9 w-9 items-center justify-center gap-0 overflow-hidden rounded-xl border px-0 text-[11px] font-medium transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mf-accent)]/45',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // AM: Requisito UX: sin hover muestra solo icono; con hover/focus muestra icono + leyenda.
        'hover:w-[132px] hover:px-3 hover:gap-1.5 focus-visible:w-[132px] focus-visible:px-3 focus-visible:gap-1.5',
        toneClass,
        className
      )}
    >
      <span className="shrink-0">{icon}</span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover/btn:max-w-[88px] group-hover/btn:opacity-100 group-focus-visible/btn:max-w-[88px] group-focus-visible/btn:opacity-100">
        {label}
      </span>
    </button>
  );
}
