import { expect, test, vi } from 'vitest';
import { completePublicPixelPay3ds } from '../publicPixelPay3ds.js';

const handoff = () => ({ token: 'NEVER_LOG_TOKEN', expiresAt: Date.now() + 5000,
  continuation: { payload: 'NEVER_LOG_PAYLOAD' } });
const pending = { processed: false, booking_confirmed: false, pending_confirmation: true };

test.each([
  'PIXELPAY_3DS_COLLECTION_URL_ABSENT', 'PIXELPAY_3DS_COLLECTION_URL_NULL',
  'PIXELPAY_3DS_COLLECTION_URL_EMPTY', 'PIXELPAY_3DS_COLLECTION_URL_INVALID',
  'PIXELPAY_3DS_CONTINUATION_INVALID', 'PIXELPAY_3DS_SDK_LOAD_FAILED', 'PIXELPAY_3DS_SDK_INIT_FAILED',
])('public browser failure retains safe enumerated code %s without its exception or handoff', async code => {
  const onChallenge = vi.fn();
  const result = await completePublicPixelPay3ds({ ...pending, public_3ds_handoff: handoff() }, {
    run: async () => { throw Object.assign(new Error('NEVER_LOG_CARD'), {
      code, stack: 'NEVER_LOG_STACK', payload: 'NEVER_LOG_PAYLOAD',
    }); }, onChallenge,
  });
  expect(result).toMatchObject({ ...pending, public_3ds_browser_diagnostic: { code } });
  expect(JSON.stringify(result)).not.toMatch(/NEVER_LOG|payload|token|stack/);
  expect(onChallenge.mock.calls).toEqual([[true], [false]]);
});

test('arbitrary browser exception text and code are replaced with a fixed interrupted code', async () => {
  const result = await completePublicPixelPay3ds({ public_3ds_handoff: handoff() }, {
    run: async () => { throw Object.assign(new Error('NEVER_LOG_SECRET'), { code: 'NEVER_LOG_ARBITRARY' }); },
  });
  expect(result.public_3ds_browser_diagnostic).toEqual({ code: 'PIXELPAY_3DS_CHALLENGE_INTERRUPTED' });
  expect(JSON.stringify(result)).not.toMatch(/NEVER_LOG|payload|token/);
});

test.each([{ expiresAt: 1 }, { token: '' }, { expiresAt: null }])('unavailable handoff emits a fixed local code before any operation', async patch => {
  const run = vi.fn(), advance = vi.fn(), onChallenge = vi.fn();
  const result = await completePublicPixelPay3ds({ public_3ds_handoff: { ...handoff(), ...patch } }, { run, advance, onChallenge });
  expect(result.public_3ds_browser_diagnostic).toEqual({ code: 'PIXELPAY_3DS_HANDOFF_UNAVAILABLE' });
  expect(run).not.toHaveBeenCalled();
  expect(advance).not.toHaveBeenCalled();
  expect(onChallenge).not.toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toMatch(/NEVER_LOG|payload|token/);
});

test('no handoff leaves the backend pending response unchanged', async () => {
  const run = vi.fn();
  expect(await completePublicPixelPay3ds(pending, { run })).toBe(pending);
  expect(run).not.toHaveBeenCalled();
});

test('successful completion still returns only financial evidence from the backend', async () => {
  const payment = { processed: true, booking_confirmed: true };
  const advance = vi.fn(async () => ({ payment }));
  const result = await completePublicPixelPay3ds({ public_3ds_handoff: handoff() }, {
    advance,
    run: async ({ transport }) => {
      await transport('retry', {}, undefined);
      return transport('status', {}, undefined);
    },
  });
  expect(result).toBe(payment);
  expect(result.public_3ds_browser_diagnostic).toBeUndefined();
  expect(advance).toHaveBeenCalledOnce();
});
