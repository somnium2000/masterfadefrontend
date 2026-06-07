import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { useEffect } from 'react';
import { CalendarDays, Coins, Gift, Sparkles, UserRound } from 'lucide-react';

const MASTERPUNTOS_META = 10;
function formatUpcomingDateTimeHn(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-HN', {
    timeZone: 'America/Tegucigalpa',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function KpiCard({ icon: Icon, label, value, helper, actionLabel, onAction, tone = 'default' }) {
  const toneClass = tone === 'success'
    ? 'text-emerald-300'
    : tone === 'accent'
      ? 'text-[var(--mf-accent)]'
      : 'text-[var(--mf-text)]';

  return (
    <article className="mf-glass-surface rounded-[22px] border border-[var(--mf-nav-border)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-text-2)]">{label}</p>
          <p className={`mt-2 text-[30px] font-semibold leading-none ${toneClass}`}>{value}</p>
          {helper ? <p className="mt-2 text-xs leading-5 text-[var(--mf-text-2)]">{helper}</p> : null}
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
          <Icon size={18} />
        </span>
      </div>
      {actionLabel ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mf-accent)] transition-colors hover:text-[var(--mf-accent-hover)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
}

function MasterpuntoSlot({ index, progressSpring, reduceMotion }) {
  const threshold = ((index + 1) / MASTERPUNTOS_META) * 100;
  const filled = useTransform(progressSpring, [threshold - 2.8, threshold], [0, 1], { clamp: true });
  const numberScale = useTransform(filled, [0, 1], [1, 1.12]);
  const borderColor = useTransform(filled, [0, 1], ['rgba(117,97,68,0.45)', 'rgba(212,170,97,0.95)']);
  const backgroundColor = useTransform(filled, [0, 1], ['rgba(34,31,28,0.64)', 'rgba(212,170,97,0.34)']);
  const textColor = useTransform(filled, [0, 1], ['rgba(189,179,165,0.88)', 'rgba(255,244,222,0.98)']);
  const glow = useTransform(filled, (value) => `0 0 ${8 + value * 14}px rgba(212,170,97,${0.08 + value * 0.3})`);

  return (
    <motion.div
      style={{
        borderColor,
        backgroundColor,
        boxShadow: reduceMotion ? undefined : glow,
      }}
      className="relative h-8 rounded-[10px] border"
    >
      <motion.span
        className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold"
        style={{
          scale: reduceMotion ? 1 : numberScale,
          color: textColor,
        }}
      >
        {index + 1}
      </motion.span>
    </motion.div>
  );
}

export default function ClienteSummaryCards({
  masterpuntos = 0,
  upcomingAppointments = 0,
  nextUpcomingAppointmentAt = null,
  completionPercent = 0,
  onNewAppointment,
  onOpenProfile,
  hideRewardsHero = false,
  hideProfileKpi = false,
}) {
  const reduceMotion = useReducedMotion();
  const safeMasterpuntos = Math.max(0, Number(masterpuntos || 0));
  const progressPoints = Math.min(safeMasterpuntos, MASTERPUNTOS_META);
  const progressPercent = Math.max(0, Math.min(100, (progressPoints / MASTERPUNTOS_META) * 100));
  const safeCompletionPercent = Math.max(0, Number(completionPercent || 0));
  const profileCompleted = safeCompletionPercent >= 100;
  const nextUpcomingLabel = formatUpcomingDateTimeHn(nextUpcomingAppointmentAt);
  const upcomingHelperText = upcomingAppointments > 0
    ? `Próxima cita: ${nextUpcomingLabel || 'por confirmar'}`
    : 'No tienes citas próximas. Agenda tu próxima visita.';
  const progressValue = useMotionValue(progressPercent);
  const progressSpring = useSpring(progressValue, {
    stiffness: reduceMotion ? 1000 : 160,
    damping: reduceMotion ? 200 : 30,
    mass: reduceMotion ? 1 : 0.7,
  });
  const progressWidth = useTransform(progressSpring, (value) => `${Math.max(0, Math.min(100, value)).toFixed(2)}%`);

  useEffect(() => {
    progressValue.set(progressPercent);
  }, [progressPercent, progressValue]);

  if (hideRewardsHero) {
    return (
      <section className={`grid grid-cols-1 gap-3 ${hideProfileKpi ? 'sm:grid-cols-1' : 'sm:grid-cols-2'}`}>
        <KpiCard
          icon={CalendarDays}
          label="Citas proximas"
          value={upcomingAppointments}
          helper={upcomingHelperText}
          actionLabel="Agendar nueva"
          onAction={onNewAppointment}
          tone="accent"
        />
        {!hideProfileKpi ? (
          <KpiCard
            icon={UserRound}
            label="Perfil"
            value={profileCompleted ? 'Completo' : `${safeCompletionPercent}%`}
            helper={profileCompleted ? 'Tu perfil ya esta al dia.' : 'Completa tus datos para mejorar tu experiencia.'}
            actionLabel={profileCompleted ? 'Ver perfil' : 'Completar perfil'}
            onAction={onOpenProfile}
            tone={profileCompleted ? 'success' : 'default'}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
      <article className="mf-glass-surface relative overflow-hidden rounded-[24px] border border-[var(--mf-btn-border)]/80 p-5 xl:col-span-2 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -left-12 top-8 h-44 w-44 rounded-full bg-[color:color-mix(in_srgb,var(--mf-accent)_26%,transparent)] blur-3xl" />
          <div className="absolute -right-10 -top-8 h-40 w-40 rounded-full bg-[color:color-mix(in_srgb,var(--mf-accent)_16%,transparent)] blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,170,97,0.12),transparent_48%)]" />
        </div>

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Masterpuntos</p>
              <h2 className="mf-font-display mt-2 text-3xl leading-[0.95] text-[var(--mf-text)] sm:text-[44px]">
                Ruta a tu cortesía
              </h2>
              <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                Acumula citas hasta llegar a los {MASTERPUNTOS_META} puntos y desbloquear tu regalo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
                <Gift size={15} />
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--mf-accent)]">
                <Coins size={14} />
                {safeMasterpuntos} pts
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_74%,transparent)] p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">
              <span>Progreso actual</span>
              <span>{progressPoints}/{MASTERPUNTOS_META}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--mf-nav-border)_68%,transparent)]">
              <motion.div
                className="relative h-full overflow-hidden rounded-full bg-[linear-gradient(90deg,var(--mf-accent),color-mix(in_srgb,var(--mf-accent)_72%,white_28%))] shadow-[0_0_24px_color-mix(in_srgb,var(--mf-accent)_40%,transparent)]"
                style={{ width: progressWidth }}
              >
                {!reduceMotion ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#f6d79b]/85 to-transparent mix-blend-screen"
                    animate={{ x: ['-120%', '320%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                  />
                ) : null}
              </motion.div>
            </div>

            <div className="mt-3 grid grid-cols-10 gap-1.5 sm:gap-2">
              {Array.from({ length: MASTERPUNTOS_META }).map((_, index) => {
                return (
                  <MasterpuntoSlot
                    key={`masterpunto-slot-${index + 1}`}
                    index={index}
                    progressSpring={progressSpring}
                    reduceMotion={reduceMotion}
                  />
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={onNewAppointment}
            className="mf-accent-gradient mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
          >
            <Sparkles size={15} />
            Sumar puntos con una cita
          </button>
        </div>
      </article>

      <div className={`grid grid-cols-1 gap-3 ${hideProfileKpi ? 'sm:grid-cols-1 xl:grid-cols-1' : 'sm:grid-cols-2 xl:grid-cols-1'}`}>
        <KpiCard
          icon={CalendarDays}
          label="Citas próximas"
          value={upcomingAppointments}
          helper={upcomingHelperText}
          actionLabel="Agendar nueva"
          onAction={onNewAppointment}
          tone="accent"
        />
        {!hideProfileKpi ? (
          <KpiCard
            icon={UserRound}
            label="Perfil"
            value={profileCompleted ? 'Completo' : `${safeCompletionPercent}%`}
            helper={profileCompleted ? 'Tu perfil ya está al día.' : 'Completa tus datos para mejorar tu experiencia.'}
            actionLabel={profileCompleted ? 'Ver perfil' : 'Completar perfil'}
            onAction={onOpenProfile}
            tone={profileCompleted ? 'success' : 'default'}
          />
        ) : null}
      </div>
    </section>
  );
}
