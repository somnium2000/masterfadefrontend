import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext.jsx';

const TYPE_META = {
  success: {
    icon: CheckCircle2,
    iconClass: 'text-emerald-300',
    accentClass: 'bg-emerald-400/70',
    role: 'status',
    live: 'polite',
  },
  info: {
    icon: Info,
    iconClass: 'text-sky-300',
    accentClass: 'bg-sky-400/70',
    role: 'status',
    live: 'polite',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-amber-300',
    accentClass: 'bg-amber-400/70',
    role: 'alert',
    live: 'assertive',
  },
  error: {
    icon: AlertCircle,
    iconClass: 'text-red-300',
    accentClass: 'bg-red-400/70',
    role: 'alert',
    live: 'assertive',
  },
  loading: {
    icon: Loader2,
    iconClass: 'text-[var(--mf-accent)] animate-spin',
    accentClass: 'bg-[var(--mf-accent)]/70',
    role: 'status',
    live: 'polite',
  },
};

function NotificationItem({ item, onDismiss, reducedMotion }) {
  const type = TYPE_META[item.type] ? item.type : 'info';
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  const motionProps = reducedMotion
    ? {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    }
    : {
      initial: { opacity: 0, y: -8, scale: 0.98 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: -6, scale: 0.98 },
    };

  return (
    <motion.article
      layout
      {...motionProps}
      transition={{ duration: reducedMotion ? 0.12 : 0.22, ease: 'easeOut' }}
      role={meta.role}
      aria-live={meta.live}
      className="relative overflow-hidden rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] shadow-[var(--mf-shadow-card)] backdrop-blur px-3.5 py-3"
    >
      <span className={`absolute inset-x-0 top-0 h-[2px] ${meta.accentClass}`} />
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 ${meta.iconClass}`} aria-hidden="true">
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          {item.title ? <p className="text-sm font-semibold text-[var(--mf-text)] leading-5">{item.title}</p> : null}
          <p className="text-sm text-[var(--mf-text-2)] leading-5 break-words">{item.message}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="mf-focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] transition-colors hover:text-[var(--mf-text)]"
          aria-label="Cerrar notificacion"
          title="Cerrar"
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>
    </motion.article>
  );
}

export default function NotificationsViewport() {
  const { notifications, dismiss } = useNotifications();
  const reducedMotion = useReducedMotion();
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-3 top-3 z-[140] flex flex-col gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[min(420px,calc(100vw-2rem))]">
      <AnimatePresence initial={false}>
        {notifications.map((item) => (
          <div key={item.id} className="pointer-events-auto">
            {/* AM: Microanimaciones sutiles; respeta reduced motion via framer hook. */}
            <NotificationItem item={item} onDismiss={dismiss} reducedMotion={reducedMotion} />
          </div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
