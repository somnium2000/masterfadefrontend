import { ArrowLeft, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import {
  formatCurrencyHnl,
  formatDateOnly,
  formatTime12Hour,
  HONDURAS_TIME_ZONE,
} from './bookingUtils.js';

function HoldResultSummary({ holdResult, holdDurationMin, mode = 'public' }) {
  if (!holdResult) return null;

  const expiresAt = holdResult.expires_at ? new Date(holdResult.expires_at) : null;
  const bloques = Array.isArray(holdResult.bloques) ? holdResult.bloques : [];

  return (
    <div className="citas-surface p-5 public-booking-success">
      <div className="public-booking-success-head">
        <CheckCircle2 size={18} />
        <span>{mode === 'preview' ? 'Simulacion completada' : 'Reserva grupal creada con exito'}</span>
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
        <span>Expira hold</span>
        <span>{expiresAt ? expiresAt.toLocaleString('es-HN', { timeZone: HONDURAS_TIME_ZONE }) : 'N/D'}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Duracion de hold</span>
        <span>{holdDurationMin} min</span>
      </div>

      {bloques.length > 0 ? (
        <div className="citas-confirm-services mt-3">
          <h4 className="citas-confirm-subtitle">Detalle del grupo</h4>
          {bloques.map((block) => (
            <div key={block.id_cita || `${block.orden_integrante}-${block.alias}`} className="citas-confirm-service-item">
              <span>
                {block.alias || `Integrante ${block.orden_integrante || ''}`}: {block.nombre_barbero || 'Barbero'}
              </span>
              <span>{formatTime12Hour(block.hora || '')}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function PublicBookingConfirmStep() {
  const booking = usePublicBookingFlow();
  const {
    bookingBlocksSummary,
    holdDurationMin,
    holdResult,
    holdSubmitting,
    mode = 'public',
    paymentRequired,
    submitHold,
    totalToPay,
    goToAgenda,
  } = booking;

  return (
    <>
      <div className="citas-confirm-wrap">
        <div className="citas-surface p-5">
          <h3 className="citas-confirm-title">
            {mode === 'preview' ? 'Simular reserva grupal' : 'Confirmar reserva grupal'}
          </h3>

          <div className="mt-4">
            <div className="citas-confirm-row">
              <span>Integrantes</span>
              <span>{bookingBlocksSummary.length}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Duracion hold</span>
              <span>{holdDurationMin} min</span>
            </div>
            <div className="citas-confirm-row">
              <span>Total servicios</span>
              <span>{formatCurrencyHnl(totalToPay)}</span>
            </div>
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
              {paymentRequired
                ? 'Pago total obligatorio activo. La pasarela se integra en la siguiente iteracion.'
                : 'La pasarela de pago aun no esta integrada en este flujo.'}
            </span>
          </div>

          <div className="public-booking-actions is-inline mt-4">
            <Button variant="outline" className="gap-2" onClick={goToAgenda} disabled={holdSubmitting}>
              <ArrowLeft size={15} />
              Volver a agenda
            </Button>
            <Button className="gap-2" onClick={submitHold} disabled={holdSubmitting}>
              {holdSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {holdSubmitting
                ? (mode === 'preview' ? 'Simulando reserva...' : 'Creando reserva...')
                : (mode === 'preview' ? 'Simular reserva grupal' : 'Crear reserva grupal')}
            </Button>
          </div>
        </div>

        <HoldResultSummary holdResult={holdResult} holdDurationMin={holdDurationMin} mode={mode} />
      </div>
    </>
  );
}
