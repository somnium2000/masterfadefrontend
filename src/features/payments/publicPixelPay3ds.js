import { isDelegatedContinuationError } from './experimental/delegatedContinuationCodes.js';

export const PUBLIC_3DS_UNAVAILABLE = 'La autenticación del pago no está disponible en este momento. Intenta más tarde.';

export async function preparePublicPixelPay3ds() {
  try {
    const { isDelegatedPixelPayBusy, loadDelegatedSdk, runDelegatedPixelPay } = await import('./experimental/delegatedPixelPay.js');
    const nativeSdk = await loadDelegatedSdk();
    if (isDelegatedPixelPayBusy() || ['startCardinalTransaction', 'startCardinalDirectApiTransaction', 'submitChallengeForm', 'handleDirectApiLookup']
      .some(method => typeof nativeSdk.Manager.prototype[method] !== 'function')) throw new Error();
    new nativeSdk.sdk.Requests.SaleTransaction().withAuthenticationRequest();
    return options => runDelegatedPixelPay({ ...options, loadSdk: () => nativeSdk });
  } catch {
    throw Object.assign(new Error(PUBLIC_3DS_UNAVAILABLE), { code: 'PIXELPAY_3DS_SDK_LOAD_FAILED' });
  }
}

export async function completePublicPixelPay3ds(response, { run, signal, onChallenge, advance, readLocalStatus }) {
  const { public_3ds_handoff: handoff, ...pending } = response || {};
  if (!handoff) return response;
  const unresolved = {
    ...pending, processed: false, booking_confirmed: false, estado_intent_codigo: 'pendiente_confirmacion',
    pending_confirmation: true, public_3ds_pending: true,
  };
  const diagnostic = code => ({ ...unresolved, public_3ds_browser_diagnostic: { code } });
  if (!run || signal?.aborted || typeof handoff.token !== 'string'
    || !handoff.token || !Number.isFinite(handoff.expiresAt) || handoff.expiresAt <= Date.now()) {
    return diagnostic('PIXELPAY_3DS_HANDOFF_UNAVAILABLE');
  }
  let terminalPayment;
  onChallenge?.(true);
  try {
    const payment = await run({
      handoff,
      signal,
      transport: async (operation, data, operationSignal) => {
        if (operation === 'status') return terminalPayment ?? readLocalStatus(operationSignal);
        const result = await advance({ token: handoff.token, operation, data }, operationSignal);
        if (operation === 'retry') terminalPayment = result.payment;
        return result;
      },
    });
    return payment ?? unresolved;
  } catch (error) {
    const code = isDelegatedContinuationError(error?.code)
      || ['PIXELPAY_3DS_SDK_LOAD_FAILED', 'PIXELPAY_3DS_SDK_INIT_FAILED'].includes(error?.code)
      ? error.code : 'PIXELPAY_3DS_CHALLENGE_INTERRUPTED';
    return diagnostic(code);
  } finally {
    onChallenge?.(false);
  }
}
