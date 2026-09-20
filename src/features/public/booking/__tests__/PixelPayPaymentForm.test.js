import { describe, expect, it } from 'vitest';
import {
  buildPaymentCardProviderLabel,
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

describe('PixelPay visual label', () => {
  it('no muestra TodoPago test cuando el provider es PixelPay', () => {
    expect(buildPaymentCardProviderLabel({
      providerType: 'pixelpay',
      cardBrand: 'visa',
      cardBrandLabel: 'VISA',
    })).toBe('VISA · PixelPay Sandbox');
  });
});
