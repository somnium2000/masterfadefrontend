import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Armchair,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  MapPin,
  Phone,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.jsx';
import ViewToggle from '../../../components/data/ViewToggle.jsx';
import DataCard from '../../../components/data/DataCard.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
  getAdminCitasOperativasContexto,
  getAdminCitasOperativasCompletadasHoy,
  listAdminCitasAfectadasReagendacion,
  listAdminCitasOperativas,
  listPublicAgendaHorarios,
  patchAdminCitaEstado,
  postAdminCitaReagendarEmergencia,
  postAdminCitasReagendarEmergenciaLote,
} from '../lib/adminCitasApi.js';
import { buildTimeSlots } from '../../public/booking/bookingUtils.js';
import { supabase } from '../../../config/supabaseClient.js';

const FILTER_DEFAULTS = {
  idSucursal: 'all',
  idBarbero: 'all',
  fechaDesde: '',
  fechaHasta: '',
};

const LIVE_REFRESH_DEBOUNCE_MS = 180;
const LIVE_REFRESH_POLL_MS = 8000;

const STATE_LABELS = {
  en_espera: 'En espera',
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  en_salon: 'En salón',
  completada: 'Completada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  no_show: 'No show',
  anulada: 'Anulada',
};

const CONTAINER_META = {
  confirmada: { title: 'Confirmadas', subtitle: 'Pendientes de llegada al salón', accent: 'text-sky-300', border: 'border-sky-400/30', surface: 'bg-[color:color-mix(in_srgb,var(--mf-card)_88%,rgba(56,189,248,0.08))]' },
  en_salon: { title: 'En salón', subtitle: 'Atención en curso', accent: 'text-amber-300', border: 'border-amber-400/30', surface: 'bg-[color:color-mix(in_srgb,var(--mf-card)_88%,rgba(245,158,11,0.08))]' },
  completada_hoy: { title: 'Completadas hoy', subtitle: 'Se reinicia visualmente cada día', accent: 'text-emerald-300', border: 'border-emerald-400/30', surface: 'bg-[color:color-mix(in_srgb,var(--mf-card)_88%,rgba(16,185,129,0.08))]' },
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function extractSafeEstadoMessage(err) {
  const code = String(err?.data?.error?.code || '').trim();
  if (code === 'ADMIN_CITAS_STATUS_WINDOW_NOT_OPEN') {
    return 'La cita aún no está disponible para marcarse en este estado.';
  }
  if (code === 'ADMIN_CITAS_STATUS_TRANSITION_INVALID') {
    return 'El cambio de estado solicitado no está disponible para esta cita.';
  }
  if (code === 'ADMIN_CITAS_STATUS_START_INVALID') {
    return 'La cita no se puede actualizar en este momento.';
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

function getStateBadgeClass(state) {
  const normalized = String(state || '').toLowerCase();
  if (['confirmada', 'en_salon', 'completada'].includes(normalized)) return 'mf-badge mf-badge-green';
  if (['en_espera', 'pendiente_pago'].includes(normalized)) return 'mf-badge mf-badge-gold';
  if (['cancelada', 'expirada', 'no_show', 'anulada'].includes(normalized)) return 'mf-badge mf-badge-red';
  return 'mf-badge mf-badge-muted';
}

function getDateInHonduras(isoValue = null) {
  const date = isoValue ? new Date(isoValue) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tegucigalpa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
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

function getCompletedSortTimestamp(item) {
  return toTimestamp(item?.completada_at || item?.fin_at || item?.updated_at || item?.inicio_at);
}

function compareCompletedByRecent(a, b) {
  const aMs = getCompletedSortTimestamp(a);
  const bMs = getCompletedSortTimestamp(b);
  return bMs - aMs;
}

export default function AdminAgendamientoCitasPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { roles } = useAuth();

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
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

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
  const liveRefreshTimeoutRef = useRef(null);
  const realtimeStatusRef = useRef('idle');

  const sucursales = Array.isArray(context?.sucursales) ? context.sucursales : [];
  const barberos = Array.isArray(context?.barberos) ? context.barberos : [];
  const todayHn = useMemo(() => getDateInHonduras(new Date(nowMs).toISOString()), [nowMs]);

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
  const citasCompletadasHoy = useMemo(
    () => citas
      .filter((item) => String(item?.estado_cita_codigo || '').toLowerCase() === 'completada' && getDateInHonduras(item?.inicio_at) === todayHn)
      .sort(compareCompletedByRecent),
    [citas, todayHn]
  );
  const containerItemsByKey = useMemo(
    () => ({
      confirmada: citasConfirmadas,
      en_salon: citasEnSalon,
      completada_hoy: citasCompletadasHoy,
    }),
    [citasCompletadasHoy, citasConfirmadas, citasEnSalon]
  );
  const mobileTabs = useMemo(
    () => ([
      { key: 'confirmada', label: 'Confirmadas', accent: 'text-sky-300', count: citasConfirmadas.length },
      { key: 'en_salon', label: 'En salón', accent: 'text-amber-300', count: citasEnSalon.length },
      { key: 'completada_hoy', label: 'Completadas', accent: 'text-emerald-300', count: citasCompletadasHoy.length },
    ]),
    [citasCompletadasHoy.length, citasConfirmadas.length, citasEnSalon.length]
  );
  const activeMobileItems = containerItemsByKey[activeMobileContainer] || [];

  useEffect(() => {
    const hasActive = (containerItemsByKey[activeMobileContainer] || []).length > 0;
    if (hasActive) return;
    const firstNonEmpty = mobileTabs.find((tab) => tab.count > 0);
    if (firstNonEmpty && firstNonEmpty.key !== activeMobileContainer) {
      setActiveMobileContainer(firstNonEmpty.key);
    }
  }, [activeMobileContainer, containerItemsByKey, mobileTabs]);

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
      navigate('/login');
      return true;
    }
    if (err?.status === 403) {
      navigate('/unauthorized');
      return true;
    }
    return false;
  }, [navigate]);

  const fetchContext = useCallback(async () => {
    setContextLoading(true);
    setContextError('');
    try {
      const response = await getAdminCitasOperativasContexto();
      const payload = response?.data ?? response;
      const sucursalesPayload = Array.isArray(payload?.sucursales) ? payload.sucursales : [];
      const barberosPayload = Array.isArray(payload?.barberos) ? payload.barberos : [];
      setContext({ sucursales: sucursalesPayload, barberos: barberosPayload });
      if (sucursalesPayload.length === 1) setFilters((prev) => ({ ...prev, idSucursal: sucursalesPayload[0].id_sucursal }));
      if (barberosPayload.length === 1) {
        setFilters((prev) => ({ ...prev, idBarbero: barberosPayload[0].id_empleado }));
        setBatchForm((prev) => ({ ...prev, id_empleado_barbero: barberosPayload[0].id_empleado }));
      }
    } catch (err) {
      if (handleAuthError(err)) return;
      setContextError(extractMessage(err));
    } finally {
      setContextLoading(false);
    }
  }, [handleAuthError]);

  const fetchCitas = useCallback(async ({ silent = false } = {}) => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (!silent) setLoading(true);
    setListError('');
    try {
      const params = buildFilterParams(filters, search);
      const [operativasResponse, completadasResponse] = await Promise.all([
        listAdminCitasOperativas(params),
        getAdminCitasOperativasCompletadasHoy({ ...params, limit: 300 }),
      ]);
      const operativas = Array.isArray((operativasResponse?.data ?? operativasResponse)?.citas) ? (operativasResponse?.data ?? operativasResponse).citas : [];
      const completadas = Array.isArray((completadasResponse?.data ?? completadasResponse)?.citas) ? (completadasResponse?.data ?? completadasResponse).citas : [];
      const byId = new Map();
      [...operativas, ...completadas].forEach((item) => {
        if (item?.id_cita) byId.set(item.id_cita, item);
      });
      setCitas(Array.from(byId.values()).sort((a, b) => new Date(a?.inicio_at || '').getTime() - new Date(b?.inicio_at || '').getTime()));
    } catch (err) {
      if (handleAuthError(err)) return;
      setListError(extractMessage(err));
    } finally {
      fetchInFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [filters, handleAuthError, search]);
  const scheduleLiveRefresh = useCallback((options = {}) => {
    const { immediate = false } = options;
    if (liveRefreshTimeoutRef.current) {
      window.clearTimeout(liveRefreshTimeoutRef.current);
      liveRefreshTimeoutRef.current = null;
    }
    const runRefresh = () => {
      if (typeof document !== 'undefined' && document.hidden && !immediate) return;
      void fetchCitas({ silent: true });
    };
    if (immediate) {
      runRefresh();
      return;
    }
    liveRefreshTimeoutRef.current = window.setTimeout(runRefresh, LIVE_REFRESH_DEBOUNCE_MS);
  }, [fetchCitas]);
  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchCitas();
    }, 260);
    return () => clearTimeout(timer);
  }, [fetchCitas]);
  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase
      .channel('admin-agendamiento-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => { scheduleLiveRefresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas_holds' }, () => { scheduleLiveRefresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bloqueos_agenda' }, () => { scheduleLiveRefresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas_reagendaciones' }, () => { scheduleLiveRefresh(); })
      .subscribe((status) => {
        realtimeStatusRef.current = status;
        if (status === 'SUBSCRIBED') scheduleLiveRefresh({ immediate: true });
      });
    return () => {
      if (liveRefreshTimeoutRef.current) {
        window.clearTimeout(liveRefreshTimeoutRef.current);
        liveRefreshTimeoutRef.current = null;
      }
      try {
        supabase.removeChannel(channel);
      } catch {
        // ignore teardown errors
      }
    };
  }, [scheduleLiveRefresh]);
  useEffect(() => {
    const handleFocus = () => {
      scheduleLiveRefresh({ immediate: true });
    };
    const handleVisibility = () => {
      if (!document.hidden) scheduleLiveRefresh({ immediate: true });
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [scheduleLiveRefresh]);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const channelHealthy = realtimeStatusRef.current === 'SUBSCRIBED';
      scheduleLiveRefresh({ immediate: !channelHealthy });
    }, LIVE_REFRESH_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [scheduleLiveRefresh]);

  function clearAllFilters() {
    setSearch('');
    setFilters(FILTER_DEFAULTS);
  }

  function openStatusDialog(cita, estadoDestino) {
    if (!cita?.id_cita || !estadoDestino) return;
    setStateDialog({ open: true, cita, estadoDestino });
  }

  async function submitEstadoChange() {
    if (!stateDialog?.cita?.id_cita || !stateDialog?.estadoDestino) return;
    setStateActionLoadingId(stateDialog.cita.id_cita);
    try {
      const response = await patchAdminCitaEstado(stateDialog.cita.id_cita, { estado_cita_codigo: stateDialog.estadoDestino });
      const payload = response?.data ?? response;
      const updated = payload?.cita;
      if (updated?.id_cita) {
        setCitas((prev) => prev.map((item) => (item.id_cita === updated.id_cita ? updated : item)));
      }
      notifications.success('Estado de cita actualizado.', { dedupeKey: 'agendamiento-citas-estado-ok' });
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
      notifications.error(extractMessage(err), { dedupeKey: 'agendamiento-citas-single-error' });
    } finally {
      setSingleSaving(false);
    }
  }

  async function fetchBatchAffected() {
    if (!batchForm.id_empleado_barbero || !batchForm.fecha) {
      notifications.warning('Selecciona barbero y fecha para buscar citas afectadas.', { dedupeKey: 'agendamiento-citas-batch-missing' });
      return;
    }
    setBatchLoading(true);
    try {
      const response = await listAdminCitasAfectadasReagendacion({
        id_empleado_barbero: batchForm.id_empleado_barbero,
        fecha: batchForm.fecha,
        id_sucursal: filters.idSucursal !== 'all' ? filters.idSucursal : undefined,
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
      notifications.error(extractMessage(err), { dedupeKey: 'agendamiento-citas-batch-fetch-error' });
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
      notifications.error(extractMessage(err), { dedupeKey: 'agendamiento-citas-batch-error' });
    } finally {
      setBatchSaving(false);
    }
  }

  function renderItemActions(cita, options = {}) {
    const { compact = false } = options;
    const state = String(cita?.estado_cita_codigo || '').toLowerCase();
    if (!['confirmada', 'en_salon'].includes(state)) return null;
    const fitClass = compact ? 'flex-1 justify-center' : '';

    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        {state === 'confirmada' ? (
          <Button type="button" size="sm" className={`gap-2 ${fitClass}`} disabled={stateActionLoadingId === cita.id_cita} onClick={() => openStatusDialog(cita, 'en_salon')}>
            <CalendarCheck2 size={14} />
            Marcar como En salón
          </Button>
        ) : (
          <Button type="button" size="sm" className={`gap-2 ${fitClass}`} disabled={stateActionLoadingId === cita.id_cita} onClick={() => openStatusDialog(cita, 'completada')}>
            <CalendarCheck2 size={14} />
            Marcar como completada
          </Button>
        )}
        {canManageEmergency ? (
          <Button type="button" size="sm" variant="outline" className={`gap-2 ${fitClass}`} onClick={() => openSingleReschedule(cita)}>
            <CalendarClock size={14} />
            {compact ? 'Reagendar' : 'Reagendar emergencia'}
          </Button>
        ) : null}
      </div>
    );
  }

  function renderMobileCardsList(items, emptyText) {
    if (!items.length) return <p className="px-1 py-6 text-center text-sm text-[var(--mf-text-2)]">{emptyText}</p>;
    return (
      <div className="space-y-3">
        {items.map((cita) => (
          <article key={`mobile-${cita.id_cita}`} className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_92%,transparent)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-[13px] text-[var(--mf-text-2)]">Cliente: <span className="font-semibold text-[var(--mf-text)]">{cita.nombre_cliente || 'Cliente'}</span></p>
                <p className="truncate text-[13px] text-[var(--mf-text-2)]">Barbero: <span className="text-[var(--mf-text)]">{cita.nombre_barbero || '-'}</span></p>
                <p className="text-[13px] text-[var(--mf-text-2)]">Cita: <span className="text-[var(--mf-text)]">{formatDateTime(cita.inicio_at)}</span></p>
              </div>
              <div className="text-right">
                <span className={getStateBadgeClass(cita.estado_cita_codigo)}>{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo}</span>
                <p className="mt-2 text-[1.75rem] font-semibold leading-none text-[var(--mf-text)]">{formatCurrencyHnl(cita.total_pagar_hnl)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--mf-nav-border)] pt-2 text-xs text-[var(--mf-text-2)]">
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} />
                {cita.nombre_sucursal || '-'}
              </span>
              <span className="inline-flex items-center gap-1">
                <Phone size={12} />
                {cita.telefono_cliente || 'Sin teléfono'}
              </span>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {renderItemActions(cita, { compact: true })}
            </div>
          </article>
        ))}
      </div>
    );
  }

function renderCardsList(items, emptyText) {
  if (!items.length) return <p className="text-sm text-[var(--mf-text-2)]">{emptyText}</p>;
  return (
    <div className="space-y-0">
      {items.map((cita, index) => (
          <div key={cita.id_cita} className="h-[440px] snap-start">
            <DataCard
              animationDelay={index * 0.04}
              avatar={<CalendarDays size={16} />}
              title={cita.nombre_cliente || 'Cliente'}
              subtitle={`${cita.nombre_barbero || '-'} · ${formatDateTime(cita.inicio_at)}`}
              badge={<span className={getStateBadgeClass(cita.estado_cita_codigo)}>{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo}</span>}
              fields={[
                { label: 'Sucursal', value: cita.nombre_sucursal || '-' },
                { label: 'Integrante', value: cita.alias_integrante || 'Titular' },
                { label: 'Teléfono', value: cita.telefono_cliente || '-' },
                { label: 'Inicio', value: formatDateTime(cita.inicio_at) },
                { label: 'Monto', value: formatCurrencyHnl(cita.total_pagar_hnl) },
              ]}
              actions={renderItemActions(cita)}
            />
          </div>
        ))}
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
            {items.map((cita) => (
              <TableRow key={cita.id_cita} className="border-[var(--mf-nav-border)]">
                <TableCell className="font-medium">
                  {cita.nombre_cliente || 'Cliente'}
                  {cita.alias_integrante ? <p className="text-xs text-[var(--mf-text-2)]">{cita.alias_integrante}</p> : null}
                  {cita.telefono_cliente ? <p className="text-xs text-[var(--mf-text-2)]">{cita.telefono_cliente}</p> : null}
                </TableCell>
                <TableCell>{cita.nombre_barbero || '-'}<p className="text-xs text-[var(--mf-text-2)]">{cita.nombre_sucursal || '-'}</p></TableCell>
                <TableCell>{formatDateTime(cita.inicio_at)}<p className="text-xs text-[var(--mf-text-2)]">{formatCurrencyHnl(cita.total_pagar_hnl)}</p></TableCell>
                <TableCell className="text-right">{renderItemActions(cita)}</TableCell>
              </TableRow>
            ))}
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
        <div className={`overflow-y-auto ${view === 'cards' ? 'h-[440px] snap-y snap-mandatory pr-1' : 'h-[440px] pr-1'}`}>
          {view === 'cards' ? renderCardsList(items, emptyText) : renderTableList(items, emptyText)}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4 px-0 pb-4 sm:px-4 sm:pb-6">
      <section className="space-y-4 px-2 pt-1 md:hidden">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--mf-accent)]">Agendamiento · Operación</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)]">Citas</h1>
          </div>

          <div className="relative w-full">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente, barbero o ID" className="h-11 rounded-2xl pl-9 pr-[6.25rem] text-[0.98rem] min-[390px]:pr-28 min-[390px]:text-[1.03rem]" />
            <div className="absolute right-1 top-1/2 -translate-y-1/2">
              <div className="relative">
                <div className="origin-right scale-[0.92]">
                  <ViewToggle defaultView={view} onViewChange={setView} storageKey="agendamiento-citas" />
                </div>
                {activeFilterCount > 0 ? (
                  <span className="absolute -right-2 -top-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-[var(--mf-nav-border)] bg-[var(--mf-card)] px-1.5 text-xs font-semibold text-[var(--mf-text)]">
                    {activeFilterCount}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className={`grid gap-2 ${canManageEmergency ? 'grid-cols-1 min-[380px]:grid-cols-[0.95fr_1.35fr]' : 'grid-cols-1'}`}>
            <Button type="button" variant="outline" className="h-11 min-w-0 gap-2 rounded-2xl px-3 text-base font-semibold" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={15} />
              Filtros
            </Button>
            {canManageEmergency ? (
              <Button type="button" variant="outline" className="h-auto min-h-11 min-w-0 gap-2 whitespace-normal rounded-2xl px-3 py-2 text-center text-sm font-semibold leading-tight min-[390px]:text-base" onClick={() => setBatchDialogOpen(true)}>
                <AlertTriangle size={14} />
                Reagendación masiva
              </Button>
            ) : null}
          </div>

          {hiddenOperationalCount > 0 ? (
            <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-xs text-[var(--mf-text-2)]">
              {hiddenOperationalCount} cita(s) en espera o pendiente de pago no se muestran.
            </div>
          ) : null}
        </div>
      </section>

      <section className="border-b border-[var(--mf-nav-border)] px-2 pb-1 md:hidden">
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide">
          {mobileTabs.map((tab) => {
            const active = activeMobileContainer === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveMobileContainer(tab.key)}
                className={`relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap px-1 pb-2 text-[0.96rem] font-semibold transition-colors min-[375px]:text-[1.02rem] ${
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

      <header className="hidden rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5 md:block">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Agendamiento · Operación</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Citas</h1>
            <p className="text-sm text-[var(--mf-text-2)]">Gestiona confirmadas, en salón y completadas del día sin salir de la operación.</p>
          </div>
          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[640px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[var(--mf-text-2)]">{loading ? 'Cargando...' : `${citas.length} cita(s)`}</span>
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
        <div className="hidden rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-2 text-sm text-[var(--mf-text-2)] md:block">
          {hiddenOperationalCount} cita(s) en espera o pendiente de pago no se muestran en estos contenedores.
        </div>
      ) : null}

      {contextLoading ? <LoadingSpinner /> : null}
      {contextError ? <ErrorBanner message={contextError} onRetry={fetchContext} /> : null}
      {listError ? <ErrorBanner message={listError} onRetry={fetchCitas} /> : null}
      {loading && !listError ? <LoadingSpinner /> : null}

      {!loading && !listError ? (
        <div className="md:hidden space-y-4">
          {renderMobileCardsList(
            activeMobileItems,
            activeMobileContainer === 'confirmada'
              ? 'No hay citas confirmadas pendientes.'
              : activeMobileContainer === 'en_salon'
                ? 'No hay citas en salón en este momento.'
                : 'No hay citas completadas hoy.'
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-amber-400/30 bg-[color:color-mix(in_srgb,var(--mf-card)_90%,rgba(245,158,11,0.08))] p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-300">
                <Armchair size={16} />
                En salón
              </p>
              <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                {citasEnSalon.length > 0 ? `${citasEnSalon.length} cita(s) en atención.` : 'No hay citas en salón hoy.'}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/30 bg-[color:color-mix(in_srgb,var(--mf-card)_90%,rgba(16,185,129,0.08))] p-3">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <CheckCircle2 size={16} />
                Completadas
              </p>
              <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                {citasCompletadasHoy.length > 0 ? `${citasCompletadasHoy.length} cita(s) completadas hoy.` : 'No hay citas completadas hoy.'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !listError ? (
        <div className="hidden grid-cols-1 gap-4 xl:grid-cols-3 md:grid">
          {renderContainer('confirmada', citasConfirmadas, 'No hay citas confirmadas pendientes.')}
          {renderContainer('en_salon', citasEnSalon, 'No hay citas en salón en este momento.')}
          {renderContainer('completada_hoy', citasCompletadasHoy, 'No hay citas completadas hoy.')}
        </div>
      ) : null}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Filtros de Citas</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Sucursal</Label>
              <select className="mf-select mt-1" value={filters.idSucursal} onChange={(event) => setFilters((prev) => ({ ...prev, idSucursal: event.target.value }))}>
                <option value="all">Todas</option>
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
          <DialogHeader><DialogTitle>Confirmar cambio de estado</DialogTitle></DialogHeader>
          <p className="text-sm text-[var(--mf-text-2)]">
            ¿Deseas cambiar la cita de <strong>{stateDialog.cita?.nombre_cliente || 'Cliente'}</strong> a <strong>{STATE_LABELS[stateDialog.estadoDestino] || stateDialog.estadoDestino}</strong>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStateDialog({ open: false, cita: null, estadoDestino: '' })} disabled={Boolean(stateActionLoadingId)}>Cancelar</Button>
            <Button onClick={submitEstadoChange} disabled={Boolean(stateActionLoadingId)}>{stateActionLoadingId ? 'Actualizando...' : 'Confirmar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={singleDialogOpen} onOpenChange={setSingleDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Reagendación de emergencia</DialogTitle></DialogHeader>
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
            <DialogHeader><DialogTitle>Reagendación masiva de emergencia</DialogTitle></DialogHeader>
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






