import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import viteConfig from '../../vite.config.js';
import { assertPixelPayBuildEnvironment, resolvePixelPayEnvironment } from './pixelPayEnvironment.js';

const production = 'https://masterfadeapp.com';
const qa = 'https://qa.masterfadeapp.com';

describe('PixelPay environment configuration', () => {
  it.each([production, `${production}/`, 'https://www.masterfadeapp.com', 'https://MASTERFADEAPP.COM.:443'])(
    'requires an explicit Live environment at production target %s', (appUrl) => {
      expect(resolvePixelPayEnvironment({ appUrl, environment: 'live' })).toMatchObject({
        environment: 'live', canPay: true, valid: true, productionTarget: true,
      });
      for (const environment of [undefined, '', 'sandbox', 'invalid']) {
        expect(resolvePixelPayEnvironment({ appUrl, environment })).toMatchObject({ environment: 'invalid', canPay: false, valid: false });
      }
    });

  it.each([undefined, '', 'https://qa.masterfadeapp.com', 'not-a-url', 'https://masterfadeapp.com.attacker.invalid'])(
    'blocks a bundle served on the production hostname with inconsistent APP_URL %s', (appUrl) => {
      expect(resolvePixelPayEnvironment({ appUrl, environment: 'live', runtimeHostname: 'masterfadeapp.com' }))
        .toMatchObject({ canPay: false, valid: false, environment: 'invalid' });
    });

  it.each(['http://masterfadeapp.com', 'https://user:synthetic-secret@masterfadeapp.com'])(
    'rejects an unsafe production APP_URL without leaking its value: %s', (appUrl) => {
      expect(() => assertPixelPayBuildEnvironment({ VITE_APP_URL: appUrl,
        VITE_PAYMENT_PROVIDER: 'pixelpay', VITE_PIXELPAY_ENV: 'live' })).toThrow(/VITE_APP_URL/);
      try {
        assertPixelPayBuildEnvironment({ VITE_APP_URL: appUrl, VITE_PAYMENT_PROVIDER: 'pixelpay', VITE_PIXELPAY_ENV: 'live' });
      } catch (error) { expect(error.message).not.toContain('synthetic-secret'); }
    });

  it.each([qa, 'http://localhost:5173', undefined])('preserves Sandbox for non-production target %s', (appUrl) => {
    expect(resolvePixelPayEnvironment({ appUrl, environment: 'sandbox' })).toMatchObject({ canPay: true, environment: 'sandbox' });
    expect(resolvePixelPayEnvironment({ appUrl })).toMatchObject({ canPay: true, environment: 'sandbox' });
  });

  it('preserves a local Live fixture while rejecting Live on the QA destination or actual host', () => {
    expect(resolvePixelPayEnvironment({ appUrl: 'http://localhost:5173', environment: 'live' }).canPay).toBe(true);
    expect(resolvePixelPayEnvironment({ appUrl: qa, environment: 'live' }).canPay).toBe(false);
    expect(resolvePixelPayEnvironment({ appUrl: production, runtimeHostname: 'qa.masterfadeapp.com', environment: 'live' }).canPay).toBe(false);
    expect(() => assertPixelPayBuildEnvironment({ VITE_APP_URL: qa, VITE_PAYMENT_PROVIDER: 'pixelpay', VITE_PIXELPAY_ENV: 'live' }))
      .toThrow(/destino QA/);
  });

  it('does not silently label malformed or unknown configuration as Sandbox', () => {
    for (const appUrl of ['not-a-url', 'javascript:alert(1)']) {
      expect(resolvePixelPayEnvironment({ appUrl })).toMatchObject({ canPay: false, environment: 'invalid' });
    }
    expect(resolvePixelPayEnvironment({ environment: 'typo', appUrl: qa })).toMatchObject({ canPay: false, environment: 'invalid' });
  });

  it('does not change QA TodoPago or simulators', () => {
    for (const provider of ['todopago', 'mock', 'disabled']) {
      expect(() => assertPixelPayBuildEnvironment({ VITE_APP_URL: qa, VITE_PAYMENT_PROVIDER: provider, VITE_PIXELPAY_ENV: '' }))
        .not.toThrow();
    }
  });
});

describe('Vite build boundary', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_APP_URL', production);
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay');
    vi.stubEnv('VITE_PIXELPAY_ENV', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('rejects a missing environment even for a custom production build mode', () => {
    expect(() => viteConfig({ command: 'build', mode: 'qa' })).toThrow(/VITE_PIXELPAY_ENV=live/);
  });

  it('rejects Sandbox in a production destination', () => {
    vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
    expect(() => viteConfig({ command: 'build', mode: 'production' })).toThrow(/VITE_PIXELPAY_ENV=live/);
  });

  it('permits the explicit production Live configuration', () => {
    vi.stubEnv('VITE_PIXELPAY_ENV', 'live');
    expect(() => viteConfig({ command: 'build', mode: 'production' })).not.toThrow();
  });

  it('permits QA Sandbox in Vite production mode', () => {
    vi.stubEnv('VITE_APP_URL', qa);
    vi.stubEnv('VITE_PIXELPAY_ENV', 'sandbox');
    expect(() => viteConfig({ command: 'build', mode: 'production' })).not.toThrow();
  });

  it('permits QA TodoPago without a PixelPay environment', () => {
    vi.stubEnv('VITE_APP_URL', qa);
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'todopago');
    expect(() => viteConfig({ command: 'build', mode: 'production' })).not.toThrow();
  });

  it('leaves development startup available to show the runtime configuration error', () => {
    expect(() => viteConfig({ command: 'serve', mode: 'development' })).not.toThrow();
  });
});
