import { describe, expect, it } from 'vitest';
import {
  buildPaymentCardProviderLabel,
  getPixelPayReconciliationNotice,
  isPixelPayBillingAddressPlaceholder,
  isPixelPayCardExpireCurrentOrFuture,
  isCanonicalBookingBlock,
  resolveCanonicalBookingBlocks,
  resolvePaymentAmount,
  resolvePaymentBreakdown,
  shouldQueryPixelPayProviderOnManualVerify,
  toPixelPayCardExpire,
  validatePaymentForm,
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

describe('PixelPay expiry validity', () => {
  const referenceDate = new Date('2026-10-10T16:51:50.000Z');

  it.each([
    ['10/26', true],
    ['11/26', true],
    ['12/28', true],
    ['09/26', false],
    ['12/25', false],
    ['13/26', false],
    ['1228', false],
  ])('evalua %s sin depender del dia (%s)', (expiry, expected) => {
    expect(isPixelPayCardExpireCurrentOrFuture(expiry, referenceDate)).toBe(expected);
  });

  it('muestra el error de tarjeta vencida antes de transformar o enviar', () => {
    const errors = validatePaymentForm({
      cardholderName: 'Cliente QA',
      phone: '99999999',
      cardNumber: '4111111111111111',
      expiry: '09/26',
      cvv: '999',
      billingAddress: 'Blvd Suyapa',
      billingCity: 'Tegucigalpa',
      billingState: 'HN-FM',
      billingCountry: 'HN',
    }, referenceDate);
    expect(errors.expiry).toBe('La tarjeta se encuentra vencida.');
  });

  it('distingue formato MM/AA invalido de una tarjeta vencida', () => {
    const errors = validatePaymentForm({
      cardholderName: 'Cliente QA',
      phone: '99999999',
      cardNumber: '4111111111111111',
      expiry: '1228',
      cvv: '999',
      billingAddress: 'Blvd Suyapa',
      billingCity: 'Tegucigalpa',
      billingState: 'HN-FM',
      billingCountry: 'HN',
    }, referenceDate);
    expect(errors.expiry).toBe('Ingresa una fecha MM/AA valida.');
  });
});

describe('PixelPay billing address', () => {
  it.each(['QA', ' qa ', 'TEST', 'N/A'])('rechaza placeholder exacto %s', (address) => {
    expect(isPixelPayBillingAddressPlaceholder(address)).toBe(true);
  });

  it.each(['Blvd Suyapa', 'Blvd. Suyapa', 'Tegucigalpa', 'Residencial QA'])(
    'acepta direccion real %s',
    (address) => {
      expect(isPixelPayBillingAddressPlaceholder(address)).toBe(false);
    },
  );

  it('usa el mensaje visible seguro para placeholders', () => {
    const errors = validatePaymentForm({
      cardholderName: 'Cliente QA',
      phone: '99999999',
      cardNumber: '4111111111111111',
      expiry: '11/26',
      cvv: '999',
      billingAddress: ' QA ',
      billingCity: 'Tegucigalpa',
      billingState: 'HN-FM',
      billingCountry: 'HN',
    }, new Date('2026-10-10T16:51:50.000Z'));
    expect(errors.billingAddress).toBe('Ingresa una dirección de facturación válida.');
  });
});

describe('PixelPay recovered amount', () => {
  it('prioriza monto backend y conserva cero real', () => {
    expect(resolvePaymentAmount({
      paymentResult: { monto_hnl: 1 },
      paymentIntent: { monto_hnl: 2 },
      holdPricing: { total_pagar_hnl: 3 },
      holdTotalToPay: 4,
      fallbackTotal: 5,
    })).toBe(1);
    expect(resolvePaymentAmount({
      paymentResult: { monto_hnl: 0 },
      paymentIntent: { monto_hnl: 2 },
    })).toBe(0);
  });

  it('descarta montos invalidos y usa el siguiente fallback canonico', () => {
    expect(resolvePaymentAmount({
      paymentResult: { monto_hnl: Number.NaN },
      paymentIntent: { monto_hnl: -1 },
      holdPricing: { total_pagar_hnl: '1.00' },
    })).toBe(1);
  });
});

describe('PixelPay payment breakdown visibility', () => {
  const placeholderBlock = {
    id: 'placeholder',
    alias: 'Titular',
    total_hnl: 0,
    isComplete: false,
    selectedServices: [],
    selectedServiceIdsEffective: [],
    selectedPackage: null,
    selection_type: 'services',
  };
  const realBlock = {
    id: 'block-1',
    alias: 'Titular',
    total_hnl: 8,
    isComplete: true,
    selectedServices: [{ id_servicio: 'service-1', precio_hnl: 8 }],
    selectedServiceIdsEffective: ['service-1'],
    selectedPackage: null,
    selection_type: 'services',
  };

  it('rechaza el placeholder real de PublicBookingFlow como fila y agregado', () => {
    expect(isCanonicalBookingBlock(placeholderBlock)).toBe(false);
    expect(resolvePaymentBreakdown({
      holdPricing: null,
      bookingBlocksSummary: [placeholderBlock],
    })).toEqual({
      canonicalBlocks: [],
      hasAggregateBreakdown: false,
      hasBlockBreakdown: false,
      source: 'none',
    });
  });

  it('separa holdPricing agregado de las filas placeholder', () => {
    expect(resolvePaymentBreakdown({
      holdPricing: {
        subtotal_hnl: 10,
        cubierto_por_plan_hnl: 2,
        extras_a_pagar_hnl: 8,
        total_pagar_hnl: 8,
      },
      bookingBlocksSummary: [placeholderBlock],
    })).toEqual({
      canonicalBlocks: [],
      hasAggregateBreakdown: true,
      hasBlockBreakdown: false,
      source: 'hold_pricing',
    });
  });

  it('rechaza holdPricing si un campo opcional usado no es canonico', () => {
    expect(resolvePaymentBreakdown({
      holdPricing: {
        subtotal_hnl: 10,
        cubierto_por_plan_hnl: -2,
        extras_a_pagar_hnl: 8,
        total_pagar_hnl: 8,
      },
      bookingBlocksSummary: [placeholderBlock],
    })).toMatchObject({
      canonicalBlocks: [],
      hasAggregateBreakdown: false,
      hasBlockBreakdown: false,
      source: 'none',
    });
  });

  it('acepta un bloque completo con seleccion real', () => {
    expect(isCanonicalBookingBlock(realBlock)).toBe(true);
    expect(resolvePaymentBreakdown({
      holdPricing: null,
      bookingBlocksSummary: [realBlock],
    })).toEqual({
      canonicalBlocks: [realBlock],
      hasAggregateBreakdown: true,
      hasBlockBreakdown: true,
      source: 'booking_blocks',
    });
  });

  it('acepta cero real cuando el bloque esta completo y tiene seleccion', () => {
    const coveredBlock = {
      ...realBlock,
      total_hnl: 0,
      selectedServices: [{ id_servicio: 'service-1', precio_hnl: 0, coveredByPlan: true }],
    };

    expect(isCanonicalBookingBlock(coveredBlock)).toBe(true);
    expect(resolveCanonicalBookingBlocks([coveredBlock])).toEqual([coveredBlock]);
  });

  it('filtra placeholder de las filas pero no deriva subtotal de bloques mixtos', () => {
    expect(resolvePaymentBreakdown({
      holdPricing: null,
      bookingBlocksSummary: [realBlock, placeholderBlock],
    })).toEqual({
      canonicalBlocks: [realBlock],
      hasAggregateBreakdown: false,
      hasBlockBreakdown: true,
      source: 'none',
    });
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
    expect(getPixelPayReconciliationNotice({ pending_confirmation: true }))
      .toBe('Tu pago requiere verificación. No vuelvas a realizar el pago.');
    expect(getPixelPayReconciliationNotice({ estado_intent_codigo: 'pendiente_confirmacion' }))
      .toBe('Tu pago requiere verificación. No vuelvas a realizar el pago.');
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
