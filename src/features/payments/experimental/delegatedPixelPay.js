const EMV = ['browser_java_enabled', 'browser_language', 'browser_color_depth', 'browser_screen_height',
  'browser_screen_width', 'browser_time_zone', 'user_agent', 'browser_javascript_enabled'];
const LOOKUP_FIELDS = ['reference', ...EMV];
const QA_ENDPOINT = 'https://pixelpay.dev';
const CAS_ORIGIN = 'https://cas.client.cardinaltrusted.com';
const COLLECTION_PATHS = ['/centinelapi/V1/Cruise/Collect', '/centinelapi/V2/Cruise/Collect'];
const STEP_UP_PATHS = ['/centinelapi/V2/Cruise/StepUp'];
const STEP_UP_FRAME = 'iframe[name="step-up-iframe"]';
let active = false;
export const isDelegatedPixelPayBusy = () => active;
const unwrap = module => module.default || module;

// AM: Native manager is an internal SDK import, enabled only by server-authorized QA or private Live checkout.
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
    || typeof Manager.prototype?.init !== 'function' || typeof Manager.clearAllEvents !== 'function'
    || typeof Manager.prototype?.validationLookupResponse !== 'function') {
    throw new Error('PIXELPAY_3DS_SDK_CONTRACT_INVALID');
  }
  return { sdk, Manager };
}

const browserFailure = code => Object.assign(new Error(code), { code });

function isCasUrl(value, paths) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\#]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.origin === CAS_ORIGIN && !url.username && !url.password && paths.includes(url.pathname);
  } catch { return false; }
}

const validPayload = value => typeof value === 'string' && value.length > 0 && value.length <= 32768;
function isSongbirdChallengeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\#]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}

function isAllowedLiveEndpoint(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.pathname === '/' && !url.username
      && !url.password && !url.search && !url.hash && url.hostname !== 'pixelpay.dev'
      && url.hostname !== 'localhost';
  } catch { return false; }
}

export function validatePublicHandoff(handoff) {
  const continuation = handoff?.continuation;
  const sdk = handoff?.sdk;
  const validEnvironment = (sdk?.environment === 'sandbox' && sdk.endpoint === QA_ENDPOINT)
    || (sdk?.environment === 'live' && isAllowedLiveEndpoint(sdk.endpoint));
  let code;
  const songbird = handoff?.continuation_mode === 'songbird';
  if (songbird && continuation && Object.hasOwn(continuation, 'collection_url')) code = 'PIXELPAY_3DS_CONTINUATION_INVALID';
  else if (songbird) {
    if (handoff.state !== 'challenge' || !validEnvironment || continuation?.status !== 202
      || continuation.transaction_type !== 'songbird' || !validPayload(continuation.payload)) code = 'PIXELPAY_3DS_CONTINUATION_INVALID';
  } else if (!continuation || !Object.hasOwn(continuation, 'collection_url')) code = 'PIXELPAY_3DS_COLLECTION_URL_ABSENT';
  else if (continuation.collection_url === null) code = 'PIXELPAY_3DS_COLLECTION_URL_NULL';
  else if (continuation.collection_url === '') code = 'PIXELPAY_3DS_COLLECTION_URL_EMPTY';
  else if (!isCasUrl(continuation.collection_url, COLLECTION_PATHS)) code = 'PIXELPAY_3DS_COLLECTION_URL_INVALID';
  else if (handoff.state !== 'challenge' || handoff.continuation_mode !== 'direct_api' || !validEnvironment
    || continuation.status !== 202 || continuation.transaction_type !== 'songbird'
    || !validPayload(continuation.payload)) code = 'PIXELPAY_3DS_CONTINUATION_INVALID';
  if (code) throw browserFailure(code);
  return new URL(sdk.endpoint).origin;
}

export function validateDirectHandoff(handoff) {
  if (handoff?.continuation_mode !== 'direct_api') throw browserFailure('PIXELPAY_3DS_CONTINUATION_INVALID');
  return validatePublicHandoff(handoff);
}

function bindSongbird(manager, isClosed, stop) {
  const start = manager.startCardinalTransaction?.bind(manager);
  if (!start) throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
  let previous, facade, reference, validated = false;
  const handlers = new Set();
  manager.startCardinalTransaction = (...args) => {
    previous = window.Cardinal;
    if (!previous || ['configure', 'on', 'off', 'setup', 'continue'].some(method => typeof previous[method] !== 'function')) {
      throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
    }
    previous.configure({ logging: { level: 'off' } });
    facade = new Proxy(previous, { get(target, name) {
      if (name === 'on') return (event, callback) => {
        handlers.add(event);
        return target.on(event, (...values) => {
          if (isClosed()) { stop(); return; }
          if (event === 'payments.setupComplete') {
            const current = values[0]?.sessionId;
            if (typeof current !== 'string' || !current || current.length > 160) { stop(); return; }
            if (reference !== undefined) {
              if (reference !== current) stop();
              return;
            }
            reference = current;
          }
          if (event === 'payments.validated') {
            if (validated) return;
            validated = true;
            if (values[0]?.ActionCode !== 'SUCCESS' || !validPayload(values[1])) { stop(); return; }
          }
          if (event === 'ui.close') { stop(); return; }
          try { return Promise.resolve(callback(...values)).catch(() => stop()); }
          catch { stop(); }
        });
      };
      return typeof target[name] === 'function' ? target[name].bind(target) : target[name];
    }, set(target, name, value) { target[name] = value; return true; } });
    window.Cardinal = facade;
    return start(...args);
  };
  return () => {
    if (!previous) return;
    for (const name of handlers) previous.off(name);
    if (window.Cardinal === facade) window.Cardinal = previous;
  };
}

function bindDirectApiFrames(manager, isClosed, stop, callbackOrigin, armNativeRetry) {
  if (typeof manager.startCardinalDirectApiTransaction !== 'function' || typeof manager.submitChallengeForm !== 'function'
    || typeof manager.handleDirectApiLookup !== 'function'
    || document.getElementById('cardinal_collection_iframe') || document.getElementById('cardinal_collection_form')
    || document.getElementById('step-up-form') || document.querySelector(STEP_UP_FRAME)) {
    throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
  }
  const start = manager.startCardinalDirectApiTransaction.bind(manager);
  const submit = manager.submitChallengeForm.bind(manager);
  const lookup = manager.handleDirectApiLookup.bind(manager);
  let challengeFrame, callbackAccepted = false, nativeSettled = false;
  // AM: The SDK polls collection without awaiting this callback.
  manager.handleDirectApiLookup = async data => {
    if (isClosed()) { stop(); return; }
    try { await lookup(data); }
    catch { stop(); }
  };
  manager.startCardinalDirectApiTransaction = secureForm => {
    const collectionFrame = document.getElementById('cardinal_collection_iframe');
    const completion = start(secureForm);
    void completion.then(() => { nativeSettled = true; }, () => { nativeSettled = true; });
    const nativeListener = manager.listen_direct_message;
    if (!collectionFrame || typeof nativeListener !== 'function') { stop(); return completion; }
    // AM: Native init owns the forms and listener. Restrict this instance's messages to its own frames.
    window.removeEventListener('message', nativeListener, false);
    manager.listen_direct_message = event => {
      if (isClosed()) { stop(); return; }
      if (!event.source) return;
      if (event.data?.name === 'pixelpay_continue') {
        if (callbackAccepted || event.origin !== callbackOrigin || event.source !== challengeFrame?.contentWindow) return;
        callbackAccepted = true;
        armNativeRetry();
      } else if (event.origin !== CAS_ORIGIN || event.source !== collectionFrame?.contentWindow) return;
      return nativeListener(event);
    };
    window.addEventListener('message', manager.listen_direct_message, false);
    return completion;
  };
  manager.submitChallengeForm = (...args) => {
    if (isClosed()) { stop(); return; }
    if (challengeFrame) return;
    try {
      submit(...args);
    } catch {
      stop();
    } finally {
      challengeFrame = document.querySelector(STEP_UP_FRAME);
      challengeFrame?.setAttribute('title', 'Autenticación bancaria');
    }
    if (!challengeFrame) stop();
  };
  return () => {
    // AM: Settle native init so its finally removes the listener and forms on abort/expiry too.
    if (!nativeSettled) manager.direct_api_reject?.(new Error('PROTOTYPE_UNCERTAIN'));
    challengeFrame?.remove();
  };
}

export async function runDelegatedPixelPay({ transport, handoff: suppliedHandoff, signal, timeoutMs = 60000,
  loadSdk = loadDelegatedSdk, now = Date.now }) {
  if (active || signal?.aborted) throw new Error('PROTOTYPE_BUSY');
  active = true;
  const transportAbort = new AbortController();
  let Manager, timer, abort, stop, firstLookup, closeDirectApi, closeSongbird, nativeStarted = false, halted = false, finished = false;
  let nativeRetryAuthorized = false;
  const isClosed = () => halted || signal?.aborted || (suppliedHandoff && now() >= suppliedHandoff.expiresAt);
  const stopped = new Promise((_, reject) => {
    stop = () => {
      if (halted) return;
      halted = true;
      reject(new Error('PROTOTYPE_UNCERTAIN'));
    };
  });
  // AM: Attach the race before any transport or SDK await; SDK async event handlers need not catch our failures.
  const task = (async () => {
    const endpointOrigin = suppliedHandoff ? validatePublicHandoff(suppliedHandoff) : null;
    const direct = suppliedHandoff?.continuation_mode === 'direct_api';
    let sdk;
    try {
      ({ sdk, Manager } = await loadSdk());
    } catch {
      throw browserFailure('PIXELPAY_3DS_SDK_LOAD_FAILED');
    }
    if (isClosed()) throw new Error('PROTOTYPE_UNCERTAIN');
    let clientRequest;
    try {
      clientRequest = new sdk.Requests.SaleTransaction();
      clientRequest.withAuthenticationRequest();
    } catch {
      throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
    }
    // AM: Separate server request follows the current unflagged Sale branch. No flagged request is stripped or serialized.
    const handoff = suppliedHandoff ?? await transport('start', {}, transportAbort.signal);
    if (isClosed()) throw new Error('PROTOTYPE_UNCERTAIN');
    if (handoff.state !== 'challenge') return await transport('status', {}, transportAbort.signal);
    if (handoff.continuation?.transaction_type !== 'songbird') throw new Error('PROTOTYPE_UNSUPPORTED');
    let manager;
    try {
      Object.assign(clientRequest, { order_id: handoff.order.id, order_amount: handoff.order.amount,
        order_currency: handoff.order.currency });
      const settings = new sdk.Models.Settings();
      // AM: The native Direct listener compares MessageEvent.origin to settings.endpoint verbatim.
      settings.setupEndpoint(endpointOrigin ?? handoff.sdk.endpoint);
      settings.setupEnvironment(handoff.sdk.environment);
      manager = new Manager(settings, clientRequest);
      if (typeof manager.validationLookupResponse !== 'function') throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
      if (direct) closeDirectApi = bindDirectApiFrames(
        manager, isClosed, stop, endpointOrigin,
        () => { nativeRetryAuthorized = true; });
      else if (suppliedHandoff) closeSongbird = bindSongbird(manager, isClosed, stop);
    } catch {
      throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
    }
    // AM: Native setup assigns identifier before validation. Preserve it when settling a skipped lookup.
    const skippedLookup = { get data() { return { identifier: manager.identifier }; } };
    const validateLookup = manager.validationLookupResponse.bind(manager);
    manager.validationLookupResponse = (response, resolve) => {
      if (isClosed()) { stop(); return; }
      // AM: Do not feed a synthetic response to native validation or close the original challenge.
      if (response !== skippedLookup) {
        try { return Promise.resolve(validateLookup(response, resolve)).catch(() => stop()); }
        catch { stop(); }
      }
    };

    let nativeTransportStarted = false;
    const invoke = async (operation, data) => {
      nativeTransportStarted = true;
      try {
        if (isClosed()) throw new Error('PROTOTYPE_UNCERTAIN');
        const result = await transport(operation, data, transportAbort.signal);
        if (isClosed()) throw new Error('PROTOTYPE_UNCERTAIN');
        if (suppliedHandoff && operation === 'lookup' && result.status === 200
          && result.success === true && result.action === null && result.data?.identifier) {
          nativeRetryAuthorized = true; // Frictionless native 3DS; no challenge required.
        }
        if (suppliedHandoff && operation === 'lookup' && result.action === 'continue'
          && (![200, 202].includes(result.status) || result.success !== true
            || !(direct ? isCasUrl(result.data?.continue_url, STEP_UP_PATHS) : isSongbirdChallengeUrl(result.data?.continue_url))
            || !validPayload(result.data?.continue_payload))) {
          throw new Error('PROTOTYPE_UNCERTAIN');
        }
        if (suppliedHandoff && operation === 'continue') {
          if (direct || result.status !== 200 || result.success !== true || result.action !== null) throw new Error('PROTOTYPE_UNCERTAIN');
          nativeRetryAuthorized = true;
        }
        // AM: Rehydrate only the actual Node SDK response envelope; never invent an authentication result.
        const Type = result.status === 200 ? sdk.Responses.SuccessResponse
          : result.status === 202 ? sdk.Responses.PayloadResponse : sdk.Responses.FailureResponse;
        return Object.assign(new Type(), result);
      } catch {
        stop();
        if (operation === 'lookup') return skippedLookup;
        if (suppliedHandoff) throw new Error('PROTOTYPE_UNCERTAIN');
        // AM: Pause this failed native callback until teardown, instead of fabricating a response that advances 3DS.
        return new Promise(() => {});
      }
    };
    manager.service = {
      authenticationLookup: lookup => {
        if (isClosed()) { stop(); return skippedLookup; }
        const data = Object.fromEntries(LOOKUP_FIELDS
          .filter(key => lookup[key] !== undefined).map(key => [key, lookup[key]]));
        if (firstLookup) {
          if (LOOKUP_FIELDS.some(key => firstLookup[key] !== data[key])) stop();
          return skippedLookup;
        }
        firstLookup = data;
        return invoke('lookup', data);
      },
      authenticationContinue: request => {
        if (suppliedHandoff && (direct || !validPayload(request.payload))) {
          stop();
          return Promise.reject(new Error('PIXELPAY_3DS_CONTINUATION_INVALID'));
        }
        return invoke('continue', { payload: request.payload });
      },
      retryTransaction: () => {
        // A failed/cancelled challenge must never trigger the SDK's second Sale.
        if (suppliedHandoff && !nativeRetryAuthorized) {
          stop();
          return Promise.reject(new Error('PIXELPAY_3DS_RETRY_NOT_AUTHORIZED'));
        }
        return invoke('retry', {});
      },
    };
    nativeStarted = true;
    try {
      await manager.init(handoff.continuation.payload, handoff.continuation.collection_url);
    } catch (error) {
      if (nativeTransportStarted) throw error;
      throw browserFailure('PIXELPAY_3DS_SDK_INIT_FAILED');
    }
    // AM: Native challenge completion is not a financial verdict; display only server evidence.
    if (isClosed()) throw new Error('PROTOTYPE_UNCERTAIN');
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
    firstLookup = undefined;
    transportAbort.abort();
    try {
      if (closeDirectApi) closeDirectApi();
      else if (nativeStarted) Manager.clearAllEvents();
      closeSongbird?.();
    } catch {
      // AM: A partially loaded Cardinal script must not replace the initialization error.
      finished = false;
    }
    // AM: An uncertain native async handler has no abort API; require reload before another session on this page.
    if (finished || !nativeStarted) active = false;
  }
}
