import { CheckCircle2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import { buildBookingShortCode, formatCurrencyHnl } from './bookingUtils.js';

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

function resolvePaymentSummary({ bookingSuccessResult, paymentResult, totalToPay }) {
  const isCoveredByPlan = bookingSuccessResult?.source === 'membership_no_payment'
    || String(bookingSuccessResult?.estado_pago || '').trim().toLowerCase() === 'cubierto_por_plan';
  if (isCoveredByPlan) {
    return {
      estadoPago: 'Cubierto por plan',
      totalPagadoHnl: 0,
    };
  }

  const successAmount = Number(bookingSuccessResult?.total_pagado_hnl);
  const paymentAmount = Number(paymentResult?.monto_hnl ?? totalToPay ?? 0);
  const totalPagadoHnl = Number.isFinite(successAmount)
    ? successAmount
    : (Number.isFinite(paymentAmount) ? paymentAmount : 0);

  const estadoPago = String(
    bookingSuccessResult?.estado_pago
    || bookingSuccessResult?.paymentResult?.estado_intent_codigo
    || paymentResult?.estado_intent_codigo
    || 'pagado'
  ).trim() || 'pagado';

  return { estadoPago, totalPagadoHnl };
}

export default function PublicBookingSuccessStep() {
  const {
    bookingSuccessResult,
    bookingBlocksSummary,
    completeBookingFlow,
    holdResult,
    paymentResult,
    totalToPay,
  } = usePublicBookingFlow();
  const bookingCodes = resolveBookingCodes({ bookingSuccessResult, paymentResult, holdResult });
  const paymentSummary = resolvePaymentSummary({ bookingSuccessResult, paymentResult, totalToPay });
  const fallbackShortCode = buildBookingShortCode(holdResult?.id_grupo_cita || null, 5);
  const hasRealCode = bookingCodes.length > 0;
  const displayCodes = hasRealCode
    ? bookingCodes
    : (fallbackShortCode && fallbackShortCode !== 'N/A' ? [fallbackShortCode] : []);

  return (
    <div className="citas-confirm-wrap">
      <div className="citas-surface p-5 public-booking-success">
        <div className="public-booking-success-head">
          <CheckCircle2 size={20} />
          <span>Pago confirmado y reserva cerrada</span>
        </div>

        <div className="public-booking-final-code mt-3">
          Codigo de cita:{' '}
          {displayCodes.length > 0 ? (
            <strong>{displayCodes.join(', ')}</strong>
          ) : (
            <strong>En proceso de asignacion</strong>
          )}
        </div>

        <div className="citas-confirm-row">
          <span>Estado de pago</span>
          <span>{paymentSummary.estadoPago}</span>
        </div>
        <div className="citas-confirm-row">
          <span>Total pagado</span>
          <span>{formatCurrencyHnl(paymentSummary.totalPagadoHnl)}</span>
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
          <Button onClick={completeBookingFlow}>Entendido</Button>
        </div>
      </div>
    </div>
  );
}
