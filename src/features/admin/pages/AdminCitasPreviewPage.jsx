import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '../../../components/ui/button.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import PublicBookingBarberosStep from '../../public/booking/PublicBookingBarberosStep.jsx';
import PublicBookingAgendaStep from '../../public/booking/PublicBookingAgendaStep.jsx';
import PublicBookingConfirmStep from '../../public/booking/PublicBookingConfirmStep.jsx';
import {
  PublicBookingProvider,
} from '../../public/booking/PublicBookingFlow.jsx';
import {
  getPublicBookingContext,
  listPublicAgendaBarberos,
  listPublicAgendaDisponibilidad,
  listPublicAgendaHorarios,
  listPublicCatalogServicios,
} from '../../public/booking/publicBookingApi.js';
import {
  ALL_TIME_SLOTS,
  MAX_COMPANIONS,
  buildTimeSlots,
  extractMessage,
  getCurrentTimeKeyInTimeZone,
  getTodayDateKeyInTimeZone,
  toDateKey,
  toLocalDateTimeWithOffset,
  toMonthStartFromDateKey,
} from '../../public/booking/bookingUtils.js';
import './AdminCitasPage.css';
import '../../public/booking/PublicBookingFlow.css';

const EMPTY_CONTEXT = {
  sucursales: [],
  parametros: {},
};

function readBooleanParam(parametros, key, fallback) {
  const value = parametros?.[key];
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && typeof value.valor_booleano === 'boolean') {
    return value.valor_booleano;
  }
  return fallback;
}

function readNumberParam(parametros, key, fallback) {
  const value = parametros?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && Number.isFinite(Number(value.valor_numero))) {
    return Number(value.valor_numero);
  }
  return fallback;
}

function buildDefaultSlots() {
  return ALL_TIME_SLOTS.map((hora) => ({ hora, disponible: false }));
}

function normalizeHourMinute(value) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function buildDynamicSlots({ availableTimes, horaInicio, horaFin }) {
  const start = normalizeHourMinute(horaInicio);
  const end = normalizeHourMinute(horaFin);
  const rangeSlots = start && end ? buildTimeSlots(start, end) : ALL_TIME_SLOTS;
  return rangeSlots.map((hora) => ({
    hora,
    disponible: availableTimes.has(hora),
  }));
}

function createBlockId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `blk-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function areServiceIdsEqual(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function normalizeBookingBlock(block, index) {
  const fallbackAlias = index === 0 ? 'Titular' : `Acompañante ${index}`;
  const nextServiceIds = Array.isArray(block?.serviceIds)
    ? Array.from(new Set(block.serviceIds.map((id) => String(id || '').trim()).filter(Boolean)))
    : [];

  return {
    id: String(block?.id || '').trim() || createBlockId(),
    alias: String(block?.alias || '').trim() || fallbackAlias,
    idBarbero: String(block?.idBarbero || '').trim(),
    serviceIds: nextServiceIds,
    selectedDate: String(block?.selectedDate || '').trim(),
    selectedTime: String(block?.selectedTime || '').trim(),
  };
}

function areBlocksEqual(left, right) {
  if (!left || !right) return false;
  return left.id === right.id
    && left.alias === right.alias
    && left.idBarbero === right.idBarbero
    && left.selectedDate === right.selectedDate
    && left.selectedTime === right.selectedTime
    && areServiceIdsEqual(left.serviceIds, right.serviceIds);
}

function createBookingBlock({ alias = '', idBarbero = '' } = {}) {
  return normalizeBookingBlock(
    {
      id: createBlockId(),
      alias,
      idBarbero,
      serviceIds: [],
      selectedDate: '',
      selectedTime: '',
    },
    alias === 'Titular' ? 0 : 1
  );
}

const PREVIEW_STEPS = [
  { id: 'barberos', label: '1. Barberos' },
  { id: 'agenda', label: '2. Agenda' },
  { id: 'confirmar', label: '3. Confirmar' },
];

export default function AdminCitasPreviewPage() {
  const notifications = useNotifications();
  const [previewStep, setPreviewStep] = useState('barberos');

  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [contextData, setContextData] = useState(EMPTY_CONTEXT);

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [barbersLoading, setBarbersLoading] = useState(false);
  const [barbers, setBarbers] = useState([]);

  const [servicesLoading, setServicesLoading] = useState(false);
  const [services, setServices] = useState([]);

  const [bookingBlocks, setBookingBlocks] = useState(() => [createBookingBlock({ alias: 'Titular' })]);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);

  const [minBookingDateKey] = useState(() => getTodayDateKeyInTimeZone());
  const minBookingMonth = useMemo(
    () => toMonthStartFromDateKey(minBookingDateKey) || new Date(),
    [minBookingDateKey]
  );

  const [currentMonth, setCurrentMonth] = useState(() => {
    const monthStart = toMonthStartFromDateKey(getTodayDateKeyInTimeZone());
    if (monthStart) return monthStart;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState(() => buildDefaultSlots());
  const [slotConflict, setSlotConflict] = useState(null);
  const [slotSuggestions, setSlotSuggestions] = useState([]);
  const [slotSuggestionsLoading, setSlotSuggestionsLoading] = useState(false);

  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdResult, setHoldResult] = useState(null);

  const availabilityAbortRef = useRef(null);
  const slotsAbortRef = useRef(null);
  const branchDataRequestSeqRef = useRef(0);
  const availabilityRequestSeqRef = useRef(0);
  const slotsRequestSeqRef = useRef(0);
  const slotSuggestionRequestSeqRef = useRef(0);
  const availabilityCacheRef = useRef(new Map());
  const slotsCacheRef = useRef(new Map());
  const servicesScrollRef = useRef(null);
  const [servicesCanScroll, setServicesCanScroll] = useState(false);
  const [servicesAtEnd, setServicesAtEnd] = useState(true);

  const effectiveActiveBlockIndex = bookingBlocks[activeBlockIndex]
    ? activeBlockIndex
    : 0;

  const activeBlock = bookingBlocks[effectiveActiveBlockIndex] || null;
  const selectedBarberId = bookingBlocks[0]?.idBarbero || '';

  const activeBlockBarberId = activeBlock?.idBarbero || '';
  const serviceIds = useMemo(
    () => (Array.isArray(activeBlock?.serviceIds) ? activeBlock.serviceIds : []),
    [activeBlock]
  );
  const selectedDate = activeBlock?.selectedDate || '';
  const selectedTime = activeBlock?.selectedTime || '';

  const canGoPrevMonth = useMemo(() => {
    const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const minMonthStart = new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1);
    return currentMonthStart.getTime() > minMonthStart.getTime();
  }, [currentMonth, minBookingMonth]);

  const allowCompanions = useMemo(
    () => readBooleanParam(contextData?.parametros, 'permitir_acompanantes', false),
    [contextData?.parametros]
  );
  const paymentRequired = useMemo(
    () => readBooleanParam(contextData?.parametros, 'pago_total_obligatorio', true),
    [contextData?.parametros]
  );
  const holdDurationMin = useMemo(
    () => readNumberParam(contextData?.parametros, 'hold_duracion_min', 5),
    [contextData?.parametros]
  );

  const branchList = useMemo(
    () => (Array.isArray(contextData?.sucursales) ? contextData.sucursales : []),
    [contextData?.sucursales]
  );

  const selectedBranch = useMemo(
    () => branchList.find((branch) => branch.id_sucursal === selectedBranchId) || null,
    [branchList, selectedBranchId]
  );

  const barbersById = useMemo(() => {
    const map = new Map();
    (Array.isArray(barbers) ? barbers : []).forEach((barber) => {
      if (!barber?.id_empleado) return;
      map.set(barber.id_empleado, barber);
    });
    return map;
  }, [barbers]);

  const selectedBarber = useMemo(
    () => barbersById.get(activeBlockBarberId) || null,
    [activeBlockBarberId, barbersById]
  );

  const servicesById = useMemo(() => {
    const map = new Map();
    (Array.isArray(services) ? services : []).forEach((service) => {
      if (!service?.id_servicio) return;
      map.set(service.id_servicio, service);
    });
    return map;
  }, [services]);

  const selectedServices = useMemo(
    () => serviceIds.map((id) => servicesById.get(id)).filter(Boolean),
    [serviceIds, servicesById]
  );

  const servicesCsv = useMemo(() => serviceIds.join(','), [serviceIds]);

  const bookingBlocksSummary = useMemo(
    () =>
      bookingBlocks.map((block, index) => {
        const blockServices = block.serviceIds
          .map((serviceId) => servicesById.get(serviceId))
          .filter(Boolean);
        const blockTotal = blockServices.reduce((total, service) => total + Number(service?.precio_hnl || 0), 0);
        return {
          ...block,
          index,
          alias: block.alias || (index === 0 ? 'Titular' : `Acompañante ${index}`),
          barbero: barbersById.get(block.idBarbero) || null,
          selectedServices: blockServices,
          total_hnl: blockTotal,
          isComplete: Boolean(
            block.idBarbero
              && blockServices.length > 0
              && block.selectedDate
              && block.selectedTime
          ),
        };
      }),
    [bookingBlocks, servicesById, barbersById]
  );

  const totalToPay = useMemo(
    () => bookingBlocksSummary.reduce((total, block) => total + Number(block.total_hnl || 0), 0),
    [bookingBlocksSummary]
  );

  const allBlocksComplete = useMemo(
    () => bookingBlocksSummary.length > 0 && bookingBlocksSummary.every((block) => block.isComplete),
    [bookingBlocksSummary]
  );

  const canAddCompanionBlock = useMemo(
    () => allowCompanions && bookingBlocks.length < (MAX_COMPANIONS + 1),
    [allowCompanions, bookingBlocks.length]
  );

  const monthRange = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const from = toDateKey(new Date(year, month, 1));
    const to = toDateKey(new Date(year, month + 1, 0));
    return { from, to };
  }, [currentMonth]);

  const previewCanOpenStep = useMemo(() => ({
    barberos: true,
    agenda: Boolean(selectedBranchId && selectedBarberId),
    confirmar: Boolean(allBlocksComplete),
  }), [allBlocksComplete, selectedBarberId, selectedBranchId]);

  const isPastSlotForToday = useCallback((dateKey, timeKey) => {
    if (!dateKey || !timeKey) return false;
    if (dateKey !== minBookingDateKey) return false;
    return String(timeKey).slice(0, 5) < getCurrentTimeKeyInTimeZone();
  }, [minBookingDateKey]);

  const clearSlotConflict = useCallback(() => {
    setSlotConflict(null);
    setSlotSuggestions([]);
    setSlotSuggestionsLoading(false);
  }, []);

  const resetAvailabilityViewState = useCallback((options = {}) => {
    const { clearError = true } = options;
    setSlots(buildDefaultSlots());
    if (clearError) {
      setAvailabilityError('');
    }
    clearSlotConflict();
  }, [clearSlotConflict]);

  const clearRequestState = useCallback(() => {
    if (availabilityAbortRef.current) availabilityAbortRef.current.abort();
    if (slotsAbortRef.current) slotsAbortRef.current.abort();
    availabilityCacheRef.current.clear();
    slotsCacheRef.current.clear();
    setAvailabilityMap({});
    resetAvailabilityViewState();
  }, [resetAvailabilityViewState]);

  const resetFlowForBranchChange = useCallback(() => {
    setBookingBlocks([createBookingBlock({ alias: 'Titular' })]);
    setActiveBlockIndex(0);
    setHoldResult(null);
    setPreviewStep('barberos');
    setCurrentMonth(new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1));
    clearRequestState();
  }, [clearRequestState, minBookingMonth]);

  const syncServicesScrollState = useCallback(() => {
    const scroller = servicesScrollRef.current;
    if (!scroller) {
      setServicesCanScroll(false);
      setServicesAtEnd(true);
      return;
    }

    const canScroll = scroller.scrollHeight > scroller.clientHeight + 2;
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    setServicesCanScroll(canScroll);
    setServicesAtEnd(atEnd);
  }, []);

  const updateBlockAtIndex = useCallback((index, updater) => {
    setBookingBlocks((prev) => {
      if (!prev[index]) return prev;
      const currentBlock = prev[index];
      const nextRaw = typeof updater === 'function'
        ? updater(currentBlock)
        : { ...currentBlock, ...updater };
      const nextBlock = normalizeBookingBlock(nextRaw, index);

      if (areBlocksEqual(currentBlock, nextBlock)) {
        return prev;
      }

      const nextBlocks = [...prev];
      nextBlocks[index] = nextBlock;
      return nextBlocks;
    });
  }, []);

  const fetchContext = useCallback(async () => {
    setContextLoading(true);
    setContextError('');
    try {
      const response = await getPublicBookingContext();
      const payload = response?.data ?? response;
      const nextContext = {
        sucursales: Array.isArray(payload?.sucursales) ? payload.sucursales : [],
        parametros: payload?.parametros || {},
      };
      setContextData(nextContext);
    } catch (err) {
      setContextError(extractMessage(err));
    } finally {
      setContextLoading(false);
    }
  }, []);

  const fetchBranchData = useCallback(async () => {
    if (!selectedBranchId) {
      setBarbers([]);
      setServices([]);
      return;
    }

    const requestSeq = branchDataRequestSeqRef.current + 1;
    branchDataRequestSeqRef.current = requestSeq;
    setBarbersLoading(true);
    setServicesLoading(true);
    setAvailabilityError('');

    try {
      const [barbersResponse, servicesResponse] = await Promise.all([
        listPublicAgendaBarberos({ id_sucursal: selectedBranchId }),
        listPublicCatalogServicios({ id_sucursal: selectedBranchId }),
      ]);
      if (requestSeq !== branchDataRequestSeqRef.current) return;

      const barbersPayload = barbersResponse?.data ?? barbersResponse;
      const servicesPayload = servicesResponse?.data ?? servicesResponse;
      const nextBarbers = Array.isArray(barbersPayload?.barberos) ? barbersPayload.barberos : [];
      const nextServices = Array.isArray(servicesPayload?.servicios) ? servicesPayload.servicios : [];
      const validBarberIds = new Set(nextBarbers.map((barber) => barber.id_empleado));
      const fallbackBarberId = nextBarbers[0]?.id_empleado || '';

      setBarbers(nextBarbers);
      setServices(nextServices);

      setBookingBlocks((prev) => {
        const sourceBlocks = prev.length > 0
          ? prev
          : [createBookingBlock({ alias: 'Titular', idBarbero: fallbackBarberId })];

        let hasChanges = false;
        const normalizedSource = sourceBlocks.map((block, index) => normalizeBookingBlock(block, index));

        const nextBlocks = normalizedSource.map((block) => {
          const nextBarberId = validBarberIds.has(block.idBarbero)
            ? block.idBarbero
            : fallbackBarberId;

          if (block.idBarbero === nextBarberId) {
            return block;
          }

          hasChanges = true;
          return {
            ...block,
            idBarbero: nextBarberId,
            selectedDate: '',
            selectedTime: '',
          };
        });

        return hasChanges ? nextBlocks : normalizedSource;
      });
    } catch (err) {
      if (requestSeq !== branchDataRequestSeqRef.current) return;
      const message = extractMessage(err);
      setAvailabilityError(message);
      notifications.error(message, { dedupeKey: 'public-booking-branch-data-error' });
    } finally {
      if (requestSeq === branchDataRequestSeqRef.current) {
        setBarbersLoading(false);
        setServicesLoading(false);
      }
    }
  }, [notifications, selectedBranchId]);

  const fetchAvailability = useCallback(async () => {
    if (!selectedBranchId || !activeBlockBarberId || !servicesCsv) {
      setAvailabilityMap({});
      setAvailabilityLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId, servicesCsv, monthRange.from, monthRange.to].join('|');
    const cached = availabilityCacheRef.current.get(cacheKey);
    if (cached) {
      setAvailabilityMap(cached);
      setAvailabilityError('');

      const shouldValidateSelectedDate = selectedDate >= monthRange.from && selectedDate <= monthRange.to;
      if (selectedDate && (selectedDate < minBookingDateKey || (shouldValidateSelectedDate && !cached[selectedDate]?.disponible))) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedDate: '',
          selectedTime: '',
        }));
      }
      return;
    }

    if (availabilityAbortRef.current) {
      availabilityAbortRef.current.abort();
    }

    const controller = new AbortController();
    availabilityAbortRef.current = controller;
    const requestSeq = availabilityRequestSeqRef.current + 1;
    availabilityRequestSeqRef.current = requestSeq;

    setAvailabilityLoading(true);
    setAvailabilityError('');

    try {
      const response = await listPublicAgendaDisponibilidad(
        {
          id_sucursal: selectedBranchId,
          id_barbero: activeBlockBarberId,
          servicios: servicesCsv,
          fecha_desde: monthRange.from,
          fecha_hasta: monthRange.to,
        },
        { signal: controller.signal }
      );

      if (requestSeq !== availabilityRequestSeqRef.current) return;

      const payload = response?.data ?? response;
      const list = Array.isArray(payload?.disponibilidad) ? payload.disponibilidad : [];
      const nextMap = list.reduce((acc, item) => {
        if (!item?.fecha) return acc;
        acc[item.fecha] = item;
        return acc;
      }, {});

      availabilityCacheRef.current.set(cacheKey, nextMap);
      setAvailabilityMap(nextMap);

      const shouldValidateSelectedDate = selectedDate >= monthRange.from && selectedDate <= monthRange.to;
      if (selectedDate && (selectedDate < minBookingDateKey || (shouldValidateSelectedDate && !nextMap[selectedDate]?.disponible))) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedDate: '',
          selectedTime: '',
        }));
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (requestSeq !== availabilityRequestSeqRef.current) return;
      const message = extractMessage(err);
      setAvailabilityError(message);
    } finally {
      if (requestSeq === availabilityRequestSeqRef.current) {
        setAvailabilityLoading(false);
      }
    }
  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    minBookingDateKey,
    monthRange.from,
    monthRange.to,
    selectedBranchId,
    selectedDate,
    servicesCsv,
    updateBlockAtIndex,
  ]);

  const fetchSlots = useCallback(async () => {
    if (!selectedBranchId || !activeBlockBarberId || !servicesCsv || !selectedDate) {
      setSlots(buildDefaultSlots());
      setSlotsLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId, servicesCsv, selectedDate].join('|');
    const cached = slotsCacheRef.current.get(cacheKey);
    if (cached) {
      setSlots(cached);
      return;
    }

    if (slotsAbortRef.current) {
      slotsAbortRef.current.abort();
    }

    const controller = new AbortController();
    slotsAbortRef.current = controller;
    const requestSeq = slotsRequestSeqRef.current + 1;
    slotsRequestSeqRef.current = requestSeq;
    setSlotsLoading(true);

    try {
      const response = await listPublicAgendaHorarios(
        {
          id_sucursal: selectedBranchId,
          id_barbero: activeBlockBarberId,
          servicios: servicesCsv,
          fecha: selectedDate,
        },
        { signal: controller.signal }
      );

      if (requestSeq !== slotsRequestSeqRef.current) return;

      const payload = response?.data ?? response;
      const list = Array.isArray(payload?.horarios) ? payload.horarios : [];
      const availableTimes = new Set(list.map((slot) => slot?.hora).filter(Boolean));
      const mapped = buildDynamicSlots({
        availableTimes,
        horaInicio: payload?.hora_inicio,
        horaFin: payload?.hora_fin,
      });

      slotsCacheRef.current.set(cacheKey, mapped);
      setSlots(mapped);

      if (selectedTime && !availableTimes.has(selectedTime)) {
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedTime: '',
        }));
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (requestSeq !== slotsRequestSeqRef.current) return;
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-slots-error' });
    } finally {
      if (requestSeq === slotsRequestSeqRef.current) {
        setSlotsLoading(false);
      }
    }
  }, [
    activeBlockBarberId,
    effectiveActiveBlockIndex,
    notifications,
    selectedBranchId,
    selectedDate,
    selectedTime,
    servicesCsv,
    updateBlockAtIndex,
  ]);

  const fetchSlotsForBarber = useCallback(async ({ barberId, dateKey, servicesCsvValue }) => {
    if (!selectedBranchId || !barberId || !dateKey || !servicesCsvValue) {
      return buildDefaultSlots();
    }

    const cacheKey = [selectedBranchId, barberId, servicesCsvValue, dateKey].join('|');
    const cached = slotsCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const response = await listPublicAgendaHorarios({
      id_sucursal: selectedBranchId,
      id_barbero: barberId,
      servicios: servicesCsvValue,
      fecha: dateKey,
    });

    const payload = response?.data ?? response;
    const list = Array.isArray(payload?.horarios) ? payload.horarios : [];
    const availableTimes = new Set(list.map((slot) => slot?.hora).filter(Boolean));
    const mapped = buildDynamicSlots({
      availableTimes,
      horaInicio: payload?.hora_inicio,
      horaFin: payload?.hora_fin,
    });
    slotsCacheRef.current.set(cacheKey, mapped);
    return mapped;
  }, [selectedBranchId]);

  const findBlockCollision = useCallback((barberId, dateKey, timeKey, ignoreIndex) => {
    if (!barberId || !dateKey || !timeKey) return null;
    return bookingBlocksSummary.find((block) =>
      block.index !== ignoreIndex
      && block.idBarbero === barberId
      && block.selectedDate === dateKey
      && block.selectedTime === timeKey) || null;
  }, [bookingBlocksSummary]);

  const loadSlotSuggestions = useCallback(async ({
    barberId,
    dateKey,
    timeKey,
    servicesCsvValue,
  }) => {
    if (!barberId || !dateKey || !timeKey || !servicesCsvValue) {
      setSlotSuggestions([]);
      setSlotSuggestionsLoading(false);
      return;
    }

    const barberCandidates = (Array.isArray(barbers) ? barbers : [])
      .filter((barber) => barber?.id_empleado && barber.id_empleado !== barberId);
    if (!barberCandidates.length) {
      setSlotSuggestions([]);
      setSlotSuggestionsLoading(false);
      return;
    }

    const requestSeq = slotSuggestionRequestSeqRef.current + 1;
    slotSuggestionRequestSeqRef.current = requestSeq;
    setSlotSuggestionsLoading(true);
    setSlotSuggestions([]);

    try {
      const results = await Promise.all(
        barberCandidates.map(async (barber) => {
          try {
            const barberSlots = await fetchSlotsForBarber({
              barberId: barber.id_empleado,
              dateKey,
              servicesCsvValue,
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

      if (requestSeq !== slotSuggestionRequestSeqRef.current) return;
      setSlotSuggestions(results.filter(Boolean));
    } finally {
      if (requestSeq === slotSuggestionRequestSeqRef.current) {
        setSlotSuggestionsLoading(false);
      }
    }
  }, [barbers, fetchSlotsForBarber]);

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    if (!branchList.length) {
      setSelectedBranchId('');
      return;
    }

    setSelectedBranchId((prev) =>
      branchList.some((branch) => branch.id_sucursal === prev) ? prev : branchList[0]?.id_sucursal || ''
    );
  }, [branchList]);

  useEffect(() => {
    void fetchBranchData();
  }, [fetchBranchData]);

  useEffect(() => {
    if (!selectedBranchId) return;
    const timer = setTimeout(() => {
      void fetchAvailability();
    }, 220);
    return () => clearTimeout(timer);
  }, [fetchAvailability, selectedBranchId]);

  useEffect(() => {
    if (!selectedBranchId) return;
    const timer = setTimeout(() => {
      void fetchSlots();
    }, 160);
    return () => clearTimeout(timer);
  }, [fetchSlots, selectedBranchId]);

  useEffect(() => {
    return () => {
      if (availabilityAbortRef.current) availabilityAbortRef.current.abort();
      if (slotsAbortRef.current) slotsAbortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (bookingBlocks[activeBlockIndex]) return;
    setActiveBlockIndex(0);
  }, [activeBlockIndex, bookingBlocks]);

  useEffect(() => {
    clearSlotConflict();
  }, [activeBlockBarberId, clearSlotConflict, effectiveActiveBlockIndex, selectedDate, servicesCsv]);

  useEffect(() => {
    setBookingBlocks((prev) => {
      let changed = false;
      const nextBlocks = prev.map((block, index) => {
        if (!block?.selectedDate || block.selectedDate >= minBookingDateKey) {
          return block;
        }
        changed = true;
        return normalizeBookingBlock(
          {
            ...block,
            selectedDate: '',
            selectedTime: '',
          },
          index
        );
      });
      return changed ? nextBlocks : prev;
    });
  }, [minBookingDateKey]);

  useEffect(() => {
    if (!selectedDate || !selectedTime) return;
    if (!isPastSlotForToday(selectedDate, selectedTime)) return;
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      selectedTime: '',
    }));
  }, [
    effectiveActiveBlockIndex,
    isPastSlotForToday,
    selectedDate,
    selectedTime,
    updateBlockAtIndex,
  ]);

  useEffect(() => {
    if (previewStep !== 'agenda') return;
    if (!selectedBranchId || !selectedBarberId) {
      setPreviewStep('barberos');
    }
  }, [previewStep, selectedBarberId, selectedBranchId]);

  useEffect(() => {
    if (previewStep !== 'confirmar') return;
    if (!allBlocksComplete) {
      setPreviewStep('agenda');
    }
  }, [allBlocksComplete, previewStep]);

  useEffect(() => {
    setHoldResult(null);
  }, [selectedBranchId, bookingBlocks]);

  const selectBranch = useCallback(
    (nextBranchId) => {
      if (!nextBranchId || nextBranchId === selectedBranchId) return;
      resetFlowForBranchChange();
      setSelectedBranchId(nextBranchId);
    },
    [resetFlowForBranchChange, selectedBranchId]
  );

  const selectBarber = useCallback((barberId) => {
    if (!barberId) return;
    clearRequestState();
    setActiveBlockIndex(0);
    updateBlockAtIndex(0, (currentBlock) => ({
      ...currentBlock,
      idBarbero: barberId,
      selectedDate: '',
      selectedTime: '',
    }));
  }, [clearRequestState, updateBlockAtIndex]);

  const setActiveBlock = useCallback((nextIndex) => {
    const parsed = Number(nextIndex);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(bookingBlocks.length - 1, Math.trunc(parsed)));
    setActiveBlockIndex(clamped);
    resetAvailabilityViewState();
  }, [bookingBlocks.length, resetAvailabilityViewState]);

  const addCompanionBlock = useCallback(() => {
    setBookingBlocks((prev) => {
      if (!allowCompanions || prev.length >= (MAX_COMPANIONS + 1)) return prev;
      const source = prev.length > 0 ? prev : [createBookingBlock({ alias: 'Titular' })];
      const companionNumber = source.length;
      const inheritedBarberId = source[effectiveActiveBlockIndex]?.idBarbero || source[0]?.idBarbero || '';
      const nextBlock = createBookingBlock({
        alias: `Acompañante ${companionNumber}`,
        idBarbero: inheritedBarberId,
      });
      const nextBlocks = [...source, nextBlock];
      setActiveBlockIndex(nextBlocks.length - 1);
      return nextBlocks;
    });
    resetAvailabilityViewState();
  }, [allowCompanions, effectiveActiveBlockIndex, resetAvailabilityViewState]);

  const goToAgenda = useCallback(() => {
    if (!selectedBranchId || !selectedBarberId) return;
    setPreviewStep('agenda');
  }, [selectedBarberId, selectedBranchId]);

  const goToBarberos = useCallback(() => {
    setPreviewStep('barberos');
  }, []);

  const goToConfirm = useCallback(() => {
    if (!allBlocksComplete) return;
    setPreviewStep('confirmar');
  }, [allBlocksComplete]);

  const toggleService = useCallback((serviceId) => {
    if (!serviceId) return;

    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const exists = currentBlock.serviceIds.includes(serviceId);
      const nextServiceIds = exists
        ? currentBlock.serviceIds.filter((id) => id !== serviceId)
        : [...currentBlock.serviceIds, serviceId];

      return {
        ...currentBlock,
        serviceIds: nextServiceIds,
        selectedDate: nextServiceIds.length > 0 ? currentBlock.selectedDate : '',
        selectedTime: '',
      };
    });

    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState, updateBlockAtIndex]);

  const updateActiveBlockBarber = useCallback((barberId) => {
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      idBarbero: String(barberId || '').trim(),
      selectedDate: '',
      selectedTime: '',
    }));

    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState, updateBlockAtIndex]);

  const selectSuggestedBarber = useCallback((barberId) => {
    const nextBarberId = String(barberId || '').trim();
    if (!nextBarberId) return;

    const preservedDate = slotConflict?.dateKey || selectedDate;
    const preservedTime = slotConflict?.timeKey || '';

    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      idBarbero: nextBarberId,
      selectedDate: preservedDate,
      selectedTime: preservedTime,
    }));

    resetAvailabilityViewState();
  }, [
    effectiveActiveBlockIndex,
    resetAvailabilityViewState,
    selectedDate,
    slotConflict,
    updateBlockAtIndex,
  ]);

  const setMonth = useCallback((delta) => {
    const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    const minMonthStart = new Date(minBookingMonth.getFullYear(), minBookingMonth.getMonth(), 1);
    if (nextMonth.getTime() < minMonthStart.getTime()) return;
    setCurrentMonth(nextMonth);
  }, [currentMonth, minBookingMonth]);

  const onSelectDay = useCallback((dateKey, enabled) => {
    if (!enabled || dateKey < minBookingDateKey) return;
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      selectedDate: dateKey,
      selectedTime: '',
    }));
    clearSlotConflict();
  }, [clearSlotConflict, effectiveActiveBlockIndex, minBookingDateKey, updateBlockAtIndex]);

  const onSelectTime = useCallback(async (time, enabled) => {
    if (!enabled) return;
    const nextTime = String(time || '').trim().slice(0, 5);
    if (!nextTime || !selectedDate || !activeBlockBarberId) return;

    if (isPastSlotForToday(selectedDate, nextTime)) {
      notifications.warning('No puedes agendar en una hora pasada para hoy.', {
        dedupeKey: 'public-booking-past-time-blocked',
      });
      return;
    }

    const conflictingBlock = findBlockCollision(
      activeBlockBarberId,
      selectedDate,
      nextTime,
      effectiveActiveBlockIndex
    );

    if (conflictingBlock) {
      setSlotConflict({
        dateKey: selectedDate,
        timeKey: nextTime,
        barberId: activeBlockBarberId,
        conflictingAlias: conflictingBlock.alias || `Integrante ${conflictingBlock.index + 1}`,
      });
      notifications.warning('Ese barbero ya esta ocupado en la misma fecha y hora por otro integrante.', {
        dedupeKey: 'public-booking-duplicate-barber-slot',
      });
      await loadSlotSuggestions({
        barberId: activeBlockBarberId,
        dateKey: selectedDate,
        timeKey: nextTime,
        servicesCsvValue: servicesCsv,
      });
      return;
    }

    clearSlotConflict();
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      selectedTime: nextTime,
    }));
  }, [
    activeBlockBarberId,
    clearSlotConflict,
    effectiveActiveBlockIndex,
    findBlockCollision,
    isPastSlotForToday,
    loadSlotSuggestions,
    notifications,
    selectedDate,
    servicesCsv,
    updateBlockAtIndex,
  ]);

  const submitHold = useCallback(async () => {
    if (!selectedBranchId || !selectedBarberId) {
      notifications.warning('Debes seleccionar sucursal y barbero.', { dedupeKey: 'admin-preview-hold-context' });
      setPreviewStep('barberos');
      return false;
    }

    const blocksToSubmit = bookingBlocksSummary.filter((block) => block.selectedServices.length > 0);
    if (blocksToSubmit.length === 0 || !allBlocksComplete) {
      notifications.warning('Completa servicios, fecha y hora en todos los bloques antes de simular.', {
        dedupeKey: 'admin-preview-blocks-required',
      });
      setPreviewStep('agenda');
      return false;
    }

    const selectedSlotMap = new Map();
    for (const block of blocksToSubmit) {
      if (isPastSlotForToday(block.selectedDate, block.selectedTime)) {
        notifications.warning('No puedes confirmar una cita en hora pasada para hoy.', {
          dedupeKey: 'admin-preview-submit-past-time',
        });
        setActiveBlockIndex(block.index);
        setPreviewStep('agenda');
        return false;
      }

      const collisionKey = `${block.idBarbero}|${block.selectedDate}|${block.selectedTime}`;
      const previous = selectedSlotMap.get(collisionKey);
      if (previous) {
        setSlotConflict({
          dateKey: block.selectedDate,
          timeKey: block.selectedTime,
          barberId: block.idBarbero,
          conflictingAlias: previous.alias || 'Integrante',
        });
        notifications.warning('Hay integrantes con el mismo barbero, fecha y hora. Debes cambiar uno de ellos.', {
          dedupeKey: 'admin-preview-submit-duplicate-slot',
        });
        setActiveBlockIndex(block.index);
        setPreviewStep('agenda');
        await loadSlotSuggestions({
          barberId: block.idBarbero,
          dateKey: block.selectedDate,
          timeKey: block.selectedTime,
          servicesCsvValue: block.serviceIds.join(','),
        });
        return false;
      }

      selectedSlotMap.set(collisionKey, block);
    }

    const bloques = [];
    for (const block of blocksToSubmit) {
      const fechaInicio = toLocalDateTimeWithOffset(block.selectedDate, block.selectedTime);
      if (!fechaInicio) {
        notifications.error('No se pudo construir la fecha y hora de una de las citas del grupo.', {
          dedupeKey: 'admin-preview-datetime-invalid',
        });
        return false;
      }

      bloques.push({
        id_cita: `sim-${block.id}`,
        orden_integrante: block.index + 1,
        alias: block.alias,
        id_barbero: block.idBarbero || null,
        nombre_barbero: block.barbero?.nombre_completo || 'Barbero',
        fecha: block.selectedDate,
        hora: block.selectedTime,
        fecha_inicio: fechaInicio,
        estado_cita_codigo: 'simulada',
        monto_total_hnl: block.total_hnl,
        duracion_total_min: block.selectedServices.reduce((total, item) => total + Number(item?.duracion_min || 0), 0),
        buffer_total_min: block.selectedServices.reduce((total, item) => total + Number(item?.buffer_min || 0), 0),
      });
    }

    setHoldSubmitting(true);
    try {
      const expiresAt = new Date(Date.now() + holdDurationMin * 60 * 1000).toISOString();
      setHoldResult({
        demo: true,
        id_grupo_cita: `SIM-${Date.now()}`,
        estado_grupo_codigo: 'simulada',
        expires_at: expiresAt,
        monto_total_hnl: totalToPay,
        bloques,
      });
      notifications.success('Simulacion completada. No se creo ningun hold real.', {
        dedupeKey: 'admin-preview-hold-success',
      });
      return true;
    } finally {
      setHoldSubmitting(false);
    }
  }, [
    allBlocksComplete,
    bookingBlocksSummary,
    holdDurationMin,
    isPastSlotForToday,
    loadSlotSuggestions,
    notifications,
    selectedBarberId,
    selectedBranchId,
    totalToPay,
  ]);

  const selectPreviewStep = useCallback((stepId) => {
    if (!previewCanOpenStep[stepId]) return;
    setPreviewStep(stepId);
  }, [previewCanOpenStep]);

  const contextValue = useMemo(
    () => ({
      mode: 'preview',
      activeBlock,
      activeBlockIndex: effectiveActiveBlockIndex,
      addCompanionBlock,
      allBlocksComplete,
      allowCompanions,
      availabilityError,
      availabilityLoading,
      availabilityMap,
      barbers,
      barbersLoading,
      bookingBlocks,
      bookingBlocksSummary,
      branchList,
      canAddCompanionBlock,
      canGoPrevMonth,
      contextData,
      currentMonth,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      holdDurationMin,
      holdResult,
      holdSubmitting,
      isPastSlotForToday,
      maxCompanions: MAX_COMPANIONS,
      minBookingDateKey,
      monthRange,
      onSelectDay,
      onSelectTime,
      paymentRequired,
      selectedBarber,
      selectedBarberId,
      selectedBranch,
      selectedBranchId,
      selectedDate,
      selectedServices,
      selectedTime,
      serviceIds,
      services,
      servicesAtEnd,
      servicesCanScroll,
      servicesLoading,
      servicesScrollRef,
      setActiveBlock,
      setMonth,
      selectSuggestedBarber,
      slotConflict,
      slotSuggestions,
      slotSuggestionsLoading,
      slots,
      slotsLoading,
      submitHold,
      syncServicesScrollState,
      toggleService,
      totalToPay,
      updateActiveBlockBarber,
      selectBarber,
      selectBranch,
      fetchAvailability,
    }),
    [
      activeBlock,
      effectiveActiveBlockIndex,
      addCompanionBlock,
      allBlocksComplete,
      allowCompanions,
      availabilityError,
      availabilityLoading,
      availabilityMap,
      barbers,
      barbersLoading,
      bookingBlocks,
      bookingBlocksSummary,
      branchList,
      canAddCompanionBlock,
      canGoPrevMonth,
      contextData,
      currentMonth,
      fetchAvailability,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      holdDurationMin,
      holdResult,
      holdSubmitting,
      isPastSlotForToday,
      minBookingDateKey,
      monthRange,
      onSelectDay,
      onSelectTime,
      paymentRequired,
      selectedBarber,
      selectedBarberId,
      selectedBranch,
      selectedBranchId,
      selectedDate,
      selectedServices,
      selectedTime,
      serviceIds,
      services,
      servicesAtEnd,
      servicesCanScroll,
      servicesLoading,
      setActiveBlock,
      setMonth,
      selectSuggestedBarber,
      slotConflict,
      slotSuggestions,
      slotSuggestionsLoading,
      slots,
      slotsLoading,
      submitHold,
      syncServicesScrollState,
      toggleService,
      totalToPay,
      updateActiveBlockBarber,
      selectBarber,
      selectBranch,
    ]
  );

  return (
    <div className="mf-page citas-page public-booking-page public-booking-preview-scope">
      <div className="citas-toolbar">
        <span className="citas-mode-pill">Modo Vista Previa - Simulacion (sin hold real)</span>
        <div className="citas-stepper">
          {PREVIEW_STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              className={`citas-step-btn ${previewStep === step.id ? 'is-active' : ''}`}
              disabled={!previewCanOpenStep[step.id]}
              onClick={() => selectPreviewStep(step.id)}
            >
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {contextLoading ? (
        <div className="citas-surface p-6">
          <LoadingSpinner />
        </div>
      ) : null}
      {contextError ? <ErrorBanner message={contextError} onRetry={fetchContext} /> : null}

      {!contextLoading && !contextError ? (
        <div className="public-booking-main">
          <PublicBookingProvider value={contextValue}>
            {previewStep === 'barberos' ? <PublicBookingBarberosStep /> : null}
            {previewStep === 'agenda' ? <PublicBookingAgendaStep /> : null}
            {previewStep === 'confirmar' ? <PublicBookingConfirmStep /> : null}
          </PublicBookingProvider>
        </div>
      ) : null}
    </div>
  );
}
