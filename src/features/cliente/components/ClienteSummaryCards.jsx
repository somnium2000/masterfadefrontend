import { CalendarDays, Coins, Sparkles, UserRound } from 'lucide-react';

function SummaryCard({ icon: Icon, label, value, helper, actionLabel, onAction }) {
  return (
    <article className="mf-glass-surface rounded-[20px] border border-[var(--mf-nav-border)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-text-2)]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">{value}</p>
          {helper ? <p className="mt-1 text-xs text-[var(--mf-text-2)]">{helper}</p> : null}
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
          <Icon size={18} />
        </span>
      </div>
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 text-xs font-semibold text-[var(--mf-accent)] transition-colors hover:text-[var(--mf-accent-hover)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

export default function ClienteSummaryCards({
  masterpuntos = 0,
  upcomingAppointments = 0,
  completionPercent = 0,
  onNewAppointment,
  onOpenProfile,
}) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard
        icon={Coins}
        label="Masterpuntos"
        value={masterpuntos}
        helper="Acumulados en tu cuenta"
        actionLabel="Ver mi perfil"
        onAction={onOpenProfile}
      />
      <SummaryCard
        icon={CalendarDays}
        label="Citas proximas"
        value={upcomingAppointments}
        helper="Reservas pendientes"
        actionLabel="Agendar nueva"
        onAction={onNewAppointment}
      />
      <SummaryCard
        icon={UserRound}
        label="Perfil"
        value={`${completionPercent}%`}
        helper="Nivel de completitud"
        actionLabel="Completar datos"
        onAction={onOpenProfile}
      />
      <SummaryCard
        icon={Sparkles}
        label="Estado"
        value={upcomingAppointments > 0 ? 'Activo' : 'Sin citas'}
        helper="Gestiona tus reservas cuando quieras"
        actionLabel="Nueva cita"
        onAction={onNewAppointment}
      />
    </section>
  );
}