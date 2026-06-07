import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './BookingFlowContext.jsx';
import BookingActions from './components/BookingActions.jsx';
import {
  buildBookingShortCode,
  formatCurrencyHnl,
  normalizeBookingPaymentUiState,
} from './bookingUtils.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toSafeCode(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (UUID_PATTERN.test(normalized)) return '';
  if (normalized.length > 30) return '';
  return normalized;
}

function collectCodesFromList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => toSafeCode(item?.codigo_cita))
    .filter(Boolean);
}

function resolveBookingCodes({ bookingSuccessResult, paymentResult, holdResult }) {
  const candidates = [
    toSafeCode(bookingSuccessResult?.codigo_cita),
    toSafeCode(bookingSuccessResult?.confirmation?.codigo_cita),
    ...collectCodesFromList(bookingSuccessResult?.citas_confirmadas),
    ...collectCodesFromList(bookingSuccessResult?.confirmation?.citas_confirmadas),
    toSafeCode(bookingSuccessResult?.paymentResult?.codigo_cita),
    ...collectCodesFromList(bookingSuccessResult?.paymentResult?.citas_confirmadas),
    toSafeCode(paymentResult?.codigo_cita),
    toSafeCode(paymentResult?.data?.codigo_cita),
    toSafeCode(paymentResult?.confirmation?.codigo_cita),
    toSafeCode(paymentResult?.confirmation?.data?.codigo_cita),
    toSafeCode(holdResult?.codigo_cita),
    toSafeCode(holdResult?.data?.codigo_cita),
    ...collectCodesFromList(paymentResult?.citas_confirmadas),
    ...collectCodesFromList(paymentResult?.citas),
    ...collectCodesFromList(paymentResult?.confirmation?.citas_confirmadas),
    ...collectCodesFromList(paymentResult?.confirmation?.citas),
    ...collectCodesFromList(holdResult?.citas_confirmadas),
    ...collectCodesFromList(holdResult?.citas),
  ];
  return Array.from(new Set(candidates.filter(Boolean)));
}

export default function PublicBookingSuccessStep() {
  const {
    bookingSuccessResult,
    bookingBlocksSummary,
    checkingPaymentStatus,
    completeBookingFlow,
    holdResult,
    paymentIntent,
    paymentResult,
    refreshPaymentStatus,
    holdTotalToPay,
    totalToPay,
  } = usePublicBookingFlow();
  const bookingCodes = resolveBookingCodes({ bookingSuccessResult, paymentResult, holdResult });
  const paymentUiState = normalizeBookingPaymentUiState({
    paymentIntent,
    paymentResult,
    bookingSuccessResult,
    holdTotalToPay,
    totalToPay,
  });
  const isConfirmedUi = paymentUiState.status === 'confirmed' || paymentUiState.status === 'paid';
  const paymentLabelLower = String(paymentUiState.paymentLabel || '').trim().toLowerCase();
  const coveredByPlanHnl = Number(
    bookingSuccessResult?.cubierto_por_plan_hnl
    ?? holdResult?.membresia?.cubierto_por_plan_hnl
    ?? holdResult?.pricing?.cubierto_por_plan_hnl
    ?? 0
  );
  const isCoveredByPlan = paymentLabelLower === 'cubierto_por_plan' || coveredByPlanHnl > 0;
  const fallbackShortCode = buildBookingShortCode(holdResult?.id_grupo_cita || null, 5);
  const hasRealCode = bookingCodes.length > 0;
  const displayCodes = hasRealCode
    ? bookingCodes
    : (fallbackShortCode && fallbackShortCode !== 'N/A' ? [fallbackShortCode] : []);

  return (
    <div className="citas-confirm-wrap">
      <div className={`citas-surface p-5 ${isConfirmedUi ? 'public-booking-success' : ''}`.trim()}>
        <div className="public-booking-success-head">
          <CheckCircle2 size={20} />
          <span>{paymentUiState.text}</span>
        </div>

        {isConfirmedUi ? (
          <div className="public-booking-final-code mt-3">
            Codigo de cita:{' '}
            {displayCodes.length > 0 ? (
              <strong>{displayCodes.join(', ')}</strong>
            ) : (
              <strong>En proceso de asignacion</strong>
            )}
          </div>
        ) : (
          <div className="public-booking-final-code mt-3">
            <strong>El backend confirmará la reserva cuando el proveedor notifique el pago.</strong>
          </div>
        )}

        <div className="citas-confirm-row">
          <span>Estado de pago</span>
          <span>{paymentUiState.paymentLabel}</span>
        </div>
        {isCoveredByPlan ? (
          <>
            <div className="citas-confirm-row">
              <span>Cubierto por tu plan</span>
              <span>{formatCurrencyHnl(coveredByPlanHnl)}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Total pagado hoy</span>
              <span>{formatCurrencyHnl(paymentUiState.totalPagadoHnl)}</span>
            </div>
          </>
        ) : (
          <div className="citas-confirm-row">
            <span>Total pagado</span>
            <span>{formatCurrencyHnl(paymentUiState.totalPagadoHnl)}</span>
          </div>
        )}

        <div className="citas-confirm-services mt-4">
          <h4 className="citas-confirm-subtitle">{isConfirmedUi ? 'Citas confirmadas' : 'Resumen de citas'}</h4>
          {bookingBlocksSummary.map((block) => (
            <div key={block.id} className="citas-confirm-service-item">
              <span>{block.alias}</span>
              <span>{block.barbero?.nombre_completo || 'Barbero'}</span>
            </div>
          ))}
        </div>

        <BookingActions className="mt-4">
          {!isConfirmedUi && paymentIntent?.id_intent ? (
            <Button
              variant="outline"
              onClick={() => refreshPaymentStatus()}
              disabled={checkingPaymentStatus}
            >
              {checkingPaymentStatus ? <Loader2 size={16} className="animate-spin" /> : null}
              Verificar estado del pago
            </Button>
          ) : null}
          {isConfirmedUi ? (
            <Button onClick={completeBookingFlow}>Entendido</Button>
          ) : null}
        </BookingActions>
      </div>
    </div>
  );
}
