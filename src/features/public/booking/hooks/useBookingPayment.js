import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completePublicMockPayment,
  completePublicSimulatorPayment,
  createPublicPaymentIntent,
  getPublicPaymentStatus,
} from '../publicBookingApi.js';
import {
  buildMockPaymentPayload,
  buildPaymentContextPayload,
  buildPaymentStatusParams,
  buildSimulatorPaymentPayload,
} from '../bookingPayloadBuilders.js';

const PAYMENT_CONTEXT_STORAGE_KEY = 'masterfade.publicBookingPayment.v1';
const TODO_PAGO_SIMULATION_SCENARIO_STORAGE_KEY = 'masterfade.todopagoSimulation.amountHnl';

function safeText(value) {
  const normalized = String(value || '').trim();
  return normalized || '';
}

function readStoredPaymentContext(groupId = '') {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(PAYMENT_CONTEXT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const storedGroupId = safeText(parsed.id_grupo_cita);
    if (groupId && storedGroupId && storedGroupId !== groupId) return null;
    return {
      id_grupo_cita: storedGroupId,
      id_intent: safeText(parsed.id_intent),
      titular_email: safeText(parsed.titular_email).toLowerCase(),
      paymentIntent: parsed.paymentIntent && typeof parsed.paymentIntent === 'object'
        ? parsed.paymentIntent
        : null,
    };
  } catch {
    return null;
  }
}

function writeStoredPaymentContext(context) {
  if (typeof window === 'undefined') return;
  try {
    if (!context) {
      window.sessionStorage.removeItem(PAYMENT_CONTEXT_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(PAYMENT_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // no-op
  }
}

function isAbortError(error) {
  return error?.name === 'AbortError'
    || String(error?.message || '').toLowerCase().includes('aborted');
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

export default function useBookingPayment({ currentGroupId = '' } = {}) {
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (statusRequestRef.current?.controller) {
        statusRequestRef.current.controller.abort('booking_payment_unmounted');
      }
    };
  }, []);

  useEffect(() => {
    currentGroupIdRef.current = safeText(currentGroupId) || safeText(paymentIntentRef.current?.id_grupo_cita);
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

  const restorePaymentContext = useCallback((groupId = '') => {
    const stored = readStoredPaymentContext(groupId);
    if (!stored?.id_intent || !stored?.id_grupo_cita) return null;
    if (!isCurrentPaymentGroup(stored.id_grupo_cita)) return null;
    const restoredIntent = stored.paymentIntent || {
      id_intent: stored.id_intent,
      id_grupo_cita: stored.id_grupo_cita,
    };
    paymentIntentRef.current = restoredIntent;
    setPaymentIntentState(restoredIntent);
    return stored;
  }, [isCurrentPaymentGroup]);

  const createPaymentIntentOnce = useCallback(async ({ groupId, titularEmail, payload, forceNew = false }) => {
    const normalizedGroupId = safeText(groupId);
    const normalizedEmail = safeText(titularEmail).toLowerCase();
    if (!normalizedGroupId) return null;

    const currentIntentGroupId = safeText(paymentIntentRef.current?.id_grupo_cita);
    const currentIntentId = safeText(paymentIntentRef.current?.id_intent);
    if (!forceNew && currentIntentId && currentIntentGroupId === normalizedGroupId) {
      return paymentIntentRef.current;
    }

    if (!forceNew) {
      const restored = restorePaymentContext(normalizedGroupId);
      if (restored?.id_intent) return restored.paymentIntent || paymentIntentRef.current;
    }

    if (createIntentRef.current?.groupId === normalizedGroupId) {
      return createIntentRef.current.promise;
    }

    const promise = (async () => {
      const requestSeq = paymentStateSeqRef.current;
      setCreatingPaymentIntent(true);
      const response = await createPublicPaymentIntent(payload);
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
      setPaymentResultState(null);
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
  }, [isCurrentPaymentGroup, restorePaymentContext]);

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
      setCheckingPaymentStatus(true);
      let lastPayload = null;
      const maxAttempts = Math.max(1, Math.min(4, Number(retries || 0) + 1));
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const response = await getPublicPaymentStatus(buildPaymentStatusParams({
          groupId: normalizedGroupId,
          intentId: normalizedIntentId,
          titularEmail: normalizedEmail,
        }), {
          signal: controller?.signal,
        });
        const payload = response?.data ?? response;
        lastPayload = payload;

        if (!mountedRef.current || !isCurrentPaymentGroup(normalizedGroupId)) return null;
        setPaymentResultState(payload);

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
  }, [isCurrentPaymentGroup]);

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
    }));
    return true;
  }, [isCurrentPaymentGroup]);

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
    }));
    const payload = response?.data ?? response;
    const normalizedStatus = safeText(payload?.normalized_status).toUpperCase();
    if (normalizedStatus && normalizedStatus !== 'PAID') {
      throw new Error(safeText(payload?.message) || 'El pago no fue aprobado por el simulador.');
    }
    return payload || true;
  }, [isCurrentPaymentGroup]);

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
    isCurrentPaymentGroup,
  };
}
