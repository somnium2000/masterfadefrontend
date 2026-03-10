// src/components/data/DataCard.jsx
// Tarjeta de datos generica para la vista Cards mobile-first.
// Reemplaza filas de tabla en viewports pequenos.

import { motion } from 'framer-motion';
import {
  Building2,
  CalendarClock,
  CircleSmall,
  Clock3,
  KeyRound,
  Landmark,
  Megaphone,
  Phone,
  ShieldCheck,
  Tags,
  UserRound,
} from 'lucide-react';

/**
 * @param {{
 *   avatar?: React.ReactNode,
 *   title: string,
 *   subtitle?: string,
 *   badge?: React.ReactNode,
 *   fields?: { label: string, value: React.ReactNode, icon?: React.ReactNode }[],
 *   actions?: React.ReactNode,
 *   onClick?: () => void,
 *   animationDelay?: number,
 * }} props
 */
function resolveFieldIcon(label) {
  const normalized = String(label || '').toLowerCase();
  // AM: Mapeo semantico de iconos por leyenda para mantener consistencia visual en todos los cards.
  if (normalized.includes('sucursal')) return Building2;
  if (normalized.includes('rol')) return ShieldCheck;
  if (normalized.includes('estado')) return KeyRound;
  if (normalized.includes('acceso')) return KeyRound;
  if (normalized.includes('fecha')) return CalendarClock;
  if (normalized.includes('duracion')) return Clock3;
  if (normalized.includes('buffer')) return Clock3;
  if (normalized.includes('precio')) return Landmark;
  if (normalized.includes('salario')) return Landmark;
  if (normalized.includes('tarifa')) return Tags;
  if (normalized.includes('telefono')) return Phone;
  if (normalized.includes('marketing')) return Megaphone;
  if (normalized.includes('origen')) return UserRound;
  if (normalized.includes('usuario')) return UserRound;
  return CircleSmall;
}

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
      {/* AM: En mobile prioriza nombre completo (sin truncate) y mueve badge sin robar ancho al titulo. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {avatar && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
              {avatar}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-[var(--mf-text)] break-words">{title}</p>
            {subtitle && (
              <p className="mt-0.5 text-xs leading-snug text-[var(--mf-text-2)] break-words">{subtitle}</p>
            )}
          </div>
        </div>
        {badge && <div className="self-start sm:shrink-0">{badge}</div>}
      </div>

      {/* Fields */}
      {fields.length > 0 && (
        <div className="mt-3 border-t border-[var(--mf-nav-border)]/80 pt-3">
          <div className="overflow-hidden rounded-[14px] border border-[var(--mf-nav-border)]/70 bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)]">
            {fields.map((field, i) => {
              const Icon = resolveFieldIcon(field?.label);
              return (
                <div
                  key={i}
                  className={`flex items-start justify-between gap-3 px-3 py-2.5 ${
                    i < fields.length - 1 ? 'border-b border-[var(--mf-nav-border)]/65' : ''
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--mf-text-2)]">
                    {/* AM: Icono de leyenda sutil para lectura rapida sin ensuciar visualmente. */}
                    {field?.icon || <Icon size={12} strokeWidth={1.9} className="text-[var(--mf-accent)]/85" />}
                    {field.label}
                  </span>
                  <span className="max-w-[56%] break-words text-right text-sm text-[var(--mf-text)]">
                    {field.value ?? <span className="opacity-40">-</span>}
                  </span>
                </div>
              );
            })}
          </div>
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
