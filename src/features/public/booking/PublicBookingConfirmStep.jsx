import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/button.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { usePublicBookingFlow } from './BookingFlowContext.jsx';
import BookingActions from './components/BookingActions.jsx';
import BookingStepHeader from './components/BookingStepHeader.jsx';
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
    confirmHoldWithoutPayment,
    holdResult,
    holdPricing,
    cancelBookingFlow,
    canConfirmWithoutPayment,
    paymentRequired,
    mode = 'public',
    canUseClienteHold = false,
  } = usePublicBookingFlow();
  const notifications = useNotifications();
  const [submitting, setSubmitting] = useState(false);
  const hasHoldReady = Boolean(holdResult && String(holdResult?.id_grupo_cita || '').trim());

  const subtotalFallback = bookingBlocksSummary.reduce(
    (acc, block) => acc + Number(block?.total_hnl || 0),
    0
  );
  const subtotalApi = Number(holdPricing?.subtotal_hnl ?? holdResult?.subtotal_hnl ?? holdResult?.monto_total_hnl ?? 0);
  const subtotalResolved = Number.isFinite(subtotalApi) && subtotalApi > 0 ? subtotalApi : subtotalFallback;
  const descuento = Number(holdPricing?.descuento_total_hnl ?? holdResult?.descuento_total_hnl ?? 0);
  const coveredByPlan = Number(holdPricing?.cubierto_por_plan_hnl || 0);
  const coveredByReward = Number(holdPricing?.cubierto_por_recompensa_hnl || 0);
  const coveredTotal = Math.max(0, coveredByPlan + coveredByReward);
  const extrasToPay = Number(
    holdPricing?.extras_a_pagar_hnl
    ?? holdResult?.extras_a_pagar_hnl
    ?? holdResult?.total_pagar_hnl
    ?? 0
  );
  const totalToPayApi = Number(holdPricing?.total_pagar_hnl ?? holdResult?.total_pagar_hnl ?? 0);
  const subtotalMenosDescuento = Math.max(0, subtotalResolved - Math.max(0, descuento));
  const totalServiciosNeto = Math.max(0, subtotalMenosDescuento - coveredTotal);
  const hasBackendTotal = hasHoldReady && Number.isFinite(totalToPayApi);
  const totalToPay = hasBackendTotal ? Math.max(0, totalToPayApi) : totalServiciosNeto;
  const requiresOnlinePayment = Boolean(paymentRequired && totalToPay > 0);
  const totalLabel = paymentRequired ? 'Total a pagar' : 'Total a pagar en salón';
  const showExtrasRow = Number.isFinite(extrasToPay) && extrasToPay > 0;
  const mustLoginForNoPaymentConfirmation = Boolean(!requiresOnlinePayment && !canUseClienteHold);

  const handleContinueAction = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      let currentHold = holdResult;
      if (!currentHold && typeof submitHold === 'function') {
        currentHold = await submitHold();
      }
      if (!currentHold) return;

      const backendTotalToPay = Number(
        currentHold?.total_pagar_hnl
        ?? currentHold?.monto_pendiente_hnl
        ?? NaN
      );
      const hasResolvedBackendTotal = Number.isFinite(backendTotalToPay);
      if (paymentRequired && (!hasResolvedBackendTotal || backendTotalToPay > 0)) {
        if (typeof startCheckout === 'function') {
          await startCheckout();
        }
        return;
      }

      if (!canUseClienteHold) {
        return;
      }

      const resolvedTotalToPay = Number(
        currentHold?.total_pagar_hnl
        ?? currentHold?.monto_pendiente_hnl
        ?? holdPricing?.total_pagar_hnl
        ?? 0
      );
      const canConfirmNow = Boolean(
        !paymentRequired
        || canConfirmWithoutPayment
        || (Number.isFinite(resolvedTotalToPay) && resolvedTotalToPay === 0)
      );
      if (!canConfirmNow) return;

      const localGroupId = String(currentHold?.id_grupo_cita || '').trim();
      if (!localGroupId) {
        notifications.error('No se pudo preparar la reserva para confirmar. Vuelve a agenda e inténtalo de nuevo.', {
          dedupeKey: 'public-booking-confirm-no-payment-group-missing',
        });
        return;
      }

      if (typeof confirmHoldWithoutPayment === 'function') {
        await confirmHoldWithoutPayment({
          idGrupoCita: localGroupId,
          totalPagarHnl: resolvedTotalToPay,
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getDedupedServices = (block) => Array.from(
    new Map(
      (Array.isArray(block?.selectedServices) ? block.selectedServices : [])
        .map((service) => [String(service?.id_servicio || '').trim(), service])
        .filter(([serviceId]) => Boolean(serviceId))
    ).values()
  );

  return (
    <div className="citas-confirm-wrap">
      <div className="citas-surface p-5">
        <BookingStepHeader
          title="Resumen de cita"
          headingLevel="h3"
          titleClassName="citas-confirm-title"
        />
        {mode === 'preview' ? (
          <p className="citas-selected-date mt-2">Modo vista previa: puedes validar estructura y reglas antes de publicar.</p>
        ) : null}
        {!hasHoldReady ? (
          <p className="citas-selected-date mt-2">
            El bloqueo del horario se realizará cuando continúes a pago o confirmes la reserva.
          </p>
        ) : null}
        {Number(coveredByReward) > 0 ? (
          <>
            <p className="citas-selected-date mt-2 text-emerald-200">
              Cubierto por recompensa: {holdPricing?.recompensa_servicio_nombre || 'Servicio de cortesía'}.
            </p>
            <p className="citas-selected-date text-emerald-100">
              Tus 10 puntos se descontarán cuando confirmes la cita.
            </p>
          </>
        ) : null}

        <div className="citas-confirm-services mt-4">
          <h4 className="citas-confirm-subtitle">Detalle por persona</h4>
          {bookingBlocksSummary.map((block) => (
            <article key={block.id} className="citas-confirm-service-item">
              <span>
                {block.alias} - {block.barbero?.nombre_completo || 'Barbero por asignar'}
              </span>
              <span>
                {formatDateOnly(block.selectedDate)} {formatTime12Hour(block.selectedTime)}
              </span>
              <span>
                {block.selection_type === 'package' ? `Paquete: ${block.selectedPackage?.nombre_paquete || 'Sin paquete'}` : ''}
                {block.selection_type === 'mixed' ? `Paquete + ${getDedupedServices(block).length} servicios` : ''}
                {block.selection_type === 'services'
                  ? getDedupedServices(block).map((service) => {
                    const baseName = String(service?.nombre_servicio || '').trim() || 'Servicio';
                    if (service?.coveredByReward) return `${baseName} (Cubierto por recompensa)`;
                    return service?.coveredByPlan ? `${baseName} (Cubierto por tu plan)` : baseName;
                  }).join(', ')
                  : ''}
              </span>
            </article>
          ))}
        </div>

        <div className="citas-confirm-row mt-4">
          <span>Total servicios</span>
          <span>{formatCurrencyHnl(subtotalResolved)}</span>
        </div>
        <div className="citas-confirm-row">
          <span>Descuento</span>
          <span>-{formatCurrencyHnl(Math.max(0, descuento))}</span>
        </div>
        {coveredByReward > 0 ? (
          <div className="citas-confirm-row">
            <span>Cubierto por recompensa</span>
            <span>-{formatCurrencyHnl(coveredByReward)}</span>
          </div>
        ) : null}
        {coveredByPlan > 0 ? (
          <div className="citas-confirm-row">
            <span>Cubierto por tu plan</span>
            <span>-{formatCurrencyHnl(coveredByPlan)}</span>
          </div>
        ) : null}
        {showExtrasRow ? (
          <div className="citas-confirm-row">
            <span>Extras a pagar</span>
            <span>{formatCurrencyHnl(extrasToPay)}</span>
          </div>
        ) : null}
        <div className="citas-confirm-row">
          <span>ISV</span>
          <span>{formatCurrencyHnl(0)}</span>
        </div>
        <div className="citas-confirm-row mt-1">
          <span>{totalLabel}</span>
          <span>{formatCurrencyHnl(totalToPay)}</span>
        </div>

        <div className="public-booking-payment-note mt-4">
          <span>
            ¿Tienes cuenta activa? Inicia sesión para acumular puntos por citas de acompañantes pagadas.
          </span>
        </div>

        <BookingActions inline className="mt-4">
          <Button variant="outline" className="gap-2" onClick={goToAgenda} disabled={submitting}>
            <ArrowLeft size={15} />
            Volver a agenda
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              void cancelBookingFlow();
            }}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            className="gap-2"
            onClick={handleContinueAction}
            disabled={
              submitting
              || (!requiresOnlinePayment && paymentRequired && !canConfirmWithoutPayment)
              || (!requiresOnlinePayment && !canUseClienteHold)
            }
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {requiresOnlinePayment ? 'Continuar al pago' : 'Confirmar cita'}
            <ArrowRight size={15} />
          </Button>
        </BookingActions>
        {mustLoginForNoPaymentConfirmation ? (
          <p className="citas-selected-date mt-2">
            Para confirmar sin pago en línea debes iniciar sesión.
          </p>
        ) : null}
      </div>
    </div>
  );
}
