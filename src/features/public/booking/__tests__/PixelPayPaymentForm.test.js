import { describe, expect, it } from 'vitest';
import {
  buildPaymentCardProviderLabel,
  getPixelPayReconciliationNotice,
  shouldQueryPixelPayProviderOnManualVerify,
  toPixelPayCardExpire,
} from '../PublicBookingPaymentStep.jsx';

describe('PixelPay card_expire', () => {
  it('convierte 01/27 a 2701', () => {
    expect(toPixelPayCardExpire('01/27')).toBe('2701');
  });

  it('convierte 12/30 a 3012', () => {
    expect(toPixelPayCardExpire('12/30')).toBe('3012');
  });

  it('rechaza mes o formato invalido', () => {
    expect(() => toPixelPayCardExpire('13/30')).toThrow(/MM\/AA/);
    expect(() => toPixelPayCardExpire('3012')).toThrow(/MM\/AA/);
  });
});

describe('PixelPay manual status verification', () => {
  it('consulta proveedor solo cuando el intent PixelPay esta pendiente de confirmacion', () => {
    expect(shouldQueryPixelPayProviderOnManualVerify({
      providerType: 'pixelpay',
      paymentResult: { pending_confirmation: true },
    })).toBe(true);
    expect(shouldQueryPixelPayProviderOnManualVerify({
      providerType: 'pixelpay',
      paymentResult: { manual_reconciliation_required: true },
    })).toBe(true);
    expect(shouldQueryPixelPayProviderOnManualVerify({
      providerType: 'pixelpay',
      paymentIntent: { estado_intent_codigo: 'pendiente_confirmacion' },
    })).toBe(true);
    expect(shouldQueryPixelPayProviderOnManualVerify({
      providerType: 'pixelpay',
      paymentIntent: { estado_intent_codigo: 'link_generado' },
    })).toBe(false);
    expect(shouldQueryPixelPayProviderOnManualVerify({
      providerType: 'simulator',
      paymentResult: { pending_confirmation: true },
    })).toBe(false);
  });

  it('advierte conciliacion manual sin invitar a pagar nuevamente', () => {
    expect(getPixelPayReconciliationNotice({ manual_reconciliation_required: true }))
      .toBe('Tu pago requiere verificación. No vuelvas a realizar el pago.');
    expect(getPixelPayReconciliationNotice({ pending_confirmation: true })).toBe('');
  });
});

describe('PixelPay visual label', () => {
  it('no muestra TodoPago test cuando el provider es PixelPay', () => {
    expect(buildPaymentCardProviderLabel({
      providerType: 'pixelpay',
      cardBrand: 'visa',
      cardBrandLabel: 'VISA',
    })).toBe('VISA · PixelPay Sandbox');
  });
});
