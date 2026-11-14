import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completePublicMockPayment,
  completePublicSimulatorPayment,
  createPublicPaymentIntent,
  getPublicPaymentStatus,
  queryPublicPixelPayStatus,
  salePublicPixelPay,
} from '../publicBookingApi.js';
import {
  buildMockPaymentPayload,
  buildPaymentContextPayload,
  buildPaymentStatusParams,
  buildSimulatorPaymentPayload,
} from '../bookingPayloadBuilders.js';
import {
  BOOKING_PAYMENT_CONTEXT_STORAGE_KEY,
  PENDING_PAYMENT_CONTEXT_STORAGE_KEY,
  readBookingPaymentContext,
} from '../paymentResumeContext.js';
import { getPixelPayHostedPaymentStatus, startPixelPayHostedPayment } from '../pixelPayHostedApi.js';
import { isPixelPayHostedPayment, validatePixelPayHostedCheckoutUrl } from '../pixelPayHostedCheckout.js';

const TODO_PAGO_SIMULATION_SCENARIO_STORAGE_KEY = 'masterfade.todopagoSimulation.amountHnl';

function safeText(value) {
  const normalized = String(value || '').trim();
  return normalized || '';
}

function createClientRequestId() {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === 'function') return browserCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  browserCrypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function writeStoredPaymentContext(context) {
  if (typeof window === 'undefined') return;
  try {
    if (!context) {
      window.sessionStorage.removeItem(BOOKING_PAYMENT_CONTEXT_STORAGE_KEY);
      window.sessionStorage.removeItem(PENDING_PAYMENT_CONTEXT_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(BOOKING_PAYMENT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // no-op
  }
}

function clearStoredPendingPaymentContext() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_PAYMENT_CONTEXT_STORAGE_KEY);
  } catch {
    // AM: El almacenamiento puede estar bloqueado; el backend mantiene el estado canónico.
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError'
    || String(error?.message || '').toLowerCase().includes('aborted');
}

function isHostedStartRejectedBeforeClaim(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.data?.error?.code || error?.error?.code || '').toUpperCase();
  return (status >= 400 && status < 500 && status !== 408 && status !== 429)
    || code === 'PIXELPAY_HOSTED_DISABLED';
}

function waitAbortable(ms, signal) {
  if (!ms || ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timeoutId);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', abort, { once: true });
    }
  });
}

function readTodoPagoSimulationAmount() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(TODO_PAGO_SIMULATION_SCENARIO_STORAGE_KEY);
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export default function useBookingPayment({ currentGroupId = '', authenticated = false } = {}) {
  const [paymentIntentState, setPaymentIntentState] = useState(null);
  const [paymentResultState, setPaymentResultState] = useState(null);
  const [bookingSuccessResultState, setBookingSuccessResultState] = useState(null);
  const [creatingPaymentIntent, setCreatingPaymentIntent] = useState(false);
  const [checkingPaymentStatus, setCheckingPaymentStatus] = useState(false);

  const mountedRef = useRef(false);
  const currentGroupIdRef = useRef('');
  const createIntentRef = useRef(null);
  const statusRequestRef = useRef(null);
  const paymentIntentRef = useRef(null);
  const paymentStateSeqRef = useRef(0);
  const pixelPaySaleRef = useRef(null);
  const pixelPayStatusRef = useRef(null);
  const pixelPayHostedStartRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (statusRequestRef.current?.controller) {
        statusRequestRef.current.controller.abort('booking_payment_unmounted');
      }
      if (pixelPaySaleRef.current?.controller) {
        pixelPaySaleRef.current.controller.abort('booking_payment_unmounted');
      }
      if (pixelPayStatusRef.current?.controller) {
        pixelPayStatusRef.current.controller.abort('booking_payment_unmounted');
      }
      pixelPayHostedStartRef.current?.controller?.abort('booking_payment_unmounted');
      pixelPaySaleRef.current = null;
      pixelPayStatusRef.current = null;
    };
  }, []);

  useEffect(() => {
    const groupId = safeText(currentGroupId);
    const previousGroupId = safeText(currentGroupIdRef.current);
    const groupChanged = Boolean(groupId && previousGroupId && groupId !== previousGroupId);
    currentGroupIdRef.current = groupId || safeText(paymentIntentRef.current?.id_grupo_cita);
    if (!groupId) return;
    const incompatible = (value) => value && safeText(value.id_grupo_cita) !== groupId;
    if (incompatible(paymentIntentRef.current)) {
      paymentIntentRef.current = null;
      paymentStateSeqRef.current += 1;
      setPaymentIntentState(null);
    }
    const staleResult = (value) => value && (incompatible(value)
      && (groupChanged || safeText(value.id_grupo_cita)));
    setPaymentResultState((current) => staleResult(current) ? null : current);
    setBookingSuccessResultState((current) => staleResult(current) ? null : current);
    if (typeof window !== 'undefined') {
      for (const key of [BOOKING_PAYMENT_CONTEXT_STORAGE_KEY, PENDING_PAYMENT_CONTEXT_STORAGE_KEY]) {
        try {
          const stored = JSON.parse(window.sessionStorage.getItem(key));
          if (incompatible(stored)) window.sessionStorage.removeItem(key);
        } catch {
          // AM: Un contexto ilegible nunca se utiliza para resolver un pago.
        }
      }
    }
  }, [currentGroupId]);

  const isCurrentPaymentGroup = useCallback((groupId) => {
    const expectedGroupId = safeText(currentGroupIdRef.current);
    const incomingGroupId = safeText(groupId);
    if (!expectedGroupId || !incomingGroupId) return true;
    return expectedGroupId === incomingGroupId;
  }, []);

  const setPaymentIntent = useCallback((nextValue) => {
    setPaymentIntentState((current) => {
      const resolved = typeof nextValue === 'function' ? nextValue(current) : nextValue;
      paymentIntentRef.current = resolved && typeof resolved === 'object' ? resolved : null;
      return paymentIntentRef.current;
    });
  }, []);

  const setPaymentResult = useCallback((nextValue) => {
    setPaymentResultState((current) => (
      typeof nextValue === 'function' ? nextValue(current) : nextValue
    ));
  }, []);

  const setBookingSuccessResult = useCallback((nextValue) => {
    setBookingSuccessResultState((current) => (
      typeof nextValue === 'function' ? nextValue(current) : nextValue
    ));
  }, []);

  const clearPaymentState = useCallback(() => {
    if (statusRequestRef.current?.controller) {
      statusRequestRef.current.controller.abort('booking_payment_cleared');
    }
    statusRequestRef.current = null;
    if (pixelPaySaleRef.current?.controller) {
      pixelPaySaleRef.current.controller.abort('booking_payment_cleared');
    }
    pixelPaySaleRef.current = null;
    if (pixelPayStatusRef.current?.controller) {
      pixelPayStatusRef.current.controller.abort('booking_payment_cleared');
    }
    pixelPayStatusRef.current = null;
    pixelPayHostedStartRef.current?.controller?.abort('booking_payment_cleared');
    pixelPayHostedStartRef.current = null;
    createIntentRef.current = null;
    paymentIntentRef.current = null;
    paymentStateSeqRef.current += 1;
    currentGroupIdRef.current = '';
    writeStoredPaymentContext(null);
    setPaymentIntentState(null);
    setPaymentResultState(null);
    setBookingSuccessResultState(null);
    setCreatingPaymentIntent(false);
    setCheckingPaymentStatus(false);
  }, []);

  const restorePaymentContext = useCallback((groupId = '', fallbackContext = null) => {
    const fallback = fallbackContext && typeof fallbackContext === 'object'
      ? {
          id_grupo_cita: safeText(fallbackContext.id_grupo_cita),
          id_intent: safeText(fallbackContext.id_intent),
          titular_email: safeText(fallbackContext.titular_email).toLowerCase(),
          ...(isPixelPayHostedPayment(fallbackContext) ? { payment_channel: 'hosted' } : {}),
          paymentIntent: null,
        }
      : null;
    const expectedGroupId = safeText(groupId) || fallback?.id_grupo_cita;
    if (fallback && expectedGroupId && fallback.id_grupo_cita !== expectedGroupId) return null;
    const expectedIntentId = fallback?.id_intent || '';
    const stored = readBookingPaymentContext({
      groupId: expectedGroupId,
      intentId: expectedIntentId,
    });
    const context = stored || fallback;
    if (!context?.id_intent || !context?.id_grupo_cita) return null;
    if (!isCurrentPaymentGroup(context.id_grupo_cita)) return null;
    const restoredIntent = context.paymentIntent || {
      id_intent: context.id_intent,
      id_grupo_cita: context.id_grupo_cita,
      ...(isPixelPayHostedPayment(context) ? { payment_channel: 'hosted' } : {}),
    };
    paymentIntentRef.current = restoredIntent;
    setPaymentIntentState(restoredIntent);
    return context;
  }, [isCurrentPaymentGroup]);

  const createPaymentIntentOnce = useCallback(async ({ groupId, titularEmail, payload }) => {
    const normalizedGroupId = safeText(groupId);
    const normalizedEmail = safeText(titularEmail).toLowerCase();
    if (!normalizedGroupId) return null;

    const currentIntentGroupId = safeText(paymentIntentRef.current?.id_grupo_cita);
    const currentIntentId = safeText(paymentIntentRef.current?.id_intent);
    if (currentIntentId && currentIntentGroupId === normalizedGroupId) {
      return paymentIntentRef.current;
    }

    const restored = restorePaymentContext(normalizedGroupId);
    if (restored?.id_intent) return restored.paymentIntent || paymentIntentRef.current;

    if (createIntentRef.current?.groupId === normalizedGroupId) {
      return createIntentRef.current.promise;
    }

    const promise = (async () => {
      const requestSeq = paymentStateSeqRef.current;
      setCreatingPaymentIntent(true);
      const response = await createPublicPaymentIntent(payload, { authenticated });
      const intent = response?.data ?? response;
      if (
        !mountedRef.current
        || paymentStateSeqRef.current !== requestSeq
        || !isCurrentPaymentGroup(normalizedGroupId)
      ) {
        return null;
      }
      const intentWithGroup = {
        ...(intent && typeof intent === 'object' ? intent : {}),
        id_grupo_cita: normalizedGroupId,
      };
      paymentIntentRef.current = intentWithGroup;
      setPaymentIntentState(intentWithGroup);
      writeStoredPaymentContext(buildPaymentContextPayload({
        groupId: normalizedGroupId,
        intentId: intentWithGroup.id_intent,
        titularEmail: normalizedEmail,
        paymentIntent: intentWithGroup,
      }));
      return intentWithGroup;
    })();

    createIntentRef.current = { groupId: normalizedGroupId, promise };
    try {
      return await promise;
    } finally {
      if (createIntentRef.current?.promise === promise) {
        createIntentRef.current = null;
      }
      if (mountedRef.current) setCreatingPaymentIntent(false);
    }
  }, [authenticated, isCurrentPaymentGroup, restorePaymentContext]);

  const fetchPaymentStatusOnce = useCallback(async ({
    groupId,
    intentId,
    titularEmail,
    retries = 0,
    retryDelayMs = 1200,
    shouldRetry = null,
  }) => {
    const normalizedGroupId = safeText(groupId);
    const normalizedIntentId = safeText(intentId);
    const normalizedEmail = safeText(titularEmail).toLowerCase();
    if (!normalizedGroupId || !normalizedIntentId || !normalizedEmail) return null;
    if (!isCurrentPaymentGroup(normalizedGroupId)) return null;

    const requestKey = `${normalizedGroupId}|${normalizedIntentId}|${normalizedEmail}`;
    if (statusRequestRef.current?.key === requestKey) {
      return statusRequestRef.current.promise;
    }
    if (statusRequestRef.current?.controller) {
      statusRequestRef.current.controller.abort('booking_payment_status_replaced');
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const promise = (async () => {
      const requestSeq = paymentStateSeqRef.current;
      setCheckingPaymentStatus(true);
      let lastPayload = null;
      const maxAttempts = Math.max(1, Math.min(4, Number(retries || 0) + 1));
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const hostedContext = isPixelPayHostedPayment(paymentIntentRef.current);
        const statusRequest = hostedContext && paymentIntentRef.current?.hosted_start_rejected !== true
          ? getPixelPayHostedPaymentStatus
          : getPublicPaymentStatus;
        const statusParams = buildPaymentStatusParams({
          groupId: normalizedGroupId,
          intentId: normalizedIntentId,
          titularEmail: normalizedEmail,
        });
        const requestOptions = {
          authenticated,
          signal: controller?.signal,
        };
        let response;
        try {
          response = await statusRequest(statusParams, requestOptions);
        } catch (error) {
          if (statusRequest !== getPixelPayHostedPaymentStatus || Number(error?.status) !== 404) throw error;
          response = await getPublicPaymentStatus(statusParams, requestOptions);
        }
        let payload = response?.data ?? response;

        if (!mountedRef.current || paymentStateSeqRef.current !== requestSeq
          || !isCurrentPaymentGroup(normalizedGroupId)) return null;
        const canRestoreSdkChannel = hostedContext
          && paymentIntentRef.current?.hosted_start_rejected === true
          && payload?.payment_channel === 'sdk';
        if (canRestoreSdkChannel) payload = { ...payload, hosted_start_rejected: true };
        lastPayload = payload;
        if (isPixelPayHostedPayment(payload) || canRestoreSdkChannel) {
          const recoveredIntent = {
            ...paymentIntentRef.current,
            id_grupo_cita: normalizedGroupId,
            id_intent: normalizedIntentId,
            payment_channel: canRestoreSdkChannel ? 'sdk' : 'hosted',
            hosted_state: payload.hosted_state,
            hosted_start_rejected: false,
            hosted_available: payload.hosted_available === true,
            estado_intent_codigo: payload.estado_intent_codigo,
            pending_confirmation: payload.pending_confirmation,
            manual_reconciliation_required: payload.manual_reconciliation_required,
          };
          paymentIntentRef.current = recoveredIntent;
          setPaymentIntentState(recoveredIntent);
          writeStoredPaymentContext(buildPaymentContextPayload({
            groupId: normalizedGroupId,
            intentId: normalizedIntentId,
            titularEmail: normalizedEmail,
            paymentIntent: recoveredIntent,
          }));
        }
        setPaymentResultState(payload);
        if (payload?.booking_confirmed === true) clearStoredPendingPaymentContext();

        const retry = typeof shouldRetry === 'function' && shouldRetry(payload);
        if (!retry || attempt >= maxAttempts - 1) break;
        await waitAbortable(retryDelayMs, controller?.signal);
      }
      return lastPayload;
    })();

    statusRequestRef.current = { key: requestKey, controller, promise };
    try {
      return await promise;
    } catch (error) {
      if (isAbortError(error)) return null;
      throw error;
    } finally {
      if (statusRequestRef.current?.promise === promise) {
        statusRequestRef.current = null;
      }
      if (mountedRef.current) setCheckingPaymentStatus(false);
    }
  }, [authenticated, isCurrentPaymentGroup]);

  const completeMockPaymentOnce = useCallback(async ({ groupId, intentId, titularEmail }) => {
    const normalizedGroupId = safeText(groupId);
    const normalizedIntentId = safeText(intentId);
    const normalizedEmail = safeText(titularEmail).toLowerCase();
    if (!normalizedGroupId || !normalizedIntentId || !normalizedEmail) return false;
    if (!isCurrentPaymentGroup(normalizedGroupId)) return false;
    await completePublicMockPayment(buildMockPaymentPayload({
      groupId: normalizedGroupId,
      intentId: normalizedIntentId,
      titularEmail: normalizedEmail,
    }), { authenticated });
    return true;
  }, [authenticated, isCurrentPaymentGroup]);

  const completeSimulatorPaymentOnce = useCallback(async ({ groupId, intentId, titularEmail, status = 'success' }) => {
    const normalizedGroupId = safeText(groupId);
    const normalizedIntentId = safeText(intentId);
    const normalizedEmail = safeText(titularEmail).toLowerCase();
    if (!normalizedGroupId || !normalizedIntentId || !normalizedEmail) return false;
    if (!isCurrentPaymentGroup(normalizedGroupId)) return false;
    const amountForSimulation = readTodoPagoSimulationAmount();
    const response = await completePublicSimulatorPayment(buildSimulatorPaymentPayload({
      groupId: normalizedGroupId,
      intentId: normalizedIntentId,
      titularEmail: normalizedEmail,
      status,
      amountForSimulation,
    }), { authenticated });
    const payload = response?.data ?? response;
    return payload || true;
  }, [authenticated, isCurrentPaymentGroup]);

  const salePixelPayOnce = useCallback(async ({ groupId, intentId, titularEmail, card, billing }) => {
    const normalizedGroupId = safeText(groupId);
    const normalizedIntentId = safeText(intentId);
    const normalizedEmail = safeText(titularEmail).toLowerCase();
    if (!normalizedGroupId || !normalizedIntentId || !normalizedEmail) return null;
    if (!isCurrentPaymentGroup(normalizedGroupId)) return null;
    if (isPixelPayHostedPayment(paymentIntentRef.current)) return null;
    if (pixelPaySaleRef.current?.promise) return pixelPaySaleRef.current.promise;

    const controller = new AbortController();
    const promise = (async () => {
      const response = await salePublicPixelPay({
        id_grupo_cita: normalizedGroupId,
        id_intent: normalizedIntentId,
        titular_email: normalizedEmail,
        card_number: safeText(card?.number),
        card_holder: safeText(card?.holder),
        card_expire: safeText(card?.expire),
        card_cvv: safeText(card?.cvv),
        billing_address: safeText(billing?.address),
        billing_country: safeText(billing?.country),
        billing_state: safeText(billing?.state),
        billing_city: safeText(billing?.city),
        billing_phone: safeText(billing?.phone),
      }, { authenticated, signal: controller.signal });
      if (mountedRef.current && isCurrentPaymentGroup(normalizedGroupId)) {
        setPaymentResultState(response);
      }
      return response;
    })();
    pixelPaySaleRef.current = { controller, promise };
    try {
      return await promise;
    } finally {
      if (pixelPaySaleRef.current?.promise === promise) pixelPaySaleRef.current = null;
    }
  }, [authenticated, isCurrentPaymentGroup]);

  const startPixelPayHostedOnce = useCallback(async ({ groupId, intentId, titularEmail }) => {
    const normalizedGroupId = safeText(groupId);
    const normalizedIntentId = safeText(intentId);
    const normalizedEmail = safeText(titularEmail).toLowerCase();
    if (!normalizedGroupId || !normalizedIntentId || !normalizedEmail) return null;
    if (!isCurrentPaymentGroup(normalizedGroupId)) return null;
    const requestKey = `${normalizedGroupId}|${normalizedIntentId}`;
    if (pixelPayHostedStartRef.current?.key === requestKey) return pixelPayHostedStartRef.current.promise;
    if (safeText(paymentIntentRef.current?.id_intent) !== normalizedIntentId
      || paymentIntentRef.current?.hosted_available !== true
      || isPixelPayHostedPayment(paymentIntentRef.current)) return null;

    const controller = new AbortController();
    const requestSeq = paymentStateSeqRef.current;
    const pendingIntent = {
      ...paymentIntentRef.current,
      payment_channel: 'hosted',
      hosted_state: 'creating',
      estado_intent_codigo: 'pendiente_confirmacion',
      pending_confirmation: true,
      manual_reconciliation_required: true,
      booking_confirmed: false,
    };
    // AM: Persistir antes de salir evita reenviar una creación cuyo resultado se perdió.
    paymentIntentRef.current = pendingIntent;
    setPaymentIntentState(pendingIntent);
    setPaymentResultState(pendingIntent);
    writeStoredPaymentContext(buildPaymentContextPayload({
      groupId: normalizedGroupId,
      intentId: normalizedIntentId,
      titularEmail: normalizedEmail,
      paymentIntent: pendingIntent,
    }));

    const promise = (async () => {
      try {
        const response = await startPixelPayHostedPayment(buildPaymentStatusParams({
          groupId: normalizedGroupId,
          intentId: normalizedIntentId,
          titularEmail: normalizedEmail,
        }), { authenticated, signal: controller.signal });
        if (!mountedRef.current || paymentStateSeqRef.current !== requestSeq
          || !isCurrentPaymentGroup(normalizedGroupId)) return null;
        const checkoutUrl = response?.checkout_url
          ? validatePixelPayHostedCheckoutUrl(response.checkout_url)
          : null;
        if (!isPixelPayHostedPayment(response)
          || safeText(response?.id_intent) !== normalizedIntentId
          || (response?.id_grupo_cita && safeText(response.id_grupo_cita) !== normalizedGroupId)
          || (response?.checkout_url && !checkoutUrl)) {
          throw new Error('No se pudo abrir el portal de pago. Verifica el estado antes de continuar.');
        }
        const safeResult = {
          ...response,
          id_grupo_cita: normalizedGroupId,
          checkout_url: checkoutUrl,
          estado_intent_codigo: 'pendiente_confirmacion',
          booking_confirmed: false,
          pending_confirmation: true,
        };
        const savedIntent = {
          ...pendingIntent,
          hosted_state: response.hosted_state || 'checkout_ready',
          expires_at: response.expires_at || pendingIntent.expires_at,
        };
        paymentIntentRef.current = savedIntent;
        setPaymentIntentState(savedIntent);
        setPaymentResultState(safeResult);
        writeStoredPaymentContext(buildPaymentContextPayload({
          groupId: normalizedGroupId,
          intentId: normalizedIntentId,
          titularEmail: normalizedEmail,
          paymentIntent: savedIntent,
        }));
        return safeResult;
      } catch (error) {
        if (mountedRef.current && paymentStateSeqRef.current === requestSeq
          && isCurrentPaymentGroup(normalizedGroupId)) {
          const rejected = isHostedStartRejectedBeforeClaim(error);
          const uncertainIntent = {
            ...pendingIntent,
            hosted_state: rejected ? 'start_rejected' : 'creation_uncertain',
            hosted_start_rejected: rejected,
          };
          paymentIntentRef.current = uncertainIntent;
          setPaymentIntentState(uncertainIntent);
          setPaymentResultState(uncertainIntent);
          writeStoredPaymentContext(buildPaymentContextPayload({
            groupId: normalizedGroupId,
            intentId: normalizedIntentId,
            titularEmail: normalizedEmail,
            paymentIntent: uncertainIntent,
          }));
        }
        throw error;
      }
    })();
    pixelPayHostedStartRef.current = { key: requestKey, controller, promise };
    try {
      return await promise;
    } finally {
      if (pixelPayHostedStartRef.current?.promise === promise) pixelPayHostedStartRef.current = null;
    }
  }, [authenticated, isCurrentPaymentGroup]);

  const queryPixelPayStatusOnce = useCallback(async ({ groupId, intentId, titularEmail }) => {
    const normalizedGroupId = safeText(groupId);
    const normalizedIntentId = safeText(intentId);
    const normalizedEmail = safeText(titularEmail).toLowerCase();
    if (!normalizedGroupId || !normalizedIntentId || !normalizedEmail) return null;
    if (!isCurrentPaymentGroup(normalizedGroupId)) return null;
    if (isPixelPayHostedPayment(paymentIntentRef.current)) {
      return fetchPaymentStatusOnce({ groupId, intentId, titularEmail });
    }
    const requestKey = `${normalizedGroupId}|${normalizedIntentId}|${normalizedEmail}`;
    if (pixelPayStatusRef.current?.key === requestKey) return pixelPayStatusRef.current.promise;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const clientRequestId = createClientRequestId();
    const promise = (async () => {
      setCheckingPaymentStatus(true);
      const response = await queryPublicPixelPayStatus({
        id_grupo_cita: normalizedGroupId,
        id_intent: normalizedIntentId,
        titular_email: normalizedEmail,
      }, {
        authenticated,
        signal: controller?.signal,
        headers: { 'X-Request-Id': clientRequestId },
      });
      if (mountedRef.current && isCurrentPaymentGroup(normalizedGroupId)) {
        setPaymentResultState(response);
      }
      return response;
    })();
    pixelPayStatusRef.current = { key: requestKey, controller, promise };
    try {
      return await promise;
    } finally {
      if (pixelPayStatusRef.current?.promise === promise) pixelPayStatusRef.current = null;
      if (mountedRef.current) setCheckingPaymentStatus(false);
    }
  }, [authenticated, fetchPaymentStatusOnce, isCurrentPaymentGroup]);

  return {
    paymentIntent: paymentIntentState,
    paymentResult: paymentResultState,
    bookingSuccessResult: bookingSuccessResultState,
    creatingPaymentIntent,
    checkingPaymentStatus,
    setPaymentIntent,
    setPaymentResult,
    setBookingSuccessResult,
    clearPaymentState,
    restorePaymentContext,
    createPaymentIntentOnce,
    fetchPaymentStatusOnce,
    completeMockPaymentOnce,
    completeSimulatorPaymentOnce,
    salePixelPayOnce,
    startPixelPayHostedOnce,
    queryPixelPayStatusOnce,
    isCurrentPaymentGroup,
  };
}
