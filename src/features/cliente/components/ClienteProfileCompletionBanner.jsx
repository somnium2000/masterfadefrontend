import { AlertCircle, UserRound } from 'lucide-react';

const FIELD_LABELS = {
  telefono_principal: 'Teléfono principal',
  fecha_nacimiento: 'Fecha de nacimiento',
  genero_codigo: 'Género',
  direccion_texto: 'Dirección',
  preferencias_corte: 'Preferencias para barbero',
};

function formatMissingFields(fields = []) {
  if (!Array.isArray(fields)) return [];
  return fields
    .map((field) => FIELD_LABELS[field] || String(field || '').trim())
    .filter(Boolean);
}

export default function ClienteProfileCompletionBanner({
  profileCompletion,
  onEditProfile,
  compact = false,
}) {
  if (!profileCompletion || profileCompletion.is_complete) return null;

  const percent = Math.max(0, Number(profileCompletion.completion_percent || 0));
  const missing = formatMissingFields(profileCompletion.missing_fields || []);

  return (
    <section className="rounded-[20px] border border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_68%,transparent)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">
            <AlertCircle size={13} />
            Perfil en progreso
          </div>
          <h2 className="mf-font-display mt-2 text-base text-[var(--mf-text)] sm:text-lg">
            Completa tu perfil para recibir una experiencia más personalizada
          </h2>
          {!compact && missing.length ? (
            <p className="mt-2 text-sm leading-6 text-[var(--mf-text-2)]">
              Pendiente: {missing.join(', ')}.
            </p>
          ) : null}
        </div>

        <div className="shrink-0 rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-card)] px-3 py-2 text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Completado</p>
          <p className="mt-1 text-lg font-semibold text-[var(--mf-accent)]">{percent}%</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--mf-btn-bg)]">
          <div
            className="h-full rounded-full bg-[var(--mf-accent)] transition-all duration-300"
            style={{ width: `${Math.max(8, Math.min(percent, 100))}%` }}
          />
        </div>
        <button
          type="button"
          onClick={onEditProfile}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-card)] px-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
        >
          <UserRound size={13} />
          Perfil
        </button>
      </div>
    </section>
  );
}
