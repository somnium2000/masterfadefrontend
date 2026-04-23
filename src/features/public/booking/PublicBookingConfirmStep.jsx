import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import {
  formatCurrencyHnl,
  formatDateOnly,
  formatTime12Hour,
} from './bookingUtils.js';

export default function PublicBookingConfirmStep() {
  const {
    bookingBlocksSummary,
    goToAgenda,
    startCheckout,
    submitHold,
    mode = 'public',
    totalToPay,
  } = usePublicBookingFlow();
  const [submitting, setSubmitting] = useState(false);

  const handleContinueToPayment = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (typeof startCheckout === 'function') {
        await startCheckout();
      } else if (typeof submitHold === 'function') {
        await submitHold();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="citas-confirm-wrap">
      <div className="citas-surface p-5">
        <h3 className="citas-confirm-title">Resumen previo al pago</h3>
        {mode === 'preview' ? (
          <p className="citas-selected-date mt-2">Modo vista previa: puedes validar estructura y reglas antes de publicar.</p>
        ) : null}

        <div className="citas-confirm-services mt-4">
          <h4 className="citas-confirm-subtitle">Detalle por persona</h4>
          {bookingBlocksSummary.map((block) => (
            <article key={block.id} className="citas-confirm-service-item">
              <span>
                {block.alias} · {block.barbero?.nombre_completo || 'Barbero por asignar'}
              </span>
              <span>
                {formatDateOnly(block.selectedDate)} {formatTime12Hour(block.selectedTime)}
              </span>
              <span>
                {block.selection_type === 'package' ? `Paquete: ${block.selectedPackage?.nombre_paquete || 'Sin paquete'}` : ''}
                {block.selection_type === 'mixed' ? `Paquete + ${block.selectedServices.length} servicios` : ''}
                {block.selection_type === 'services' ? block.selectedServices.map((service) => service.nombre_servicio).join(', ') : ''}
              </span>
              <span>{formatCurrencyHnl(block.total_hnl)}</span>
            </article>
          ))}
        </div>

        <div className="citas-confirm-row mt-4">
          <span>Total general</span>
          <span>{formatCurrencyHnl(totalToPay)}</span>
        </div>

        <div className="public-booking-payment-note mt-4">
          <span>
            ¿Tienes cuenta activa? Inicia sesión para acumular puntos por citas de acompañantes pagadas.
          </span>
        </div>

        <div className="public-booking-actions is-inline mt-4">
          <Button variant="outline" className="gap-2" onClick={goToAgenda} disabled={submitting}>
            <ArrowLeft size={15} />
            Volver a agenda
          </Button>
          <Button className="gap-2" onClick={handleContinueToPayment} disabled={submitting}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            Continuar a pagar
            <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
