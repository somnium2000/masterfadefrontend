import { useCallback, useEffect, useRef, useState } from 'react';
import guestBookingAdapter from '../../../booking/adapters/guestBookingAdapter.js';
import {
  buildBookingHoldFingerprint,
  resolveBookingHoldIdempotencyKey,
  syncBookingHoldIdempotencyKey,
} from '../bookingIdempotency.js';

function isFinalHoldState(hold) {
  const finalStates = new Set([
    'confirmado',
    'confirmada',
    'pagado',
    'paid',
    'capturado',
    'capturada',
    'consumido',
    'completado',
    'completada',
  ]);
  const states = [
    hold?.estado_grupo_codigo,
    hold?.estado_pago_codigo,
    hold?.estado_intent_codigo,
    hold?.estado_hold_codigo,
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
  return hold?.booking_confirmed === true
    || hold?.confirmado === true
    || states.some((state) => finalStates.has(state));
}

export default function useBookingHold({
  mode,
  isAuthenticatedBooking,
  bookingAdapter,
  selectionFingerprint,
} = {}) {
  const [hold, setHold] = useState(null);
  const [creatingHold, setCreatingHold] = useState(false);
  const [releasingHold, setReleasingHold] = useState(false);
  const [holdError, setHoldError] = useState(null);

  const creatingPromiseRef = useRef(null);
  const holdFingerprintRef = useRef('');
  const latestSelectionFingerprintRef = useRef('');
  const latestModeRef = useRef('');
  const latestAdapterRef = useRef(bookingAdapter || guestBookingAdapter);
  const mountedRef = useRef(true);
  const obsoleteRef = useRef(false);
  const requestSeqRef = useRef(0);

  latestSelectionFingerprintRef.current = String(selectionFingerprint || '').trim();
  latestModeRef.current = String(mode || '').trim();
  latestAdapterRef.current = bookingAdapter || guestBookingAdapter;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSeqRef.current += 1;
      creatingPromiseRef.current = null;
    };
  }, []);

  const isCreateResponseCurrent = useCallback((requestSeq, fingerprint) => (
    mountedRef.current
    && requestSeqRef.current === requestSeq
    && latestSelectionFingerprintRef.current === fingerprint
    && latestModeRef.current !== 'loading'
    && !obsoleteRef.current
  ), []);

  const releaseRemoteHold = useCallback(async (targetHold, authenticatedForHold, adapterOverride = null) => {
    const groupId = String(targetHold?.id_grupo_cita || '').trim();
    if (!groupId || isFinalHoldState(targetHold)) {
      return null;
    }

    const adapter = adapterOverride || latestAdapterRef.current || guestBookingAdapter;
    const response = authenticatedForHold
      ? await adapter.releaseHold(groupId)
      : await adapter.releaseHold(groupId, targetHold?.release_token);
    return response?.data ?? response;
  }, []);

  const releaseStaleHoldBestEffort = useCallback(async (targetHold, authenticatedForHold, adapterOverride = null) => {
    try {
      await releaseRemoteHold(targetHold, authenticatedForHold, adapterOverride);
    } catch {
      // Best-effort cleanup: a stale response must not block the current flow.
    }
  }, [releaseRemoteHold]);

  const clearHoldLocalState = useCallback(() => {
    requestSeqRef.current += 1;
    holdFingerprintRef.current = '';
    obsoleteRef.current = false;
    creatingPromiseRef.current = null;
    if (mountedRef.current) {
      setHold(null);
      setHoldError(null);
      setCreatingHold(false);
    }
  }, []);

  const markHoldObsolete = useCallback(() => {
    requestSeqRef.current += 1;
    obsoleteRef.current = true;
    holdFingerprintRef.current = '';
    creatingPromiseRef.current = null;
    if (mountedRef.current) {
      setHold(null);
      setCreatingHold(false);
    }
  }, []);

  const createHold = useCallback((payload) => {
    if (mode === 'loading') {
      const error = new Error('BOOKING_MODE_LOADING');
      if (mountedRef.current) setHoldError(error);
      return Promise.reject(error);
    }

    const currentFingerprint = latestSelectionFingerprintRef.current;
    const pendingCreate = creatingPromiseRef.current;
    if (pendingCreate?.fingerprint === currentFingerprint) {
      return pendingCreate.promise;
    }

    const existingGroupId = String(hold?.id_grupo_cita || '').trim();
    const isSameSelection = existingGroupId
      && !obsoleteRef.current
      && (!currentFingerprint || holdFingerprintRef.current === currentFingerprint);
    if (isSameSelection) {
      return Promise.resolve(hold);
    }

    if (existingGroupId) {
      setHold(null);
      holdFingerprintRef.current = '';
    }

    obsoleteRef.current = false;
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    const requestFingerprint = currentFingerprint;
    const requestIsAuthenticated = Boolean(isAuthenticatedBooking);
    const idempotencyFingerprint = buildBookingHoldFingerprint({
      mode,
      isAuthenticatedBooking: requestIsAuthenticated,
      selectionFingerprint: requestFingerprint,
      payload,
    });
    const idempotencyKey = resolveBookingHoldIdempotencyKey(idempotencyFingerprint);
    const requestAdapter = latestAdapterRef.current || guestBookingAdapter;
    const requestOptions = {
      headers: {
        'x-idempotency-key': idempotencyKey,
      },
    };

    if (mountedRef.current) {
      setCreatingHold(true);
      setHoldError(null);
    }
    const createPromise = (async () => {
      try {
        const response = await requestAdapter.createHold(payload, requestOptions);
        const nextHold = response?.data ?? response;
        const responseKey = String(
          nextHold?.__meta?.headers?.get?.('x-idempotency-key')
          || nextHold?.request_id
          || idempotencyKey
        ).trim();
        const syncedKey = syncBookingHoldIdempotencyKey(idempotencyFingerprint, responseKey) || idempotencyKey;
        const normalizedHold = nextHold && typeof nextHold === 'object'
          ? { ...nextHold, request_id: nextHold.request_id || syncedKey }
          : nextHold;
        if (!isCreateResponseCurrent(requestSeq, requestFingerprint)) {
          await releaseStaleHoldBestEffort(normalizedHold, requestIsAuthenticated, requestAdapter);
          return null;
        }
        setHold(normalizedHold);
        holdFingerprintRef.current = requestFingerprint;
        obsoleteRef.current = false;
        return normalizedHold;
      } catch (err) {
        if (!isCreateResponseCurrent(requestSeq, requestFingerprint)) {
          return null;
        }
        setHoldError(err);
        throw err;
      } finally {
        if (creatingPromiseRef.current?.requestSeq === requestSeq) {
          creatingPromiseRef.current = null;
          if (mountedRef.current) {
            setCreatingHold(false);
          }
        }
      }
    })();

    creatingPromiseRef.current = {
      fingerprint: requestFingerprint,
      promise: createPromise,
      requestSeq,
    };
    return createPromise;
  }, [
    hold,
    isAuthenticatedBooking,
    isCreateResponseCurrent,
    mode,
    releaseStaleHoldBestEffort,
  ]);

  const releaseHold = useCallback(async (holdOverride = null) => {
    const targetHold = holdOverride || hold;
    const groupId = String(targetHold?.id_grupo_cita || '').trim();
    const currentGroupId = String(hold?.id_grupo_cita || '').trim();
    const shouldClearLocalState = !holdOverride || currentGroupId === groupId;
    if (!groupId) {
      if (shouldClearLocalState) {
        clearHoldLocalState();
      }
      return null;
    }
    if (isFinalHoldState(targetHold)) {
      return null;
    }

    if (mountedRef.current) {
      setReleasingHold(true);
      setHoldError(null);
    }
    try {
      const response = await releaseRemoteHold(targetHold, Boolean(isAuthenticatedBooking));
      if (shouldClearLocalState) {
        clearHoldLocalState();
      }
      return response;
    } catch (err) {
      if (mountedRef.current && shouldClearLocalState) {
        setHoldError(err);
      }
      throw err;
    } finally {
      if (mountedRef.current) {
        setReleasingHold(false);
      }
    }
  }, [clearHoldLocalState, hold, isAuthenticatedBooking, releaseRemoteHold]);

  const confirmHoldWithoutPayment = useCallback(async (groupId, payload = {}, options = {}) => {
    const adapter = latestAdapterRef.current || guestBookingAdapter;
    if (typeof adapter.confirmWithoutPayment !== 'function') {
      throw new Error('BOOKING_CONFIRM_WITHOUT_PAYMENT_UNSUPPORTED');
    }
    const response = await adapter.confirmWithoutPayment(groupId, payload, options);
    return response;
  }, []);

  return {
    hold,
    setHold,
    creatingHold,
    releasingHold,
    holdError,
    createHold,
    releaseHold,
    confirmHoldWithoutPayment,
    clearHoldLocalState,
    markHoldObsolete,
  };
}
