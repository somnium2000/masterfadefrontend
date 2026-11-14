import { useEffect, useState } from 'react';
import { CalendarDays, Info, X } from 'lucide-react';

// Aviso temporal exclusivamente informativo. Martes 17/11/2026 00:00, Honduras (UTC-6).
const EXPIRES_AT = Date.parse('2026-11-17T00:00:00-06:00');
const DISMISS_KEY = 'mf-agendamiento-aviso-2026-11-17';

function shouldShowNotice() {
  if (Date.now() >= EXPIRES_AT) return false;
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) !== 'dismissed';
  } catch {
    return true;
  }
}

export default function TemporaryBookingNotice() {
  const [visible, setVisible] = useState(shouldShowNotice);

  useEffect(() => {
    if (!visible) return undefined;
    const remaining = EXPIRES_AT - Date.now();
    if (remaining <= 0) {
      // Verificación diferida para evitar trabajo adicional durante el render.
      const timeout = window.setTimeout(() => setVisible(false), 0);
      return () => window.clearTimeout(timeout);
    }
    const timeout = window.setTimeout(() => setVisible(false), remaining);
    return () => window.clearTimeout(timeout);
  }, [visible]);

  if (!visible || Date.now() >= EXPIRES_AT) return null;

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, 'dismissed');
    } catch {
      // El aviso también se puede cerrar cuando el almacenamiento está deshabilitado.
    }
    setVisible(false);
  }

  return (
    <aside
      role="status"
      aria-label="Comunicado temporal sobre el agendamiento en MasterFade"
      className="fixed bottom-4 left-4 right-4 z-[150] mx-auto max-h-[min(78vh,640px)] max-w-[460px] overflow-y-auto rounded-[22px] border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-5 text-[var(--mf-text)] shadow-[0_24px_70px_rgba(0,0,0,0.45)] sm:bottom-6 sm:left-auto sm:right-6 sm:mx-0 sm:w-[460px]"
      style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.17em] text-[var(--mf-accent)]">
          <Info size={17} aria-hidden="true" />
          Comunicado
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar comunicado"
          title="Cerrar comunicado"
          className="mf-focus-ring -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition hover:opacity-80"
        >
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <h2 className="text-lg font-bold leading-snug sm:text-xl">
        Información importante sobre el agendamiento
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--mf-text-2)]">
        Debido a una incidencia técnica en un proveedor externo de procesamiento de pagos, el agendamiento en línea de <strong className="text-[var(--mf-text)]">MasterFade</strong> se encuentra temporalmente pausado. Esta situación no es atribuible a MasterFade.
      </p>
      <div className="mt-4 space-y-2 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
        <div className="flex items-start gap-3">
          <CalendarDays size={18} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" aria-hidden="true" />
          <p className="text-sm leading-relaxed"><strong>Martes 17 de noviembre:</strong> está prevista la reanudación del agendamiento en la web.</p>
        </div>
        <div className="border-t border-[var(--mf-nav-border)]" />
        <div className="flex items-start gap-3">
          <CalendarDays size={18} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" aria-hidden="true" />
          <p className="text-sm leading-relaxed"><strong>Miércoles 18 de noviembre:</strong> comenzará la atención de las citas programadas desde el martes.</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--mf-text-2)]">
        Somnium IA trabaja en coordinación con el proveedor para restablecer un proceso seguro y confiable. Agradecemos su comprensión.
      </p>
    </aside>
  );
}
