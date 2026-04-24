import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/button.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import { formatCurrencyHnl } from './bookingUtils.js';

export default function PublicBookingPaymentStep() {
  const {
    bookingBlocksSummary,
    createPaymentIntentForHold,
    holdExpired,
    holdExpiresAtIso,
    holdRemainingMs,
    paymentIntent,
    paymentResult,
    refreshPaymentStatus,
    completeMockPayment,
    totalToPay,
  } = usePublicBookingFlow();
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  const holdCountdownLabel = (() => {
    if (holdRemainingMs == null) return null;
    const totalSeconds = Math.max(0, Math.floor(holdRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  })();

  const handleCreateIntent = async () => {
    if (loadingIntent) return;
    setLoadingIntent(true);
    try {
      await createPaymentIntentForHold();
    } finally {
      setLoadingIntent(false);
    }
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
        <h3 className="citas-confirm-title">Pago seguro</h3>
        <p className="citas-selected-date mt-2">
          Completa los datos y finaliza el pago para confirmar la reserva.
        </p>
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
              <span>La pasarela se integra mediante proveedor desacoplado e idempotente.</span>
            </div>
            {!paymentIntent?.id_intent ? (
              <Button className="mt-3 gap-2" onClick={handleCreateIntent} disabled={loadingIntent}>
                {loadingIntent ? <Loader2 size={16} className="animate-spin" /> : null}
                Crear intento de pago
              </Button>
            ) : (
              <div className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)] public-booking-payment-meta">
                <p>Intent: {paymentIntent.id_intent}</p>
                <p>Estado: {paymentResult?.estado_intent_codigo || paymentIntent.estado_intent_codigo || 'pendiente'}</p>
                <p>Monto: {formatCurrencyHnl(paymentIntent.monto_hnl || totalToPay)}</p>
                {paymentIntent.payment_url ? (
                  <a
                    href={paymentIntent.payment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-[var(--mf-accent)]"
                  >
                    Abrir checkout del proveedor
                    <ExternalLink size={14} />
                  </a>
                ) : null}
              </div>
            )}
            <div className="public-booking-actions is-inline public-booking-payment-actions mt-4">
              <Button variant="outline" onClick={() => refreshPaymentStatus()} disabled={!paymentIntent?.id_intent}>
                Actualizar estado
              </Button>
              <Button onClick={handleMockPay} disabled={!paymentIntent?.id_intent || processingPayment}>
                {processingPayment ? <Loader2 size={16} className="animate-spin" /> : null}
                Simular pago exitoso
              </Button>
            </div>
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
        </div>
      </div>
    </div>
  );
}
