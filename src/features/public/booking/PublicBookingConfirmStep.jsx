import { AlertTriangle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
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
    confirmHoldWithoutPayment,
    holdResult,
    holdPricing,
    canConfirmWithoutPayment,
    mode = 'public',
  } = usePublicBookingFlow();
  const [submitting, setSubmitting] = useState(false);
  const hasHoldReady = Boolean(holdResult && String(holdResult?.id_grupo_cita || '').trim());

  const handleContinueAction = async () => {
    if (submitting) return;
    if (!hasHoldReady) return;
    setSubmitting(true);
    try {
      const localGroupId = String(holdResult?.id_grupo_cita || '').trim();
      if (!localGroupId) return;
      const resolvedTotalToPay = Number(
        holdPricing?.total_pagar_hnl
        ?? holdResult?.total_pagar_hnl
        ?? 0
      );
      const canConfirmNow = Boolean(
        canConfirmWithoutPayment
        || (
          Number.isFinite(resolvedTotalToPay)
          && resolvedTotalToPay === 0
          && String(holdResult?.id_grupo_cita || '').trim()
        )
      );
      if (resolvedTotalToPay === 0 && canConfirmNow) {
        if (typeof confirmHoldWithoutPayment === 'function') {
          await confirmHoldWithoutPayment({
            idGrupoCita: localGroupId,
            totalPagarHnl: resolvedTotalToPay,
          });
        }
        return;
      }
      if (typeof startCheckout === 'function') {
        await startCheckout();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!hasHoldReady) {
    return (
      <div className="citas-confirm-wrap">
        <div className="citas-surface p-5">
          <h3 className="citas-confirm-title">Resumen de cita</h3>
          <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="inline-flex items-center gap-2 font-semibold text-amber-200">
              <AlertTriangle size={15} />
              No se pudo preparar tu reserva. Vuelve a agenda.
            </p>
            <p className="mt-2">Necesitamos generar el hold de tu cita antes de mostrar el resumen final.</p>
          </div>
          <div className="public-booking-actions is-inline mt-4">
            <Button variant="outline" className="gap-2" onClick={goToAgenda}>
              <ArrowLeft size={15} />
              Volver a agenda
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const subtotal = Number(holdPricing?.subtotal_hnl || 0);
  const coveredByPlan = Number(holdPricing?.cubierto_por_plan_hnl || 0);
  const coveredByReward = Number(holdPricing?.cubierto_por_recompensa_hnl || 0);
  const extrasToPay = Number(holdPricing?.extras_a_pagar_hnl || 0);
  const totalToPay = Number(holdPricing?.total_pagar_hnl || 0);
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
        <h3 className="citas-confirm-title">Resumen de cita</h3>
        {mode === 'preview' ? (
          <p className="citas-selected-date mt-2">Modo vista previa: puedes validar estructura y reglas antes de publicar.</p>
        ) : null}
        {Number(coveredByReward) > 0 ? (
          <>
            <p className="citas-selected-date mt-2 text-emerald-200">
              Cubierto por recompensa: {holdPricing?.recompensa_servicio_nombre || 'Servicio de cortesia'}.
            </p>
            <p className="citas-selected-date text-emerald-100">
              Tus 10 puntos se descontaran cuando confirmes la cita.
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
          <span>{formatCurrencyHnl(subtotal)}</span>
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
        <div className="citas-confirm-row">
          <span>Extras a pagar</span>
          <span>{formatCurrencyHnl(extrasToPay)}</span>
        </div>
        <div className="citas-confirm-row mt-1">
          <span>Total a pagar</span>
          <span>{formatCurrencyHnl(totalToPay)}</span>
        </div>

        <div className="public-booking-payment-note mt-4">
          <span>
            Tienes cuenta activa? Inicia sesion para acumular puntos por citas de acompanantes pagadas.
          </span>
        </div>

        <div className="public-booking-actions is-inline mt-4">
          <Button variant="outline" className="gap-2" onClick={goToAgenda} disabled={submitting}>
            <ArrowLeft size={15} />
            Volver a agenda
          </Button>
          <Button
            className="gap-2"
            onClick={handleContinueAction}
            disabled={submitting || (Number(totalToPay) === 0 && !canConfirmWithoutPayment)}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {Number(totalToPay) === 0 ? 'Confirmar cita' : 'Continuar al pago'}
            <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}

