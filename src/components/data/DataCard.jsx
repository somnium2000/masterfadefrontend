// src/components/data/DataCard.jsx
// Tarjeta de datos genérica para la vista Cards mobile-first.
// Reemplaza filas de tabla en viewports pequeños.

import { motion } from 'framer-motion';

/**
 * @param {{
 *   avatar?: React.ReactNode,
 *   title: string,
 *   subtitle?: string,
 *   badge?: React.ReactNode,
 *   fields?: { label: string, value: React.ReactNode }[],
 *   actions?: React.ReactNode,
 *   onClick?: () => void,
 *   animationDelay?: number,
 * }} props
 */
export default function DataCard({
    avatar,
    title,
    subtitle,
    badge,
    fields = [],
    actions,
    onClick,
    animationDelay = 0,
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: animationDelay }}
            onClick={onClick}
            className={`
                group relative overflow-hidden rounded-[20px]
                border border-[var(--mf-nav-border)]
                bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)]
                p-4 shadow-[var(--mf-shadow-soft)]
                transition-all duration-200
                ${onClick ? 'cursor-pointer hover:border-[var(--mf-btn-border)] hover:shadow-[var(--mf-shadow-card)]' : ''}
            `}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    {avatar && (
                        <div className="shrink-0 h-10 w-10 overflow-hidden rounded-[12px] border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] flex items-center justify-center text-[var(--mf-accent)]">
                            {avatar}
                        </div>
                    )}
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--mf-text)]">{title}</p>
                        {subtitle && (
                            <p className="truncate text-xs text-[var(--mf-text-2)] mt-0.5">{subtitle}</p>
                        )}
                    </div>
                </div>
                {badge && <div className="shrink-0">{badge}</div>}
            </div>

            {/* Fields */}
            {fields.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--mf-nav-border)] pt-3">
                    {fields.map((field, i) => (
                        <div key={i} className="flex flex-col gap-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--mf-text-2)]">
                                {field.label}
                            </span>
                            <span className="text-sm text-[var(--mf-text)] break-words">
                                {field.value ?? <span className="opacity-40">—</span>}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Actions */}
            {actions && (
                <div className="mt-3 flex items-center justify-end gap-2 border-t border-[var(--mf-nav-border)] pt-3">
                    {actions}
                </div>
            )}
        </motion.div>
    );
}
