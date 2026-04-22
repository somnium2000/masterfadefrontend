import { CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import { buildBookingShortCode, formatCurrencyHnl } from './bookingUtils.js';

export default function PublicBookingSuccessStep() {
  const {
    bookingBlocksSummary,
    completeBookingFlow,
    holdResult,
    paymentResult,
    totalToPay,
  } = usePublicBookingFlow();
  const bookingCode = buildBookingShortCode(holdResult?.id_grupo_cita || null, 5);

  return (
    <div className="citas-confirm-wrap">
      <div className="citas-surface p-5 public-booking-success">
        <div className="public-booking-success-head">
          <CheckCircle2 size={20} />
          <span>Pago confirmado y reserva cerrada</span>
        </div>

        <div className="public-booking-final-code mt-3">
          Codigo de cita: <strong>{bookingCode}</strong>
        </div>

        <div className="citas-confirm-row">
          <span>Estado de pago</span>
          <span>{paymentResult?.estado_intent_codigo || 'pagado'}</span>
        </div>
        <div className="citas-confirm-row">
          <span>Total pagado</span>
          <span>{formatCurrencyHnl(paymentResult?.monto_hnl || totalToPay)}</span>
        </div>

        <div className="citas-confirm-services mt-4">
          <h4 className="citas-confirm-subtitle">Citas confirmadas</h4>
          {bookingBlocksSummary.map((block) => (
            <div key={block.id} className="citas-confirm-service-item">
              <span>{block.alias}</span>
              <span>{block.barbero?.nombre_completo || 'Barbero'}</span>
            </div>
          ))}
        </div>

        <div className="public-booking-actions mt-4">
          <Button onClick={completeBookingFlow}>Agendar una nueva cita desde inicio</Button>
        </div>
      </div>
    </div>
  );
}
