import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Armchair,
  CalendarCheck2,
  CalendarClock,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.jsx';
import ViewToggle from '../../../components/data/ViewToggle.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
  getAdminCitasOperativasContexto,
  listAdminCitasAfectadasReagendacion,
  listAdminCitasOperativas,
  listPublicAgendaHorarios,
  postAdminCitaFinalizarAtencion,
  postAdminCitaIniciarAtencion,
  postAdminCitaRegistrarLlegada,
  postAdminCitaReagendarEmergencia,
  postAdminCitasReagendarEmergenciaLote,
} from '../lib/adminCitasApi.js';
import { buildTimeSlots } from '../../public/booking/bookingUtils.js';
import { isAbortError } from '../../../services/httpClient.js';

const FILTER_DEFAULTS = {
  idSucursal: 'all',
  idBarbero: 'all',
  fechaDesde: '',
  fechaHasta: '',
};

const LIVE_REFRESH_DEBOUNCE_MS = 180;
const AGENDAMIENTO_SELECTED_SUCURSAL_KEY = 'masterfade.admin.agendamiento.selectedSucursalId';

const STATE_LABELS = {
  en_espera: 'En espera',
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  en_salon: 'En salón',
  en_atencion: 'En atención',
  completada: 'Completada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  no_show: 'No show',
  anulada: 'Anulada',
};

const CONTAINER_META = {
  confirmada: { title: 'Confirmadas', subtitle: 'Pendientes de llegada al salón', accent: 'text-sky-300', border: 'border-sky-400/30', surface: 'bg-[color:color-mix(in_srgb,var(--mf-card)_88%,rgba(56,189,248,0.08))]' },
  en_salon: { title: 'En salón', subtitle: 'Cliente llegó, pendiente de iniciar atención', accent: 'text-amber-300', border: 'border-amber-400/30', surface: 'bg-[color:color-mix(in_srgb,var(--mf-card)_88%,rgba(245,158,11,0.08))]' },
  en_atencion: { title: 'En atención', subtitle: 'Servicio iniciado por el barbero', accent: 'text-indigo-300', border: 'border-indigo-400/30', surface: 'bg-[color:color-mix(in_srgb,var(--mf-card)_88%,rgba(99,102,241,0.11))]' },
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function mapAdminCitasErrorMessage(err, fallback = 'No fue posible cargar la información de la cita.') {
  const code = String(err?.data?.error?.code || '').trim().toUpperCase();
  const rawMessage = String(extractMessage(err) || '').toLowerCase();
  if (code === 'BOOKING_NOT_FOUND') return 'La cita solicitada no existe.';
  if (code === 'BOOKING_GROUP_NOT_FOUND') return 'No se encontró la reserva solicitada.';
  if (code === 'BOOKING_DETAIL_LOAD_FAILED') return 'No fue posible cargar el detalle de la cita.';
  if (code === 'BOOKING_RECEIPT_NOT_FOUND') return 'No se encontró comprobante para esta reserva.';
  if (code === 'BOOKING_ADMIN_QUERY_FAILED') return 'No fue posible consultar la información de citas.';
  if (code === 'SLOT_NOT_AVAILABLE') return 'El horario seleccionado ya no está disponible.';
  if (code === 'EMAIL_BELONGS_TO_ACTIVE_USER') return 'El correo ingresado pertenece a una cuenta activa.';
  if (code === 'MEMBERSHIP_BRANCH_MISMATCH' || rawMessage.includes('membresía activa no corresponde a la sucursal de la cita')) {
    return 'No se puede completar la acción porque la cita no corresponde a la sucursal operativa seleccionada.';
  }
  return extractMessage(err) || fallback;
}

function extractSafeEstadoMessage(err) {
  const code = String(err?.data?.error?.code || '').trim();
  const rawMessage = String(extractMessage(err) || '').toLowerCase();
  if (code === 'ADMIN_CITAS_STATUS_WINDOW_NOT_OPEN') {
    return 'La cita aún no está disponible para marcarse en este estado.';
  }
  if (code === 'ADMIN_CITAS_STATUS_TRANSITION_INVALID') {
    return 'El cambio de estado solicitado no está disponible para esta cita.';
  }
  if (code === 'ADMIN_CITAS_STATUS_START_INVALID') {
    return 'La cita no se puede actualizar en este momento.';
  }
  if (code === 'ADMIN_CITAS_ARRIVAL_STATE_INVALID') {
    return 'La cita no está en estado confirmada para registrar llegada.';
  }
  if (code === 'ADMIN_CITAS_START_ATTENTION_STATE_INVALID') {
    return 'La cita debe estar en salón para iniciar atención.';
  }
  if (code === 'ADMIN_CITAS_FINISH_ATTENTION_STATE_INVALID') {
    return 'La cita debe estar en atención para finalizar.';
  }
  if (rawMessage.includes('membresía activa no corresponde a la sucursal de la cita')) {
    return 'No se puede completar la acción porque la cita no corresponde a la sucursal operativa seleccionada.';
  }
  return extractMessage(err);
}

function toInputDateTime(isoValue) {
  const parsed = new Date(isoValue || '');
  if (Number.isNaN(parsed.getTime())) return '';
  const adjusted = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}

function toIsoDateTime(localValue) {
  const parsed = new Date(String(localValue || '').trim());
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function formatDateTime(isoValue) {
  const parsed = new Date(isoValue || '');
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(parsed);
}

function toDateKey(isoValue) {
  const parsed = new Date(isoValue || '');
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildSlotsForPicker(payload) {
  const horarios = Array.isArray(payload?.horarios) ? payload.horarios : [];
  const available = new Set(horarios.map((item) => String(item?.hora || '').slice(0, 5)).filter(Boolean));
  const fallbackStart = String(payload?.hora_inicio || '08:00').slice(0, 5);
  const fallbackEnd = String(payload?.hora_fin || '18:30').slice(0, 5);
  const timeline = buildTimeSlots(fallbackStart, fallbackEnd);
  return timeline.map((hora) => ({
    hora,
    disponible: available.has(hora),
  }));
}

function formatCurrencyHnl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'L 0.00';
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' }).format(amount);
}

function getSelectionTypeLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'package') return 'Paquete';
  if (normalized === 'mixed') return 'Mixta';
  return 'Servicios';
}

function getAppointmentDisplayInfo(cita) {
  const integrante = cita?.integrante || null;
  const titular = cita?.titular || null;
  const alias = String(
    integrante?.alias_integrante
    || integrante?.nombre_snapshot
    || cita?.alias_integrante
    || ''
  ).trim() || 'Titular';
  const titularNombre = String(
    titular?.nombre_snapshot
    || cita?.nombre_cliente
    || ''
  ).trim() || 'Cliente';
  const paqueteNombre = String(
    cita?.paquete?.nombre_paquete_snapshot
    || cita?.paquete?.nombre_paquete
    || ''
  ).trim() || null;
  const serviciosManual = Array.isArray(cita?.servicios_manual) ? cita.servicios_manual : [];
  const serviciosExtra = Array.isArray(cita?.servicios_extra) ? cita.servicios_extra : [];
  const serviciosIncluidos = Array.isArray(cita?.servicios_incluidos) ? cita.servicios_incluidos : [];
  const promociones = Array.isArray(cita?.promociones) ? cita.promociones : [];
  const descuentoPromociones = promociones.reduce((acc, item) => acc + Number(item?.descuento_hnl || 0), 0);
  const comprobante = cita?.comprobante || null;

  return {
    aliasIntegrante: alias,
    titularNombre,
    selectionLabel: getSelectionTypeLabel(cita?.selection_type),
    paqueteNombre,
    serviciosManualCount: serviciosManual.length,
    serviciosExtraCount: serviciosExtra.length,
    serviciosIncluidosCount: serviciosIncluidos.length,
    promocionesCount: promociones.length,
    descuentoPromociones,
    comprobanteCodigo: comprobante?.codigo_comprobante || null,
    comprobanteEstado: comprobante?.estado_comprobante_codigo || null,
    serviciosManual,
    serviciosExtra,
    serviciosIncluidos,
  };
}

function getServicioNombre(item) {
  if (!item) return '';
  if (typeof item === 'string') return item.trim();
  if (typeof item !== 'object') return '';
  return String(
    item?.nombre_servicio_snapshot
    || item?.nombre_servicio
    || item?.servicio_nombre
    || item?.nombre
    || ''
  ).trim();
}

function getServiciosLegibles(cita) {
  const serviciosManual = Array.isArray(cita?.servicios_manual) ? cita.servicios_manual : [];
  const serviciosIncluidos = Array.isArray(cita?.servicios_incluidos) ? cita.servicios_incluidos : [];
  const serviciosExtra = Array.isArray(cita?.servicios_extra) ? cita.servicios_extra : [];
  const servicios = [...serviciosManual, ...serviciosIncluidos, ...serviciosExtra];
  const nombres = servicios.map(getServicioNombre).filter(Boolean);
  return [...new Set(nombres)];
}

function getServicioResumen(cita) {
  const servicios = getServiciosLegibles(cita);
  if (!servicios.length) return 'Sin servicios registrados';
  if (servicios.length === 1) return servicios[0];
  return `${servicios[0]} + ${servicios.length - 1} más`;
}

function getStateBadgeClass(state) {
  const normalized = String(state || '').toLowerCase();
  if (['confirmada', 'en_salon', 'en_atencion', 'completada'].includes(normalized)) return 'mf-badge mf-badge-green';
  if (['en_espera', 'pendiente_pago'].includes(normalized)) return 'mf-badge mf-badge-gold';
  if (['cancelada', 'expirada', 'no_show', 'anulada'].includes(normalized)) return 'mf-badge mf-badge-red';
  return 'mf-badge mf-badge-muted';
}

function getOperationLabel(operationCode) {
  const normalized = String(operationCode || '').trim().toLowerCase();
  if (normalized === 'registrar_llegada') return 'Registrar llegada';
  if (normalized === 'iniciar_atencion') return 'Iniciar atención';
  if (normalized === 'finalizar_atencion') return 'Finalizar atención';
  return operationCode || '';
}

function buildFilterParams(filters, search) {
  const params = {};
  if (filters.idSucursal !== 'all') params.id_sucursal = filters.idSucursal;
  if (filters.idBarbero !== 'all') params.id_empleado_barbero = filters.idBarbero;
  if (filters.fechaDesde) params.fecha_desde = filters.fechaDesde;
  if (filters.fechaHasta) params.fecha_hasta = filters.fechaHasta;
  if (search.trim()) params.q = search.trim();
  return params;
}

function toTimestamp(value) {
  const parsed = new Date(value || '');
  const ts = parsed.getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function compareOperationalByProximity(a, b, nowMs) {
  const aMs = toTimestamp(a?.inicio_at);
  const bMs = toTimestamp(b?.inicio_at);
  const aDiff = aMs - nowMs;
  const bDiff = bMs - nowMs;
  const aIsUpcoming = aDiff >= 0;
  const bIsUpcoming = bDiff >= 0;

  if (aIsUpcoming !== bIsUpcoming) return aIsUpcoming ? -1 : 1;
  if (aIsUpcoming && bIsUpcoming) return aDiff - bDiff;
  return bDiff - aDiff;
}

function joinEventUrl(baseUrl, path) {
  const base = String(baseUrl || '').trim();
  const p = String(path || '').trim();
  if (!base) return p;
  if (!p) return base;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  const baseClean = base.replace(/\/+$/, '');
  const pathClean = p.startsWith('/') ? p : `/${p}`;
  return `${baseClean}${pathClean}`;
}

function buildOperationalEventsUrl(idSucursal) {
  const query = new URLSearchParams({ id_sucursal: idSucursal });
  return joinEventUrl(import.meta.env.VITE_API_URL, `/v1/admin/citas/operativas/events?${query.toString()}`);
}

export default function AdminAgendamientoCitasPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { roles, isAuthenticated, invalidateSession } = useAuth();

  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [context, setContext] = useState({ sucursales: [], barberos: [] });

  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [citas, setCitas] = useState([]);
  const [view, setView] = useState(() => {
    try {
      const value = localStorage.getItem('mf-view-agendamiento-citas');
      return value === 'table' || value === 'cards' ? value : 'cards';
    } catch {
      return 'cards';
    }
  });
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [selectedSucursalId, setSelectedSucursalId] = useState('');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState('idle');

  const [stateDialog, setStateDialog] = useState({ open: false, cita: null, estadoDestino: '' });
  const [stateActionLoadingId, setStateActionLoadingId] = useState('');

  const [singleDialogOpen, setSingleDialogOpen] = useState(false);
  const [singleTarget, setSingleTarget] = useState(null);
  const [singleForm, setSingleForm] = useState({ fecha_inicio_nueva: '', id_empleado_barbero_nuevo: '', motivo: '' });
  const [singleSaving, setSingleSaving] = useState(false);
  const [singlePickerDate, setSinglePickerDate] = useState('');
  const [singlePickerLoading, setSinglePickerLoading] = useState(false);
  const [singlePickerSlots, setSinglePickerSlots] = useState([]);
  const [singlePickerOpen, setSinglePickerOpen] = useState(false);

  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchForm, setBatchForm] = useState({ id_empleado_barbero: '', fecha: '', motivo: '' });
  const [batchItems, setBatchItems] = useState([]);
  const [batchPickerLoadingId, setBatchPickerLoadingId] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activeMobileContainer, setActiveMobileContainer] = useState('confirmada');
  const fetchInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const fetchCitasRef = useRef(null);
  const liveRefreshTimeoutRef = useRef(null);

  const sucursales = useMemo(
    () => (Array.isArray(context?.sucursales) ? context.sucursales : []),
    [context?.sucursales]
  );
  const barberos = useMemo(
    () => (Array.isArray(context?.barberos) ? context.barberos : []),
    [context?.barberos]
  );
  const selectedSucursal = useMemo(
    () => sucursales.find((item) => item?.id_sucursal === selectedSucursalId) || null,
    [selectedSucursalId, sucursales]
  );
  const hasMultipleSucursales = sucursales.length > 1;
  const requiresSucursalSelection = hasMultipleSucursales && !selectedSucursalId;
  const canOperateWithSucursal = !hasMultipleSucursales || Boolean(selectedSucursalId);
  const isInitialPageLoading = contextLoading || (loading && citas.length === 0 && !listError);
  const canRenderCitasContent = !isInitialPageLoading && !contextError && !listError && canOperateWithSucursal;
  const liveStatusLabel = useMemo(() => {
    if (!isAuthenticated || !canOperateWithSucursal) return '';
    if (liveStatus === 'connected') return 'Conectado en vivo';
    if (liveStatus === 'connecting') return 'Conectando en vivo';
    if (liveStatus === 'reconnecting') return 'Reconectando';
    if (liveStatus === 'manual') return 'Actualización manual disponible';
    return '';
  }, [canOperateWithSucursal, isAuthenticated, liveStatus]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNowMs(Date.now()), 30000);
    return () => window.clearInterval(timerId);
  }, []);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== 'all' && value !== '').length + (search.trim() ? 1 : 0),
    [filters, search]
  );

  const citasConfirmadas = useMemo(
    () => citas
      .filter((item) => String(item?.estado_cita_codigo || '').toLowerCase() === 'confirmada')
      .sort((a, b) => compareOperationalByProximity(a, b, nowMs)),
    [citas, nowMs]
  );
  const citasEnSalon = useMemo(
    () => citas
      .filter((item) => String(item?.estado_cita_codigo || '').toLowerCase() === 'en_salon')
      .sort((a, b) => compareOperationalByProximity(a, b, nowMs)),
    [citas, nowMs]
  );
  const citasEnAtencion = useMemo(
    () => citas
      .filter((item) => String(item?.estado_cita_codigo || '').toLowerCase() === 'en_atencion')
      .sort((a, b) => compareOperationalByProximity(a, b, nowMs)),
    [citas, nowMs]
  );
  const containerItemsByKey = useMemo(
    () => ({
      confirmada: citasConfirmadas,
      en_salon: citasEnSalon,
      en_atencion: citasEnAtencion,
    }),
    [citasConfirmadas, citasEnAtencion, citasEnSalon]
  );
  const mobileTabs = useMemo(
    () => ([
      { key: 'confirmada', label: 'Confirmadas', accent: 'text-sky-300', count: citasConfirmadas.length },
      { key: 'en_salon', label: 'En salón', accent: 'text-amber-300', count: citasEnSalon.length },
      { key: 'en_atencion', label: 'En atención', accent: 'text-indigo-300', count: citasEnAtencion.length },
    ]),
    [citasConfirmadas.length, citasEnAtencion.length, citasEnSalon.length]
  );
  const activeMobileItems = containerItemsByKey[activeMobileContainer] || [];

  useEffect(() => {
    const activeExists = mobileTabs.some((tab) => tab.key === activeMobileContainer);
    if (activeExists) return;
    const fallbackKey = mobileTabs[0]?.key || 'confirmada';
    setActiveMobileContainer(fallbackKey);
  }, [activeMobileContainer, mobileTabs]);

  useEffect(() => {
    if (!sucursales.length) return;
    const allowedIds = new Set(sucursales.map((item) => item.id_sucursal));
    if (sucursales.length === 1) {
      const onlyId = sucursales[0].id_sucursal;
      setSelectedSucursalId((prev) => (prev === onlyId ? prev : onlyId));
      setFilters((prev) => (prev.idSucursal === onlyId ? prev : { ...prev, idSucursal: onlyId }));
      try {
        localStorage.setItem(AGENDAMIENTO_SELECTED_SUCURSAL_KEY, onlyId);
      } catch {
        // ignore localStorage errors
      }
      return;
    }

    let storedId = '';
    try {
      storedId = String(localStorage.getItem(AGENDAMIENTO_SELECTED_SUCURSAL_KEY) || '').trim();
    } catch {
      storedId = '';
    }
    const currentValid = selectedSucursalId && allowedIds.has(selectedSucursalId) ? selectedSucursalId : '';
    const nextId = currentValid || (storedId && allowedIds.has(storedId) ? storedId : '');
    if (nextId) {
      setSelectedSucursalId((prev) => (prev === nextId ? prev : nextId));
      setFilters((prev) => (prev.idSucursal === nextId ? prev : { ...prev, idSucursal: nextId }));
      try {
        localStorage.setItem(AGENDAMIENTO_SELECTED_SUCURSAL_KEY, nextId);
      } catch {
        // ignore localStorage errors
      }
      return;
    }

    setSelectedSucursalId('');
    setFilters((prev) => (prev.idSucursal === 'all' ? prev : { ...prev, idSucursal: 'all' }));
    setCitas([]);
    try {
      localStorage.removeItem(AGENDAMIENTO_SELECTED_SUCURSAL_KEY);
    } catch {
      // ignore localStorage errors
    }
  }, [selectedSucursalId, sucursales]);

  const hiddenOperationalCount = useMemo(
    () => citas.filter((item) => ['en_espera', 'pendiente_pago'].includes(String(item?.estado_cita_codigo || '').toLowerCase())).length,
    [citas]
  );

  const canManageEmergency = useMemo(() => {
    const roleList = Array.isArray(roles) ? roles : [];
    return roleList.includes('admin') || roleList.includes('super_admin');
  }, [roles]);

  const handleAuthError = useCallback((err) => {
    if (err?.status === 401) {
      invalidateSession('admin_agendamiento_401');
      return true;
    }
    if (err?.status === 403) {
      navigate('/unauthorized');
      return true;
    }
    return false;
  }, [invalidateSession, navigate]);

  const fetchContext = useCallback(async () => {
    if (!isAuthenticated) return;
    setContextLoading(true);
    setContextError('');
    try {
      const response = await getAdminCitasOperativasContexto();
      const payload = response?.data ?? response;
      const sucursalesPayload = Array.isArray(payload?.sucursales) ? payload.sucursales : [];
      const barberosPayload = Array.isArray(payload?.barberos) ? payload.barberos : [];
      setContext({ sucursales: sucursalesPayload, barberos: barberosPayload });
      if (barberosPayload.length === 1) {
        const nextBarbero = barberosPayload[0].id_empleado;
        setFilters((prev) => (prev.idBarbero === nextBarbero ? prev : { ...prev, idBarbero: nextBarbero }));
        setBatchForm((prev) => (prev.id_empleado_barbero === nextBarbero ? prev : { ...prev, id_empleado_barbero: nextBarbero }));
      }
    } catch (err) {
      if (isAbortError(err)) return;
      if (handleAuthError(err)) return;
      setContextError(mapAdminCitasErrorMessage(err, 'No fue posible cargar el contexto operativo.'));
    } finally {
      setContextLoading(false);
    }
  }, [handleAuthError, isAuthenticated]);

  const fetchCitas = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) return;
    if (!canOperateWithSucursal) return;
    if (fetchInFlightRef.current) {
      pendingRefreshRef.current = true;
      return;
    }
    fetchInFlightRef.current = true;
    if (!silent) setLoading(true);
    setListError('');
    try {
      const params = buildFilterParams(filters, search);
      params.id_sucursal = selectedSucursalId;
      const operativasResponse = await listAdminCitasOperativas(params);
      const operativas = Array.isArray((operativasResponse?.data ?? operativasResponse)?.citas) ? (operativasResponse?.data ?? operativasResponse).citas : [];
      const byId = new Map();
      operativas.forEach((item) => {
        if (item?.id_cita) byId.set(item.id_cita, item);
      });
      setCitas(Array.from(byId.values()).sort((a, b) => new Date(a?.inicio_at || '').getTime() - new Date(b?.inicio_at || '').getTime()));
    } catch (err) {
      if (isAbortError(err)) return;
      if (handleAuthError(err)) return;
      setListError(mapAdminCitasErrorMessage(err));
    } finally {
      fetchInFlightRef.current = false;
      if (!silent) setLoading(false);
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        const refresh = fetchCitasRef.current;
        if (typeof refresh === 'function') {
          void refresh({ silent: true });
        }
      }
    }
  }, [canOperateWithSucursal, filters, handleAuthError, isAuthenticated, search, selectedSucursalId]);
  fetchCitasRef.current = fetchCitas;
  const scheduleLiveRefresh = useCallback((options = {}) => {
    if (!isAuthenticated) return;
    if (!canOperateWithSucursal) return;
    const { immediate = false } = options;
    if (liveRefreshTimeoutRef.current) {
      window.clearTimeout(liveRefreshTimeoutRef.current);
      liveRefreshTimeoutRef.current = null;
    }
    const runRefresh = () => {
      void fetchCitas({ silent: true });
    };
    if (immediate) {
      runRefresh();
      return;
    }
    liveRefreshTimeoutRef.current = window.setTimeout(runRefresh, LIVE_REFRESH_DEBOUNCE_MS);
  }, [canOperateWithSucursal, fetchCitas, isAuthenticated]);
  const handleManualRefresh = useCallback(() => {
    void fetchCitas({ silent: false });
  }, [fetchCitas]);
  useEffect(() => {
    if (!isAuthenticated) return;
    void fetchContext();
  }, [fetchContext, isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    if (!canOperateWithSucursal) return undefined;
    const timer = setTimeout(() => {
      void fetchCitas();
    }, 260);
    return () => clearTimeout(timer);
  }, [canOperateWithSucursal, fetchCitas, isAuthenticated]);
  useEffect(() => {
    if (!isAuthenticated || !canOperateWithSucursal || !selectedSucursalId) {
      setLiveStatus('idle');
      return undefined;
    }

    const source = new EventSource(buildOperationalEventsUrl(selectedSucursalId), { withCredentials: true });
    setLiveStatus('connecting');

    source.onopen = () => {
      setLiveStatus('connected');
    };

    source.addEventListener('ready', () => {
      setLiveStatus('connected');
    });

    source.addEventListener('ping', () => {
      // Heartbeat del backend; no dispara refresh.
    });

    source.addEventListener('citas.operativas.changed', () => {
      setLiveStatus('connected');
      scheduleLiveRefresh();
    });

    source.onerror = () => {
      setLiveStatus('reconnecting');
    };

    return () => {
      if (liveRefreshTimeoutRef.current) {
        window.clearTimeout(liveRefreshTimeoutRef.current);
        liveRefreshTimeoutRef.current = null;
      }
      pendingRefreshRef.current = false;
      source.close();
    };
  }, [canOperateWithSucursal, isAuthenticated, scheduleLiveRefresh, selectedSucursalId]);

  function handleSucursalSelectionChange(nextId) {
    const safeId = String(nextId || '').trim();
    setSelectedSucursalId(safeId);
    setFilters((prev) => ({ ...prev, idSucursal: safeId || 'all' }));
    setSearch('');
    setCitas([]);
    pendingRefreshRef.current = false;
    try {
      if (safeId) localStorage.setItem(AGENDAMIENTO_SELECTED_SUCURSAL_KEY, safeId);
      else localStorage.removeItem(AGENDAMIENTO_SELECTED_SUCURSAL_KEY);
    } catch {
      // ignore localStorage errors
    }
  }

  function canOperateOnCita(cita) {
    if (!selectedSucursalId) return false;
    const citaSucursal = String(cita?.id_sucursal || '').trim();
    return Boolean(citaSucursal) && citaSucursal === selectedSucursalId;
  }

  function clearAllFilters() {
    setSearch('');
    setFilters({
      ...FILTER_DEFAULTS,
      idSucursal: selectedSucursalId || 'all',
    });
  }

  function openStatusDialog(cita, estadoDestino) {
    if (!cita?.id_cita || !estadoDestino) return;
    if (!selectedSucursalId || !canOperateOnCita(cita)) {
      notifications.warning('Selecciona la sucursal correcta para operar esta cita.', { dedupeKey: 'agendamiento-citas-sucursal-required' });
      return;
    }
    setStateDialog({ open: true, cita, estadoDestino });
  }

  async function submitEstadoChange() {
    if (!stateDialog?.cita?.id_cita || !stateDialog?.estadoDestino) return;
    if (!selectedSucursalId || !canOperateOnCita(stateDialog.cita)) {
      notifications.warning('Selecciona la sucursal correcta para operar esta cita.', { dedupeKey: 'agendamiento-citas-sucursal-required' });
      return;
    }
    setStateActionLoadingId(stateDialog.cita.id_cita);
    try {
      let response = null;
      if (stateDialog.estadoDestino === 'registrar_llegada') {
        response = await postAdminCitaRegistrarLlegada(stateDialog.cita.id_cita);
      } else if (stateDialog.estadoDestino === 'iniciar_atencion') {
        response = await postAdminCitaIniciarAtencion(stateDialog.cita.id_cita);
      } else if (stateDialog.estadoDestino === 'finalizar_atencion') {
        response = await postAdminCitaFinalizarAtencion(stateDialog.cita.id_cita);
      } else {
        throw new Error('Operacion de estado no soportada');
      }
      const payload = response?.data ?? response;
      const updated = payload?.cita;
      if (updated?.id_cita) {
        setCitas((prev) => prev.map((item) => (item.id_cita === updated.id_cita ? updated : item)));
      }
      notifications.success('Estado operativo actualizado.', { dedupeKey: 'agendamiento-citas-estado-ok' });
      setStateDialog({ open: false, cita: null, estadoDestino: '' });
      void fetchCitas();
    } catch (err) {
      notifications.error(extractSafeEstadoMessage(err), { dedupeKey: 'agendamiento-citas-estado-error' });
    } finally {
      setStateActionLoadingId('');
    }
  }

  function openSingleReschedule(cita) {
    setSingleTarget(cita);
    setSingleForm({ fecha_inicio_nueva: toInputDateTime(cita?.inicio_at), id_empleado_barbero_nuevo: '', motivo: 'Reagendación por emergencia operativa.' });
    setSinglePickerDate(toDateKey(cita?.inicio_at));
    setSinglePickerSlots([]);
    setSinglePickerOpen(false);
    setSingleDialogOpen(true);
  }

  async function loadSingleSlots(dateKey, forcedBarberId = '') {
    if (!singleTarget?.id_sucursal || !Array.isArray(singleTarget?.servicios) || singleTarget.servicios.length === 0 || !dateKey) {
      setSinglePickerSlots([]);
      return;
    }
    setSinglePickerLoading(true);
    try {
      const response = await listPublicAgendaHorarios({
        id_sucursal: singleTarget.id_sucursal,
        id_barbero: forcedBarberId || singleForm.id_empleado_barbero_nuevo || singleTarget.id_empleado_barbero || undefined,
        servicios: singleTarget.servicios.join(','),
        fecha: dateKey,
      });
      const payload = response?.data ?? response;
      setSinglePickerSlots(buildSlotsForPicker(payload));
    } catch {
      setSinglePickerSlots([]);
    } finally {
      setSinglePickerLoading(false);
    }
  }

  function assignSingleSlot(dateKey, timeKey) {
    if (!dateKey || !timeKey) return;
    setSingleForm((prev) => ({ ...prev, fecha_inicio_nueva: `${dateKey}T${timeKey}` }));
    setSinglePickerOpen(false);
  }

  async function submitSingleReschedule() {
    if (!singleTarget?.id_cita) return;
    const fechaInicio = toIsoDateTime(singleForm.fecha_inicio_nueva);
    if (!fechaInicio) {
      notifications.warning('Debes indicar una fecha y hora válida.', { dedupeKey: 'agendamiento-citas-single-date' });
      return;
    }
    setSingleSaving(true);
    try {
      await postAdminCitaReagendarEmergencia(singleTarget.id_cita, {
        fecha_inicio_nueva: fechaInicio,
        id_empleado_barbero_nuevo: singleForm.id_empleado_barbero_nuevo || null,
        motivo: singleForm.motivo || null,
      });
      notifications.success('Cita reagendada por emergencia sin cobro adicional.', { dedupeKey: 'agendamiento-citas-single-ok' });
      setSingleDialogOpen(false);
      setSingleTarget(null);
      void fetchCitas();
    } catch (err) {
      notifications.error(mapAdminCitasErrorMessage(err, 'No fue posible reagendar la cita.'), { dedupeKey: 'agendamiento-citas-single-error' });
    } finally {
      setSingleSaving(false);
    }
  }

  async function fetchBatchAffected() {
    if (!selectedSucursalId) {
      notifications.warning('Selecciona una sucursal para operar.', { dedupeKey: 'agendamiento-citas-sucursal-required' });
      return;
    }
    if (!batchForm.id_empleado_barbero || !batchForm.fecha) {
      notifications.warning('Selecciona barbero y fecha para buscar citas afectadas.', { dedupeKey: 'agendamiento-citas-batch-missing' });
      return;
    }
    setBatchLoading(true);
    try {
      const response = await listAdminCitasAfectadasReagendacion({
        id_empleado_barbero: batchForm.id_empleado_barbero,
        fecha: batchForm.fecha,
        id_sucursal: selectedSucursalId,
      });
      const payload = response?.data ?? response;
      const affected = Array.isArray(payload?.citas_afectadas) ? payload.citas_afectadas : [];
      setBatchItems(affected.map((item) => ({
        id_cita: item.id_cita,
        nombre_cliente: item.nombre_cliente || 'Cliente',
        telefono_cliente: item.telefono_cliente || '',
        alias_integrante: item.alias_integrante || 'Titular',
        id_sucursal: item.id_sucursal,
        id_barbero_actual: item.id_empleado_barbero,
        servicios: Array.isArray(item.servicios) ? item.servicios : [],
        selected: false,
        inicio_actual: item.inicio_at,
        fecha_inicio_nueva: toInputDateTime(item.inicio_at),
        id_empleado_barbero_nuevo: '',
        motivo: '',
        picker_open: false,
        picker_date: toDateKey(item.inicio_at),
        picker_slots: [],
      })));
    } catch (err) {
      notifications.error(mapAdminCitasErrorMessage(err, 'No fue posible consultar citas afectadas.'), { dedupeKey: 'agendamiento-citas-batch-fetch-error' });
    } finally {
      setBatchLoading(false);
    }
  }

  async function loadBatchRowSlots(item, dateKey, forcedBarberId = '') {
    if (!item?.id_sucursal || !Array.isArray(item?.servicios) || item.servicios.length === 0 || !dateKey) {
      return;
    }
    setBatchPickerLoadingId(item.id_cita);
    try {
      const response = await listPublicAgendaHorarios({
        id_sucursal: item.id_sucursal,
        id_barbero: forcedBarberId || item.id_empleado_barbero_nuevo || batchForm.id_empleado_barbero || item.id_barbero_actual || undefined,
        servicios: item.servicios.join(','),
        fecha: dateKey,
      });
      const payload = response?.data ?? response;
      const slots = buildSlotsForPicker(payload);
      setBatchItems((prev) => prev.map((entry) => (
        entry.id_cita === item.id_cita
          ? { ...entry, picker_slots: slots, picker_date: dateKey }
          : entry
      )));
    } catch {
      setBatchItems((prev) => prev.map((entry) => (
        entry.id_cita === item.id_cita
          ? { ...entry, picker_slots: [], picker_date: dateKey }
          : entry
      )));
    } finally {
      setBatchPickerLoadingId('');
    }
  }

  function toggleBatchRowSelected(idCita) {
    setBatchItems((prev) => prev.map((entry) => (
      entry.id_cita === idCita ? { ...entry, selected: !entry.selected } : entry
    )));
  }

  function toggleBatchRowPicker(idCita) {
    setBatchItems((prev) => prev.map((entry) => (
      entry.id_cita === idCita ? { ...entry, picker_open: !entry.picker_open } : { ...entry, picker_open: false }
    )));
  }

  function assignBatchRowSlot(idCita, dateKey, timeKey) {
    setBatchItems((prev) => prev.map((entry) => (
      entry.id_cita === idCita
        ? { ...entry, fecha_inicio_nueva: `${dateKey}T${timeKey}`, picker_open: false }
        : entry
    )));
  }

  async function submitBatchReschedule() {
    const selectedItems = batchItems.filter((item) => item.selected);
    if (!selectedItems.length) {
      notifications.warning('Selecciona al menos una cita para reagendar.', {
        dedupeKey: 'agendamiento-citas-batch-none-selected',
      });
      return;
    }
    const hasInvalid = selectedItems.some((item) => !toIsoDateTime(item.fecha_inicio_nueva));
    if (hasInvalid) {
      notifications.warning('Todas las filas seleccionadas deben tener fecha y hora nueva válida.', {
        dedupeKey: 'agendamiento-citas-batch-invalid',
      });
      return;
    }
    setBatchSaving(true);
    try {
      await postAdminCitasReagendarEmergenciaLote({
        id_empleado_barbero: batchForm.id_empleado_barbero,
        fecha: batchForm.fecha,
        motivo: batchForm.motivo || null,
        items: selectedItems.map((item) => ({
          id_cita: item.id_cita,
          fecha_inicio_nueva: toIsoDateTime(item.fecha_inicio_nueva),
          id_empleado_barbero_nuevo: item.id_empleado_barbero_nuevo || null,
          motivo: item.motivo || null,
        })),
      });
      notifications.success('Reagendación masiva completada sin cobro adicional.', { dedupeKey: 'agendamiento-citas-batch-ok' });
      setBatchItems((prev) => prev.filter((item) => !item.selected));
      void fetchCitas();
    } catch (err) {
      notifications.error(mapAdminCitasErrorMessage(err, 'No fue posible completar la reagendación masiva.'), { dedupeKey: 'agendamiento-citas-batch-error' });
    } finally {
      setBatchSaving(false);
    }
  }

  function renderItemActions(cita, options = {}) {
    const { compact = false } = options;
    const state = String(cita?.estado_cita_codigo || '').toLowerCase();
    if (!['confirmada', 'en_salon', 'en_atencion'].includes(state)) return null;
    const fitClass = compact ? 'w-full justify-center' : '';
    const operationCode = state === 'confirmada' ? 'registrar_llegada' : state === 'en_salon' ? 'iniciar_atencion' : 'finalizar_atencion';
    const actionLabel = state === 'confirmada' ? 'Registrar llegada' : state === 'en_salon' ? 'Iniciar atención' : 'Finalizar atención';

    const actionBlocked = !selectedSucursalId || !canOperateOnCita(cita);
    return (
      <Button type="button" size="sm" className={`gap-2 ${fitClass}`} disabled={stateActionLoadingId === cita.id_cita || actionBlocked} onClick={() => openStatusDialog(cita, operationCode)}>
        <CalendarCheck2 size={14} />
        {actionLabel}
      </Button>
    );
  }

  function renderSecondaryActions(cita, options = {}) {
    const { compact = false } = options;
    if (!canManageEmergency) return null;
    return (
      <div className={`flex items-center ${compact ? 'justify-center' : 'justify-start'}`}>
        <Button type="button" size="sm" variant="ghost" className="gap-2 text-xs" onClick={() => openSingleReschedule(cita)}>
          <CalendarClock size={14} />
          Reagendación de emergencia
        </Button>
      </div>
    );
  }

  function renderCitaDetail(cita) {
    const viewInfo = getAppointmentDisplayInfo(cita);
    const serviciosLegibles = getServiciosLegibles(cita);
    const telefono = String(cita?.telefono_cliente || '').trim();
    return (
      <details className="mt-2 rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--mf-text)]">Ver detalle</summary>
        <div className="mt-2 space-y-1 text-xs text-[var(--mf-text-2)]">
          <p>Titular: <span className="text-[var(--mf-text)]">{viewInfo.titularNombre || 'Sin registrar'}</span></p>
          <p>Integrante: <span className="text-[var(--mf-text)]">{viewInfo.aliasIntegrante || 'Sin registrar'}</span></p>
          {telefono ? <p>Teléfono: <span className="text-[var(--mf-text)]">{telefono}</span></p> : null}
          <p>Barbero: <span className="text-[var(--mf-text)]">{cita.nombre_barbero || 'Sin registrar'}</span></p>
          <p>Sucursal: <span className="text-[var(--mf-text)]">{cita.nombre_sucursal || 'Sin registrar'}</span></p>
          <p>Fecha y hora: <span className="text-[var(--mf-text)]">{formatDateTime(cita.inicio_at)}</span></p>
          <p>Estado: <span className="text-[var(--mf-text)]">{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo || 'Sin registrar'}</span></p>
          <p>Servicios: <span className="text-[var(--mf-text)]">{serviciosLegibles.length ? serviciosLegibles.join(' · ') : 'Sin servicios registrados'}</span></p>
          {viewInfo.paqueteNombre ? <p>Paquete: <span className="text-[var(--mf-text)]">{viewInfo.paqueteNombre}</span></p> : null}
          {viewInfo.promocionesCount > 0 ? <p>Promoción: <span className="text-[var(--mf-text)]">{viewInfo.promocionesCount} aplicada(s)</span></p> : null}
          {viewInfo.comprobanteCodigo ? <p>Comprobante: <span className="text-[var(--mf-text)]">{viewInfo.comprobanteCodigo}</span></p> : null}
        </div>
        {renderSecondaryActions(cita)}
      </details>
    );
  }

  function renderMobileCardsList(items, emptyText) {
    if (!items.length) return <p className="px-1 py-6 text-center text-sm text-[var(--mf-text-2)]">{emptyText}</p>;
    return (
      <div className="space-y-3">
        {items.map((cita) => (
          (() => {
            const viewInfo = getAppointmentDisplayInfo(cita);
            const servicioResumen = getServicioResumen(cita);
            const telefono = String(cita?.telefono_cliente || '').trim();
            return (
          <article key={`mobile-${cita.id_cita}`} className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_92%,transparent)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-[13px] text-[var(--mf-text-2)]">Integrante</p>
                <p className="truncate text-[15px] font-semibold text-[var(--mf-text)]">{viewInfo.aliasIntegrante}</p>
                <p className="truncate text-[13px] text-[var(--mf-text-2)]">Titular: <span className="text-[var(--mf-text)]">{viewInfo.titularNombre}</span></p>
                <p className="truncate text-[13px] text-[var(--mf-text-2)]">Barbero: <span className="text-[var(--mf-text)]">{cita.nombre_barbero || '-'}</span></p>
                <p className="text-[13px] text-[var(--mf-text-2)]">Cita: <span className="text-[var(--mf-text)]">{formatDateTime(cita.inicio_at)}</span></p>
                <p className="truncate text-[13px] text-[var(--mf-text-2)]">Servicio: <span className="text-[var(--mf-text)]">{servicioResumen}</span></p>
              </div>
              <div className="text-right">
                <span className={getStateBadgeClass(cita.estado_cita_codigo)}>{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo}</span>
                <p className="mt-2 text-[1.75rem] font-semibold leading-none text-[var(--mf-text)]">{formatCurrencyHnl(cita.total_pagar_hnl)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--mf-nav-border)] pt-2 text-xs text-[var(--mf-text-2)]">
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {cita.nombre_sucursal || 'Sin registrar'}
              </span>
              {telefono ? (
                <span className="inline-flex items-center gap-1">
                  <Phone size={12} />
                  {telefono}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {renderItemActions(cita, { compact: true })}
            </div>
            {renderCitaDetail(cita)}
          </article>
            );
          })()
        ))}
      </div>
    );
  }

  function renderCardsList(items, emptyText) {
    if (!items.length) return <p className="text-sm text-[var(--mf-text-2)]">{emptyText}</p>;
    return (
      <div className="space-y-3">
        {items.map((cita) => {
          const viewInfo = getAppointmentDisplayInfo(cita);
          const servicioResumen = getServicioResumen(cita);
          const telefono = String(cita?.telefono_cliente || '').trim();
          return (
            <article key={cita.id_cita} className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_92%,transparent)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-[13px] text-[var(--mf-text-2)]">Integrante</p>
                  <p className="truncate text-base font-semibold text-[var(--mf-text)]">{viewInfo.aliasIntegrante}</p>
                  <p className="truncate text-[13px] text-[var(--mf-text-2)]">Barbero: <span className="text-[var(--mf-text)]">{cita.nombre_barbero || 'Sin registrar'}</span></p>
                  <p className="text-[13px] text-[var(--mf-text-2)]">Fecha y hora: <span className="text-[var(--mf-text)]">{formatDateTime(cita.inicio_at)}</span></p>
                  <p className="truncate text-[13px] text-[var(--mf-text-2)]">Servicio: <span className="text-[var(--mf-text)]">{servicioResumen}</span></p>
                </div>
                <div className="text-right">
                  <span className={getStateBadgeClass(cita.estado_cita_codigo)}>{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo}</span>
                  <p className="mt-2 text-xl font-semibold leading-none text-[var(--mf-text)]">{formatCurrencyHnl(cita.total_pagar_hnl)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--mf-nav-border)] pt-2 text-xs text-[var(--mf-text-2)]">
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} />
                  {cita.nombre_sucursal || 'Sin registrar'}
                </span>
                {telefono ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone size={12} />
                    {telefono}
                  </span>
                ) : null}
              </div>
              <div className="mt-3">{renderItemActions(cita)}</div>
              {renderCitaDetail(cita)}
            </article>
          );
        })}
      </div>
    );
  }

  function renderTableList(items, emptyText) {
    if (!items.length) return <p className="text-sm text-[var(--mf-text-2)]">{emptyText}</p>;
    return (
      <div className="mf-table-wrap">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--mf-nav-border)]">
              <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Cliente</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Barbero</TableHead>
              <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Inicio</TableHead>
              <TableHead className="text-right text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((cita) => {
              const viewInfo = getAppointmentDisplayInfo(cita);
              return (
                <TableRow key={cita.id_cita} className="border-[var(--mf-nav-border)]">
                  <TableCell className="font-medium">
                    {viewInfo.titularNombre}
                    <p className="text-xs text-[var(--mf-text-2)]">{viewInfo.aliasIntegrante}</p>
                    {cita.telefono_cliente ? <p className="text-xs text-[var(--mf-text-2)]">{cita.telefono_cliente}</p> : null}
                  </TableCell>
                  <TableCell>
                    {cita.nombre_barbero || '-'}
                    <p className="text-xs text-[var(--mf-text-2)]">{cita.nombre_sucursal || '-'}</p>
                    <p className="text-xs text-[var(--mf-text-2)]">Sel: {viewInfo.selectionLabel}{viewInfo.paqueteNombre ? ` · ${viewInfo.paqueteNombre}` : ''}</p>
                  </TableCell>
                  <TableCell>
                    {formatDateTime(cita.inicio_at)}
                    <p className="text-xs text-[var(--mf-text-2)]">{formatCurrencyHnl(cita.total_pagar_hnl)}</p>
                    <p className="text-xs text-[var(--mf-text-2)]">
                      M:{viewInfo.serviciosManualCount} · E:{viewInfo.serviciosExtraCount} · I:{viewInfo.serviciosIncluidosCount}
                      {viewInfo.promocionesCount > 0 ? ` · P:${viewInfo.promocionesCount}` : ''}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">{renderItemActions(cita)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }

  function renderContainer(containerKey, items, emptyText) {
    const meta = CONTAINER_META[containerKey];
    return (
      <section className={`rounded-2xl border p-4 ${meta.border} ${meta.surface}`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 className={`text-lg font-semibold ${meta.accent}`}>{meta.title}</h2>
            <p className="text-xs text-[var(--mf-text-2)]">{meta.subtitle}</p>
          </div>
          <span className="rounded-full border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2 py-1 text-xs text-[var(--mf-text)]">{items.length}</span>
        </div>
        <div className={`pr-1 ${view === 'cards' ? 'max-h-[70vh] overflow-y-auto' : ''}`}>
          {view === 'cards' ? renderCardsList(items, emptyText) : renderTableList(items, emptyText)}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4 overflow-x-hidden px-3 pb-24 sm:px-4 sm:pb-6">
      <section className="space-y-4 pt-1 lg:hidden">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--mf-accent)]">Agendamiento · Operación</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)]">Citas</h1>
          </div>

          <div>
            <Label className="mf-label">Sucursal operativa</Label>
            <select
              className="mf-select mt-1"
              value={selectedSucursalId}
              onChange={(event) => handleSucursalSelectionChange(event.target.value)}
            >
              {hasMultipleSucursales ? <option value="">Selecciona una sucursal</option> : null}
              {sucursales.map((sucursal) => <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre_sucursal}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente, barbero o ID" className="h-11 rounded-2xl pl-9 pr-3 text-[0.98rem] min-[390px]:text-[1.03rem]" />
            </div>
            <div className="relative shrink-0">
              <div className="origin-right scale-[0.94]">
                <ViewToggle defaultView={view} onViewChange={setView} storageKey="agendamiento-citas" />
              </div>
              {activeFilterCount > 0 ? (
                <span className="absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-[var(--mf-nav-border)] bg-[var(--mf-card)] px-1 text-[10px] font-semibold text-[var(--mf-text)]">
                  {activeFilterCount}
                </span>
              ) : null}
            </div>
          </div>

          <div className={`grid gap-2 ${canManageEmergency ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <Button type="button" variant="outline" className="h-11 min-w-0 gap-2 rounded-2xl px-3 text-sm font-semibold min-[390px]:text-base" onClick={handleManualRefresh} disabled={loading || !canOperateWithSucursal}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </Button>
            <Button type="button" variant="outline" className="h-11 min-w-0 gap-2 rounded-2xl px-3 text-sm font-semibold min-[390px]:text-base" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={15} />
              Filtros
            </Button>
            {canManageEmergency ? (
              <Button type="button" variant="outline" className="h-11 min-w-0 gap-2 rounded-2xl px-3 text-center text-sm font-semibold min-[390px]:text-base" onClick={() => setBatchDialogOpen(true)}>
                <AlertTriangle size={14} />
                Reagendación
              </Button>
            ) : null}
          </div>
          {liveStatusLabel ? (
            <p className="text-xs text-[var(--mf-text-2)]">{liveStatusLabel}</p>
          ) : null}

          {hiddenOperationalCount > 0 ? (
            <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-xs text-[var(--mf-text-2)]">
              {hiddenOperationalCount} cita(s) en espera o pendiente de pago no se muestran.
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-b border-[var(--mf-nav-border)] pb-1 lg:hidden">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {mobileTabs.map((tab) => {
            const active = activeMobileContainer === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveMobileContainer(tab.key)}
                className={`relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 pb-2 pt-1 text-[0.94rem] font-semibold transition-colors min-[375px]:text-[1rem] ${
                  active ? `${tab.accent}` : 'text-[var(--mf-text-2)]'
                }`}
              >
                <span>{tab.label}</span>
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-1.5 text-xs text-[var(--mf-text)]">{tab.count}</span>
                {active ? <span className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full bg-current" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <header className="hidden rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5 lg:block">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Agendamiento · Operación</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Citas</h1>
            <p className="text-sm text-[var(--mf-text-2)]">Gestiona confirmadas, en salón y en atención sin salir de la operación.</p>
          </div>
          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[640px]">
            <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="mf-label mb-0">Sucursal operativa</Label>
                <select
                  className="mf-select h-9 min-w-[260px]"
                  value={selectedSucursalId}
                  onChange={(event) => handleSucursalSelectionChange(event.target.value)}
                >
                  {hasMultipleSucursales ? <option value="">Selecciona una sucursal</option> : null}
                  {sucursales.map((sucursal) => <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre_sucursal}</option>)}
                </select>
                {selectedSucursal ? <span className="text-xs text-[var(--mf-text-2)]">Operando en: {selectedSucursal.nombre_sucursal}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[var(--mf-text-2)]">
                {loading ? 'Cargando...' : `${citas.length} cita(s)`}
                {liveStatusLabel ? <span className="ml-2">{liveStatusLabel}</span> : null}
              </span>
              <ViewToggle defaultView={view} onViewChange={setView} storageKey="agendamiento-citas" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[340px]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente, barbero o ID..." className="pl-9 pr-9" />
                {search.trim() ? (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--mf-text-2)] transition-colors hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)]">
                    <X size={12} />
                  </button>
                ) : null}
              </div>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={15} />
                Filtros
                {activeFilterCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-xs text-[var(--mf-accent-text)]">{activeFilterCount}</span> : null}
              </Button>
              {activeFilterCount > 0 ? (
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={clearAllFilters}>Limpiar</Button>
              ) : null}
              <Button type="button" variant="outline" className="gap-2" onClick={handleManualRefresh} disabled={loading || !canOperateWithSucursal}>
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                Actualizar
              </Button>
              {canManageEmergency ? (
                <Button type="button" variant="outline" className="gap-2" onClick={() => setBatchDialogOpen(true)}>
                  <AlertTriangle size={14} />
                  Reagendación masiva
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {hiddenOperationalCount > 0 ? (
        <div className="hidden rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-2 text-sm text-[var(--mf-text-2)] lg:block">
          {hiddenOperationalCount} cita(s) en espera o pendiente de pago no se muestran en estos contenedores.
        </div>
      ) : null}

      {isInitialPageLoading ? <LoadingSpinner /> : null}
      {contextError ? <ErrorBanner message={contextError} onRetry={fetchContext} /> : null}
      {listError ? <ErrorBanner message={listError} onRetry={fetchCitas} /> : null}
      {!contextError && !isInitialPageLoading && requiresSucursalSelection ? (
        <EmptyState
          icon={AlertTriangle}
          title="Selecciona una sucursal para operar"
          description="Las citas se cargarán solo para la sucursal seleccionada."
        />
      ) : null}

      {canRenderCitasContent ? (
        <div className="lg:hidden space-y-4">
          {renderMobileCardsList(
            activeMobileItems,
              activeMobileContainer === 'confirmada'
                ? 'No hay citas confirmadas pendientes.'
                : activeMobileContainer === 'en_salon'
                  ? 'No hay citas en salón en este momento.'
                  : activeMobileContainer === 'en_atencion'
                    ? 'No hay citas en atención en este momento.'
                    : 'No hay citas confirmadas pendientes.'
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-amber-400/30 bg-[color:color-mix(in_srgb,var(--mf-card)_90%,rgba(245,158,11,0.08))] p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300">
                <Armchair size={16} />
                En salón
              </p>
              <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                {citasEnSalon.length > 0 ? `${citasEnSalon.length} cita(s) esperando inicio.` : 'No hay citas en salón hoy.'}
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-400/30 bg-[color:color-mix(in_srgb,var(--mf-card)_90%,rgba(99,102,241,0.12))] p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-300">
                <CalendarClock size={16} />
                En atención
              </p>
              <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                {citasEnAtencion.length > 0 ? `${citasEnAtencion.length} cita(s) en servicio.` : 'No hay citas en atención hoy.'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {canRenderCitasContent ? (
        <div className="hidden grid-cols-1 gap-4 xl:grid-cols-3 lg:grid">
          {renderContainer('confirmada', citasConfirmadas, 'No hay citas confirmadas pendientes.')}
          {renderContainer('en_salon', citasEnSalon, 'No hay citas en salón en este momento.')}
          {renderContainer('en_atencion', citasEnAtencion, 'No hay citas en atención en este momento.')}
        </div>
      ) : null}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Citas</DialogTitle>
            <DialogDescription>Filtra la vista operativa por sucursal, barbero y rango de fechas.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Sucursal</Label>
              <select className="mf-select mt-1" value={selectedSucursalId || filters.idSucursal} onChange={(event) => handleSucursalSelectionChange(event.target.value)}>
                {hasMultipleSucursales ? <option value="">Selecciona una sucursal</option> : null}
                {sucursales.map((sucursal) => <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre_sucursal}</option>)}
              </select>
            </div>
            <div>
              <Label className="mf-label">Barbero</Label>
              <select className="mf-select mt-1" value={filters.idBarbero} onChange={(event) => setFilters((prev) => ({ ...prev, idBarbero: event.target.value }))}>
                <option value="all">Todos</option>
                {barberos.map((barbero) => <option key={barbero.id_empleado} value={barbero.id_empleado}>{barbero.nombre_completo}</option>)}
              </select>
            </div>
            <div>
              <Label className="mf-label">Desde</Label>
              <Input type="date" className="mf-input mt-1" value={filters.fechaDesde} onChange={(event) => setFilters((prev) => ({ ...prev, fechaDesde: event.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">Hasta</Label>
              <Input type="date" className="mf-input mt-1" value={filters.fechaHasta} onChange={(event) => setFilters((prev) => ({ ...prev, fechaHasta: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearAllFilters}>Limpiar filtros</Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={stateDialog.open} onOpenChange={(open) => setStateDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar cambio de estado</DialogTitle>
            <DialogDescription>Confirma la transición operativa de esta cita antes de aplicarla.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-[var(--mf-text-2)]">
            ¿Deseas ejecutar <strong>{getOperationLabel(stateDialog.estadoDestino)}</strong> para la cita de <strong>{stateDialog.cita?.nombre_cliente || 'Cliente'}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStateDialog({ open: false, cita: null, estadoDestino: '' })} disabled={Boolean(stateActionLoadingId)}>Cancelar</Button>
            <Button onClick={submitEstadoChange} disabled={Boolean(stateActionLoadingId)}>{stateActionLoadingId ? 'Actualizando...' : 'Confirmar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={singleDialogOpen} onOpenChange={setSingleDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reagendación de emergencia</DialogTitle>
            <DialogDescription>Reprograma una cita individual sin cobro cuando hay una incidencia operativa.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <p className="text-sm text-[var(--mf-text-2)]">
              {singleTarget?.nombre_cliente || '-'} - {singleTarget?.nombre_barbero || '-'} ({formatDateTime(singleTarget?.inicio_at)})
            </p>
            {singleTarget?.telefono_cliente ? (
              <p className="text-sm text-[var(--mf-text-2)]">Teléfono cliente: {singleTarget.telefono_cliente}</p>
            ) : null}
            <div>
              <Label className="mf-label">Nueva fecha y hora *</Label>
              <Input type="datetime-local" className="mf-input mt-1" value={singleForm.fecha_inicio_nueva} onChange={(event) => setSingleForm((prev) => ({ ...prev, fecha_inicio_nueva: event.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">Nuevo barbero</Label>
              <select className="mf-select mt-1" value={singleForm.id_empleado_barbero_nuevo} onChange={(event) => {
                const value = event.target.value;
                setSingleForm((prev) => ({ ...prev, id_empleado_barbero_nuevo: value }));
                if (singlePickerOpen && singlePickerDate) {
                  void loadSingleSlots(singlePickerDate, value);
                }
              }}>
                <option value="">Asignación aleatoria</option>
                {barberos.map((barbero) => <option key={barbero.id_empleado} value={barbero.id_empleado}>{barbero.nombre_completo}</option>)}
              </select>
            </div>
            <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const nextOpen = !singlePickerOpen;
                    setSinglePickerOpen(nextOpen);
                    if (nextOpen) {
                      const dateToLoad = singlePickerDate || toDateKey(singleTarget?.inicio_at) || '';
                      setSinglePickerDate(dateToLoad);
                      await loadSingleSlots(dateToLoad);
                    }
                  }}
                >
                  {singlePickerOpen ? 'Ocultar selector de horario' : 'Elegir horario disponible'}
                </Button>
                {singlePickerLoading ? <span className="text-xs text-[var(--mf-text-2)]">Cargando horarios...</span> : null}
              </div>
              {singlePickerOpen ? (
                <div className="mt-3 space-y-2">
                  <div>
                    <Label className="mf-label">Fecha</Label>
                    <Input
                      type="date"
                      className="mf-input mt-1"
                      value={singlePickerDate}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSinglePickerDate(value);
                        void loadSingleSlots(value);
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {singlePickerSlots.map((slot) => (
                      <button
                        key={slot.hora}
                        type="button"
                        className={`citas-slot-btn ${slot.disponible ? '' : 'is-unavailable'}`}
                        disabled={!slot.disponible}
                        onClick={() => assignSingleSlot(singlePickerDate, slot.hora)}
                      >
                        {slot.hora}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div>
              <Label className="mf-label">Motivo</Label>
              <Input className="mf-input mt-1" value={singleForm.motivo} onChange={(event) => setSingleForm((prev) => ({ ...prev, motivo: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleDialogOpen(false)} disabled={singleSaving}>Cancelar</Button>
            <Button onClick={submitSingleReschedule} disabled={singleSaving}>{singleSaving ? 'Guardando...' : 'Reagendar sin cobro'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canManageEmergency ? (
        <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
          <DialogContent className="w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader>
              <DialogTitle>Reagendación masiva de emergencia</DialogTitle>
              <DialogDescription>Selecciona y reprocesa en lote las citas afectadas por la emergencia.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className="mf-label">Barbero origen *</Label>
                <select className="mf-select mt-1" value={batchForm.id_empleado_barbero} onChange={(event) => setBatchForm((prev) => ({ ...prev, id_empleado_barbero: event.target.value }))}>
                  <option value="">Selecciona barbero</option>
                  {barberos.map((barbero) => <option key={barbero.id_empleado} value={barbero.id_empleado}>{barbero.nombre_completo}</option>)}
                </select>
              </div>
              <div>
                <Label className="mf-label">Fecha origen *</Label>
                <Input type="date" className="mf-input mt-1" value={batchForm.fecha} onChange={(event) => setBatchForm((prev) => ({ ...prev, fecha: event.target.value }))} />
              </div>
              <div>
                <Label className="mf-label">Motivo general</Label>
                <Input className="mf-input mt-1" value={batchForm.motivo} onChange={(event) => setBatchForm((prev) => ({ ...prev, motivo: event.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end"><Button variant="outline" onClick={fetchBatchAffected} disabled={batchLoading}>{batchLoading ? 'Buscando...' : 'Buscar afectadas'}</Button></div>

            {batchItems.length > 0 ? (
              <div className="mf-table-wrap max-h-[440px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-[var(--mf-nav-border)]">
                      <TableHead>Seleccionar</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Inicio actual</TableHead>
                      <TableHead>Nueva fecha y hora</TableHead>
                      <TableHead>Nuevo barbero</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchItems.map((item) => (
                      <TableRow key={item.id_cita} className="border-[var(--mf-nav-border)]">
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={Boolean(item.selected)}
                            onChange={() => toggleBatchRowSelected(item.id_cita)}
                            aria-label={`Seleccionar ${item.nombre_cliente}`}
                          />
                        </TableCell>
                        <TableCell>
                          {item.nombre_cliente}
                          <p className="text-xs text-[var(--mf-text-2)]">{item.alias_integrante}</p>
                          {item.telefono_cliente ? <p className="text-xs text-[var(--mf-text-2)]">{item.telefono_cliente}</p> : null}
                        </TableCell>
                        <TableCell>{formatDateTime(item.inicio_actual)}</TableCell>
                        <TableCell>
                          <Input type="datetime-local" value={item.fecha_inicio_nueva} onChange={(event) => {
                            const value = event.target.value;
                            setBatchItems((prev) => prev.map((entry) => (entry.id_cita === item.id_cita ? { ...entry, fecha_inicio_nueva: value } : entry)));
                          }} />
                          <div className="mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                toggleBatchRowPicker(item.id_cita);
                                const nextDate = item.picker_date || toDateKey(item.inicio_actual);
                                await loadBatchRowSlots(item, nextDate);
                              }}
                            >
                              {item.picker_open ? 'Cerrar horarios' : 'Elegir horario disponible'}
                            </Button>
                          </div>
                          {item.picker_open ? (
                            <div className="mt-2 rounded-md border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-2">
                              <Input
                                type="date"
                                value={item.picker_date || ''}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setBatchItems((prev) => prev.map((entry) => (
                                    entry.id_cita === item.id_cita ? { ...entry, picker_date: value } : entry
                                  )));
                                  void loadBatchRowSlots(item, value);
                                }}
                              />
                              {batchPickerLoadingId === item.id_cita ? (
                                <p className="mt-2 text-xs text-[var(--mf-text-2)]">Cargando horarios...</p>
                              ) : (
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                  {item.picker_slots.map((slot) => (
                                    <button
                                      key={`${item.id_cita}-${slot.hora}`}
                                      type="button"
                                      className={`citas-slot-btn ${slot.disponible ? '' : 'is-unavailable'}`}
                                      disabled={!slot.disponible}
                                      onClick={() => assignBatchRowSlot(item.id_cita, item.picker_date, slot.hora)}
                                    >
                                      {slot.hora}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <select className="mf-select" value={item.id_empleado_barbero_nuevo} onChange={(event) => {
                            const value = event.target.value;
                            setBatchItems((prev) => prev.map((entry) => (entry.id_cita === item.id_cita ? { ...entry, id_empleado_barbero_nuevo: value } : entry)));
                            if (item.picker_open && item.picker_date) {
                              void loadBatchRowSlots({ ...item, id_empleado_barbero_nuevo: value }, item.picker_date, value);
                            }
                          }}>
                            <option value="">Asignación aleatoria</option>
                            {barberos.map((barbero) => <option key={barbero.id_empleado} value={barbero.id_empleado}>{barbero.nombre_completo}</option>)}
                          </select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : !batchLoading ? <p className="text-sm text-[var(--mf-text-2)]">Busca las citas afectadas para preparar el lote de reagendación.</p> : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => setBatchDialogOpen(false)} disabled={batchSaving}>Cerrar</Button>
              <Button onClick={submitBatchReschedule} disabled={batchSaving || batchItems.filter((item) => item.selected).length === 0}>
                {batchSaving ? 'Procesando...' : 'Reagendar seleccionadas'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}






