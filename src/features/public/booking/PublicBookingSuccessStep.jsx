import { useState } from 'react';
import ConfirmationCard, { useConfirmationSound } from '../../../components/feedback/ConfirmationCard.jsx';
import { CalendarDays, Copy, CreditCard, ReceiptText, UserRound, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './BookingFlowContext.jsx';
import BookingActions from './components/BookingActions.jsx';
import {
  buildBookingShortCode,
  formatCurrencyHnl,
  normalizeBookingPaymentUiState,
} from './bookingUtils.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const groupId = [
    holdResult?.id_grupo_cita,
    holdResult?.data?.id_grupo_cita,
    bookingSuccessResult?.id_grupo_cita,
    bookingSuccessResult?.confirmation?.id_grupo_cita,
    bookingSuccessResult?.confirmation?.data?.id_grupo_cita,
    bookingSuccessResult?.paymentResult?.id_grupo_cita,
    bookingSuccessResult?.paymentResult?.data?.id_grupo_cita,
    paymentResult?.id_grupo_cita,
    paymentResult?.data?.id_grupo_cita,
    paymentResult?.confirmation?.id_grupo_cita,
    paymentResult?.confirmation?.data?.id_grupo_cita,
  ].map((value) => String(value || '').trim()).find((value) => UUID_PATTERN.test(value));
  if (groupId) return [buildBookingShortCode(groupId, 5)];
  const groupCode = [
    bookingSuccessResult?.codigo_cita,
    bookingSuccessResult?.confirmation?.codigo_cita,
    bookingSuccessResult?.paymentResult?.codigo_cita,
    paymentResult?.codigo_cita,
    paymentResult?.data?.codigo_cita,
    paymentResult?.confirmation?.codigo_cita,
    paymentResult?.confirmation?.data?.codigo_cita,
    holdResult?.codigo_cita,
    holdResult?.data?.codigo_cita,
  ].map(toSafeCode).find(Boolean);
  if (groupCode) return [groupCode];
  const candidates = [
    ...collectCodesFromList(bookingSuccessResult?.citas_confirmadas),
    ...collectCodesFromList(bookingSuccessResult?.confirmation?.citas_confirmadas),
    ...collectCodesFromList(bookingSuccessResult?.paymentResult?.citas_confirmadas),
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
  const [copyMessage, setCopyMessage] = useState('');
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
  const displayCodes = bookingCodes;

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(displayCodes.join(', '));
      setCopyMessage('Código copiado');
    } catch {
      setCopyMessage('No se pudo copiar. Puedes seleccionar el código.');
    }
  }

  const onCheckDrawn = useConfirmationSound(isConfirmedUi);

  if (isConfirmedUi) return (
    <div className="citas-confirm-wrap booking-confirmation-wrap">
      <ConfirmationCard title="¡Reserva confirmada!" subtitle="Tu cita ha sido confirmada exitosamente." titleId="booking-confirmation-title" onCheckDrawn={onCheckDrawn} onDone={completeBookingFlow}>
          <div className="booking-confirmation-receipt">
            <div className="booking-confirmation-row"><CalendarDays aria-hidden="true" /><span>Código de cita</span><strong className="booking-confirmation-code">{displayCodes.length ? displayCodes.join(', ') : 'En proceso de asignación'}</strong>{displayCodes.length ? <button type="button" className="booking-confirmation-copy" onClick={copyCodes} aria-label="Copiar código de cita"><Copy size={16} /></button> : null}</div>
            <div className="booking-confirmation-row"><CreditCard aria-hidden="true" /><span>Estado de pago</span><span className={paymentLabelLower === 'pagado' ? 'booking-confirmation-paid' : 'booking-confirmation-payment'}>{paymentLabelLower === 'pagado' ? 'Pagado' : paymentUiState.paymentLabel}</span></div>
            {isCoveredByPlan ? <div className="booking-confirmation-row"><ReceiptText aria-hidden="true" /><span>Cubierto por tu plan</span><strong>{formatCurrencyHnl(coveredByPlanHnl)}</strong></div> : null}
            <div className="booking-confirmation-row"><ReceiptText aria-hidden="true" /><span>{isCoveredByPlan ? 'Total pagado hoy' : 'Total pagado'}</span><strong>{formatCurrencyHnl(paymentUiState.totalPagadoHnl)}</strong></div>
          </div>
          <p className="booking-confirmation-copy-status" role="status">{copyMessage}</p>
          <div className="booking-confirmation-appointments"><h2>CITAS CONFIRMADAS</h2>{bookingBlocksSummary.map((block) => <div key={block.id} className="booking-confirmation-appointment"><UserRound aria-hidden="true" /><div><span>{block.alias}</span><span>{block.barbero?.nombre_completo || 'Barbero'}</span></div></div>)}</div>
      </ConfirmationCard>
    </div>
  );

  return (
    <div className="citas-confirm-wrap">
      <div className={`citas-surface p-5 ${isConfirmedUi ? 'public-booking-success' : ''}`.trim()}>
        <div className="public-booking-success-head">
          <Loader2 size={20} />
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
