const EMV = ['browser_java_enabled', 'browser_language', 'browser_color_depth', 'browser_screen_height',
  'browser_screen_width', 'browser_time_zone', 'user_agent', 'browser_javascript_enabled'];
let active = false;
const unwrap = module => module.default || module;

// AM: Native manager is an internal SDK import, enabled only for the selected QA checkout.
export async function loadDelegatedSdk() {
  const [core, manager] = await Promise.all([import('@pixelpay/sdk-core'),
    import('@pixelpay/sdk-core/lib/libraries/CardinalManager.js')]);
  const exports = unwrap(core);
  // AM: The SDK browser entry publishes namespaces on window, while the Node entry exports them.
  const sdk = {
    Requests: exports.Requests ?? globalThis.window?.Requests,
    Models: exports.Models ?? globalThis.window?.Models,
    Responses: exports.Responses ?? globalThis.window?.Responses,
  };
  const Manager = unwrap(manager);
  const constructors = [sdk.Requests?.SaleTransaction, sdk.Models?.Settings,
    sdk.Responses?.SuccessResponse, sdk.Responses?.PayloadResponse, sdk.Responses?.FailureResponse, Manager];
  if (constructors.some(Type => typeof Type !== 'function')
    || typeof Manager.prototype?.init !== 'function' || typeof Manager.clearAllEvents !== 'function') {
    throw new Error('PIXELPAY_3DS_SDK_CONTRACT_INVALID');
  }
  return { sdk, Manager };
}

const browserFailure = code => Object.assign(new Error(code), { code });

export async function runDelegatedPixelPay({ transport, handoff: suppliedHandoff, signal, timeoutMs = 60000,
  loadSdk = loadDelegatedSdk, now = Date.now }) {
  if (active || signal?.aborted) throw new Error('PROTOTYPE_BUSY');
  active = true;
  const transportAbort = new AbortController();
  let Manager, timer, abort, stop, nativeStarted = false, halted = false, finished = false;
  const stopped = new Promise((_, reject) => { stop = () => { halted = true; reject(new Error('PROTOTYPE_UNCERTAIN')); }; });
  // AM: Attach the race before any transport or SDK await; SDK async event handlers need not catch our failures.
  const task = (async () => {
    let sdk;
    try {
      ({ sdk, Manager } = await loadSdk());
    } catch {
      throw browserFailure('PIXELPAY_3DS_SDK_LOAD_FAILED');
    }
    if (halted) throw new Error('PROTOTYPE_UNCERTAIN');
    let clientRequest;
    try {
      clientRequest = new sdk.Requests.SaleTransaction();
      clientRequest.withAuthenticationRequest();
    } catch {
      throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
    }
    // AM: Separate server request follows the current unflagged Sale branch. No flagged request is stripped or serialized.
    const handoff = suppliedHandoff ?? await transport('start', {}, transportAbort.signal);
    if (halted || signal?.aborted) throw new Error('PROTOTYPE_UNCERTAIN');
    if (suppliedHandoff && now() >= suppliedHandoff.expiresAt) throw new Error('PROTOTYPE_UNCERTAIN');
    if (handoff.state !== 'challenge') return await transport('status', {}, transportAbort.signal);
    if (handoff.continuation?.transaction_type !== 'songbird') throw new Error('PROTOTYPE_UNSUPPORTED');
    let manager;
    try {
      Object.assign(clientRequest, { order_id: handoff.order.id, order_amount: handoff.order.amount,
        order_currency: handoff.order.currency });
      const settings = new sdk.Models.Settings();
      settings.setupEndpoint(handoff.sdk.endpoint);
      settings.setupEnvironment(handoff.sdk.environment);
      manager = new Manager(settings, clientRequest);
    } catch {
      throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
    }
    let nativeTransportStarted = false;
    const invoke = async (operation, data) => {
      nativeTransportStarted = true;
      try {
        if (halted || signal?.aborted) throw new Error('PROTOTYPE_UNCERTAIN');
        const result = await transport(operation, data, transportAbort.signal);
        if (halted || signal?.aborted) throw new Error('PROTOTYPE_UNCERTAIN');
        // AM: Rehydrate only the actual Node SDK response envelope; never invent an authentication result.
        const Type = result.status === 200 ? sdk.Responses.SuccessResponse
          : result.status === 202 ? sdk.Responses.PayloadResponse : sdk.Responses.FailureResponse;
        return Object.assign(new Type(), result);
      } catch {
        stop();
        // AM: Pause this failed native callback until teardown, instead of fabricating a response that advances 3DS.
        return new Promise(() => {});
      }
    };
    manager.service = {
      authenticationLookup: lookup => invoke('lookup', Object.fromEntries(['reference', ...EMV]
        .filter(key => lookup[key] !== undefined).map(key => [key, lookup[key]]))),
      authenticationContinue: request => invoke('continue', { payload: request.payload }),
      retryTransaction: () => invoke('retry', {}),
    };
    nativeStarted = true;
    try {
      await manager.init(handoff.continuation.payload, handoff.continuation.collection_url);
    } catch (error) {
      if (nativeTransportStarted) throw error;
      throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
    }
    // AM: Native challenge completion is not a financial verdict; display only server evidence.
    return await transport('status', {}, transportAbort.signal);
  })();
  try {
    abort = stop;
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(stop, suppliedHandoff ? Math.max(0, suppliedHandoff.expiresAt - now()) : timeoutMs);
    const result = await Promise.race([task, stopped]);
    finished = true;
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    halted = true;
    transportAbort.abort();
    try {
      if (nativeStarted) Manager.clearAllEvents();
    } catch {
      // AM: A partially loaded Cardinal script must not replace the initialization error.
      finished = false;
    }
    // AM: An uncertain native async handler has no abort API; require reload before another session on this page.
    if (finished) active = false;
  }
}
