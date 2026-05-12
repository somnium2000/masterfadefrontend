import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './BookingFlowContext.jsx';
import { formatCurrencyHnl } from './bookingUtils.js';
import BookingActions from './components/BookingActions.jsx';
import BookingStepHeader from './components/BookingStepHeader.jsx';

function isLocalHostname(value) {
  const hostname = String(value || '').trim().toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function canShowMockPaymentAction() {
  const provider = String(
    import.meta.env.VITE_PAYMENT_PROVIDER
    || import.meta.env.VITE_PAYMENT_PROVIDER_CODE
    || ''
  ).trim().toLowerCase();
  const explicitMock = String(import.meta.env.VITE_ENABLE_MOCK_PAYMENT || '').trim().toLowerCase() === 'true';
  const providerAllowsMock = !provider || provider === 'mock';
  const localHost = typeof window !== 'undefined' && isLocalHostname(window.location?.hostname);
  return providerAllowsMock && (Boolean(import.meta.env.DEV) || localHost || explicitMock);
}

function normalizePaymentStatus(intent, result) {
  const raw = String(
    result?.estado_intent_codigo
    || result?.status
    || intent?.estado_intent_codigo
    || 'pending'
  ).trim().toLowerCase();
  if (result?.booking_confirmed || ['confirmado', 'pagado', 'paid', 'capturado'].includes(raw)) return 'paid';
  if (['pendiente_confirmacion', 'processing', 'procesando', 'confirmando'].includes(raw)) return 'processing';
  if (['fallido', 'failed', 'rechazado'].includes(raw)) return 'failed';
  if (['expirado', 'expired'].includes(raw)) return 'expired';
  return 'pending';
}

function getPaymentStatusText(status) {
  if (status === 'paid') return 'Pago confirmado';
  if (status === 'processing') return 'Estamos confirmando tu pago';
  if (status === 'failed') return 'El pago no pudo completarse';
  if (status === 'expired') return 'La reserva temporal venció';
  return 'Tu pago aún está pendiente';
}

export default function PublicBookingPaymentStep() {
  const {
    bookingBlocksSummary,
    createPaymentIntentForHold,
    creatingPaymentIntent,
    holdExpired,
    holdExpiresAtIso,
    holdRemainingMs,
    paymentIntent,
    paymentResult,
    refreshPaymentStatus,
    checkingPaymentStatus,
    completeMockPayment,
    holdPricing,
    holdTotalToPay,
  } = usePublicBookingFlow();
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const showMockPaymentAction = canShowMockPaymentAction();
  const paymentStatus = normalizePaymentStatus(paymentIntent, paymentResult);
  const paymentStatusText = getPaymentStatusText(paymentStatus);

  const fallbackSubtotal = useMemo(
    () => bookingBlocksSummary.reduce((total, block) => total + Number(block?.total_hnl || 0), 0),
    [bookingBlocksSummary]
  );

  const fallbackCoveredByPlan = useMemo(
    () =>
      bookingBlocksSummary.reduce((total, block) => {
        const services = Array.isArray(block?.selectedServices) ? block.selectedServices : [];
        return total + services.reduce((lineTotal, service) => {
          if (!service?.coveredByPlan) return lineTotal;
          return lineTotal + Number(service?.precio_hnl || 0);
        }, 0);
      }, 0),
    [bookingBlocksSummary]
  );

  const effectiveSubtotal = Number(holdPricing?.subtotal_hnl ?? fallbackSubtotal ?? 0);
  const effectiveCoveredByPlan = Number(holdPricing?.cubierto_por_plan_hnl ?? fallbackCoveredByPlan ?? 0);
  const effectiveExtras = Number(
    holdPricing?.extras_a_pagar_hnl
    ?? Math.max(0, effectiveSubtotal - effectiveCoveredByPlan)
  );
  const effectiveTotalToPay = Number(
    holdPricing?.total_pagar_hnl
    ?? holdTotalToPay
    ?? 0
  );

  const holdCountdownLabel = (() => {
    if (holdRemainingMs == null) return null;
    const totalSeconds = Math.max(0, Math.floor(holdRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  })();

  const handleCreateIntent = async () => {
    if (loadingIntent || creatingPaymentIntent) return;
    setLoadingIntent(true);
    try {
      await createPaymentIntentForHold();
    } finally {
      setLoadingIntent(false);
    }
  };

  const handleVerifyPaymentStatus = async () => {
    if (checkingPaymentStatus) return;
    await refreshPaymentStatus();
  };

  const handleMockPay = async () => {
    if (processingPayment) return;
    setProcessingPayment(true);
    try {
      await completeMockPayment();
    } finally {
      setProcessingPayment(false);
    }
  };

  return (
    <div className="citas-confirm-wrap public-booking-payment-wrap">
      <div className="citas-surface p-5">
        <BookingStepHeader
          title="Pago seguro"
          subtitle="Completa los datos y finaliza el pago para confirmar la reserva."
          headingLevel="h3"
          titleClassName="citas-confirm-title"
          subtitleClassName="citas-selected-date mt-2"
        />
        {holdCountdownLabel ? (
          <div className={`public-booking-payment-note mt-3 ${holdExpired ? 'is-expired' : ''}`.trim()}>
            <ShieldCheck size={14} />
            <span>
              {holdExpired
                ? 'La reserva temporal expiró. Regresaremos a agenda para que elijas una nueva hora.'
                : `Reserva temporal activa: ${holdCountdownLabel} restantes`}
              {holdExpiresAtIso ? ' (contador real del hold en backend).' : ''}
            </span>
          </div>
        ) : null}

        <div className="public-booking-form-grid public-booking-payment-grid mt-4">
          <div className="public-booking-contact-card public-booking-payment-gateway-card">
            <h4 className="citas-confirm-subtitle">Datos de facturación</h4>
            <div className="public-booking-form-row mt-2">
              <label className="mf-label" htmlFor="pay-fullname">Nombre y apellido</label>
              <input id="pay-fullname" className="mf-input" placeholder="Ej. Carlos Ramírez" autoComplete="name" />
            </div>
            <div className="public-booking-form-row mt-2">
              <label className="mf-label" htmlFor="pay-dni">DNI</label>
              <input id="pay-dni" className="mf-input" placeholder="Ej. 0801..." autoComplete="off" />
            </div>
            <div className="public-booking-form-row mt-2">
              <label className="mf-label" htmlFor="pay-phone">Teléfono</label>
              <input id="pay-phone" className="mf-input" placeholder="Ej. +504 9999-9999" autoComplete="tel" />
            </div>
            <div className="public-booking-form-row mt-2">
              <label className="mf-label" htmlFor="pay-address">Dirección</label>
              <input id="pay-address" className="mf-input" placeholder="Colonia, calle, referencia" autoComplete="street-address" />
            </div>
          </div>

          <div className="public-booking-contact-card">
            <h4 className="citas-confirm-subtitle">Pasarela de pago</h4>
            <div className="public-booking-payment-note mt-2">
              <ShieldCheck size={14} />
              <span>{paymentIntent?.id_intent ? paymentStatusText : 'El backend confirmará el pago cuando el proveedor notifique el webhook.'}</span>
            </div>
            {!paymentIntent?.id_intent ? (
              <Button className="mt-3 gap-2" onClick={handleCreateIntent} disabled={loadingIntent || creatingPaymentIntent}>
                {loadingIntent || creatingPaymentIntent ? <Loader2 size={16} className="animate-spin" /> : null}
                Crear intento de pago
              </Button>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)] public-booking-payment-meta">
                <p>Estado: {paymentStatusText}</p>
                <p>Monto: {formatCurrencyHnl(paymentIntent.monto_hnl || effectiveTotalToPay)}</p>
                {paymentIntent.payment_url ? (
                  <a
                    href={paymentIntent.payment_url}
                    className="inline-flex items-center gap-2 text-[var(--mf-accent)]"
                  >
                    Abrir checkout del proveedor
                    <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>
            )}
            <BookingActions inline className="public-booking-payment-actions mt-4">
              <Button
                variant="outline"
                onClick={handleVerifyPaymentStatus}
                disabled={!paymentIntent?.id_intent || checkingPaymentStatus}
              >
                {checkingPaymentStatus ? <Loader2 size={16} className="animate-spin" /> : null}
                Verificar estado del pago
              </Button>
              {showMockPaymentAction ? (
                <Button onClick={handleMockPay} disabled={!paymentIntent?.id_intent || processingPayment}>
                  {processingPayment ? <Loader2 size={16} className="animate-spin" /> : null}
                  Simular pago exitoso
                </Button>
              ) : null}
            </BookingActions>
          </div>
        </div>

        <div className="citas-confirm-services mt-4">
          <h4 className="citas-confirm-subtitle">Resumen para cobro</h4>
          {bookingBlocksSummary.map((block) => (
            <div key={block.id} className="citas-confirm-service-item">
              <span>{block.alias}</span>
              <span>{formatCurrencyHnl(block.total_hnl)}</span>
            </div>
          ))}
          <div className="citas-confirm-row mt-3">
            <span>Total servicios</span>
            <span>{formatCurrencyHnl(effectiveSubtotal)}</span>
          </div>
          <div className="citas-confirm-row">
            <span>Cubierto por tu plan</span>
            <span>-{formatCurrencyHnl(effectiveCoveredByPlan)}</span>
          </div>
          <div className="citas-confirm-row">
            <span>Extras a pagar</span>
            <span>{formatCurrencyHnl(effectiveExtras)}</span>
          </div>
          <div className="citas-confirm-row">
            <span>Total a pagar</span>
            <span>{formatCurrencyHnl(effectiveTotalToPay)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
