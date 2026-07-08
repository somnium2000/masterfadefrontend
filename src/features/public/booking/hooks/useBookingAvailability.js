import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listPublicAgendaDisponibilidad,
  listPublicAgendaHorarios,
} from '../publicBookingApi.js';
import {
  buildCuratedSlots,
  buildDefaultSlots,
  buildDynamicSlots,
  createEmptyCuratedSlots,
  hasRealDayAvailability,
} from '../utils/bookingDates.js';
import { extractMessage } from '../bookingUtils.js';

const AVAILABILITY_DEBOUNCE_MS = 180;
const AVAILABILITY_CACHE_TTL_MS = 30 * 1000;

function getFreshCacheValue(cache, key) {
  const cached = cache.current.get(key);
  if (!cached) return null;
  if ((Date.now() - cached.createdAt) > AVAILABILITY_CACHE_TTL_MS) {
    cache.current.delete(key);
    return null;
  }
  return cached.value;
}

function setFreshCacheValue(cache, key, value) {
  cache.current.set(key, {
    createdAt: Date.now(),
    value,
  });
}

export default function useBookingAvailability({
  selectedBranchId,
  activeBlockBarberId,
  effectiveSelectionType,
  effectiveSelectedServiceIdsForAgenda,
  selectedPackageId,
  selectedDate,
  selectedTime,
  monthRange,
  selectionCacheKey,
  bookingBlocksFingerprint,
  minBookingDateKey,
  holdResult,
  effectiveActiveBlockIndex,
  barbers,
  updateBlockAtIndex,
  availabilityError,
  setAvailabilityError,
  notifyError,
  onSelectedSlotUnavailable,
} = {}) {
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState(() => buildDefaultSlots());
  const [slotsCurated, setSlotsCurated] = useState(() => createEmptyCuratedSlots());
  const [slotMetrics, setSlotMetrics] = useState({ duracionTotalMin: 0, bufferTotalMin: 0 });
  const [slotSuggestions, setSlotSuggestions] = useState([]);
  const [slotSuggestionsLoading, setSlotSuggestionsLoading] = useState(false);

  const availabilityAbortRef = useRef(null);
  const slotsAbortRef = useRef(null);
  const slotSuggestionsAbortRef = useRef(null);
  const availabilityRequestSeqRef = useRef(0);
  const slotsRequestSeqRef = useRef(0);
  const slotSuggestionRequestSeqRef = useRef(0);
  const availabilityCacheRef = useRef(new Map());
  const slotsCacheRef = useRef(new Map());
  const availabilityInFlightRef = useRef({ key: '', promise: null });
  const slotsInFlightRef = useRef({ key: '', promise: null });
  const slotLookupInFlightRef = useRef(new Map());
  const slotSuggestionsInFlightRef = useRef({ key: '', promise: null });
  const availabilityDebounceRef = useRef(null);
  const slotsDebounceRef = useRef(null);
  const lastAvailabilityFingerprintRef = useRef('');
  const lastSlotsFingerprintRef = useRef('');

  const safeSelectedServices = useMemo(
    () => (Array.isArray(effectiveSelectedServiceIdsForAgenda) ? effectiveSelectedServiceIdsForAgenda : []),
    [effectiveSelectedServiceIdsForAgenda]
  );
  const servicesCsv = useMemo(
    () => (safeSelectedServices.length > 0 ? safeSelectedServices.join(',') : ''),
    [safeSelectedServices]
  );
  const hasSelection = Boolean(selectedPackageId) || safeSelectedServices.length > 0;

  const resolveAffectedDateRange = useCallback((scope = {}) => {
    const from = String(scope.dateFrom || scope.fecha_desde || '').trim();
    const to = String(scope.dateTo || scope.fecha_hasta || '').trim();
    if (from && to) return { from, to };
    if (from) return { from, to: from };
    if (selectedDate) return { from: selectedDate, to: selectedDate };
    return {
      from: monthRange?.from || '',
      to: monthRange?.to || monthRange?.from || '',
    };
  }, [monthRange?.from, monthRange?.to, selectedDate]);

  const doesScopeAffectCurrentBarber = useCallback((scope = {}) => {
    const eventBranchId = String(scope.branchId || scope.id_sucursal || '').trim();
    if (!selectedBranchId || eventBranchId !== selectedBranchId) return false;
    const eventBarberId = String(scope.barberId || scope.id_barbero || '').trim();
    if (!activeBlockBarberId) return true;
    if (!eventBarberId) return true;
    return eventBarberId === activeBlockBarberId;
  }, [activeBlockBarberId, selectedBranchId]);

  const doesScopeIntersectSelectedSlot = useCallback((scope = {}) => {
    if (!selectedDate || !selectedTime || !scope.startAt || !scope.endAt) return false;
    const selectedStart = Date.parse(`${selectedDate}T${selectedTime}:00`);
    const durationMs = Math.max(1, Number(slotMetrics.duracionTotalMin || 0)) * 60 * 1000;
    if (!Number.isFinite(selectedStart)) return false;
    const selectedEnd = selectedStart + durationMs;
    const eventStart = Date.parse(scope.startAt);
    const eventEnd = Date.parse(scope.endAt);
    if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd)) return false;
    return eventStart < selectedEnd && eventEnd > selectedStart;
  }, [selectedDate, selectedTime, slotMetrics.duracionTotalMin]);

  const availabilityFingerprint = useMemo(
    () => [
      'availability',
      selectedBranchId || '',
      activeBlockBarberId || 'auto',
      selectionCacheKey || '',
      monthRange?.from || '',
      monthRange?.to || '',
      selectedDate || '',
      selectedTime || '',
      bookingBlocksFingerprint || '',
    ].join('|'),
    [
      activeBlockBarberId,
      bookingBlocksFingerprint,
      monthRange?.from,
      monthRange?.to,
      selectedBranchId,
      selectedDate,
      selectedTime,
      selectionCacheKey,
    ]
  );

  const slotsFingerprint = useMemo(
    () => [
      'slots',
      selectedBranchId || '',
      activeBlockBarberId || 'auto',
      selectionCacheKey || '',
      selectedDate || '',
      selectedTime || '',
      bookingBlocksFingerprint || '',
    ].join('|'),
    [
      activeBlockBarberId,
      bookingBlocksFingerprint,
      selectedBranchId,
      selectedDate,
      selectedTime,
      selectionCacheKey,
    ]
  );

  const abortAvailabilityRequest = useCallback(() => {
    if (availabilityAbortRef.current) {
      availabilityAbortRef.current.abort();
      availabilityAbortRef.current = null;
    }
    availabilityInFlightRef.current = { key: '', promise: null };
  }, []);

  const abortSlotsRequest = useCallback(() => {
    if (slotsAbortRef.current) {
      slotsAbortRef.current.abort();
      slotsAbortRef.current = null;
    }
    slotsInFlightRef.current = { key: '', promise: null };
  }, []);

  const abortSlotSuggestionsRequest = useCallback(() => {
    if (slotSuggestionsAbortRef.current) {
      slotSuggestionsAbortRef.current.abort();
      slotSuggestionsAbortRef.current = null;
    }
    slotSuggestionsInFlightRef.current = { key: '', promise: null };
  }, []);

  const abortAvailabilityRequests = useCallback(() => {
    abortAvailabilityRequest();
    abortSlotsRequest();
    abortSlotSuggestionsRequest();
  }, [abortAvailabilityRequest, abortSlotSuggestionsRequest, abortSlotsRequest]);

  const clearSlotSuggestions = useCallback(() => {
    abortSlotSuggestionsRequest();
    setSlotSuggestions([]);
    setSlotSuggestionsLoading(false);
  }, [abortSlotSuggestionsRequest]);

  const resetAvailabilityViewState = useCallback((options = {}) => {
    const { clearError = true } = options;
    setSlots(buildDefaultSlots());
    setSlotsCurated(createEmptyCuratedSlots());
    setSlotMetrics({ duracionTotalMin: 0, bufferTotalMin: 0 });
    if (clearError && typeof setAvailabilityError === 'function') {
      setAvailabilityError('');
    }
    clearSlotSuggestions();
  }, [clearSlotSuggestions, setAvailabilityError]);

  const invalidateAgendaCaches = useCallback(() => {
    availabilityCacheRef.current.clear();
    slotsCacheRef.current.clear();
  }, []);

  const resetAvailabilityData = useCallback((options = {}) => {
    abortAvailabilityRequests();
    invalidateAgendaCaches();
    setAvailabilityMap({});
    setAvailabilityLoading(false);
    setSlotsLoading(false);
    resetAvailabilityViewState(options);
  }, [abortAvailabilityRequests, invalidateAgendaCaches, resetAvailabilityViewState]);

  const fetchAvailability = useCallback(async () => {
    if (!selectedBranchId || !hasSelection) {
      abortAvailabilityRequest();
      availabilityRequestSeqRef.current += 1;
      setAvailabilityMap({});
      setAvailabilityLoading(false);
      return null;
    }

    const cacheKey = [
      selectedBranchId,
      activeBlockBarberId || 'auto',
      selectionCacheKey,
      monthRange?.from || '',
      monthRange?.to || '',
      bookingBlocksFingerprint || '',
    ].join('|');
    const cached = getFreshCacheValue(availabilityCacheRef, cacheKey);
    if (cached) {
      abortAvailabilityRequest();
      setAvailabilityMap(cached);
      if (typeof setAvailabilityError === 'function') {
        setAvailabilityError('');
      }

      const shouldValidateSelectedDate = selectedDate >= monthRange?.from && selectedDate <= monthRange?.to;
      if (
        !holdResult
        && selectedDate
        && (selectedDate < minBookingDateKey || (shouldValidateSelectedDate && !hasRealDayAvailability(cached[selectedDate])))
        && typeof updateBlockAtIndex === 'function'
      ) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedDate: '',
          selectedTime: '',
          selectedDateTime: '',
        }));
      }
      return cached;
    }

    if (availabilityInFlightRef.current.key === cacheKey && availabilityInFlightRef.current.promise) {
      return availabilityInFlightRef.current.promise;
    }

    abortAvailabilityRequest();

    const controller = new AbortController();
    availabilityAbortRef.current = controller;
    const requestSeq = availabilityRequestSeqRef.current + 1;
    availabilityRequestSeqRef.current = requestSeq;

    setAvailabilityLoading(true);
    if (typeof setAvailabilityError === 'function') {
      setAvailabilityError('');
    }

    const promise = (async () => {
      try {
        const response = await listPublicAgendaDisponibilidad(
          {
            id_sucursal: selectedBranchId,
            id_barbero: activeBlockBarberId || undefined,
            selection_type: effectiveSelectionType,
            servicios: servicesCsv || undefined,
            id_paquete: selectedPackageId || undefined,
            fecha_desde: monthRange?.from,
            fecha_hasta: monthRange?.to,
          },
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return null;
        if (requestSeq !== availabilityRequestSeqRef.current) return null;

        const payload = response?.data ?? response;
        const list = Array.isArray(payload?.disponibilidad) ? payload.disponibilidad : [];
        const nextMap = list.reduce((acc, item) => {
          if (!item?.fecha) return acc;
          acc[item.fecha] = item;
          return acc;
        }, {});

        setFreshCacheValue(availabilityCacheRef, cacheKey, nextMap);
        setAvailabilityMap(nextMap);

        const shouldValidateSelectedDate = selectedDate >= monthRange?.from && selectedDate <= monthRange?.to;
        if (
          !holdResult
          && selectedDate
          && (selectedDate < minBookingDateKey || (shouldValidateSelectedDate && !hasRealDayAvailability(nextMap[selectedDate])))
          && typeof updateBlockAtIndex === 'function'
        ) {
          updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
            ...currentBlock,
            selectedDate: '',
            selectedTime: '',
            selectedDateTime: '',
          }));
        }
        return nextMap;
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) return null;
        if (requestSeq !== availabilityRequestSeqRef.current) return null;
        if (typeof setAvailabilityError === 'function') {
          setAvailabilityError(extractMessage(err));
        }
        return null;
      } finally {
        if (requestSeq === availabilityRequestSeqRef.current) {
          if (availabilityAbortRef.current === controller) {
            availabilityAbortRef.current = null;
          }
          setAvailabilityLoading(false);
        }
        if (availabilityInFlightRef.current.key === cacheKey) {
          availabilityInFlightRef.current = { key: '', promise: null };
        }
      }
    })();

    availabilityInFlightRef.current = { key: cacheKey, promise };
    return promise;
  }, [
    abortAvailabilityRequest,
    activeBlockBarberId,
    bookingBlocksFingerprint,
    effectiveActiveBlockIndex,
    effectiveSelectionType,
    hasSelection,
    holdResult,
    minBookingDateKey,
    monthRange?.from,
    monthRange?.to,
    selectedBranchId,
    selectedDate,
    selectedPackageId,
    selectionCacheKey,
    servicesCsv,
    setAvailabilityError,
    updateBlockAtIndex,
  ]);

  const fetchSlots = useCallback(async () => {
    if (!selectedBranchId || !hasSelection || !selectedDate) {
      abortSlotsRequest();
      slotsRequestSeqRef.current += 1;
      setSlots(buildDefaultSlots());
      setSlotsCurated(createEmptyCuratedSlots());
      setSlotMetrics({ duracionTotalMin: 0, bufferTotalMin: 0 });
      setSlotsLoading(false);
      return null;
    }

    const cacheKey = [
      selectedBranchId,
      activeBlockBarberId || 'auto',
      selectionCacheKey,
      selectedDate,
      bookingBlocksFingerprint || '',
    ].join('|');
    const cached = getFreshCacheValue(slotsCacheRef, cacheKey);
    if (cached) {
      abortSlotsRequest();
      setSlots(cached.slots);
      setSlotsCurated(cached.curated || createEmptyCuratedSlots());
      setSlotMetrics(cached.metrics);
      return cached.slots;
    }

    if (slotsInFlightRef.current.key === cacheKey && slotsInFlightRef.current.promise) {
      return slotsInFlightRef.current.promise;
    }

    abortSlotsRequest();

    const controller = new AbortController();
    slotsAbortRef.current = controller;
    const requestSeq = slotsRequestSeqRef.current + 1;
    slotsRequestSeqRef.current = requestSeq;
    setSlotsLoading(true);

    const promise = (async () => {
      try {
        const response = await listPublicAgendaHorarios(
          {
            id_sucursal: selectedBranchId,
            id_barbero: activeBlockBarberId || undefined,
            selection_type: effectiveSelectionType,
            servicios: servicesCsv || undefined,
            id_paquete: selectedPackageId || undefined,
            fecha: selectedDate,
          },
          { signal: controller.signal }
        );

        if (controller.signal.aborted) return null;
        if (requestSeq !== slotsRequestSeqRef.current) return null;

        const payload = response?.data ?? response;
        const mapped = buildDynamicSlots({
          horarios: payload?.horarios,
          duracionTotalMin: payload?.duracion_total_min,
        });
        const curated = buildCuratedSlots({
          horariosCurados: payload?.horarios_curados,
          horarios: payload?.horarios,
          duracionTotalMin: payload?.duracion_total_min,
        });
        const metrics = {
          duracionTotalMin: Number(payload?.duracion_total_min || 0),
          bufferTotalMin: Number(payload?.buffer_total_min || 0),
        };

        setFreshCacheValue(slotsCacheRef, cacheKey, { slots: mapped, curated, metrics });
        setSlots(mapped);
        setSlotsCurated(curated);
        setSlotMetrics(metrics);

        if (
          selectedTime
          && !mapped.some((slot) => slot.hora === selectedTime && slot.disponible)
          && typeof updateBlockAtIndex === 'function'
        ) {
          updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
            ...currentBlock,
            selectedTime: '',
            selectedDateTime: '',
          }));
        }
        return mapped;
      } catch (err) {
        if (err?.name === 'AbortError' || controller.signal.aborted) return null;
        if (requestSeq !== slotsRequestSeqRef.current) return null;
        const message = extractMessage(err);
        if (typeof setAvailabilityError === 'function') {
          setAvailabilityError(message);
        }
        if (typeof notifyError === 'function') {
          notifyError(message, { dedupeKey: 'public-booking-slots-error' });
        }
        return null;
      } finally {
        if (requestSeq === slotsRequestSeqRef.current) {
          if (slotsAbortRef.current === controller) {
            slotsAbortRef.current = null;
          }
          setSlotsLoading(false);
        }
        if (slotsInFlightRef.current.key === cacheKey) {
          slotsInFlightRef.current = { key: '', promise: null };
        }
      }
    })();

    slotsInFlightRef.current = { key: cacheKey, promise };
    return promise;
  }, [
    abortSlotsRequest,
    activeBlockBarberId,
    bookingBlocksFingerprint,
    effectiveActiveBlockIndex,
    effectiveSelectionType,
    hasSelection,
    notifyError,
    selectedBranchId,
    selectedDate,
    selectedPackageId,
    selectedTime,
    selectionCacheKey,
    setAvailabilityError,
    servicesCsv,
    updateBlockAtIndex,
  ]);

  const fetchAvailabilityRange = useCallback(async ({ dateFrom, dateTo, signal } = {}) => {
    if (!selectedBranchId || !hasSelection || !dateFrom) return null;
    const requestSeq = availabilityRequestSeqRef.current + 1;
    availabilityRequestSeqRef.current = requestSeq;
    const response = await listPublicAgendaDisponibilidad(
      {
        id_sucursal: selectedBranchId,
        id_barbero: activeBlockBarberId || undefined,
        selection_type: effectiveSelectionType,
        servicios: servicesCsv || undefined,
        id_paquete: selectedPackageId || undefined,
        fecha_desde: dateFrom,
        fecha_hasta: dateTo || dateFrom,
      },
      { signal }
    );
    if (signal?.aborted || requestSeq !== availabilityRequestSeqRef.current) return null;
    const payload = response?.data ?? response;
    const list = Array.isArray(payload?.disponibilidad) ? payload.disponibilidad : [];
    const partialMap = list.reduce((acc, item) => {
      if (!item?.fecha) return acc;
      acc[item.fecha] = item;
      return acc;
    }, {});
    availabilityCacheRef.current.clear();
    setAvailabilityMap((current) => ({ ...current, ...partialMap }));
    return partialMap;
  }, [
    activeBlockBarberId,
    effectiveSelectionType,
    hasSelection,
    selectedBranchId,
    selectedPackageId,
    servicesCsv,
  ]);

  const invalidateAvailabilityScope = useCallback(async (scope = {}) => {
    if (!doesScopeAffectCurrentBarber(scope)) return { ignored: true };
    const { from, to } = resolveAffectedDateRange(scope);
    const controller = new AbortController();
    availabilityAbortRef.current?.abort();
    availabilityAbortRef.current = controller;
    let availabilityResult = null;
    try {
      availabilityResult = await fetchAvailabilityRange({
        dateFrom: from,
        dateTo: to,
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name !== 'AbortError' && typeof setAvailabilityError === 'function') {
        setAvailabilityError(extractMessage(err));
      }
    } finally {
      if (availabilityAbortRef.current === controller) {
        availabilityAbortRef.current = null;
      }
    }

    const shouldRefreshSelectedDate = Boolean(selectedDate && from && to && selectedDate >= from && selectedDate <= to);
    let slotsResult = null;
    if (shouldRefreshSelectedDate) {
      slotsCacheRef.current.clear();
      slotsResult = await fetchSlots();
      if (
        doesScopeIntersectSelectedSlot(scope)
        && selectedTime
        && Array.isArray(slotsResult)
        && !slotsResult.some((slot) => slot?.hora === selectedTime && slot?.disponible)
      ) {
        onSelectedSlotUnavailable?.();
      }
    }
    return { ignored: false, availability: availabilityResult, slots: slotsResult };
  }, [
    doesScopeAffectCurrentBarber,
    doesScopeIntersectSelectedSlot,
    fetchAvailabilityRange,
    fetchSlots,
    onSelectedSlotUnavailable,
    resolveAffectedDateRange,
    selectedDate,
    selectedTime,
    setAvailabilityError,
  ]);

  const resyncAvailabilityScope = useCallback(async () => {
    invalidateAgendaCaches();
    const availabilityResult = await fetchAvailability();
    const slotsResult = selectedDate ? await fetchSlots() : null;
    return { availability: availabilityResult, slots: slotsResult };
  }, [fetchAvailability, fetchSlots, invalidateAgendaCaches, selectedDate]);

  const fetchSlotsForBarber = useCallback(async ({
    barberId,
    dateKey,
    selectionTypeValue,
    servicesCsvValue,
    packageIdValue,
    signal,
  }) => {
    const hasBarberSelection = Boolean(packageIdValue) || Boolean(servicesCsvValue);
    if (!selectedBranchId || !barberId || !dateKey || !hasBarberSelection || signal?.aborted) {
      return buildDefaultSlots();
    }

    const selectionKey = `type:${selectionTypeValue}|package:${packageIdValue || ''}|services:${servicesCsvValue || ''}`;
    const cacheKey = [selectedBranchId, barberId, selectionKey, dateKey].join('|');
    const cached = getFreshCacheValue(slotsCacheRef, cacheKey);
    if (cached) return cached.slots;
    if (slotLookupInFlightRef.current.has(cacheKey)) {
      return slotLookupInFlightRef.current.get(cacheKey);
    }

    const promise = (async () => {
      const response = await listPublicAgendaHorarios(
        {
          id_sucursal: selectedBranchId,
          id_barbero: barberId,
          selection_type: selectionTypeValue,
          servicios: servicesCsvValue || undefined,
          id_paquete: packageIdValue || undefined,
          fecha: dateKey,
        },
        { signal }
      );

      const payload = response?.data ?? response;
      const mapped = buildDynamicSlots({
        horarios: payload?.horarios,
        duracionTotalMin: payload?.duracion_total_min,
      });
      setFreshCacheValue(slotsCacheRef, cacheKey, {
        slots: mapped,
        metrics: {
          duracionTotalMin: Number(payload?.duracion_total_min || 0),
          bufferTotalMin: Number(payload?.buffer_total_min || 0),
        },
      });
      return mapped;
    })().finally(() => {
      slotLookupInFlightRef.current.delete(cacheKey);
    });

    slotLookupInFlightRef.current.set(cacheKey, promise);
    return promise;
  }, [selectedBranchId]);

  const loadSlotSuggestions = useCallback(async ({
    barberId,
    dateKey,
    timeKey,
    selectionTypeValue,
    servicesCsvValue,
    packageIdValue,
  }) => {
    const hasSuggestionSelection = Boolean(packageIdValue) || Boolean(servicesCsvValue);
    if (!barberId || !dateKey || !timeKey || !hasSuggestionSelection) {
      clearSlotSuggestions();
      return null;
    }

    const barberCandidates = (Array.isArray(barbers) ? barbers : [])
      .filter((barber) => barber?.id_empleado && barber.id_empleado !== barberId);
    if (!barberCandidates.length) {
      clearSlotSuggestions();
      return null;
    }

    const suggestionKey = [
      barberId,
      dateKey,
      timeKey,
      selectionTypeValue || '',
      servicesCsvValue || '',
      packageIdValue || '',
      barberCandidates.map((barber) => barber.id_empleado).join(','),
    ].join('|');
    if (slotSuggestionsInFlightRef.current.key === suggestionKey && slotSuggestionsInFlightRef.current.promise) {
      return slotSuggestionsInFlightRef.current.promise;
    }

    const requestSeq = slotSuggestionRequestSeqRef.current + 1;
    slotSuggestionRequestSeqRef.current = requestSeq;
    abortSlotSuggestionsRequest();
    const controller = new AbortController();
    slotSuggestionsAbortRef.current = controller;
    setSlotSuggestionsLoading(true);
    setSlotSuggestions([]);

    const promise = (async () => {
      try {
        const results = await Promise.all(
          barberCandidates.map(async (barber) => {
            try {
              const barberSlots = await fetchSlotsForBarber({
                barberId: barber.id_empleado,
                dateKey,
                selectionTypeValue,
                servicesCsvValue,
                packageIdValue,
                signal: controller.signal,
              });
              const isAvailable = barberSlots.some((slot) => slot.hora === timeKey && slot.disponible);
              if (!isAvailable) return null;
              return {
                idBarbero: barber.id_empleado,
                nombreBarbero: barber.nombre_completo || 'Barbero',
              };
            } catch {
              return null;
            }
          })
        );

        if (requestSeq !== slotSuggestionRequestSeqRef.current) return null;
        if (controller.signal.aborted) return null;
        const nextSuggestions = results.filter(Boolean);
        setSlotSuggestions(nextSuggestions);
        return nextSuggestions;
      } finally {
        if (requestSeq === slotSuggestionRequestSeqRef.current) {
          if (slotSuggestionsAbortRef.current === controller) {
            slotSuggestionsAbortRef.current = null;
          }
          setSlotSuggestionsLoading(false);
        }
        if (slotSuggestionsInFlightRef.current.key === suggestionKey) {
          slotSuggestionsInFlightRef.current = { key: '', promise: null };
        }
      }
    })();

    slotSuggestionsInFlightRef.current = { key: suggestionKey, promise };
    return promise;
  }, [
    abortSlotSuggestionsRequest,
    barbers,
    clearSlotSuggestions,
    fetchSlotsForBarber,
  ]);

  useEffect(() => {
    if (lastAvailabilityFingerprintRef.current && lastAvailabilityFingerprintRef.current !== availabilityFingerprint) {
      abortAvailabilityRequest();
    }
    lastAvailabilityFingerprintRef.current = availabilityFingerprint;
  }, [abortAvailabilityRequest, availabilityFingerprint]);

  useEffect(() => {
    if (lastSlotsFingerprintRef.current && lastSlotsFingerprintRef.current !== slotsFingerprint) {
      abortSlotsRequest();
    }
    lastSlotsFingerprintRef.current = slotsFingerprint;
  }, [abortSlotsRequest, slotsFingerprint]);

  useEffect(() => {
    if (availabilityDebounceRef.current) {
      clearTimeout(availabilityDebounceRef.current);
    }
    availabilityDebounceRef.current = setTimeout(() => {
      void fetchAvailability();
    }, AVAILABILITY_DEBOUNCE_MS);
    return () => {
      if (availabilityDebounceRef.current) {
        clearTimeout(availabilityDebounceRef.current);
      }
    };
  }, [availabilityFingerprint, fetchAvailability]);

  useEffect(() => {
    if (slotsDebounceRef.current) {
      clearTimeout(slotsDebounceRef.current);
    }
    slotsDebounceRef.current = setTimeout(() => {
      void fetchSlots();
    }, AVAILABILITY_DEBOUNCE_MS);
    return () => {
      if (slotsDebounceRef.current) {
        clearTimeout(slotsDebounceRef.current);
      }
    };
  }, [fetchSlots, slotsFingerprint]);

  useEffect(() => () => {
    if (availabilityDebounceRef.current) clearTimeout(availabilityDebounceRef.current);
    if (slotsDebounceRef.current) clearTimeout(slotsDebounceRef.current);
    abortAvailabilityRequests();
  }, [abortAvailabilityRequests]);

  return {
    availabilityError,
    availabilityLoading,
    availabilityMap,
    slotsLoading,
    slots,
    slotsCurated,
    slotMetrics,
    slotSuggestions,
    slotSuggestionsLoading,
    fetchAvailability,
    fetchSlots,
    fetchSlotsForBarber,
    invalidateAvailabilityScope,
    loadSlotSuggestions,
    resyncAvailabilityScope,
    invalidateAgendaCaches,
    resetAvailabilityViewState,
    resetAvailabilityData,
    abortAvailabilityRequests,
    clearSlotSuggestions,
    availabilityFingerprint,
    slotsFingerprint,
  };
}
