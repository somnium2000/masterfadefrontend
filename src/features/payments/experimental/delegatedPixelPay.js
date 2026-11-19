const EMV = ['browser_java_enabled', 'browser_language', 'browser_color_depth', 'browser_screen_height',
  'browser_screen_width', 'browser_time_zone', 'user_agent', 'browser_javascript_enabled'];
let active = false;
const unwrap = module => module.default || module;

// AM: Native manager import is internal SDK surface, explicitly experimental; no checkout imports this module.
export async function loadDelegatedSdk() {
  const [core, manager] = await Promise.all([import('@pixelpay/sdk-core'),
    import('@pixelpay/sdk-core/lib/libraries/CardinalManager.js')]);
  return { sdk: unwrap(core), Manager: unwrap(manager) };
}

export async function runDelegatedPixelPay({ transport, signal, timeoutMs = 60000, loadSdk = loadDelegatedSdk }) {
  if (active || signal?.aborted) throw new Error('PROTOTYPE_BUSY');
  active = true;
  let Manager, timer, abort, stop, halted = false, finished = false;
  const stopped = new Promise((_, reject) => { stop = () => { halted = true; reject(new Error('PROTOTYPE_UNCERTAIN')); }; });
  // AM: Attach the race before any transport or SDK await; SDK async event handlers need not catch our failures.
  const task = (async () => {
    const loaded = await loadSdk();
    if (halted) throw new Error('PROTOTYPE_UNCERTAIN');
    const sdk = loaded.sdk;
    Manager = loaded.Manager;
    const clientRequest = new sdk.Requests.SaleTransaction();
    clientRequest.withAuthenticationRequest();
    // AM: Separate server request follows the current unflagged Sale branch. No flagged request is stripped or serialized.
    const handoff = await transport('start', {});
    if (halted || signal?.aborted) throw new Error('PROTOTYPE_UNCERTAIN');
    if (handoff.state !== 'challenge') return await transport('status', {});
    if (handoff.continuation?.transaction_type !== 'songbird') throw new Error('PROTOTYPE_UNSUPPORTED');
    Object.assign(clientRequest, { order_id: handoff.order.id, order_amount: handoff.order.amount,
      order_currency: handoff.order.currency });
    const settings = new sdk.Models.Settings();
    settings.setupEndpoint(handoff.sdk.endpoint);
    settings.setupEnvironment(handoff.sdk.environment);
    const manager = new Manager(settings, clientRequest);
    const invoke = async (operation, data) => {
      try {
        if (halted || signal?.aborted) throw new Error('PROTOTYPE_UNCERTAIN');
        const result = await transport(operation, data);
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
    await manager.init(handoff.continuation.payload, handoff.continuation.collection_url);
    // AM: Native challenge completion is not a financial verdict; display only server evidence.
    return await transport('status', {});
  })();
  try {
    abort = stop;
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(stop, timeoutMs);
    const result = await Promise.race([task, stopped]);
    finished = true;
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    Manager?.clearAllEvents();
    halted = true;
    // AM: An uncertain native async handler has no abort API; require reload before another session on this page.
    if (finished) active = false;
  }
}
