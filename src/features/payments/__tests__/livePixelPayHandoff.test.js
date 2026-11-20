import { describe, expect, it } from 'vitest';
import { validateDirectHandoff } from '../experimental/delegatedPixelPay.js';

const handoff = {
  state: 'challenge', continuation_mode: 'direct_api',
  sdk: { endpoint: 'https://pixelpay.app', environment: 'live' },
  continuation: {
    status: 202, transaction_type: 'songbird', payload: 'opaque-token',
    collection_url: 'https://cas.client.cardinaltrusted.com/centinelapi/V2/Cruise/Collect',
  },
};

describe('Live 3DS SDK handoff is restricted to verified server-originated shapes', () => {
  it('accepts a Live endpoint with an official Cardinal collection URL', () => {
    expect(() => validateDirectHandoff(handoff)).not.toThrow();
  });
  it.each([
    { ...handoff, sdk: { ...handoff.sdk, environment: 'sandbox' } },
    { ...handoff, sdk: { ...handoff.sdk, endpoint: 'https://pixelpay.dev' } },
    { ...handoff, sdk: { ...handoff.sdk, endpoint: 'http://pixelpay.app' } },
    { ...handoff, sdk: { ...handoff.sdk, endpoint: 'https://pixelpay.app.evil.example' },
      continuation: { ...handoff.continuation, collection_url: 'https://malicious.invalid/Collect' } },
    { ...handoff, continuation: { ...handoff.continuation, collection_url: null } },
    { ...handoff, continuation: { ...handoff.continuation, status: 200 } },
  ])('rejects invalid environment, URL, or incomplete 3DS handoff', value => {
    expect(() => validateDirectHandoff(value)).toThrow();
  });
  it('QA still accepts the original Sandbox shapes without Live configuration', () => {
    expect(() => validateDirectHandoff({
      ...handoff, sdk: { endpoint: 'https://pixelpay.dev', environment: 'sandbox' },
    })).not.toThrow();
  });
});
