import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowLeft, House } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/button.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  createPublicCitaHold,
  getPublicBookingContext,
  listPublicAgendaBarberos,
  listPublicAgendaDisponibilidad,
  listPublicAgendaHorarios,
  listPublicCatalogServicios,
} from './publicBookingApi.js';
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
} from './bookingUtils.js';
import '../../admin/pages/AdminCitasPage.css';
import './PublicBookingFlow.css';

const EMPTY_CONTEXT = {
  sucursales: [],
  parametros: {},
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PublicBookingContext = createContext(null);

export function PublicBookingProvider({ value, children }) {
  return <PublicBookingContext.Provider value={value}>{children}</PublicBookingContext.Provider>;
}

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

function isValidEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized);
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
  const contactName = String(block?.contactName || '').trim();
  const resolvedAlias = contactName || String(block?.alias || '').trim() || fallbackAlias;

  return {
    id: String(block?.id || '').trim() || createBlockId(),
    alias: resolvedAlias,
    idBarbero: String(block?.idBarbero || '').trim(),
    serviceIds: nextServiceIds,
    selectedDate: String(block?.selectedDate || '').trim(),
    selectedTime: String(block?.selectedTime || '').trim(),
    contactName,
    contactEmail: String(block?.contactEmail || '').trim(),
    contactPhone: String(block?.contactPhone || '').trim(),
  };
}

function areBlocksEqual(left, right) {
  if (!left || !right) return false;
  return left.id === right.id
    && left.alias === right.alias
    && left.idBarbero === right.idBarbero
    && left.selectedDate === right.selectedDate
    && left.selectedTime === right.selectedTime
    && left.contactName === right.contactName
    && left.contactEmail === right.contactEmail
    && left.contactPhone === right.contactPhone
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
      contactName: '',
      contactEmail: '',
      contactPhone: '',
    },
    alias === 'Titular' ? 0 : 1
  );
}

export function usePublicBookingFlow() {
  const context = useContext(PublicBookingContext);
  if (!context) {
    throw new Error('usePublicBookingFlow debe usarse dentro de PublicBookingFlow.');
  }
  return context;
}

export default function PublicBookingFlow() {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { isAuthenticated, roles } = useAuth();

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
  const [holdCountdownStartedAt, setHoldCountdownStartedAt] = useState(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

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
  const simulationNoPayment = useMemo(
    () => readBooleanParam(contextData?.parametros, 'simulacion_sin_pago', true),
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
            String(block.contactName || '').trim()
              && (index > 0 || isValidEmail(block.contactEmail))
              && block.idBarbero
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
  const holdExpiresAtIso = useMemo(() => {
    if (holdResult?.expires_at) return holdResult.expires_at;
    if (!holdCountdownStartedAt) return null;
    return new Date(holdCountdownStartedAt + holdDurationMin * 60 * 1000).toISOString();
  }, [holdCountdownStartedAt, holdDurationMin, holdResult?.expires_at]);
  const holdRemainingMs = useMemo(() => {
    if (!holdExpiresAtIso) return null;
    const expiresAt = new Date(holdExpiresAtIso);
    if (Number.isNaN(expiresAt.getTime())) return null;
    return Math.max(expiresAt.getTime() - countdownNow, 0);
  }, [holdExpiresAtIso, countdownNow]);
  const holdExpired = holdRemainingMs != null && holdRemainingMs <= 0;

  const canAddCompanionBlock = useMemo(
    () => bookingBlocks.length < (MAX_COMPANIONS + 1),
    [bookingBlocks.length]
  );

  const monthRange = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const from = toDateKey(new Date(year, month, 1));
    const to = toDateKey(new Date(year, month + 1, 0));
    return { from, to };
  }, [currentMonth]);

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
    setHoldCountdownStartedAt(null);
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
      const nextServices = Array.isArray(servicesPayload?.servicios)
        ? servicesPayload.servicios.filter(
          (service) => service?.agendable && !service?.servicio_informativo
        )
        : [];
      const validBarberIds = new Set(nextBarbers.map((barber) => barber.id_empleado));
      const validServiceIds = new Set(nextServices.map((service) => service.id_servicio));
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
          const nextServiceIds = block.serviceIds.filter((serviceId) => validServiceIds.has(serviceId));

          if (block.idBarbero === nextBarberId && areServiceIdsEqual(block.serviceIds, nextServiceIds)) {
            return block;
          }

          hasChanges = true;
          return {
            ...block,
            idBarbero: nextBarberId,
            serviceIds: nextServiceIds,
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
    if (!selectedBranchId || !servicesCsv) {
      setAvailabilityMap({});
      setAvailabilityLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId || 'auto', servicesCsv, monthRange.from, monthRange.to].join('|');
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
          id_barbero: activeBlockBarberId || undefined,
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
    if (!selectedBranchId || !servicesCsv || !selectedDate) {
      setSlots(buildDefaultSlots());
      setSlotsLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, activeBlockBarberId || 'auto', servicesCsv, selectedDate].join('|');
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
          id_barbero: activeBlockBarberId || undefined,
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
    if (!location.pathname.startsWith('/agendar/confirmar')) return;
    if (!selectedBranchId || !selectedBarberId) {
      navigate('/agendar/barberos', { replace: true });
      return;
    }
    if (!allBlocksComplete) {
      navigate('/agendar/agenda', { replace: true });
    }
  }, [location.pathname, navigate, selectedBranchId, selectedBarberId, allBlocksComplete]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/agenda')) return;
    if (!selectedBranchId || !selectedBarberId) {
      navigate('/agendar/barberos', { replace: true });
    }
  }, [location.pathname, navigate, selectedBarberId, selectedBranchId]);

  useEffect(() => {
    setHoldResult(null);
    if (!allBlocksComplete) {
      setHoldCountdownStartedAt(null);
      return;
    }
    setHoldCountdownStartedAt(Date.now());
  }, [selectedBranchId, bookingBlocks, allBlocksComplete]);

  useEffect(() => {
    if (!holdExpiresAtIso) return undefined;
    setCountdownNow(Date.now());
    const intervalId = setInterval(() => {
      setCountdownNow(Date.now());
    }, 1000);
    return () => clearInterval(intervalId);
  }, [holdExpiresAtIso]);

  const selectBranch = useCallback(
    (nextBranchId) => {
      if (!nextBranchId || nextBranchId === selectedBranchId) return;
      resetFlowForBranchChange();
      setSelectedBranchId(nextBranchId);
      navigate('/agendar/barberos');
    },
    [navigate, resetFlowForBranchChange, selectedBranchId]
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
      if (prev.length >= (MAX_COMPANIONS + 1)) return prev;
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
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState]);

  const goToAgenda = useCallback(() => {
    if (!selectedBranchId || !selectedBarberId) return;
    navigate('/agendar/agenda');
  }, [navigate, selectedBarberId, selectedBranchId]);

  const goToBarberos = useCallback(() => {
    navigate('/agendar/barberos');
  }, [navigate]);

  const goToConfirm = useCallback(() => {
    if (!allBlocksComplete) return;
    navigate('/agendar/confirmar');
  }, [allBlocksComplete, navigate]);

  const completeBookingFlow = useCallback(() => {
    setHoldResult(null);
    setHoldCountdownStartedAt(null);
    resetFlowForBranchChange();
    navigate('/');
  }, [navigate, resetFlowForBranchChange]);

  const toggleService = useCallback((serviceId) => {
    if (!serviceId) return;
    const currentBlock = bookingBlocks[effectiveActiveBlockIndex];
    const contactName = String(currentBlock?.contactName || '').trim();
    if (!contactName) {
      notifications.warning(
        effectiveActiveBlockIndex === 0
          ? 'Completa el nombre del titular antes de elegir servicios.'
          : 'Completa el nombre del acompañante antes de elegir servicios.',
        { dedupeKey: 'public-booking-contact-name-required' }
      );
      return;
    }

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
  }, [bookingBlocks, effectiveActiveBlockIndex, notifications, resetAvailabilityViewState, updateBlockAtIndex]);

  const updateActiveBlockBarber = useCallback((barberId) => {
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
      ...currentBlock,
      idBarbero: String(barberId || '').trim(),
      selectedDate: currentBlock.selectedDate || '',
      selectedTime: '',
    }));

    resetAvailabilityViewState();
  }, [effectiveActiveBlockIndex, resetAvailabilityViewState, updateBlockAtIndex]);

  const updateActiveBlockContact = useCallback((patch) => {
    updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => {
      const next = {
        ...currentBlock,
        ...patch,
      };
      const normalizedName = String(next.contactName || '').trim();
      next.alias = normalizedName || (effectiveActiveBlockIndex === 0 ? 'Titular' : `Acompañante ${effectiveActiveBlockIndex}`);
      return next;
    });
  }, [effectiveActiveBlockIndex, updateBlockAtIndex]);

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

    setBookingBlocks((prev) => {
      const currentBlock = prev[effectiveActiveBlockIndex];
      if (!currentBlock) return prev;

      const nextBlocks = [...prev];
      nextBlocks[effectiveActiveBlockIndex] = normalizeBookingBlock(
        { ...currentBlock, selectedDate: dateKey, selectedTime: '' },
        effectiveActiveBlockIndex
      );

      return nextBlocks;
    });

    clearSlotConflict();
  }, [clearSlotConflict, effectiveActiveBlockIndex, minBookingDateKey]);

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
      notifications.warning('Ese barbero ya está ocupado en la misma fecha y hora por otro integrante.', {
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
      notifications.warning('Debes seleccionar sucursal y barbero.', { dedupeKey: 'public-booking-hold-context' });
      navigate('/agendar/barberos');
      return false;
    }
    if (holdExpired) {
      notifications.warning('El tiempo de confirmación expiró. Reintentaremos con la misma hora si sigue disponible.', {
        dedupeKey: 'public-booking-hold-expired-before-submit',
      });
    }
    const blocksToSubmit = bookingBlocksSummary.filter((block) => block.selectedServices.length > 0);
    if (blocksToSubmit.length === 0 || !allBlocksComplete) {
      notifications.warning('Completa servicios, fecha y hora en todos los bloques antes de confirmar.', {
        dedupeKey: 'public-booking-blocks-required',
      });
      navigate('/agendar/agenda');
      return false;
    }
    const titularBlock = bookingBlocks[0] || null;
    const titularNombre = String(titularBlock?.contactName || '').trim();
    const titularEmail = String(titularBlock?.contactEmail || '').trim().toLowerCase();
    const titularTelefono = String(titularBlock?.contactPhone || '').trim();
    if (!titularNombre) {
      notifications.warning('Debes ingresar el nombre del titular antes de confirmar.', {
        dedupeKey: 'public-booking-holder-name-required',
      });
      setActiveBlockIndex(0);
      navigate('/agendar/agenda');
      return false;
    }
    if (!isValidEmail(titularEmail)) {
      notifications.warning('Debes ingresar un correo válido del titular antes de confirmar.', {
        dedupeKey: 'public-booking-holder-email-required',
      });
      setActiveBlockIndex(0);
      navigate('/agendar/agenda');
      return false;
    }
    for (let index = 1; index < bookingBlocks.length; index += 1) {
      const companion = bookingBlocks[index];
      const companionName = String(companion?.contactName || '').trim();
      const companionEmail = String(companion?.contactEmail || '').trim().toLowerCase();
      if (!companionName) {
        notifications.warning('Cada acompañante debe tener nombre antes de confirmar.', {
          dedupeKey: 'public-booking-companion-name-required-submit',
        });
        setActiveBlockIndex(index);
        navigate('/agendar/agenda');
        return false;
      }
      if (companionEmail && !isValidEmail(companionEmail)) {
        notifications.warning('Uno de los acompañantes tiene un correo inválido.', {
          dedupeKey: 'public-booking-companion-email-invalid-submit',
        });
        setActiveBlockIndex(index);
        navigate('/agendar/agenda');
        return false;
      }
    }
    const selectedSlotMap = new Map();
    const resolvedBarberByBlockId = new Map();
    let autoAssignedCompanion = false;
    for (const block of blocksToSubmit) {
      if (isPastSlotForToday(block.selectedDate, block.selectedTime)) {
        notifications.warning('No puedes confirmar una cita en hora pasada para hoy.', {
          dedupeKey: 'public-booking-submit-past-time',
        });
        setActiveBlockIndex(block.index);
        navigate('/agendar/agenda');
        return false;
      }
      if (block.idBarbero) {
        const collisionKey = `${block.idBarbero}|${block.selectedDate}|${block.selectedTime}`;
        const previous = selectedSlotMap.get(collisionKey);
        if (previous) {
          if (block.index > 0) {
            resolvedBarberByBlockId.set(block.id, null);
            autoAssignedCompanion = true;
            continue;
          }
          setSlotConflict({
            dateKey: block.selectedDate,
            timeKey: block.selectedTime,
            barberId: block.idBarbero,
            conflictingAlias: previous.alias || 'Integrante',
          });
          notifications.warning('Hay integrantes con el mismo barbero, fecha y hora. Debes cambiar uno de ellos.', {
            dedupeKey: 'public-booking-submit-duplicate-slot',
          });
          setActiveBlockIndex(block.index);
          navigate('/agendar/agenda');
          await loadSlotSuggestions({
            barberId: block.idBarbero,
            dateKey: block.selectedDate,
            timeKey: block.selectedTime,
            servicesCsvValue: block.serviceIds.join(','),
          });
          return false;
        }
        selectedSlotMap.set(collisionKey, block);
        resolvedBarberByBlockId.set(block.id, block.idBarbero);
      } else {
        resolvedBarberByBlockId.set(block.id, null);
        if (block.index > 0) autoAssignedCompanion = true;
      }
    }
    if (autoAssignedCompanion) {
      notifications.info('Uno o más acompañantes serán asignados automáticamente con barbero disponible en ese horario.', {
        dedupeKey: 'public-booking-autoassign-companion-info',
      });
    }
    const integrantes = [];
    for (const block of blocksToSubmit) {
      const fechaInicio = toLocalDateTimeWithOffset(block.selectedDate, block.selectedTime);
      if (!fechaInicio) {
        notifications.error('No se pudo construir la fecha y hora de una de las citas del grupo.', {
          dedupeKey: 'public-booking-datetime-invalid',
        });
        return false;
      }
      integrantes.push({
        orden_integrante: block.index + 1,
        alias: block.contactName || block.alias,
        id_barbero: resolvedBarberByBlockId.has(block.id)
          ? resolvedBarberByBlockId.get(block.id)
          : (block.idBarbero || null),
        contacto: {
          nombre: String(block.contactName || block.alias || '').trim(),
          email: String(block.contactEmail || '').trim().toLowerCase() || null,
          telefono: String(block.contactPhone || '').trim() || null,
        },
        fecha_inicio: fechaInicio,
        servicios: block.selectedServices.map((service) => ({
          id_servicio: service.id_servicio,
        })),
      });
    }
    setHoldSubmitting(true);
    try {
      const response = await createPublicCitaHold({
        id_sucursal: selectedBranchId,
        titular: {
          nombre: titularNombre,
          email: titularEmail,
          telefono: titularTelefono || null,
        },
        integrantes,
      });
      const payload = response?.data ?? response;
      setHoldResult(payload);
      notifications.success('Reserva creada correctamente.', { dedupeKey: 'public-booking-hold-success' });
      return true;
    } catch (err) {
      if (err?.status === 409) {
        notifications.warning(
          'La hora seleccionada ya no está disponible. Selecciona una hora distinta para continuar.',
          { dedupeKey: 'public-booking-hold-conflict' }
        );
        updateBlockAtIndex(effectiveActiveBlockIndex, (currentBlock) => ({
          ...currentBlock,
          selectedTime: '',
        }));
        navigate('/agendar/agenda');
        void fetchSlots();
        void fetchAvailability();
      } else {
        notifications.error(extractMessage(err), { dedupeKey: 'public-booking-hold-error' });
      }
      return false;
    } finally {
      setHoldSubmitting(false);
    }
  }, [
    allBlocksComplete,
    bookingBlocks,
    bookingBlocksSummary,
    effectiveActiveBlockIndex,
    fetchAvailability,
    fetchSlots,
    holdExpired,
    isPastSlotForToday,
    loadSlotSuggestions,
    navigate,
    notifications,
    selectedBarberId,
    selectedBranchId,
    updateBlockAtIndex,
  ]);

  const contextValue = useMemo(
    () => ({
      mode: 'public',
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
      completeBookingFlow,
      holdDurationMin,
      holdExpiresAtIso,
      holdRemainingMs,
      holdExpired,
      holdResult,
      holdSubmitting,
      isPastSlotForToday,
      maxCompanions: MAX_COMPANIONS,
      minBookingDateKey,
      monthRange,
      onSelectDay,
      onSelectTime,
      paymentRequired,
      simulationNoPayment,
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
      updateActiveBlockContact,
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
      goToAgenda,
      goToBarberos,
      goToConfirm,
      completeBookingFlow,
      holdDurationMin,
      holdExpiresAtIso,
      holdRemainingMs,
      holdExpired,
      holdResult,
      holdSubmitting,
      isPastSlotForToday,
      minBookingDateKey,
      monthRange,
      onSelectDay,
      onSelectTime,
      paymentRequired,
      simulationNoPayment,
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
      updateActiveBlockContact,
      selectBarber,
      selectBranch,
      fetchAvailability,
    ]
  );

  if (location.pathname === '/agendar') {
    return <Navigate to="/agendar/barberos" replace />;
  }

  const showTopbarBackToBarberos = location.pathname.startsWith('/agendar/agenda');
  const isClienteSession = isAuthenticated && Array.isArray(roles) && roles.includes('cliente');
  const homePath = isClienteSession ? '/home/cliente' : '/';
  const homeLabel = isClienteSession ? 'Inicio cliente' : 'Inicio';

  return (
    <div className="public-booking-page mf-page-gradient min-h-screen">
      <div className="public-booking-shell">
        <header className="public-booking-topbar">
          <div className="public-booking-topbar-left">
            <Link to={homePath} className="public-booking-home">
              <House size={16} />
              <span>{homeLabel}</span>
            </Link>
            {isClienteSession ? (
              <Button
                variant="outline"
                size="sm"
                className="public-booking-topbar-back gap-2"
                onClick={() => navigate('/home/cliente')}
              >
                <ArrowLeft size={15} />
                Volver al inicio
              </Button>
            ) : null}
            {showTopbarBackToBarberos ? (
              <Button
                variant="outline"
                size="sm"
                className="public-booking-topbar-back gap-2"
                onClick={goToBarberos}
              >
                <ArrowLeft size={15} />
                Volver a barberos
              </Button>
            ) : null}
          </div>
          <ThemeSwitcher />
        </header>

        {contextLoading ? (
          <div className="public-booking-loading">
            <LoadingSpinner />
          </div>
        ) : null}

        {contextError ? (
          <div className="public-booking-error">
            <ErrorBanner message={contextError} onRetry={fetchContext} />
          </div>
        ) : null}

        {!contextLoading && !contextError ? (
          <main className="mf-page citas-page public-booking-main">
            <PublicBookingProvider value={contextValue}>
              <Outlet />
            </PublicBookingProvider>
          </main>
        ) : null}
      </div>
    </div>
  );
}


