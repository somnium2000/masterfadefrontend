import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './BookingFlowContext.jsx';
import { formatCurrencyHnl, normalizeBookingPaymentUiState } from './bookingUtils.js';
import BookingActions from './components/BookingActions.jsx';
import BookingStepHeader from './components/BookingStepHeader.jsx';

function isLocalHostname(value) {
  const hostname = String(value || '').trim().toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isQaHostname(value) {
  return String(value || '').trim().toLowerCase() === 'qa.masterfadeapp.com';
}

function isProductionHostname(value) {
  const hostname = String(value || '').trim().toLowerCase();
  return hostname === 'masterfadeapp.com'
    || hostname === 'www.masterfadeapp.com'
    || hostname === 'api.masterfadeapp.com';
}

function readEnvFlag(value) {
  return String(value || '').trim().toLowerCase() === 'true';
}

function normalizePaymentProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  return provider === 'payment-simulator' ? 'simulator' : provider;
}

function isProductionRuntime() {
  if (import.meta.env.PROD) return true;
  const mode = String(import.meta.env.MODE || '').trim().toLowerCase();
  const runtime = String(
    import.meta.env.VITE_ENTORNO
    || import.meta.env.VITE_APP_ENV
    || import.meta.env.VITE_RUNTIME_ENV
    || import.meta.env.VITE_NODE_ENV
    || ''
  ).trim().toLowerCase();
  return mode === 'production'
    || mode === 'prod'
    || runtime === 'production'
    || runtime === 'prod';
}

let paymentSimulationDiagnosticLogged = false;

function resolvePaymentSimulationAction() {
  const hostname = typeof window !== 'undefined' ? window.location?.hostname : '';
  const localHost = isLocalHostname(hostname);
  const provider = normalizePaymentProvider(
    import.meta.env.VITE_PAYMENT_PROVIDER
    || import.meta.env.VITE_PAYMENT_PROVIDER_CODE
    || ''
  );
  const mockEnabled = readEnvFlag(import.meta.env.VITE_ENABLE_MOCK_PAYMENT);
  const simulatorEnabled = readEnvFlag(import.meta.env.VITE_ENABLE_PAYMENT_SIMULATOR);
  const qaSimulationEnabled = readEnvFlag(import.meta.env.VITE_ENABLE_QA_PAYMENT_SIMULATION);

  let action = { canShow: false, type: null, provider, reason: 'host_not_allowed' };
  if (!provider) {
    action = { canShow: false, type: null, provider, reason: 'provider_missing' };
  } else if (isProductionHostname(hostname) || isProductionRuntime()) {
    action = { canShow: false, type: null, provider, reason: 'production_blocked' };
  } else if (localHost) {
    action = provider === 'mock' && mockEnabled
      ? { canShow: true, type: 'mock', provider, reason: 'local_mock_enabled' }
      : { canShow: false, type: null, provider, reason: 'local_mock_not_configured' };
  } else if (isQaHostname(hostname)) {
    action = provider === 'simulator' && simulatorEnabled && qaSimulationEnabled
      ? { canShow: true, type: 'simulator', provider, reason: 'qa_simulator_enabled' }
      : { canShow: false, type: null, provider, reason: 'qa_simulator_not_configured' };
  }

  if (import.meta.env.DEV && localHost && !paymentSimulationDiagnosticLogged) {
    paymentSimulationDiagnosticLogged = true;
    console.info('[payment-simulation]', {
      provider,
      mockEnabled,
      simulatorEnabled,
      qaSimulationEnabled,
      hostname,
      canShow: action.canShow,
      reason: action.reason,
      type: action.type,
      mode: import.meta.env.MODE,
    });
  }

  return action;
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
    completePaymentSimulation,
    holdPricing,
    holdTotalToPay,
  } = usePublicBookingFlow();
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const paymentSimulationAction = resolvePaymentSimulationAction();
  const paymentUiState = normalizeBookingPaymentUiState({
    paymentIntent,
    paymentResult,
    holdTotalToPay,
  });

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
      await completePaymentSimulation({ provider: paymentSimulationAction.type });
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
              <span>{paymentIntent?.id_intent ? paymentUiState.text : 'El backend confirmará el pago cuando el proveedor notifique el webhook.'}</span>
            </div>
            {!paymentIntent?.id_intent ? (
              <Button className="mt-3 gap-2" onClick={handleCreateIntent} disabled={loadingIntent || creatingPaymentIntent}>
                {loadingIntent || creatingPaymentIntent ? <Loader2 size={16} className="animate-spin" /> : null}
                Crear intento de pago
              </Button>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)] public-booking-payment-meta">
                <p>Estado: {paymentUiState.text}</p>
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
              {paymentSimulationAction.canShow ? (
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
