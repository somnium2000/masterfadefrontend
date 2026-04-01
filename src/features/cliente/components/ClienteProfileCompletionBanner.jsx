const FIELD_LABELS = {
  telefono_principal: 'Telefono principal',
  fecha_nacimiento: 'Fecha de nacimiento',
  genero_codigo: 'Genero',
  direccion_texto: 'Direccion',
  preferencias_corte: 'Preferencias para barbero',
};

function formatMissingFields(fields = []) {
  if (!Array.isArray(fields)) return [];
  return fields.map((field) => FIELD_LABELS[field] || String(field || '').trim()).filter(Boolean);
}

export default function ClienteProfileCompletionBanner({
  profileCompletion,
  onEditProfile,
  compact = false,
}) {
  if (!profileCompletion || profileCompletion.is_complete) return null;

  const percent = Number(profileCompletion.completion_percent || 0);
  const missing = formatMissingFields(profileCompletion.missing_fields || []);

  return (
    <section className="mf-glass-surface rounded-[20px] border border-[var(--mf-btn-border)] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            Perfil incompleto
          </p>
          <h2 className="mt-2 text-lg font-semibold text-[var(--mf-text)] sm:text-xl">
            Completa tu perfil para una experiencia MASTER completa
          </h2>
          {!compact && missing.length ? (
            <p className="mt-2 text-sm text-[var(--mf-text-2)]">
              Te faltan: {missing.join(', ')}.
            </p>
          ) : null}
        </div>

        <div className="shrink-0 rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-center">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Completado</p>
          <p className="mt-1 text-lg font-semibold text-[var(--mf-accent)]">{percent}%</p>
        </div>
      </div>

      <div className="mt-4 h-2 w-full rounded-full bg-[var(--mf-btn-bg)]">
        <div
          className="h-2 rounded-full bg-[var(--mf-accent)] transition-all duration-300"
          style={{ width: `${Math.max(8, percent)}%` }}
        />
      </div>

      <button
        type="button"
        onClick={onEditProfile}
        className="mf-accent-gradient mt-4 inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
      >
        Completar perfil
      </button>
    </section>
  );
}
