import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { House } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
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
  extractMessage,
  normalizePhone,
  toDateKey,
  toLocalDateTimeWithOffset,
} from './bookingUtils.js';
import '../../admin/pages/AdminCitasPage.css';
import './PublicBookingFlow.css';

const EMPTY_CONTEXT = {
  sucursales: [],
  parametros: {},
};

const EMPTY_CLIENT_FORM = {
  nombre: '',
  telefono: '',
  email: '',
  notas: '',
};

const PublicBookingContext = createContext(null);

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

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
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

  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [contextData, setContextData] = useState(EMPTY_CONTEXT);

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [barbersLoading, setBarbersLoading] = useState(false);
  const [barbers, setBarbers] = useState([]);
  const [selectedBarberId, setSelectedBarberId] = useState('');

  const [servicesLoading, setServicesLoading] = useState(false);
  const [services, setServices] = useState([]);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slots, setSlots] = useState(() => buildDefaultSlots());

  const [serviceIds, setServiceIds] = useState([]);
  const [companionsCount, setCompanionsCount] = useState(0);
  const [companionServiceIds, setCompanionServiceIds] = useState([]);

  const [clientForm, setClientForm] = useState(EMPTY_CLIENT_FORM);
  const [holdSubmitting, setHoldSubmitting] = useState(false);
  const [holdResult, setHoldResult] = useState(null);

  const availabilityAbortRef = useRef(null);
  const slotsAbortRef = useRef(null);
  const branchDataRequestSeqRef = useRef(0);
  const availabilityRequestSeqRef = useRef(0);
  const slotsRequestSeqRef = useRef(0);
  const availabilityCacheRef = useRef(new Map());
  const slotsCacheRef = useRef(new Map());
  const servicesScrollRef = useRef(null);
  const [servicesCanScroll, setServicesCanScroll] = useState(false);
  const [servicesAtEnd, setServicesAtEnd] = useState(true);

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

  const selectedBarber = useMemo(
    () => barbers.find((barber) => barber.id_empleado === selectedBarberId) || null,
    [barbers, selectedBarberId]
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

  const companionItems = useMemo(
    () =>
      companionServiceIds
        .slice(0, companionsCount)
        .map((id_servicio, index) => ({
          index,
          id_servicio: id_servicio || '',
          servicio: id_servicio ? servicesById.get(id_servicio) || null : null,
        })),
    [companionServiceIds, companionsCount, servicesById]
  );

  const serviceSelectionComplete = useMemo(() => {
    if (selectedServices.length === 0) return false;
    if (!allowCompanions) return true;
    if (companionsCount === 0) return true;
    return companionItems.every((item) => Boolean(item.id_servicio));
  }, [allowCompanions, companionItems, companionsCount, selectedServices.length]);

  const allSelectedServiceIds = useMemo(() => {
    return [
      ...selectedServices.map((item) => item.id_servicio),
      ...companionItems.map((item) => item.id_servicio).filter(Boolean),
    ];
  }, [companionItems, selectedServices]);

  const servicesCsv = useMemo(() => allSelectedServiceIds.join(','), [allSelectedServiceIds]);

  const totalToPay = useMemo(() => {
    const mainTotal = selectedServices.reduce((total, service) => total + Number(service?.precio_hnl || 0), 0);
    const companionsTotal = companionItems.reduce(
      (total, item) => total + Number(item?.servicio?.precio_hnl || 0),
      0
    );
    return mainTotal + companionsTotal;
  }, [companionItems, selectedServices]);

  const monthRange = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const from = toDateKey(new Date(year, month, 1));
    const to = toDateKey(new Date(year, month + 1, 0));
    return { from, to };
  }, [currentMonth]);

  const showBlockingAvailabilityLoader = availabilityLoading && Object.keys(availabilityMap).length === 0;

  const clearRequestState = useCallback(() => {
    if (availabilityAbortRef.current) availabilityAbortRef.current.abort();
    if (slotsAbortRef.current) slotsAbortRef.current.abort();
    availabilityCacheRef.current.clear();
    slotsCacheRef.current.clear();
    setAvailabilityMap({});
    setSlots(buildDefaultSlots());
    setAvailabilityError('');
    setSelectedDate('');
    setSelectedTime('');
  }, []);

  const resetFlowForBranchChange = useCallback(() => {
    setSelectedBarberId('');
    setServiceIds([]);
    setCompanionsCount(0);
    setCompanionServiceIds([]);
    setClientForm(EMPTY_CLIENT_FORM);
    setHoldResult(null);
    clearRequestState();
  }, [clearRequestState]);

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

      setBarbers(nextBarbers);
      setServices(nextServices);
      setSelectedBarberId((prev) =>
        nextBarbers.some((barber) => barber.id_empleado === prev) ? prev : nextBarbers[0]?.id_empleado || ''
      );
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
    if (!selectedBranchId || !selectedBarberId || !servicesCsv) {
      setAvailabilityMap({});
      setAvailabilityLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, selectedBarberId, servicesCsv, monthRange.from, monthRange.to].join('|');
    const cached = availabilityCacheRef.current.get(cacheKey);
    if (cached) {
      setAvailabilityMap(cached);
      setAvailabilityError('');
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
          id_barbero: selectedBarberId,
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

      if (selectedDate && !nextMap[selectedDate]?.disponible) {
        setSelectedDate('');
        setSelectedTime('');
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
  }, [monthRange.from, monthRange.to, selectedBarberId, selectedBranchId, selectedDate, servicesCsv]);

  const fetchSlots = useCallback(async () => {
    if (!selectedBranchId || !selectedBarberId || !servicesCsv || !selectedDate) {
      setSlots(buildDefaultSlots());
      setSlotsLoading(false);
      return;
    }

    const cacheKey = [selectedBranchId, selectedBarberId, servicesCsv, selectedDate].join('|');
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
          id_barbero: selectedBarberId,
          servicios: servicesCsv,
          fecha: selectedDate,
        },
        { signal: controller.signal }
      );

      if (requestSeq !== slotsRequestSeqRef.current) return;

      const payload = response?.data ?? response;
      const list = Array.isArray(payload?.horarios) ? payload.horarios : [];
      const availableTimes = new Set(list.map((slot) => slot?.hora).filter(Boolean));
      const mapped = ALL_TIME_SLOTS.map((hora) => ({
        hora,
        disponible: availableTimes.has(hora),
      }));

      slotsCacheRef.current.set(cacheKey, mapped);
      setSlots(mapped);

      if (selectedTime && !availableTimes.has(selectedTime)) {
        setSelectedTime('');
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
  }, [notifications, selectedBarberId, selectedBranchId, selectedDate, selectedTime, servicesCsv]);

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
    if (allowCompanions) return;
    if (companionsCount === 0 && companionServiceIds.length === 0) return;
    setCompanionsCount(0);
    setCompanionServiceIds([]);
  }, [allowCompanions, companionServiceIds.length, companionsCount]);

  useEffect(() => {
    setCompanionServiceIds((prev) => {
      const nextLength = Math.min(Math.max(companionsCount, 0), MAX_COMPANIONS);
      if (prev.length === nextLength) return prev;
      if (prev.length > nextLength) return prev.slice(0, nextLength);
      return [...prev, ...Array.from({ length: nextLength - prev.length }, () => '')];
    });
  }, [companionsCount]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/confirmar')) return;
    if (!selectedBranchId || !selectedBarberId) {
      navigate('/agendar/barberos', { replace: true });
      return;
    }
    if (!serviceSelectionComplete || !selectedDate || !selectedTime) {
      navigate('/agendar/agenda', { replace: true });
    }
  }, [
    location.pathname,
    navigate,
    selectedBranchId,
    selectedBarberId,
    selectedDate,
    selectedTime,
    serviceSelectionComplete,
  ]);

  useEffect(() => {
    if (!location.pathname.startsWith('/agendar/agenda')) return;
    if (!selectedBranchId || !selectedBarberId) {
      navigate('/agendar/barberos', { replace: true });
    }
  }, [location.pathname, navigate, selectedBarberId, selectedBranchId]);

  useEffect(() => {
    setHoldResult(null);
  }, [selectedBranchId, selectedBarberId, servicesCsv, selectedDate, selectedTime]);

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
    setSelectedBarberId(barberId);
    clearRequestState();
  }, [clearRequestState]);

  const goToAgenda = useCallback(() => {
    if (!selectedBranchId || !selectedBarberId) return;
    navigate('/agendar/agenda');
  }, [navigate, selectedBarberId, selectedBranchId]);

  const goToBarberos = useCallback(() => {
    navigate('/agendar/barberos');
  }, [navigate]);

  const goToConfirm = useCallback(() => {
    if (!serviceSelectionComplete || !selectedDate || !selectedTime) return;
    navigate('/agendar/confirmar');
  }, [navigate, selectedDate, selectedTime, serviceSelectionComplete]);

  const toggleService = useCallback((serviceId) => {
    setServiceIds((prev) => (prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]));
    setSelectedTime('');
  }, []);

  const updateCompanionService = useCallback((index, value) => {
    setCompanionServiceIds((prev) => prev.map((item, idx) => (idx === index ? value : item)));
    setSelectedTime('');
  }, []);

  const updateCompanionsCount = useCallback((value) => {
    const parsed = Number(value);
    const clamped = Math.max(0, Math.min(MAX_COMPANIONS, Number.isFinite(parsed) ? parsed : 0));
    setCompanionsCount(clamped);
  }, []);

  const setMonth = useCallback((delta) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setSelectedDate('');
    setSelectedTime('');
    setSlots(buildDefaultSlots());
  }, []);

  const onSelectDay = useCallback((dateKey, enabled) => {
    if (!enabled) return;
    setSelectedDate(dateKey);
    setSelectedTime('');
  }, []);

  const onSelectTime = useCallback((time, enabled) => {
    if (!enabled) return;
    setSelectedTime(time);
  }, []);

  const updateClientField = useCallback((field, value) => {
    setClientForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const submitHold = useCallback(async () => {
    if (!selectedBranchId || !selectedBarberId) {
      notifications.warning('Debes seleccionar sucursal y barbero.', { dedupeKey: 'public-booking-hold-context' });
      navigate('/agendar/barberos');
      return false;
    }
    if (!serviceSelectionComplete) {
      notifications.warning('Debes seleccionar los servicios antes de confirmar.', { dedupeKey: 'public-booking-services-required' });
      navigate('/agendar/agenda');
      return false;
    }
    if (!selectedDate || !selectedTime) {
      notifications.warning('Debes seleccionar fecha y hora para continuar.', { dedupeKey: 'public-booking-datetime-required' });
      navigate('/agendar/agenda');
      return false;
    }
    if (!clientForm.nombre.trim()) {
      notifications.warning('Ingresa el nombre del cliente.', { dedupeKey: 'public-booking-name-required' });
      return false;
    }
    if (normalizePhone(clientForm.telefono).length < 8) {
      notifications.warning('Ingresa un telefono valido.', { dedupeKey: 'public-booking-phone-required' });
      return false;
    }
    if (!isEmailValid(clientForm.email)) {
      notifications.warning('Ingresa un correo valido.', { dedupeKey: 'public-booking-email-required' });
      return false;
    }

    const fechaInicio = toLocalDateTimeWithOffset(selectedDate, selectedTime);
    if (!fechaInicio) {
      notifications.error('No se pudo construir la fecha y hora de la reserva.', { dedupeKey: 'public-booking-datetime-invalid' });
      return false;
    }

    setHoldSubmitting(true);
    try {
      const response = await createPublicCitaHold({
        id_sucursal: selectedBranchId,
        id_barbero: selectedBarberId,
        fecha_inicio: fechaInicio,
        servicios: allSelectedServiceIds.map((id_servicio) => ({ id_servicio })),
        cliente: {
          nombre: clientForm.nombre.trim(),
          telefono: normalizePhone(clientForm.telefono),
          email: clientForm.email.trim().toLowerCase(),
        },
        notas: clientForm.notas?.trim() ? clientForm.notas.trim() : null,
      });

      const payload = response?.data ?? response;
      setHoldResult(payload);
      notifications.success('Reserva creada correctamente.', { dedupeKey: 'public-booking-hold-success' });
      return true;
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'public-booking-hold-error' });
      if (err?.status === 409) {
        setSelectedTime('');
        void fetchSlots();
        void fetchAvailability();
      }
      return false;
    } finally {
      setHoldSubmitting(false);
    }
  }, [
    allSelectedServiceIds,
    clientForm.email,
    clientForm.nombre,
    clientForm.notas,
    clientForm.telefono,
    fetchAvailability,
    fetchSlots,
    navigate,
    notifications,
    selectedBarberId,
    selectedBranchId,
    selectedDate,
    selectedTime,
    serviceSelectionComplete,
  ]);

  const contextValue = useMemo(
    () => ({
      allowCompanions,
      availabilityError,
      availabilityLoading,
      availabilityMap,
      barbers,
      barbersLoading,
      branchList,
      clientForm,
      companionItems,
      companionServiceIds,
      companionsCount,
      contextData,
      currentMonth,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      holdDurationMin,
      holdResult,
      holdSubmitting,
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
      serviceSelectionComplete,
      services,
      servicesCanScroll,
      servicesLoading,
      servicesScrollRef,
      servicesAtEnd,
      showBlockingAvailabilityLoader,
      slots,
      slotsLoading,
      submitHold,
      syncServicesScrollState,
      toggleService,
      totalToPay,
      updateClientField,
      updateCompanionService,
      updateCompanionsCount,
      selectBarber,
      selectBranch,
      setMonth,
      fetchAvailability,
    }),
    [
      allowCompanions,
      availabilityError,
      availabilityLoading,
      availabilityMap,
      barbers,
      barbersLoading,
      branchList,
      clientForm,
      companionItems,
      companionServiceIds,
      companionsCount,
      contextData,
      currentMonth,
      goToAgenda,
      goToBarberos,
      goToConfirm,
      holdDurationMin,
      holdResult,
      holdSubmitting,
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
      serviceSelectionComplete,
      services,
      servicesAtEnd,
      servicesCanScroll,
      servicesLoading,
      showBlockingAvailabilityLoader,
      slots,
      slotsLoading,
      submitHold,
      syncServicesScrollState,
      toggleService,
      totalToPay,
      updateClientField,
      updateCompanionService,
      updateCompanionsCount,
      selectBarber,
      selectBranch,
      setMonth,
      fetchAvailability,
    ]
  );

  if (location.pathname === '/agendar') {
    return <Navigate to="/agendar/barberos" replace />;
  }

  return (
    <div className="public-booking-page mf-page-gradient min-h-screen">
      <div className="public-booking-shell">
        <header className="public-booking-topbar">
          <Link to="/" className="public-booking-home">
            <House size={16} />
            <span>Inicio</span>
          </Link>
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
            <PublicBookingContext.Provider value={contextValue}>
              <Outlet />
            </PublicBookingContext.Provider>
          </main>
        ) : null}
      </div>
    </div>
  );
}
