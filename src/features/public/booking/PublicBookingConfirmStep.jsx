import { ArrowLeft, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import {
  formatCurrencyHnl,
  formatDateOnly,
  formatTime12Hour,
  HONDURAS_TIME_ZONE,
} from './bookingUtils.js';

function formatRemainingTime(remainingMs) {
  if (remainingMs == null) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getServicesLabel(block, bookingBlocksSummary) {
  const source = Array.isArray(bookingBlocksSummary)
    ? bookingBlocksSummary.find((item) => item?.id === block?.id || item?.alias === block?.alias)
    : null;

  const services = Array.isArray(source?.selectedServices)
    ? source.selectedServices.map((service) => service?.nombre_servicio).filter(Boolean)
    : [];

  return services.length ? services.join(', ') : 'Sin servicios';
}

function HoldResultSummary({ holdResult, holdDurationMin, bookingBlocksSummary, mode = 'public', onBackHome }) {
  if (!holdResult) return null;

  const expiresAt = holdResult.expires_at ? new Date(holdResult.expires_at) : null;
  const bloques = Array.isArray(holdResult.bloques) ? holdResult.bloques : [];

  return (
    <div className="citas-surface p-5 public-booking-success">
      <div className="public-booking-success-head">
        <CheckCircle2 size={18} />
        <span>{mode === 'preview' ? 'Simulación completada' : 'Reserva confirmada con éxito'}</span>
      </div>

      <div className="citas-confirm-row">
        <span>ID grupo</span>
        <span>{holdResult.id_grupo_cita || 'N/D'}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Integrantes</span>
        <span>{bloques.length}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Total servicios</span>
        <span>{formatCurrencyHnl(holdResult.monto_total_hnl || 0)}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Cubierto por plan</span>
        <span>{formatCurrencyHnl(holdResult.descuento_total_hnl || 0)}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Extras pendientes</span>
        <span>{formatCurrencyHnl(holdResult.total_pagar_hnl || holdResult.extras_pendientes_hnl || 0)}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Expira hold</span>
        <span>{expiresAt ? expiresAt.toLocaleString('es-HN', { timeZone: HONDURAS_TIME_ZONE }) : 'N/D'}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Duración de hold</span>
        <span>{holdDurationMin} min</span>
      </div>

      {bloques.length > 0 ? (
        <div className="citas-confirm-services mt-3">
          <h4 className="citas-confirm-subtitle">Resumen confirmado</h4>
          {bloques.map((block) => (
            <div key={block.id_cita || `${block.orden_integrante}-${block.alias}`} className="citas-confirm-service-item">
              <span>
                {block.alias || `Integrante ${block.orden_integrante || ''}`}: {block.nombre_barbero || 'Barbero'}
              </span>
              <span>{formatDateOnly(block.fecha || '')} {formatTime12Hour(block.hora || '')}</span>
              <span>{getServicesLabel(block, bookingBlocksSummary)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="public-booking-actions is-inline mt-4">
        <Button className="gap-2" onClick={onBackHome}>
          Volver al inicio
        </Button>
      </div>
    </div>
  );
}

export default function PublicBookingConfirmStep() {
  const booking = usePublicBookingFlow();
  const {
    bookingBlocksSummary,
    completeBookingFlow,
    holdExpired,
    holdExpiresAtIso,
    holdRemainingMs,
    holdDurationMin,
    holdResult,
    holdSubmitting,
    mode = 'public',
    paymentRequired,
    simulationNoPayment,
    submitHold,
    totalToPay,
    goToAgenda,
  } = booking;

  return (
    <>
      <div className="citas-confirm-wrap">
        <div className="citas-surface p-5">
          <h3 className="citas-confirm-title">
            {mode === 'preview' ? 'Simular reserva grupal' : 'Confirmar Reserva'}
          </h3>

          <div className="mt-4">
            <div className="citas-confirm-row">
              <span>Integrantes</span>
              <span>{bookingBlocksSummary.length}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Tiempo restante</span>
              <span>{formatRemainingTime(holdRemainingMs)}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Expira a las</span>
              <span>
                {holdExpiresAtIso
                  ? new Date(holdExpiresAtIso).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: HONDURAS_TIME_ZONE })
                  : 'N/D'}
              </span>
            </div>
            <div className="citas-confirm-row">
              <span>Duración hold</span>
              <span>{holdDurationMin} min</span>
            </div>
      <div className="citas-confirm-row">
        <span>Total servicios</span>
        <span>{formatCurrencyHnl(totalToPay)}</span>
      </div>
      {holdResult?.membresia?.cobertura_activa ? (
        <div className="citas-confirm-row">
          <span>Plan activo</span>
          <span>{holdResult?.membresia?.nombre_plan || 'Membresía activa'}</span>
        </div>
      ) : null}
    </div>

          <div className="citas-confirm-services mt-4">
            <h4 className="citas-confirm-subtitle">Resumen por integrante</h4>
            {bookingBlocksSummary.map((block) => (
              <div key={block.id} className="citas-confirm-service-item">
                <span>
                  {block.alias}: {block.selectedServices.map((service) => service.nombre_servicio).join(', ') || 'Sin servicios'}
                  {' '}
                  ({formatDateOnly(block.selectedDate)} {formatTime12Hour(block.selectedTime || '')})
                </span>
                <span>{formatCurrencyHnl(block.total_hnl)}</span>
              </div>
            ))}
          </div>

          <div className="public-booking-payment-note mt-4">
            <Clock3 size={14} />
            <span>
              {simulationNoPayment
                ? 'Simulación activa: por pruebas, no se realizará cobro ni pasarela en esta fase.'
                : paymentRequired
                  ? 'Pago total obligatorio activo. La pasarela se integra en la siguiente iteración.'
                  : 'La pasarela de pago aún no está integrada en este flujo.'}
            </span>
          </div>

          {holdExpired ? (
            <p className="mt-3 rounded-[12px] border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              El tiempo de confirmación expiró. Si la hora sigue libre, puedes crear la reserva de nuevo.
            </p>
          ) : null}

          <div className="public-booking-actions is-inline mt-4">
            <Button variant="outline" className="gap-2" onClick={goToAgenda} disabled={holdSubmitting || Boolean(holdResult)}>
              <ArrowLeft size={15} />
              Volver a agenda
            </Button>
            <Button className="gap-2" onClick={submitHold} disabled={holdSubmitting || Boolean(holdResult)}>
              {holdSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {holdSubmitting
                ? (mode === 'preview' ? 'Simulando reserva...' : 'Creando Reserva...')
                : (mode === 'preview' ? 'Simular reserva grupal' : 'Crear Reserva')}
            </Button>
          </div>
        </div>

        <HoldResultSummary
          holdResult={holdResult}
          holdDurationMin={holdDurationMin}
          bookingBlocksSummary={bookingBlocksSummary}
          mode={mode}
          onBackHome={completeBookingFlow}
        />
      </div>
    </>
  );
}
