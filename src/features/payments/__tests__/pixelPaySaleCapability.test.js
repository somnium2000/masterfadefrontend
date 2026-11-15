import { describe, expect, it } from 'vitest';
import { isPixelPaySaleAuthorized } from '../pixelPaySaleCapability.js';

const qaSandbox = { entorno: 'qa', provider: 'pixelpay', environment: 'sandbox', hostname: 'localhost' };

describe('QA Sandbox requires an explicit Sale capability', () => {
  it.each([false, undefined, null, 'true', 'false', 0, 1])('rejects unconfirmed capability %s', capability => {
    expect(isPixelPaySaleAuthorized(capability, qaSandbox)).toBe(false);
  });
  it('permits only true and normalizes environment configuration', () => {
    expect(isPixelPaySaleAuthorized(true, qaSandbox)).toBe(true);
    expect(isPixelPaySaleAuthorized(undefined, { ...qaSandbox, entorno: ' QA ', provider: ' PIXELPAY ' })).toBe(false);
  });
  it('recognizes the QA hostname and the existing default Sandbox presentation', () => {
    expect(isPixelPaySaleAuthorized(undefined, { ...qaSandbox, entorno: '', hostname: 'qa.masterfadeapp.com' })).toBe(false);
    expect(isPixelPaySaleAuthorized(undefined, { ...qaSandbox, environment: '' })).toBe(false);
    expect(isPixelPaySaleAuthorized(undefined, { ...qaSandbox, environment: 'invalid' })).toBe(false);
  });
});

describe('legacy capabilities outside QA PixelPay Sandbox', () => {
  it.each([
    { ...qaSandbox, entorno: 'production', environment: 'live' },
    { ...qaSandbox, entorno: 'development' },
    { ...qaSandbox, provider: 'todopago' },
  ])('preserves the existing absent/true/false contract in %j', options => {
    expect(isPixelPaySaleAuthorized(undefined, options)).toBe(true);
    expect(isPixelPaySaleAuthorized(true, options)).toBe(true);
    expect(isPixelPaySaleAuthorized(false, options)).toBe(false);
  });
});
