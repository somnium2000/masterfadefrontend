import { useState } from 'react';
import { CalendarDays, Info, X } from 'lucide-react';

// Comunicado sin vencimiento automatico. Solo se retirara mediante un cambio aprobado.
// Se conserva la clave de cierre por sesion para no alterar el comportamiento existente.
const DISMISS_KEY = 'mf-agendamiento-aviso-2026-11-17';

function shouldShowNotice() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) !== 'dismissed';
  } catch {
    return true;
  }
}

export default function TemporaryBookingNotice() {
  const [visible, setVisible] = useState(shouldShowNotice);

  if (!visible) return null;

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, 'dismissed');
    } catch {
      // El comunicado tambien se puede cerrar si el almacenamiento esta deshabilitado.
    }
    setVisible(false);
  }

  return (
    <aside
      role="status"
      aria-label="Comunicado sobre el agendamiento en MasterFade"
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
        Aviso importante sobre el agendamiento de citas
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--mf-text-2)]">
        Estimados clientes:
      </p>
      <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
        <div className="flex items-start gap-3">
          <CalendarDays size={18} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" aria-hidden="true" />
          <p className="text-sm leading-relaxed">
            La habilitación del <strong>agendamiento de citas en línea ha sido postergada hasta nuevo aviso.</strong> La fecha anunciada anteriormente ya no está vigente.
          </p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-[var(--mf-text-2)]">
        Estamos realizando las verificaciones y ajustes necesarios para garantizar que el proceso de reserva y confirmación de citas funcione de manera segura y confiable.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-[var(--mf-text-2)]">
        Nuestro compromiso es habilitar este servicio tan pronto como se encuentre completamente listo. Comunicaremos su disponibilidad a través de nuestros canales oficiales, sin establecer una nueva fecha hasta tener la certeza de su correcto funcionamiento.
      </p>
      <p className="mt-3 text-xs leading-relaxed text-[var(--mf-text-2)]">
        Agradecemos sinceramente su paciencia, comprensión y confianza.
        <strong className="mt-1 block text-[var(--mf-text)]">Equipo MasterFade</strong>
      </p>
    </aside>
  );
}
