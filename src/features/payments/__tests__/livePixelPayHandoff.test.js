import { describe, expect, it } from 'vitest';
import { validateDirectHandoff } from '../experimental/delegatedPixelPay.js';

const handoff = {
  state: 'challenge', continuation_mode: 'direct_api',
  sdk: { endpoint: 'https://pixelpay.app', environment: 'live' },
  continuation: {
    status: 202, transaction_type: 'songbird', payload: 'opaque-token',
    collection_url: 'https://client.cardinaltrusted.com/centinelapi/V2/Cruise/Collect',
  },
};

describe('Live 3DS SDK handoff is restricted to verified server-originated shapes', () => {
  it.each(['V1', 'V2'])('accepts a Live endpoint with official Collect %s', version => {
    const collection_url = handoff.continuation.collection_url.replace('V2', version);
    expect(collection_url).toHaveLength(64);
    expect(validateDirectHandoff({ ...handoff, continuation: { ...handoff.continuation, collection_url } }))
      .toBe('https://pixelpay.app');
  });
  it.each([
    'https://cas.client.cardinaltrusted.com/centinelapi/V2/Cruise/Collect',
    'https://client.cardinaltrusted.com/centinelapi/V2/Cruise/StepUp',
    'https://client.cardinaltrusted.com/other/../centinelapi/V2/Cruise/Collect',
    'https://client.cardinaltrusted.com/centinelapi/V2/Cruise/Collect?redirect=https://redirect.invalid',
    'https://@client.cardinaltrusted.com/centinelapi/V2/Cruise/Collect',
    'https://client.cardinaltrusted.com:444/centinelapi/V2/Cruise/Collect',
  ])('rejects a mismatched or ambiguous Live collection %s', collection_url => {
    expect(() => validateDirectHandoff({ ...handoff, continuation: { ...handoff.continuation, collection_url } }))
      .toThrow('PIXELPAY_3DS_COLLECTION_URL_INVALID');
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
      continuation: { ...handoff.continuation, collection_url: handoff.continuation.collection_url.replace('client.', 'cas.client.') },
    })).not.toThrow();
  });
});
