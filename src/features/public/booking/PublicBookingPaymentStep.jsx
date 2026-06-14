import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './BookingFlowContext.jsx';
import { formatCurrencyHnl, normalizeBookingPaymentUiState } from './bookingUtils.js';
import BookingActions from './components/BookingActions.jsx';
import BookingStepHeader from './components/BookingStepHeader.jsx';
import { CARD_BRAND_LABELS, detectCardBrand } from './utils/detectCardBrand.js';

const TODO_PAGO_SIMULATION_SCENARIO_STORAGE_KEY = 'masterfade.todopagoSimulation.amountHnl';
const TODO_PAGO_SIMULATION_SCENARIOS = [
  { value: '1.00', label: 'Aprobado (1.00)' },
  { value: '1.05', label: 'Rechazado (1.05)' },
  { value: '1.23', label: 'Tarjeta vencida (1.23)' },
  { value: '1.56', label: 'CVV incorrecto (1.56)' },
  { value: '1.57', label: 'Timeout (1.57)' },
];
const INITIAL_PAYMENT_FORM = {
  cardholderName: '',
  receiptEmail: '',
  phone: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
};

function normalizeDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function formatCardNumber(value) {
  return normalizeDigits(value).slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
}

function maskCardNumber(value) {
  const digits = normalizeDigits(value);
  if (!digits) return '**** **** **** ****';
  const visibleDigits = digits.slice(-4).padStart(4, '*');
  return `**** **** **** ${visibleDigits}`;
}

function formatExpiry(value) {
  const digits = normalizeDigits(value).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function formatPhone(value) {
  return normalizeDigits(value).slice(0, 15);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validatePaymentForm(form) {
  const errors = {};
  const expiryDigits = normalizeDigits(form.expiry);
  const expiryMonth = Number(expiryDigits.slice(0, 2));

  if (!String(form.cardholderName || '').trim()) {
    errors.cardholderName = 'Ingresa el nombre del titular.';
  }
  if (!isValidEmail(form.receiptEmail)) {
    errors.receiptEmail = 'Ingresa un correo valido para el comprobante.';
  }
  if (normalizeDigits(form.phone).length < 8) {
    errors.phone = 'Ingresa un telefono valido.';
  }
  if (normalizeDigits(form.cardNumber).length < 13) {
    errors.cardNumber = 'Ingresa un numero de tarjeta de prueba valido.';
  }
  if (expiryDigits.length !== 4 || Number.isNaN(expiryMonth) || expiryMonth < 1 || expiryMonth > 12) {
    errors.expiry = 'Ingresa una fecha MM/AA valida.';
  }
  if (![3, 4].includes(normalizeDigits(form.cvv).length)) {
    errors.cvv = 'Ingresa un CVV de 3 o 4 digitos.';
  }

  return errors;
}

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
  } else if (isProductionHostname(hostname)) {
    action = { canShow: false, type: null, provider, reason: 'production_blocked' };
  } else if (localHost) {
    if (provider === 'mock' && mockEnabled) {
      action = { canShow: true, type: 'mock', provider, reason: 'local_mock_enabled' };
    } else if ((provider === 'todopago' || provider === 'simulator') && simulatorEnabled && qaSimulationEnabled) {
      action = { canShow: true, type: 'simulator', provider, reason: 'local_todopago_simulator_enabled' };
    } else {
      action = { canShow: false, type: null, provider, reason: 'local_payment_simulation_not_configured' };
    }
  } else if (isQaHostname(hostname)) {
    action = (provider === 'simulator' || provider === 'todopago') && simulatorEnabled && qaSimulationEnabled
      ? { canShow: true, type: 'simulator', provider, reason: 'qa_simulator_enabled' }
      : { canShow: false, type: null, provider, reason: 'qa_simulator_not_configured' };
  }

  return action;
}

export default function PublicBookingPaymentStep() {
  const {
    bookingBlocksSummary,
    cancelBookingFlow,
    createPaymentIntentForHold,
    creatingPaymentIntent,
    goToConfirm,
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
    membershipHasContext,
    membershipUxMessage,
    membershipCompanionNotice,
  } = usePublicBookingFlow();
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState(INITIAL_PAYMENT_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [selectedSimulationAmount, setSelectedSimulationAmount] = useState(() => {
    if (typeof window === 'undefined') return TODO_PAGO_SIMULATION_SCENARIOS[0].value;
    try {
      const stored = String(window.sessionStorage.getItem(TODO_PAGO_SIMULATION_SCENARIO_STORAGE_KEY) || '').trim();
      return TODO_PAGO_SIMULATION_SCENARIOS.some((scenario) => scenario.value === stored)
        ? stored
        : TODO_PAGO_SIMULATION_SCENARIOS[0].value;
    } catch {
      return TODO_PAGO_SIMULATION_SCENARIOS[0].value;
    }
  });
  const paymentSimulationAction = resolvePaymentSimulationAction();
  const paymentUiState = normalizeBookingPaymentUiState({
    paymentIntent,
    paymentResult,
    holdTotalToPay,
  });
  const maskedCardLabel = useMemo(() => maskCardNumber(paymentForm.cardNumber), [paymentForm.cardNumber]);
  const cardBrand = useMemo(() => detectCardBrand(paymentForm.cardNumber), [paymentForm.cardNumber]);
  const cardBrandLabel = CARD_BRAND_LABELS[cardBrand];

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
  const safeCoveredByPlan = Math.max(0, Number(effectiveCoveredByPlan || 0));
  const safeExtras = Math.max(0, Number(effectiveExtras || 0));
  const hasPlanCoverage = safeCoveredByPlan > 0;
  const hasSaldoToPay = hasPlanCoverage && safeExtras > 0;
  const isFullyCoveredByPlan = hasPlanCoverage && safeExtras <= 0;

  const holdCountdownLabel = (() => {
    if (holdRemainingMs == null) return null;
    const totalSeconds = Math.max(0, Math.floor(holdRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  })();

  const resetSensitiveFields = () => {
    setPaymentForm((current) => ({
      ...current,
      cardNumber: '',
      expiry: '',
      cvv: '',
    }));
    setFieldErrors((current) => {
      if (!current.cardNumber && !current.expiry && !current.cvv) return current;
      return {
        ...current,
        cardNumber: undefined,
        expiry: undefined,
        cvv: undefined,
      };
    });
  };

  const resetFormState = () => {
    setPaymentForm(INITIAL_PAYMENT_FORM);
    setFieldErrors({});
  };

  useEffect(() => {
    if (paymentResult?.booking_confirmed) {
      resetSensitiveFields();
    }
  }, [paymentResult?.booking_confirmed]);

  const handleFieldChange = (field) => (event) => {
    const rawValue = event.target.value;
    let nextValue = rawValue;

    if (field === 'cardNumber') nextValue = formatCardNumber(rawValue);
    if (field === 'expiry') nextValue = formatExpiry(rawValue);
    if (field === 'cvv') nextValue = normalizeDigits(rawValue).slice(0, 4);
    if (field === 'phone') nextValue = formatPhone(rawValue);

    setPaymentForm((current) => ({ ...current, [field]: nextValue }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      return { ...current, [field]: undefined };
    });
  };

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
    const validationErrors = validatePaymentForm(paymentForm);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }

    setProcessingPayment(true);
    try {
      if (typeof window !== 'undefined') {
        if (paymentSimulationAction.type === 'simulator') {
          window.sessionStorage.setItem(TODO_PAGO_SIMULATION_SCENARIO_STORAGE_KEY, selectedSimulationAmount);
        } else {
          window.sessionStorage.removeItem(TODO_PAGO_SIMULATION_SCENARIO_STORAGE_KEY);
        }
      }
      await completePaymentSimulation({ provider: paymentSimulationAction.type });
      resetSensitiveFields();
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleReturnToConfirm = async () => {
    resetSensitiveFields();
    setFieldErrors({});
    await goToConfirm();
  };

  const handleCancelFlow = async () => {
    resetFormState();
    await cancelBookingFlow('payment_step');
  };

  return (
    <div className="citas-confirm-wrap public-booking-payment-wrap">
      <div className="citas-surface p-3 sm:p-5">
        <BookingStepHeader
          title="Pasarela de pago segura"
          subtitle="Simula la experiencia MasterFade/TodoPago en entorno de prueba sin ejecutar un cobro real."
          headingLevel="h3"
          titleClassName="citas-confirm-title"
          subtitleClassName="citas-selected-date mt-2"
        />
        <div className="mt-3 grid gap-2 sm:gap-3">
          <div className="public-booking-payment-note">
            <ShieldCheck size={14} />
            <span>Entorno de prueba: esta pantalla solo simula la pasarela y no procesa cargos reales.</span>
          </div>
          <div className="public-booking-payment-note">
            <ShieldCheck size={14} />
            <span>MasterFade no guarda PAN ni CVV. Esos datos viven solo en este formulario local y se limpian al salir.</span>
          </div>
        </div>
        {holdCountdownLabel ? (
          <div className={`public-booking-payment-note mt-3 ${holdExpired ? 'is-expired' : ''}`.trim()}>
            <ShieldCheck size={14} />
            <span>
              {holdExpired
                ? 'La reserva temporal expiro. Regresaremos a agenda para que elijas una nueva hora.'
                : `Reserva temporal activa: ${holdCountdownLabel} restantes`}
              {holdExpiresAtIso ? ' (contador real del hold en backend).' : ''}
            </span>
          </div>
        ) : null}
        {membershipUxMessage ? (
          <div className="public-booking-payment-note mt-3">
            <ShieldCheck size={14} />
            <span>{membershipUxMessage}</span>
          </div>
        ) : null}
        {membershipCompanionNotice ? (
          <div className="public-booking-payment-note mt-2">
            <ShieldCheck size={14} />
            <span>{membershipCompanionNotice}</span>
          </div>
        ) : null}

        <div className="public-booking-form-grid public-booking-payment-grid mt-4 gap-4 lg:gap-5">
          <div className="public-booking-contact-card public-booking-payment-gateway-card">
            <div className="w-full overflow-hidden rounded-2xl border border-[var(--mf-border)] bg-[linear-gradient(135deg,rgba(16,24,40,0.96),rgba(31,41,55,0.92))] p-3 text-white shadow-[0_14px_40px_rgba(15,23,42,0.28)] sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-white/70 sm:text-[11px] sm:tracking-[0.28em]">
                <span>MasterFade Pay</span>
                <span>{cardBrand === 'unknown' ? 'TodoPago test' : `${cardBrandLabel} · TodoPago test`}</span>
              </div>
              <div className="mt-6 break-words text-base font-semibold tracking-[0.16em] sm:mt-8 sm:text-xl sm:tracking-[0.28em]">
                {maskedCardLabel}
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/60">Titular</p>
                  <p className="mt-1 truncate text-sm font-medium text-white">
                    {paymentForm.cardholderName.trim() || 'Nombre del titular'}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-white/60">Expira</p>
                  <p className="mt-1 text-sm font-medium text-white">{paymentForm.expiry || 'MM/AA'}</p>
                </div>
              </div>
            </div>

            <h4 className="citas-confirm-subtitle mt-4">Datos para la simulacion</h4>
            <div className="public-booking-form-row mt-2">
              <label className="mf-label" htmlFor="pay-cardholder-name">Nombre del titular</label>
              <input
                id="pay-cardholder-name"
                className="mf-input"
                placeholder="Ej. Carlos Ramirez"
                autoComplete="cc-name"
                value={paymentForm.cardholderName}
                onChange={handleFieldChange('cardholderName')}
              />
              {fieldErrors.cardholderName ? <p className="mt-1 text-xs text-[var(--mf-danger)]">{fieldErrors.cardholderName}</p> : null}
            </div>
            <div className="public-booking-form-row mt-2">
              <label className="mf-label" htmlFor="pay-card-number">Numero de tarjeta</label>
              <input
                id="pay-card-number"
                className="mf-input"
                placeholder="4242 4242 4242 4242"
                autoComplete="cc-number"
                inputMode="numeric"
                value={paymentForm.cardNumber}
                onChange={handleFieldChange('cardNumber')}
              />
              <div className="mt-2 flex">
                <span className="inline-flex rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--mf-text-2)]">
                  Tipo de tarjeta: <strong className="ml-1 font-semibold text-[var(--mf-accent)]">{cardBrandLabel}</strong>
                </span>
              </div>
              {fieldErrors.cardNumber ? <p className="mt-1 text-xs text-[var(--mf-danger)]">{fieldErrors.cardNumber}</p> : null}
            </div>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div className="public-booking-form-row">
                <label className="mf-label" htmlFor="pay-expiry">Expiracion</label>
                <input
                  id="pay-expiry"
                  className="mf-input"
                  placeholder="MM/AA"
                  autoComplete="cc-exp"
                  inputMode="numeric"
                  value={paymentForm.expiry}
                  onChange={handleFieldChange('expiry')}
                />
                {fieldErrors.expiry ? <p className="mt-1 text-xs text-[var(--mf-danger)]">{fieldErrors.expiry}</p> : null}
              </div>
              <div className="public-booking-form-row">
                <label className="mf-label" htmlFor="pay-cvv">CVV</label>
                <input
                  id="pay-cvv"
                  className="mf-input"
                  placeholder="123"
                  autoComplete="cc-csc"
                  inputMode="numeric"
                  value={paymentForm.cvv}
                  onChange={handleFieldChange('cvv')}
                />
                {fieldErrors.cvv ? <p className="mt-1 text-xs text-[var(--mf-danger)]">{fieldErrors.cvv}</p> : null}
              </div>
            </div>
            <div className="public-booking-form-row mt-2">
              <label className="mf-label" htmlFor="pay-receipt-email">Correo para comprobante</label>
              <input
                id="pay-receipt-email"
                className="mf-input"
                placeholder="cliente@correo.com"
                autoComplete="email"
                inputMode="email"
                value={paymentForm.receiptEmail}
                onChange={handleFieldChange('receiptEmail')}
              />
              {fieldErrors.receiptEmail ? <p className="mt-1 text-xs text-[var(--mf-danger)]">{fieldErrors.receiptEmail}</p> : null}
            </div>
            <div className="public-booking-form-row mt-2">
              <label className="mf-label" htmlFor="pay-phone">Telefono de contacto</label>
              <input
                id="pay-phone"
                className="mf-input"
                placeholder="99999999"
                autoComplete="tel"
                inputMode="tel"
                value={paymentForm.phone}
                onChange={handleFieldChange('phone')}
              />
              {fieldErrors.phone ? <p className="mt-1 text-xs text-[var(--mf-danger)]">{fieldErrors.phone}</p> : null}
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-[var(--mf-border)] bg-[var(--mf-soft)]/50 p-3 text-xs leading-relaxed text-[var(--mf-text-2)]">
              Los datos de tarjeta se usan solo para validar la experiencia visual de esta pasarela simulada. No se envian al backend ni al proveedor.
            </div>
          </div>

          <div className="public-booking-contact-card">
            <h4 className="citas-confirm-subtitle">Estado de la pasarela</h4>
            <div className="public-booking-payment-note mt-2">
              <ShieldCheck size={14} />
              <span>{paymentIntent?.id_intent ? paymentUiState.text : 'Primero crea el intento para habilitar la simulacion del checkout.'}</span>
            </div>
            {!paymentIntent?.id_intent ? (
              <Button className="mt-3 w-full gap-2 sm:w-auto" onClick={handleCreateIntent} disabled={loadingIntent || creatingPaymentIntent}>
                {loadingIntent || creatingPaymentIntent ? <Loader2 size={16} className="animate-spin" /> : null}
                Crear intento de pago
              </Button>
            ) : (
              <div className="mt-3 space-y-2 break-words text-sm leading-relaxed text-[var(--mf-text-2)] public-booking-payment-meta">
                <p>Estado: {paymentUiState.text}</p>
                <p>Monto: {formatCurrencyHnl(paymentIntent.monto_hnl || effectiveTotalToPay)}</p>
                <p>Intent: {paymentIntent.id_intent}</p>
                <p>Proveedor: {paymentSimulationAction.provider || 'no_configurado'}</p>
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
            <BookingActions inline className="public-booking-payment-actions mt-4 flex-col items-stretch gap-3 sm:flex-row sm:items-end">
              <Button
                className="w-full sm:w-auto"
                variant="outline"
                onClick={handleVerifyPaymentStatus}
                disabled={!paymentIntent?.id_intent || checkingPaymentStatus}
              >
                {checkingPaymentStatus ? <Loader2 size={16} className="animate-spin" /> : null}
                Verificar estado del pago
              </Button>
              {paymentSimulationAction.canShow && paymentSimulationAction.type === 'simulator' ? (
                <div className="flex w-full min-w-0 flex-col gap-1 sm:min-w-[220px] sm:flex-1">
                  <label className="mf-label text-left text-[11px]" htmlFor="booking-simulator-scenario">
                    Escenario simulator
                  </label>
                  <select
                    id="booking-simulator-scenario"
                    className="mf-select"
                    value={selectedSimulationAmount}
                    onChange={(event) => setSelectedSimulationAmount(String(event.target.value || TODO_PAGO_SIMULATION_SCENARIOS[0].value))}
                    disabled={processingPayment}
                  >
                    {TODO_PAGO_SIMULATION_SCENARIOS.map((scenario) => (
                      <option key={scenario.value} value={scenario.value}>{scenario.label}</option>
                    ))}
                  </select>
                </div>
              ) : null}
              {paymentSimulationAction.canShow ? (
                <Button className="w-full sm:w-auto" onClick={handleMockPay} disabled={!paymentIntent?.id_intent || processingPayment}>
                  {processingPayment ? <Loader2 size={16} className="animate-spin" /> : null}
                  {paymentSimulationAction.type === 'simulator' ? 'Ejecutar simulator' : 'Simular pago exitoso'}
                </Button>
              ) : null}
            </BookingActions>
            <BookingActions inline className="public-booking-payment-actions mt-3 flex-col items-stretch gap-3 sm:flex-row">
              <Button className="w-full sm:w-auto" variant="outline" onClick={handleReturnToConfirm} disabled={processingPayment || loadingIntent}>
                Volver al resumen
              </Button>
              <Button className="w-full sm:w-auto" variant="ghost" onClick={handleCancelFlow} disabled={processingPayment || loadingIntent}>
                Cancelar reserva
              </Button>
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
            <span>{membershipHasContext ? 'Subtotal' : 'Total servicios'}</span>
            <span>{formatCurrencyHnl(effectiveSubtotal)}</span>
          </div>
          {hasPlanCoverage ? (
            <div className="citas-confirm-row">
              <span>{membershipHasContext ? 'Cubierto por tu membresia' : 'Cubierto por tu plan'}</span>
              <span>-{formatCurrencyHnl(safeCoveredByPlan)}</span>
            </div>
          ) : null}
          {hasSaldoToPay ? (
            <div className="citas-confirm-row">
              <span>{membershipHasContext ? 'Extras y acompanantes' : 'Saldo a pagar'}</span>
              <span>{formatCurrencyHnl(safeExtras)}</span>
            </div>
          ) : null}
          {isFullyCoveredByPlan ? (
            <div className="public-booking-payment-note mt-2">
              <span>Cubierto completamente por tu plan.</span>
            </div>
          ) : null}
          <div className="citas-confirm-row">
            <span>{membershipHasContext ? 'Total a pagar hoy' : 'Total a pagar'}</span>
            <span>{formatCurrencyHnl(effectiveTotalToPay)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
