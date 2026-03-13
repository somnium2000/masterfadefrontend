import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Pencil,
  Plus,
  Save,
  Scissors,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { listAdminServicios } from '../lib/adminCatalogApi.js';
import {
  createAdminCitasBloqueo,
  createAdminCitasDiaInhabilitado,
  deleteAdminCitasBloqueo,
  deleteAdminCitasDiaInhabilitado,
  getAdminCitasContexto,
  getAdminCitasHorarios,
  getAdminCitasParametros,
  listAdminCitasBloqueos,
  listAdminCitasDiasInhabilitados,
  listPublicAgendaDisponibilidad,
  listPublicAgendaHorarios,
  patchAdminCitasParametros,
  putAdminCitasHorarios,
} from '../lib/adminCitasApi.js';
import './AdminCitasPage.css';

const PREVIEW_STEPS = [
  { id: 'barberos', label: '1. Barberos' },
  { id: 'agenda', label: '2. Servicio y Horario' },
  { id: 'confirmar', label: '3. Confirmar' },
];

const CONFIG_TABS = [
  { id: 'horario', label: 'Horario Habitual', icon: Clock3 },
  { id: 'bloqueos', label: 'Bloqueos', icon: SlidersHorizontal },
  { id: 'dias', label: 'DÃ­as Inhabilitados', icon: CalendarDays },
  { id: 'parametros', label: 'ParÃ¡metros Globales', icon: SlidersHorizontal },
  { id: 'excepciones', label: 'Excepciones', icon: AlertTriangle },
  { id: 'sucursal', label: 'Por Sucursal', icon: Ban },
];

const DAY_ROWS = [
  { code: 1, label: 'Lunes' },
  { code: 2, label: 'Martes' },
  { code: 3, label: 'MiÃ©rcoles' },
  { code: 4, label: 'Jueves' },
  { code: 5, label: 'Viernes' },
  { code: 6, label: 'SÃ¡bado' },
  { code: 0, label: 'Domingo' },
];

const WEEK_DAYS = ['Dom', 'Lun', 'Mar', 'MiÃ©', 'Jue', 'Vie', 'SÃ¡b'];
const SERVICE_SPECIALTIES = [
  'Fade & Degradado',
  'DiseÃ±o & Barba',
  'Corte ClÃ¡sico & Afeitado',
  'Urban & Street Style',
  'Perfilado Premium',
];

const BARBER_GRADIENTS = [
  'linear-gradient(145deg, #4e3c2a 0%, #8b6a4a 100%)',
  'linear-gradient(145deg, #2f3f4f 0%, #5c7998 100%)',
  'linear-gradient(145deg, #3f3a38 0%, #73655c 100%)',
  'linear-gradient(145deg, #3a4d66 0%, #6d8eb8 100%)',
  'linear-gradient(145deg, #4d3543 0%, #8f5f7d 100%)',
];

const MAX_COMPANIONS = 4;

const EMPTY_CONTEXT = {
  sucursales: [],
  barberos: [],
  tipos_bloqueo: [],
  parametros: {},
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMonth(date) {
  return new Intl.DateTimeFormat('es-HN', { month: 'long', year: 'numeric' }).format(date).toUpperCase();
}

function formatFriendlyDate(dateKey) {
  if (!dateKey) return 'Sin fecha';
  const value = new Date(`${dateKey}T00:00:00`);
  return new Intl.DateTimeFormat('es-HN', { weekday: 'short', day: 'numeric', month: 'long' }).format(value);
}

function formatDateOnly(dateKey) {
  if (!dateKey) return '';
  return new Intl.DateTimeFormat('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(`${dateKey}T00:00:00`)
  );
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildCalendarCells(monthBase) {
  const year = monthBase.getFullYear();
  const month = monthBase.getMonth();
  const first = new Date(year, month, 1);
  const offset = first.getDay();
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }).map((_, index) => {
    const cellDate = addDays(start, index);
    return {
      key: toDateKey(cellDate),
      label: cellDate.getDate(),
      inMonth: cellDate.getMonth() === month,
    };
  });
}

function toInputTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.length >= 5 ? raw.slice(0, 5) : raw;
}

function toTimeWithSeconds(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.length === 5 ? `${raw}:00` : raw;
}

function buildTimeSlots(start = '08:00', end = '18:30', stepMin = 30) {
  const [startHour, startMinute] = start.split(':').map(Number);
  const [endHour, endMinute] = end.split(':').map(Number);
  const slots = [];
  const pointer = new Date();
  pointer.setHours(startHour, startMinute, 0, 0);
  const limit = new Date();
  limit.setHours(endHour, endMinute, 0, 0);

  while (pointer.getTime() <= limit.getTime()) {
    const hh = String(pointer.getHours()).padStart(2, '0');
    const mm = String(pointer.getMinutes()).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
    pointer.setMinutes(pointer.getMinutes() + stepMin);
  }

  return slots;
}

const ALL_TIME_SLOTS = buildTimeSlots();

function hashString(value) {
  let hash = 0;
  const source = String(value || '');
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getBarberMeta(barber) {
  const base = `${barber?.id_empleado || ''}${barber?.nombre_completo || ''}`;
  const hash = hashString(base);
  return {
    specialty: SERVICE_SPECIALTIES[hash % SERVICE_SPECIALTIES.length],
    years: 4 + (hash % 7),
    gradient: BARBER_GRADIENTS[hash % BARBER_GRADIENTS.length],
  };
}

function getInitials(name) {
  const parts = String(name || '')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return 'MF';
  return parts.map((item) => item[0]?.toUpperCase() || '').join('');
}

function getFirstName(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || 'Barbero';
}

function formatTimeRange(startAt, endAt) {
  const formatTime = (value) => new Intl.DateTimeFormat('es-HN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
  return `${formatTime(startAt)} - ${formatTime(endAt)}`;
}

function formatCurrencyHnl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'L. 0.00';
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', minimumFractionDigits: 2 }).format(amount);
}

function getServiceDurationLabel(service) {
  const duration = Number(service?.duracion_min || 0) + Number(service?.buffer_min || 0);
  return `${duration} min`;
}

function buildDefaultScheduleRows() {
  return DAY_ROWS.map((item) => {
    const isWeekend = item.code === 6 || item.code === 0;
    return {
      dia_semana: item.code,
      dia_label: item.label,
      hora_inicio: '08:00',
      hora_fin: isWeekend ? '17:00' : '19:00',
      almuerzo_inicio: '12:00',
      almuerzo_fin: '13:00',
      duracion_min: 30,
      activo: item.code !== 0,
    };
  });
}

function normalizeScheduleRows(horarios) {
  const byDay = new Map();
  (Array.isArray(horarios) ? horarios : []).forEach((row) => {
    if (!byDay.has(row.dia_semana)) {
      byDay.set(row.dia_semana, row);
    }
  });

  return buildDefaultScheduleRows().map((base) => {
    const found = byDay.get(base.dia_semana);
    if (!found) return base;
    return {
      ...base,
      hora_inicio: toInputTime(found.hora_inicio || base.hora_inicio),
      hora_fin: toInputTime(found.hora_fin || base.hora_fin),
      almuerzo_inicio: toInputTime(found.almuerzo_inicio || base.almuerzo_inicio),
      almuerzo_fin: toInputTime(found.almuerzo_fin || base.almuerzo_fin),
      activo: found.activo !== false,
    };
  });
}

function getBlockTone(tipo) {
  const code = String(tipo || '').toLowerCase();
  if (code.includes('enfer') || code.includes('medic')) return '#7c3aed';
  if (code.includes('permiso') || code.includes('tramite')) return '#d97706';
  if (code.includes('inhabilitado') || code.includes('dia')) return '#dc2626';
  return 'var(--mf-accent)';
}

function toDateTimeIso(dateValue, timeValue) {
  const date = String(dateValue || '').trim();
  const time = toTimeWithSeconds(timeValue);
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export default function AdminCitasPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const isPreviewMode = location.pathname.endsWith('/preview');

  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [contextData, setContextData] = useState(EMPTY_CONTEXT);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedBarberId, setSelectedBarberId] = useState('');
  const [selectedConfigTab, setSelectedConfigTab] = useState('horario');

  const [servicesLoading, setServicesLoading] = useState(false);
  const [services, setServices] = useState([]);

  const [previewStep, setPreviewStep] = useState('barberos');
  const [previewMonth, setPreviewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [previewDate, setPreviewDate] = useState('');
  const [previewTime, setPreviewTime] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewAvailabilityLoading, setPreviewAvailabilityLoading] = useState(false);
  const [previewAvailabilityMap, setPreviewAvailabilityMap] = useState({});
  const [previewSlotsLoading, setPreviewSlotsLoading] = useState(false);
  const [previewSlots, setPreviewSlots] = useState(() => ALL_TIME_SLOTS.map((time) => ({ hora: time, disponible: false })));

  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleRows, setScheduleRows] = useState(() => buildDefaultScheduleRows());

  const [blocksLoading, setBlocksLoading] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockSaving, setBlockSaving] = useState(false);
  const [blockDeleteId, setBlockDeleteId] = useState('');
  const [blockForm, setBlockForm] = useState({
    fecha: '',
    hora_inicio: '10:00',
    hora_fin: '11:00',
    tipo_bloqueo_codigo: '',
    motivo: '',
  });

  const [daysOffLoading, setDaysOffLoading] = useState(false);
  const [daysOff, setDaysOff] = useState([]);
  const [dayOffDialogOpen, setDayOffDialogOpen] = useState(false);
  const [dayOffSaving, setDayOffSaving] = useState(false);
  const [dayOffDeleteId, setDayOffDeleteId] = useState('');
  const [dayOffForm, setDayOffForm] = useState({
    fecha: '',
    motivo: '',
  });

  const [branchDaysOffLoading, setBranchDaysOffLoading] = useState(false);
  const [branchDaysOff, setBranchDaysOff] = useState([]);
  const [branchDayOffDialogOpen, setBranchDayOffDialogOpen] = useState(false);
  const [branchDayOffSaving, setBranchDayOffSaving] = useState(false);
  const [branchDayOffDeleteId, setBranchDayOffDeleteId] = useState('');
  const [branchDayOffForm, setBranchDayOffForm] = useState({
    fecha: '',
    motivo: '',
  });

  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsSaving, setParamsSaving] = useState(false);
  const [paramsForm, setParamsForm] = useState({
    hold_duracion_min: '5',
    no_show_min: '10',
    dias_anticipacion: '30',
    horas_minimas: '2',
    permitir_acompanantes: false,
    pago_total_obligatorio: true,
    confirmacion_automatica: true,
  });

  const [previewServiceIds, setPreviewServiceIds] = useState([]);
  const [previewCompanionsCount, setPreviewCompanionsCount] = useState(0);
  const [previewCompanionServices, setPreviewCompanionServices] = useState([]);
  const previewServicesScrollRef = useRef(null);
  const [previewServicesCanScroll, setPreviewServicesCanScroll] = useState(false);
  const [previewServicesAtEnd, setPreviewServicesAtEnd] = useState(true);
  const previewAvailabilityRequestSeqRef = useRef(0);
  const previewSlotsRequestSeqRef = useRef(0);
  const previewAvailabilityAbortRef = useRef(null);
  const previewSlotsAbortRef = useRef(null);
  const previewAvailabilityCacheRef = useRef(new Map());
  const previewSlotsCacheRef = useRef(new Map());
  const configLoadCacheRef = useRef(new Set());

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

  const branchList = useMemo(
    () => Array.isArray(contextData?.sucursales) ? contextData.sucursales : [],
    [contextData?.sucursales]
  );

  const branchBarbers = useMemo(() => {
    const allBarbers = Array.isArray(contextData?.barberos) ? contextData.barberos : [];
    if (!selectedBranchId) return allBarbers;
    return allBarbers.filter((barber) => barber.id_sucursal === selectedBranchId);
  }, [contextData?.barberos, selectedBranchId]);

  const selectedBarber = useMemo(
    () => branchBarbers.find((barber) => barber.id_empleado === selectedBarberId) || null,
    [branchBarbers, selectedBarberId]
  );

  const selectedBranch = useMemo(
    () => branchList.find((branch) => branch.id_sucursal === selectedBranchId) || null,
    [branchList, selectedBranchId]
  );

  const servicesById = useMemo(() => {
    const map = new Map();
    (Array.isArray(services) ? services : []).forEach((service) => {
      if (!service?.id_servicio) return;
      map.set(service.id_servicio, service);
    });
    return map;
  }, [services]);

  const previewSelectedServices = useMemo(
    () => previewServiceIds.map((id) => servicesById.get(id)).filter(Boolean),
    [previewServiceIds, servicesById]
  );

  const previewCompanionItems = useMemo(
    () => previewCompanionServices
      .slice(0, previewCompanionsCount)
      .map((id, index) => ({
        index,
        id_servicio: id || '',
        servicio: id ? servicesById.get(id) || null : null,
      })),
    [previewCompanionServices, previewCompanionsCount, servicesById]
  );

  const previewServiceSelectionComplete = useMemo(() => {
    if (previewSelectedServices.length === 0) return false;
    if (!paramsForm.permitir_acompanantes) return true;
    if (previewCompanionsCount === 0) return true;
    return previewCompanionItems.every((item) => Boolean(item.id_servicio));
  }, [paramsForm.permitir_acompanantes, previewCompanionItems, previewCompanionsCount, previewSelectedServices.length]);

  const servicesCsv = useMemo(() => {
    const ids = [
      ...previewSelectedServices.map((item) => item.id_servicio),
      ...previewCompanionItems.map((item) => item.id_servicio).filter(Boolean),
    ];
    return ids.join(',');
  }, [previewCompanionItems, previewSelectedServices]);

  const previewTotalToPay = useMemo(() => {
    const mainTotal = previewSelectedServices.reduce((total, service) => total + Number(service?.precio_hnl || 0), 0);
    const companionsTotal = previewCompanionItems.reduce(
      (total, item) => total + Number(item.servicio?.precio_hnl || 0),
      0
    );
    return mainTotal + companionsTotal;
  }, [previewCompanionItems, previewSelectedServices]);

  const monthRange = useMemo(() => {
    const year = previewMonth.getFullYear();
    const month = previewMonth.getMonth();
    const from = toDateKey(new Date(year, month, 1));
    const to = toDateKey(new Date(year, month + 1, 0));
    return { from, to };
  }, [previewMonth]);

  const previewCanOpenStep = useMemo(() => ({
    barberos: true,
    agenda: Boolean(selectedBarberId),
    confirmar: Boolean(selectedBarberId && previewServiceSelectionComplete && previewDate && previewTime),
  }), [previewDate, previewServiceSelectionComplete, previewTime, selectedBarberId]);

  const showPreviewBlockingLoader = previewAvailabilityLoading && Object.keys(previewAvailabilityMap).length === 0;

  const syncPreviewServicesScrollState = useCallback(() => {
    const scroller = previewServicesScrollRef.current;
    if (!scroller) {
      setPreviewServicesCanScroll(false);
      setPreviewServicesAtEnd(true);
      return;
    }
    const canScroll = scroller.scrollHeight > scroller.clientHeight + 2;
    const isAtEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    setPreviewServicesCanScroll(canScroll);
    setPreviewServicesAtEnd(isAtEnd);
  }, []);

  const getConfigDataCacheKey = useCallback((tabId) => {
    if (!tabId) return '';
    if (tabId === 'parametros') return 'params:global';
    if (tabId === 'sucursal') return selectedBranchId ? `branchDays:${selectedBranchId}` : '';
    if (tabId === 'horario') return selectedBarberId ? `schedule:${selectedBarberId}` : '';
    if (tabId === 'bloqueos' || tabId === 'excepciones') return selectedBarberId ? `blocks:${selectedBarberId}` : '';
    if (tabId === 'dias') {
      const barberKey = selectedBarberId ? `days:${selectedBarberId}` : '';
      const branchKey = selectedBranchId ? `branchDays:${selectedBranchId}` : '';
      return [barberKey, branchKey].filter(Boolean).join('|');
    }
    return '';
  }, [selectedBarberId, selectedBranchId]);

  const exceptionsList = useMemo(() => blocks.filter((item) => !item.es_dia_completo), [blocks]);

  const fetchContext = useCallback(async () => {
    setContextLoading(true);
    setContextError('');
    try {
      const response = await getAdminCitasContexto();
      const payload = response?.data ?? response;
      const nextContext = {
        sucursales: Array.isArray(payload?.sucursales) ? payload.sucursales : [],
        barberos: Array.isArray(payload?.barberos) ? payload.barberos : [],
        tipos_bloqueo: Array.isArray(payload?.tipos_bloqueo) ? payload.tipos_bloqueo : [],
        parametros: payload?.parametros || {},
      };

      setContextData(nextContext);
      setParamsForm((prev) => ({
        ...prev,
        hold_duracion_min: String(nextContext.parametros?.hold_duracion_min ?? prev.hold_duracion_min),
        no_show_min: String(nextContext.parametros?.no_show_min ?? prev.no_show_min),
        permitir_acompanantes: Boolean(nextContext.parametros?.permitir_acompanantes ?? prev.permitir_acompanantes),
        pago_total_obligatorio: Boolean(nextContext.parametros?.pago_total_obligatorio ?? true),
      }));
    } catch (err) {
      if (handleAuthError(err)) return;
      setContextError(extractMessage(err));
    } finally {
      setContextLoading(false);
    }
  }, [handleAuthError]);

  const fetchServices = useCallback(async () => {
    if (!selectedBranchId) {
      setServices([]);
      return;
    }
    setServicesLoading(true);
    try {
      const response = await listAdminServicios({ id_sucursal: selectedBranchId });
      const payload = response?.data ?? response;
      setServices(Array.isArray(payload?.servicios) ? payload.servicios : []);
    } catch (err) {
      if (handleAuthError(err)) return;
      setServices([]);
      notifications.warning('No se pudo cargar servicios para vista previa de citas.', { dedupeKey: 'citas-services-load-warning' });
    } finally {
      setServicesLoading(false);
    }
  }, [handleAuthError, notifications, selectedBranchId]);

  const fetchPreviewAvailability = useCallback(async () => {
    if (!selectedBranchId || !selectedBarberId || !servicesCsv) {
      setPreviewAvailabilityMap({});
      setPreviewAvailabilityLoading(false);
      return;
    }

    const cacheKey = [
      selectedBranchId,
      selectedBarberId,
      servicesCsv,
      monthRange.from,
      monthRange.to,
    ].join('|');
    const cached = previewAvailabilityCacheRef.current.get(cacheKey);
    if (cached) {
      setPreviewAvailabilityMap(cached);
      setPreviewAvailabilityLoading(false);
      setPreviewError('');
      return;
    }

    if (previewAvailabilityAbortRef.current) {
      previewAvailabilityAbortRef.current.abort();
    }
    const controller = new AbortController();
    previewAvailabilityAbortRef.current = controller;
    const requestSeq = previewAvailabilityRequestSeqRef.current + 1;
    previewAvailabilityRequestSeqRef.current = requestSeq;

    setPreviewAvailabilityLoading(true);
    setPreviewError('');
    try {
      const response = await listPublicAgendaDisponibilidad({
        id_sucursal: selectedBranchId,
        id_barbero: selectedBarberId,
        servicios: servicesCsv,
        fecha_desde: monthRange.from,
        fecha_hasta: monthRange.to,
      }, { signal: controller.signal });

      if (requestSeq !== previewAvailabilityRequestSeqRef.current) {
        return;
      }

      const payload = response?.data ?? response;
      const map = {};
      (Array.isArray(payload?.disponibilidad) ? payload.disponibilidad : []).forEach((entry) => {
        if (!entry?.fecha) return;
        map[entry.fecha] = entry;
      });
      previewAvailabilityCacheRef.current.set(cacheKey, map);
      setPreviewAvailabilityMap(map);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (requestSeq !== previewAvailabilityRequestSeqRef.current) return;
      if (handleAuthError(err)) return;
      setPreviewAvailabilityMap({});
      setPreviewError(extractMessage(err));
    } finally {
      if (requestSeq === previewAvailabilityRequestSeqRef.current) {
        setPreviewAvailabilityLoading(false);
      }
    }
  }, [handleAuthError, monthRange, selectedBarberId, selectedBranchId, servicesCsv]);

  const fetchPreviewSlots = useCallback(async () => {
    if (!selectedBranchId || !selectedBarberId || !servicesCsv || !previewDate) {
      setPreviewSlots(ALL_TIME_SLOTS.map((hora) => ({ hora, disponible: false })));
      setPreviewSlotsLoading(false);
      return;
    }

    const cacheKey = [
      selectedBranchId,
      selectedBarberId,
      servicesCsv,
      previewDate,
    ].join('|');
    const cached = previewSlotsCacheRef.current.get(cacheKey);
    if (cached) {
      setPreviewSlots(cached);
      setPreviewTime((prev) => (cached.some((slot) => slot.hora === prev && slot.disponible) ? prev : ''));
      setPreviewSlotsLoading(false);
      setPreviewError('');
      return;
    }

    if (previewSlotsAbortRef.current) {
      previewSlotsAbortRef.current.abort();
    }
    const controller = new AbortController();
    previewSlotsAbortRef.current = controller;
    const requestSeq = previewSlotsRequestSeqRef.current + 1;
    previewSlotsRequestSeqRef.current = requestSeq;

    setPreviewSlotsLoading(true);
    setPreviewError('');
    try {
      const response = await listPublicAgendaHorarios({
        id_sucursal: selectedBranchId,
        id_barbero: selectedBarberId,
        servicios: servicesCsv,
        fecha: previewDate,
      }, { signal: controller.signal });

      if (requestSeq !== previewSlotsRequestSeqRef.current) {
        return;
      }

      const payload = response?.data ?? response;
      const available = new Set(
        (Array.isArray(payload?.horarios) ? payload.horarios : [])
          .map((slot) => String(slot?.hora || '').slice(0, 5))
          .filter(Boolean)
      );
      const mapped = ALL_TIME_SLOTS.map((hora) => ({ hora, disponible: available.has(hora) }));
      previewSlotsCacheRef.current.set(cacheKey, mapped);
      setPreviewSlots(mapped);
      setPreviewTime((prev) => (available.has(prev) ? prev : ''));
    } catch (err) {
      if (controller.signal.aborted) return;
      if (requestSeq !== previewSlotsRequestSeqRef.current) return;
      if (handleAuthError(err)) return;
      setPreviewSlots(ALL_TIME_SLOTS.map((hora) => ({ hora, disponible: false })));
      setPreviewTime('');
      setPreviewError(extractMessage(err));
    } finally {
      if (requestSeq === previewSlotsRequestSeqRef.current) {
        setPreviewSlotsLoading(false);
      }
    }
  }, [handleAuthError, previewDate, selectedBarberId, selectedBranchId, servicesCsv]);

  const fetchSchedule = useCallback(async () => {
    if (!selectedBarberId) return false;
    setScheduleLoading(true);
    try {
      const response = await getAdminCitasHorarios(selectedBarberId);
      const payload = response?.data ?? response;
      setScheduleRows(normalizeScheduleRows(payload?.horarios || []));
      return true;
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-horarios-error' });
      return false;
    } finally {
      setScheduleLoading(false);
    }
  }, [handleAuthError, notifications, selectedBarberId]);

  const fetchBlocks = useCallback(async () => {
    if (!selectedBarberId) return false;
    setBlocksLoading(true);
    try {
      const response = await listAdminCitasBloqueos({ id_empleado: selectedBarberId });
      const payload = response?.data ?? response;
      setBlocks(Array.isArray(payload?.bloqueos) ? payload.bloqueos : []);
      return true;
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-bloqueos-error' });
      return false;
    } finally {
      setBlocksLoading(false);
    }
  }, [handleAuthError, notifications, selectedBarberId]);

  const fetchDaysOff = useCallback(async () => {
    if (!selectedBarberId) return false;
    setDaysOffLoading(true);
    try {
      const response = await listAdminCitasDiasInhabilitados({ id_empleado: selectedBarberId });
      const payload = response?.data ?? response;
      setDaysOff(Array.isArray(payload?.dias_inhabilitados) ? payload.dias_inhabilitados : []);
      return true;
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-days-off-error' });
      return false;
    } finally {
      setDaysOffLoading(false);
    }
  }, [handleAuthError, notifications, selectedBarberId]);

  const fetchBranchDaysOff = useCallback(async () => {
    if (!selectedBranchId) return false;
    setBranchDaysOffLoading(true);
    try {
      const response = await listAdminCitasDiasInhabilitados({ id_sucursal: selectedBranchId, scope: 'sucursal' });
      const payload = response?.data ?? response;
      setBranchDaysOff(Array.isArray(payload?.dias_inhabilitados) ? payload.dias_inhabilitados : []);
      return true;
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-branch-days-off-error' });
      return false;
    } finally {
      setBranchDaysOffLoading(false);
    }
  }, [handleAuthError, notifications, selectedBranchId]);

  const fetchParams = useCallback(async () => {
    setParamsLoading(true);
    try {
      const response = await getAdminCitasParametros();
      const payload = response?.data ?? response;
      setParamsForm((prev) => ({
        ...prev,
        hold_duracion_min: String(payload?.parametros?.hold_duracion_min ?? prev.hold_duracion_min),
        no_show_min: String(payload?.parametros?.no_show_min ?? prev.no_show_min),
        permitir_acompanantes: Boolean(payload?.parametros?.permitir_acompanantes ?? prev.permitir_acompanantes),
        pago_total_obligatorio: Boolean(payload?.parametros?.pago_total_obligatorio ?? true),
      }));
      return true;
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-params-error' });
      return false;
    } finally {
      setParamsLoading(false);
    }
  }, [handleAuthError, notifications]);

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    if (!branchList.length) {
      setSelectedBranchId('');
      return;
    }
    setSelectedBranchId((prev) => (
      branchList.some((branch) => branch.id_sucursal === prev)
        ? prev
        : branchList[0].id_sucursal
    ));
  }, [branchList]);

  useEffect(() => {
    if (!branchBarbers.length) {
      setSelectedBarberId('');
      return;
    }
    setSelectedBarberId((prev) => (
      branchBarbers.some((barber) => barber.id_empleado === prev)
        ? prev
        : branchBarbers[0].id_empleado
    ));
  }, [branchBarbers]);

  useEffect(() => {
    void fetchServices();
  }, [fetchServices]);

  useEffect(() => {
    if (previewAvailabilityAbortRef.current) previewAvailabilityAbortRef.current.abort();
    if (previewSlotsAbortRef.current) previewSlotsAbortRef.current.abort();
    previewAvailabilityCacheRef.current.clear();
    previewSlotsCacheRef.current.clear();
    setPreviewDate('');
    setPreviewTime('');
    setPreviewServiceIds([]);
    setPreviewCompanionsCount(0);
    setPreviewCompanionServices([]);
    setPreviewStep('barberos');
  }, [selectedBarberId, selectedBranchId]);

  useEffect(() => {
    if (!isPreviewMode) return;
    const timer = setTimeout(() => {
      void fetchPreviewAvailability();
    }, 220);
    return () => clearTimeout(timer);
  }, [fetchPreviewAvailability, isPreviewMode]);

  useEffect(() => {
    if (!isPreviewMode) return;
    const timer = setTimeout(() => {
      void fetchPreviewSlots();
    }, 160);
    return () => clearTimeout(timer);
  }, [fetchPreviewSlots, isPreviewMode]);

  useEffect(() => () => {
    if (previewAvailabilityAbortRef.current) previewAvailabilityAbortRef.current.abort();
    if (previewSlotsAbortRef.current) previewSlotsAbortRef.current.abort();
  }, []);

  useEffect(() => {
    if (blockForm.tipo_bloqueo_codigo) return;
    const firstType = contextData?.tipos_bloqueo?.[0]?.tipo_bloqueo_codigo || '';
    if (!firstType) return;
    setBlockForm((prev) => ({ ...prev, tipo_bloqueo_codigo: firstType }));
  }, [blockForm.tipo_bloqueo_codigo, contextData?.tipos_bloqueo]);

  useEffect(() => {
    if (paramsForm.permitir_acompanantes) return;
    if (previewCompanionsCount === 0 && previewCompanionServices.length === 0) return;
    setPreviewCompanionsCount(0);
    setPreviewCompanionServices([]);
  }, [paramsForm.permitir_acompanantes, previewCompanionServices.length, previewCompanionsCount]);

  useEffect(() => {
    setPreviewCompanionServices((prev) => {
      const targetLength = Math.min(Math.max(previewCompanionsCount, 0), MAX_COMPANIONS);
      const next = prev.slice(0, targetLength);
      while (next.length < targetLength) next.push('');
      return next;
    });
  }, [previewCompanionsCount]);

  useEffect(() => {
    setPreviewServiceIds((prev) => prev.filter((id) => servicesById.has(id)));
    setPreviewCompanionServices((prev) => prev.map((id) => (servicesById.has(id) ? id : '')));
  }, [servicesById]);

  useEffect(() => {
    if (previewStep !== 'agenda') return;
    syncPreviewServicesScrollState();
  }, [
    previewCompanionItems.length,
    previewCompanionsCount,
    previewServiceIds.length,
    previewStep,
    services.length,
    syncPreviewServicesScrollState,
  ]);

  useEffect(() => {
    if (isPreviewMode) return;

    let cancelled = false;
    const markLoaded = (key) => {
      if (!key || cancelled) return;
      configLoadCacheRef.current.add(key);
    };

    async function loadConfigData() {
      if (selectedConfigTab === 'dias') {
        const dayKey = selectedBarberId ? `days:${selectedBarberId}` : '';
        const branchKey = selectedBranchId ? `branchDays:${selectedBranchId}` : '';

        if (dayKey && !configLoadCacheRef.current.has(dayKey)) {
          const ok = await fetchDaysOff();
          if (ok) markLoaded(dayKey);
        }
        if (branchKey && !configLoadCacheRef.current.has(branchKey)) {
          const ok = await fetchBranchDaysOff();
          if (ok) markLoaded(branchKey);
        }
        return;
      }

      const cacheKey = getConfigDataCacheKey(selectedConfigTab);
      if (cacheKey && configLoadCacheRef.current.has(cacheKey)) return;

      let loaded = false;
      if (selectedConfigTab === 'horario') loaded = await fetchSchedule();
      else if (selectedConfigTab === 'bloqueos' || selectedConfigTab === 'excepciones') loaded = await fetchBlocks();
      else if (selectedConfigTab === 'parametros') loaded = await fetchParams();
      else if (selectedConfigTab === 'sucursal') loaded = await fetchBranchDaysOff();

      if (loaded) markLoaded(cacheKey);
    }

    void loadConfigData();

    return () => {
      cancelled = true;
    };
  }, [
    fetchBlocks,
    fetchBranchDaysOff,
    fetchDaysOff,
    fetchParams,
    fetchSchedule,
    getConfigDataCacheKey,
    isPreviewMode,
    selectedBarberId,
    selectedBranchId,
    selectedConfigTab,
  ]);

  function moveMonth(delta) {
    setPreviewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }

  function selectBarberForPreview(barberId) {
    setSelectedBarberId(barberId);
    setPreviewStep('agenda');
  }

  function selectPreviewStep(stepId) {
    if (!previewCanOpenStep[stepId]) return;
    setPreviewStep(stepId);
  }

  function handlePreviewDayClick(dateKey, isEnabled) {
    if (!isEnabled) return;
    setPreviewDate(dateKey);
    setPreviewTime('');
  }

  function handlePreviewSlotClick(slot) {
    if (!slot.disponible) return;
    setPreviewTime(slot.hora);
  }

  function togglePreviewService(serviceId) {
    if (!serviceId) return;
    setPreviewServiceIds((prev) => (
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    ));
    setPreviewDate('');
    setPreviewTime('');
  }

  function updatePreviewCompanionService(index, serviceId) {
    setPreviewCompanionServices((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push('');
      next[index] = serviceId;
      return next;
    });
    setPreviewDate('');
    setPreviewTime('');
  }

  function handlePreviewCompanionCountChange(rawValue) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    const normalized = Math.min(MAX_COMPANIONS, Math.max(0, Math.floor(parsed)));
    setPreviewCompanionsCount(normalized);
    setPreviewDate('');
    setPreviewTime('');
  }

  function handlePreviewServicesScrollHintClick() {
    const scroller = previewServicesScrollRef.current;
    if (!scroller) return;
    scroller.scrollBy({ top: 220, behavior: 'smooth' });
  }

  function continueFromAgenda() {
    if (!previewServiceSelectionComplete) {
      notifications.warning('Debes seleccionar servicios del cliente y de cada acompanante para continuar.', {
        dedupeKey: 'citas-preview-services-required',
      });
      return;
    }
    if (!previewDate || !previewTime) {
      notifications.warning('Selecciona una fecha y una hora disponibles para continuar.', {
        dedupeKey: 'citas-preview-datetime-required',
      });
      return;
    }
    setPreviewStep('confirmar');
  }

  function resetPreview() {
    setPreviewStep('barberos');
    setPreviewDate('');
    setPreviewTime('');
    setPreviewServiceIds([]);
    setPreviewCompanionsCount(0);
    setPreviewCompanionServices([]);
  }

  async function saveSchedule() {
    if (!selectedBarberId) return;
    setScheduleSaving(true);
    try {
      const payload = {
        horarios: scheduleRows.map((row) => ({
          dia_semana: row.dia_semana,
          hora_inicio: toTimeWithSeconds(row.hora_inicio),
          hora_fin: toTimeWithSeconds(row.hora_fin),
          almuerzo_inicio: row.almuerzo_inicio ? toTimeWithSeconds(row.almuerzo_inicio) : null,
          almuerzo_fin: row.almuerzo_fin ? toTimeWithSeconds(row.almuerzo_fin) : null,
          activo: Boolean(row.activo),
        })),
      };
      const response = await putAdminCitasHorarios(selectedBarberId, payload);
      const result = response?.data ?? response;
      setScheduleRows(normalizeScheduleRows(result?.horarios || []));
      notifications.success('Horario guardado.', { dedupeKey: 'citas-horarios-save' });
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-horarios-save-error' });
    } finally {
      setScheduleSaving(false);
    }
  }

  function updateScheduleRow(dayCode, patch) {
    setScheduleRows((prev) => prev.map((row) => (
      row.dia_semana === dayCode ? { ...row, ...patch } : row
    )));
  }

  async function handleCreateBlock() {
    if (!selectedBarber) return;
    const inicioAt = toDateTimeIso(blockForm.fecha, blockForm.hora_inicio);
    const finAt = toDateTimeIso(blockForm.fecha, blockForm.hora_fin);
    if (!inicioAt || !finAt) {
      notifications.warning('Completa fecha y rango horario vÃ¡lido.', { dedupeKey: 'citas-block-create-invalid' });
      return;
    }
    if (new Date(finAt).getTime() <= new Date(inicioAt).getTime()) {
      notifications.warning('La hora de fin debe ser mayor a la hora de inicio.', { dedupeKey: 'citas-block-create-range' });
      return;
    }
    if (!blockForm.tipo_bloqueo_codigo) {
      notifications.warning('Selecciona un tipo de bloqueo.', { dedupeKey: 'citas-block-create-type' });
      return;
    }

    setBlockSaving(true);
    try {
      await createAdminCitasBloqueo({
        id_empleado: selectedBarber.id_empleado,
        id_sucursal: selectedBarber.id_sucursal,
        tipo_bloqueo_codigo: blockForm.tipo_bloqueo_codigo,
        inicio_at: inicioAt,
        fin_at: finAt,
        motivo: blockForm.motivo || null,
      });
      setBlockDialogOpen(false);
      setBlockForm((prev) => ({
        ...prev,
        fecha: '',
        hora_inicio: '10:00',
        hora_fin: '11:00',
        motivo: '',
      }));
      notifications.success('Bloqueo creado.', { dedupeKey: 'citas-block-create-ok' });
      void fetchBlocks();
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-block-create-error' });
    } finally {
      setBlockSaving(false);
    }
  }

  async function handleDeleteBlock(idBloqueo) {
    if (!idBloqueo) return;
    setBlockDeleteId(idBloqueo);
    try {
      await deleteAdminCitasBloqueo(idBloqueo);
      notifications.warning('Bloqueo eliminado.', { dedupeKey: 'citas-block-delete-ok' });
      void fetchBlocks();
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-block-delete-error' });
    } finally {
      setBlockDeleteId('');
    }
  }

  async function handleCreateDayOff() {
    if (!selectedBarber) return;
    if (!dayOffForm.fecha) {
      notifications.warning('Selecciona una fecha para inhabilitar.', { dedupeKey: 'citas-dayoff-create-date' });
      return;
    }
    setDayOffSaving(true);
    try {
      await createAdminCitasDiaInhabilitado({
        id_empleado: selectedBarber.id_empleado,
        id_sucursal: selectedBarber.id_sucursal,
        fecha: dayOffForm.fecha,
        motivo: dayOffForm.motivo || null,
      });
      setDayOffDialogOpen(false);
      setDayOffForm({ fecha: '', motivo: '' });
      notifications.success('DÃ­a inhabilitado creado.', { dedupeKey: 'citas-dayoff-create-ok' });
      void fetchDaysOff();
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-dayoff-create-error' });
    } finally {
      setDayOffSaving(false);
    }
  }

  async function handleDeleteDayOff(idBloqueo) {
    if (!idBloqueo) return;
    setDayOffDeleteId(idBloqueo);
    try {
      await deleteAdminCitasDiaInhabilitado(idBloqueo);
      notifications.warning('DÃ­a inhabilitado eliminado.', { dedupeKey: 'citas-dayoff-delete-ok' });
      void fetchDaysOff();
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-dayoff-delete-error' });
    } finally {
      setDayOffDeleteId('');
    }
  }

  async function handleDeleteBranchDayOff(idBloqueo) {
    if (!idBloqueo) return;
    setBranchDayOffDeleteId(idBloqueo);
    try {
      await deleteAdminCitasDiaInhabilitado(idBloqueo, {
        scope: 'sucursal',
        id_sucursal: selectedBranchId,
      });
      notifications.warning('Bloqueo por sucursal eliminado.', { dedupeKey: 'citas-branch-dayoff-delete-ok' });
      void fetchBranchDaysOff();
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-branch-dayoff-delete-error' });
    } finally {
      setBranchDayOffDeleteId('');
    }
  }

  async function handleCreateBranchDayOff() {
    if (!selectedBranchId) return;
    if (!branchDayOffForm.fecha) {
      notifications.warning('Selecciona una fecha para inhabilitar.', { dedupeKey: 'citas-branch-dayoff-create-date' });
      return;
    }
    setBranchDayOffSaving(true);
    try {
      await createAdminCitasDiaInhabilitado({
        id_sucursal: selectedBranchId,
        fecha: branchDayOffForm.fecha,
        motivo: branchDayOffForm.motivo || null,
      });
      setBranchDayOffDialogOpen(false);
      setBranchDayOffForm({ fecha: '', motivo: '' });
      notifications.success('DÃ­a inhabilitado por sucursal creado.', { dedupeKey: 'citas-branch-dayoff-create-ok' });
      void fetchBranchDaysOff();
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-branch-dayoff-create-error' });
    } finally {
      setBranchDayOffSaving(false);
    }
  }

  function handleEditException() {
    notifications.info('La edicion de excepciones se habilitara en una siguiente iteracion.', {
      dedupeKey: 'citas-excepciones-edit-info',
    });
  }

  function handleEditBranchDayOff() {
    notifications.info('La edicion de bloqueos por sucursal se habilitara en una siguiente iteracion.', {
      dedupeKey: 'citas-sucursal-edit-info',
    });
  }

  async function handleSaveParams() {
    const hold = Number(paramsForm.hold_duracion_min);
    const noShow = Number(paramsForm.no_show_min);
    if (!Number.isFinite(hold) || hold <= 0 || !Number.isFinite(noShow) || noShow <= 0) {
      notifications.warning('Los parÃ¡metros deben ser nÃºmeros positivos.', { dedupeKey: 'citas-params-invalid' });
      return;
    }
    setParamsSaving(true);
    try {
      const response = await patchAdminCitasParametros({
        hold_duracion_min: hold,
        no_show_min: noShow,
        permitir_acompanantes: Boolean(paramsForm.permitir_acompanantes),
        pago_total_obligatorio: true,
      });
      const payload = response?.data ?? response;
      setParamsForm((prev) => ({
        ...prev,
        hold_duracion_min: String(payload?.parametros?.hold_duracion_min ?? hold),
        no_show_min: String(payload?.parametros?.no_show_min ?? noShow),
        permitir_acompanantes: Boolean(payload?.parametros?.permitir_acompanantes ?? prev.permitir_acompanantes),
        pago_total_obligatorio: Boolean(payload?.parametros?.pago_total_obligatorio ?? true),
      }));
      notifications.success('ParÃ¡metros guardados.', { dedupeKey: 'citas-params-save-ok' });
    } catch (err) {
      if (handleAuthError(err)) return;
      notifications.error(extractMessage(err), { dedupeKey: 'citas-params-save-error' });
    } finally {
      setParamsSaving(false);
    }
  }

  function openPreviewPaymentDemo() {
    notifications.info('Vista previa: integracion de pago total en modo demostracion.', {
      dedupeKey: 'citas-preview-payment-demo',
    });
  }

  const calendarCells = useMemo(() => buildCalendarCells(previewMonth), [previewMonth]);
  const selectedBarberMeta = useMemo(() => getBarberMeta(selectedBarber), [selectedBarber]);
  function renderBarberChips({ firstNameOnly = false } = {}) {
    if (!branchBarbers.length) return null;
    return (
      <div className="citas-barber-chips scrollbar-hide">
        {branchBarbers.map((barber) => (
          <button
            key={barber.id_empleado}
            type="button"
            className={`citas-barber-chip-btn ${barber.id_empleado === selectedBarberId ? 'is-active' : ''}`}
            onClick={() => setSelectedBarberId(barber.id_empleado)}
          >
            <span className="citas-barber-chip-avatar">{getInitials(barber.nombre_completo)}</span>
            <span>{firstNameOnly ? getFirstName(barber.nombre_completo) : barber.nombre_completo}</span>
          </button>
        ))}
      </div>
    );
  }

  function renderPreviewStepBarberos() {
    if (!branchBarbers.length) {
      return (
        <EmptyState
          icon={Scissors}
          title="Sin barberos disponibles"
          description="No hay barberos activos para la sucursal seleccionada."
        />
      );
    }

    return (
      <>
        <p className="citas-preview-note">Vista previa del catÃ¡logo de barberos como lo verÃ¡ el cliente:</p>
        <div className="citas-barber-grid">
          {branchBarbers.map((barber) => {
            const meta = getBarberMeta(barber);
            const isSelected = barber.id_empleado === selectedBarberId;
            const handleCardKeyDown = (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectBarberForPreview(barber.id_empleado);
              }
            };
            return (
              <div
                key={barber.id_empleado}
                role="button"
                tabIndex={0}
                onClick={() => selectBarberForPreview(barber.id_empleado)}
                onKeyDown={handleCardKeyDown}
                className={`citas-barber-card ${isSelected ? 'is-selected' : ''}`}
              >
                <div className="citas-barber-media" style={{ background: meta.gradient }}>
                  <span className="citas-barber-chip">{meta.specialty}</span>
                  <span className="citas-barber-avatar">{getInitials(barber.nombre_completo)}</span>
                </div>
                <div className="citas-barber-body">
                  <div className="citas-barber-name">{barber.nombre_completo}</div>
                  <div className="citas-barber-years">{meta.years} aÃ±os de experiencia</div>
                  <Button className="mt-2" size="sm">
                    Elegir
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  function renderPreviewStepAgenda() {
    if (!Array.isArray(services) || services.length === 0) {
      return (
        <EmptyState
          icon={Scissors}
          title="Sin servicios disponibles"
          description="No hay servicios activos para esta sucursal."
        />
      );
    }

    const canContinue = previewServiceSelectionComplete && previewDate && previewTime;

    return (
      <div className="citas-agenda-layout">
        <div className="citas-agenda-main">
          <div className="citas-surface p-5">
            <h3 className="citas-confirm-title">Servicio</h3>
            <p className="citas-selected-date">
              Selecciona uno o mas servicios para continuar con la agenda.
            </p>
            <div
              ref={previewServicesScrollRef}
              className="citas-services-scroll mt-4"
              onScroll={syncPreviewServicesScrollState}
            >
              <div className="citas-services-grid">
                {services.map((service) => {
                  const isSelected = previewServiceIds.includes(service.id_servicio);
                  return (
                    <button
                      key={service.id_servicio}
                      type="button"
                      className={`citas-service-card ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => togglePreviewService(service.id_servicio)}
                    >
                      <div className="citas-service-name">{service.nombre_servicio}</div>
                      <div className="citas-service-meta">
                        <span>{formatCurrencyHnl(service.precio_hnl)}</span>
                        <span>{getServiceDurationLabel(service)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {previewServicesCanScroll && !previewServicesAtEnd ? (
              <button
                type="button"
                className="citas-services-scroll-hint"
                onClick={handlePreviewServicesScrollHintClick}
                aria-label="Ver mas servicios"
              >
                <ChevronDown size={16} />
              </button>
            ) : null}

            {paramsForm.permitir_acompanantes ? (
              <div className="mt-4">
                <div className="citas-services-companion-head">
                  <h3 className="citas-confirm-title">Acompanantes</h3>
                  <Input
                    type="number"
                    min={0}
                    max={MAX_COMPANIONS}
                    className="citas-inline-input w-24"
                    value={previewCompanionsCount}
                    onChange={(event) => handlePreviewCompanionCountChange(event.target.value)}
                  />
                </div>

                {previewCompanionsCount > 0 ? (
                  <div className="mt-3 flex flex-col gap-3">
                    {previewCompanionItems.map((item) => (
                      <div key={`companion-${item.index}`} className="citas-service-companion-row">
                        <Label className="mf-label">Acompanante {item.index + 1}</Label>
                        <select
                          className="citas-inline-select"
                          value={item.id_servicio}
                          onChange={(event) => updatePreviewCompanionService(item.index, event.target.value)}
                        >
                          <option value="">Selecciona servicio</option>
                          {services.map((service) => (
                            <option key={`opt-${item.index}-${service.id_servicio}`} value={service.id_servicio}>
                              {service.nombre_servicio} · {formatCurrencyHnl(service.precio_hnl)} · {getServiceDurationLabel(service)}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="citas-selected-date mt-2">Sin acompanantes para esta cita.</p>
                )}
              </div>
            ) : null}

            <div className="citas-services-summary-row mt-4">
              <span>Servicios cliente: {previewSelectedServices.length}</span>
              <span>Acompanantes: {paramsForm.permitir_acompanantes ? previewCompanionsCount : 0}</span>
              <span>Total a pagar: {formatCurrencyHnl(previewTotalToPay)}</span>
            </div>
          </div>

          <div className="citas-surface">
            <div className="citas-calendar-head">
              <div className="citas-calendar-profile">
                <span className="citas-barber-avatar">{getInitials(selectedBarber?.nombre_completo)}</span>
                <div>
                  <div className="citas-calendar-profile-name">{selectedBarber?.nombre_completo || 'Selecciona barbero'}</div>
                  <div className="citas-calendar-profile-sub">{selectedBarberMeta.specialty}</div>
                </div>
              </div>
            </div>

            <div className="citas-calendar-head">
              <button type="button" className="citas-nav-round" onClick={() => moveMonth(-1)} aria-label="Mes anterior">
                <ArrowLeft size={16} />
              </button>
              <div className="citas-calendar-month">{formatMonth(previewMonth)}</div>
              <button type="button" className="citas-nav-round" onClick={() => moveMonth(1)} aria-label="Mes siguiente">
                <ArrowRight size={16} />
              </button>
            </div>

            <div className="citas-calendar-grid">
              <div className="citas-weekdays">
                {WEEK_DAYS.map((day) => (
                  <div key={day} className="citas-weekday">{day}</div>
                ))}
              </div>
              <div className="citas-days">
                {calendarCells.map((cell) => {
                  const dayInfo = previewAvailabilityMap[cell.key];
                  const available = Boolean(dayInfo?.disponible);
                  const isSelected = previewDate === cell.key;
                  const classNames = [
                    'citas-day-btn',
                    cell.inMonth ? 'is-in-month' : 'is-outside',
                    available ? 'is-available' : 'is-unavailable',
                    isSelected ? 'is-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      className={classNames}
                      onClick={() => handlePreviewDayClick(cell.key, cell.inMonth && available)}
                      disabled={!cell.inMonth || !available}
                      title={formatDateOnly(cell.key)}
                    >
                      {cell.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="citas-surface">
          <div className="citas-side-panel">
            <h3 className="citas-side-title">Horarios disponibles</h3>
            <p className="citas-selected-date">
              {previewDate ? `Fecha seleccionada: ${formatFriendlyDate(previewDate)}` : 'Selecciona una fecha'}
            </p>

            {previewSlotsLoading ? (
              <LoadingSpinner />
            ) : (
              <div className="citas-timeslots">
                {previewSlots.map((slot) => {
                  const isSelected = previewTime === slot.hora;
                  const className = [
                    'citas-slot-btn',
                    slot.disponible ? '' : 'is-unavailable',
                    isSelected ? 'is-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button
                      key={slot.hora}
                      type="button"
                      className={className}
                      onClick={() => handlePreviewSlotClick(slot)}
                      disabled={!slot.disponible}
                    >
                      {slot.hora}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="citas-slot-legend">
              <span><span className="citas-slot-dot is-available" /> Disponible</span>
              <span><span className="citas-slot-dot is-unavailable" /> No disponible</span>
              <span><span className="citas-slot-dot is-selected" /> Seleccionado</span>
            </div>

            <div className="mt-auto pt-3">
              <Button
                className="w-full"
                onClick={continueFromAgenda}
                disabled={!canContinue}
              >
                Continuar
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderPreviewStepConfirmar() {
    return (
      <div className="citas-confirm-wrap">
        <div className="citas-surface p-5">
          <h3 className="citas-confirm-title">Vista previa de confirmaciÃ³n</h3>
          <div className="mt-4 flex items-center gap-3">
            <span className="citas-barber-avatar">{getInitials(selectedBarber?.nombre_completo)}</span>
            <div>
              <div className="citas-barber-name">{selectedBarber?.nombre_completo || 'Barbero'}</div>
              <div className="citas-calendar-profile-sub">{selectedBarberMeta.specialty}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="citas-confirm-row">
              <span>Fecha</span>
              <span>{formatFriendlyDate(previewDate)}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Hora</span>
              <span>{previewTime || 'Sin hora'}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Pago requerido</span>
              <span>Pago total del servicio</span>
            </div>
            <div className="citas-confirm-row">
              <span>Total a pagar</span>
              <span>{formatCurrencyHnl(previewTotalToPay)}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Acompanantes</span>
              <span>{paramsForm.permitir_acompanantes ? previewCompanionsCount : 0}</span>
            </div>
          </div>

          <div className="citas-confirm-services mt-4">
            <h4 className="citas-confirm-subtitle">Servicios del cliente</h4>
            {previewSelectedServices.length === 0 ? (
              <p className="citas-selected-date">Sin servicios seleccionados.</p>
            ) : (
              previewSelectedServices.map((service) => (
                <div key={`main-${service.id_servicio}`} className="citas-confirm-service-item">
                  <span>{service.nombre_servicio}</span>
                  <span>{formatCurrencyHnl(service.precio_hnl)} Â· {getServiceDurationLabel(service)}</span>
                </div>
              ))
            )}

            {paramsForm.permitir_acompanantes && previewCompanionsCount > 0 ? (
              <>
                <h4 className="citas-confirm-subtitle mt-3">Servicios de acompanantes</h4>
                {previewCompanionItems.map((item) => (
                  <div key={`comp-${item.index}`} className="citas-confirm-service-item">
                    <span>Acompanante {item.index + 1}</span>
                    <span>
                      {item.servicio
                        ? `${item.servicio.nombre_servicio} Â· ${formatCurrencyHnl(item.servicio.precio_hnl)} Â· ${getServiceDurationLabel(item.servicio)}`
                        : 'Sin servicio seleccionado'}
                    </span>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </div>

        <Button className="w-full" onClick={openPreviewPaymentDemo}>
          Ir a Pagadito (Pago total)
        </Button>

        <button
          type="button"
          className="text-sm text-[var(--mf-text-2)]"
          onClick={resetPreview}
        >
          â† Reiniciar vista previa
        </button>
      </div>
    );
  }

  function renderHorarioTab() {
    if (!selectedBarber) {
      return <EmptyState icon={Clock3} title="Selecciona un barbero" description="Primero elige un barbero para editar su horario." />;
    }
    return (
      <div className="citas-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h3 className="mf-font-display text-[22px] md:text-[24px] text-[var(--mf-accent)]">
            Horario Semanal Â· {selectedBarber.nombre_completo}
          </h3>
          <Button onClick={saveSchedule} disabled={scheduleSaving || scheduleLoading} className="gap-2">
            <Save size={14} />
            {scheduleSaving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </div>
        {scheduleLoading ? (
          <div className="px-5 pb-5"><LoadingSpinner /></div>
        ) : (
          <div className="citas-schedule-wrap">
            <table className="citas-schedule-table">
              <thead>
                <tr>
                  <th>DÃ­a</th>
                  <th>Hora inicio</th>
                  <th>Hora fin</th>
                  <th>Almuerzo ini.</th>
                  <th>Almuerzo fin</th>
                  <th>DuraciÃ³n</th>
                  <th>Activo</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((row) => (
                  <tr key={row.dia_semana}>
                    <td>{row.dia_label}</td>
                    <td>
                      <Input
                        type="time"
                        className="citas-inline-input"
                        value={row.hora_inicio}
                        onChange={(event) => updateScheduleRow(row.dia_semana, { hora_inicio: event.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        type="time"
                        className="citas-inline-input"
                        value={row.hora_fin}
                        onChange={(event) => updateScheduleRow(row.dia_semana, { hora_fin: event.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        type="time"
                        className="citas-inline-input"
                        value={row.almuerzo_inicio}
                        onChange={(event) => updateScheduleRow(row.dia_semana, { almuerzo_inicio: event.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        type="time"
                        className="citas-inline-input"
                        value={row.almuerzo_fin}
                        onChange={(event) => updateScheduleRow(row.dia_semana, { almuerzo_fin: event.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="citas-inline-select"
                        value={row.duracion_min}
                        onChange={(event) => updateScheduleRow(row.dia_semana, { duracion_min: Number(event.target.value) })}
                      >
                        <option value={30}>30 min</option>
                      </select>
                    </td>
                    <td>
                      <div className="citas-switch-inline">
                        <button
                          type="button"
                          className={`citas-switch-track ${row.activo ? 'is-on' : ''}`}
                          onClick={() => updateScheduleRow(row.dia_semana, { activo: !row.activo })}
                          aria-label={`Cambiar estado ${row.dia_label}`}
                        />
                        <span>{row.activo ? 'Activo' : 'Inactivo'}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderBloqueosTab() {
    if (!selectedBarber) {
      return <EmptyState icon={SlidersHorizontal} title="Selecciona un barbero" description="Primero elige un barbero para administrar bloqueos." />;
    }
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[var(--mf-text-2)] text-lg">
            Bloqueos de horas para <span className="font-semibold text-[var(--mf-text)]">{selectedBarber.nombre_completo}</span>
          </p>
          <Button className="gap-2" onClick={() => setBlockDialogOpen(true)}>
            <Plus size={14} /> Nuevo bloqueo
          </Button>
        </div>

        {blocksLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="citas-block-list">
            {blocks.length === 0 ? (
              <EmptyState icon={SlidersHorizontal} title="Sin bloqueos" description="No hay bloqueos registrados para este barbero." />
            ) : (
              blocks.map((block) => (
                <div key={block.id_bloqueo} className="citas-block-item">
                  <span className="citas-block-color" style={{ background: getBlockTone(block.tipo_bloqueo_codigo) }} />
                  <div>
                    <p className="text-xl font-semibold text-[var(--mf-text)]">{block.fecha}</p>
                  </div>
                  <div className="text-[var(--mf-text-2)]">
                    {new Intl.DateTimeFormat('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(block.inicio_at))}
                    {' '}â€“{' '}
                    {new Intl.DateTimeFormat('es-HN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(block.fin_at))}
                  </div>
                  <div className="text-[var(--mf-text-2)]">{block.motivo || 'Sin motivo'}</div>
                  <div className="flex items-center justify-end gap-2">
                    <span className="citas-tag">{block.tipo_bloqueo_codigo}</span>
                    <button
                      type="button"
                      className="text-red-500 disabled:opacity-45"
                      onClick={() => handleDeleteBlock(block.id_bloqueo)}
                      disabled={blockDeleteId === block.id_bloqueo}
                      aria-label="Eliminar bloqueo"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  function renderDaysTab() {
    if (!selectedBarber) {
      return <EmptyState icon={CalendarDays} title="Selecciona un barbero" description="Primero elige un barbero para administrar dÃ­as inhabilitados." />;
    }

    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[var(--mf-text-2)] text-lg">
            DÃ­as inhabilitados para <span className="font-semibold text-[var(--mf-text)]">{selectedBarber.nombre_completo}</span>
          </p>
          <Button className="gap-2" onClick={() => setDayOffDialogOpen(true)}>
            <Plus size={14} /> Inhabilitar dÃ­a
          </Button>
        </div>

        {daysOffLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="citas-block-list">
            {daysOff.length === 0 ? (
              <EmptyState icon={CalendarDays} title="Sin dÃ­as inhabilitados" description="No hay dÃ­as completos bloqueados para este barbero." />
            ) : (
              daysOff.map((item) => (
                <div key={item.id_bloqueo} className="citas-block-item">
                  <span className="citas-block-color" style={{ background: '#dc2626' }} />
                  <div>
                    <p className="text-xl font-semibold text-[var(--mf-text)]">{item.fecha}</p>
                  </div>
                  <div className="text-[var(--mf-text-2)]">DÃ­a completo</div>
                  <div className="text-[var(--mf-text-2)]">{item.motivo || 'Sin motivo'}</div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="text-red-500 disabled:opacity-45"
                      onClick={() => handleDeleteDayOff(item.id_bloqueo)}
                      disabled={dayOffDeleteId === item.id_bloqueo}
                      aria-label="Eliminar dÃ­a inhabilitado"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  function renderParamsTab() {
    return (
      <div className="citas-surface citas-params-card">
        <h3 className="mf-font-display text-[30px] text-[var(--mf-accent)]">Parametros Globales de Agenda</h3>

        {paramsLoading ? (
          <div className="pt-3"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="citas-param-row">
              <div className="citas-param-copy">
                <h4>Duracion de hold (minutos)</h4>
                <p>Tiempo que se reserva el horario antes de confirmacion de pago.</p>
              </div>
              <Input
                type="number"
                min={1}
                className="citas-inline-input citas-param-value"
                value={paramsForm.hold_duracion_min}
                onChange={(event) => setParamsForm((prev) => ({ ...prev, hold_duracion_min: event.target.value }))}
              />
            </div>

            <div className="citas-param-row">
              <div className="citas-param-copy">
                <h4>Tolerancia de no-show (minutos)</h4>
                <p>Tiempo maximo de espera antes de marcar como ausente.</p>
              </div>
              <Input
                type="number"
                min={1}
                className="citas-inline-input citas-param-value"
                value={paramsForm.no_show_min}
                onChange={(event) => setParamsForm((prev) => ({ ...prev, no_show_min: event.target.value }))}
              />
            </div>

            <div className="citas-param-row">
              <div className="citas-param-copy">
                <h4>Dias de anticipacion para agendar</h4>
                <p>Campo informativo en esta fase (sin persistencia backend).</p>
              </div>
              <Input
                type="number"
                disabled
                className="citas-inline-input citas-param-value"
                value={paramsForm.dias_anticipacion}
                onChange={(event) => setParamsForm((prev) => ({ ...prev, dias_anticipacion: event.target.value }))}
              />
            </div>

            <div className="citas-param-row">
              <div className="citas-param-copy">
                <h4>Horas minimas de anticipacion</h4>
                <p>Campo informativo en esta fase (sin persistencia backend).</p>
              </div>
              <Input
                type="number"
                disabled
                className="citas-inline-input citas-param-value"
                value={paramsForm.horas_minimas}
                onChange={(event) => setParamsForm((prev) => ({ ...prev, horas_minimas: event.target.value }))}
              />
            </div>

            <div className="citas-param-row">
              <div className="citas-param-copy">
                <h4>Pago total obligatorio</h4>
                <p>Regla de negocio activa: para agendar se paga el total del servicio.</p>
              </div>
              <button type="button" className="citas-switch-track is-on" disabled />
            </div>

            <div className="citas-param-row">
              <div className="citas-param-copy">
                <h4>Confirmacion automatica</h4>
                <p>Toggle informativo para comportamiento esperado.</p>
              </div>
              <button
                type="button"
                className={`citas-switch-track ${paramsForm.confirmacion_automatica ? 'is-on' : ''}`}
                onClick={() => setParamsForm((prev) => ({ ...prev, confirmacion_automatica: !prev.confirmacion_automatica }))}
              />
            </div>

            <div className="citas-param-row">
              <div className="citas-param-copy">
                <h4>Permitir acompanantes</h4>
                <p>Habilita seleccionar servicios para acompanantes en vista previa.</p>
              </div>
              <button
                type="button"
                className={`citas-switch-track ${paramsForm.permitir_acompanantes ? 'is-on' : ''}`}
                onClick={() => setParamsForm((prev) => ({ ...prev, permitir_acompanantes: !prev.permitir_acompanantes }))}
              />
            </div>
          </>
        )}

        <div className="mt-4">
          <Button className="w-full gap-2" onClick={handleSaveParams} disabled={paramsSaving || paramsLoading}>
            <Check size={14} />
            {paramsSaving ? 'Guardando...' : 'Guardar parametros'}
          </Button>
        </div>
      </div>
    );
  }
  function renderExceptionsTab() {
    if (!selectedBarber) {
      return <EmptyState icon={AlertTriangle} title="Selecciona un barbero" description="Primero elige un barbero para administrar excepciones." />;
    }

    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[var(--mf-text-2)] text-lg">
            Excepciones de horario para <span className="font-semibold text-[var(--mf-text)]">{selectedBarber.nombre_completo}</span>
          </p>
          <Button className="gap-2" onClick={() => setBlockDialogOpen(true)}>
            <Plus size={15} /> Nueva excepciï¿½n
          </Button>
        </div>

        {blocksLoading ? (
          <LoadingSpinner />
        ) : exceptionsList.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Sin excepciones para mostrar"
            description="No se detectaron excepciones en los bloqueos del barbero seleccionado."
          />
        ) : (
          <div className="citas-block-list">
            {exceptionsList.map((item) => (
              <div key={item.id_bloqueo} className="citas-exception-card">
                <span className="citas-block-color" style={{ background: getBlockTone(item.tipo_bloqueo_codigo) }} />
                <div className="citas-exception-main">
                  <p className="text-[28px] font-semibold text-[var(--mf-text)]">{item.fecha}</p>
                  <div className="text-[var(--mf-text-2)]">{formatTimeRange(item.inicio_at, item.fin_at)}</div>
                  <div className="text-[var(--mf-text-2)]">{item.motivo || 'Sin motivo'}</div>
                </div>
                <div className="citas-card-actions">
                  <button
                    type="button"
                    className="citas-icon-action"
                    onClick={handleEditException}
                    aria-label="Editar excepciï¿½n"
                    title="Editar excepciï¿½n"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    type="button"
                    className="citas-icon-action is-danger disabled:opacity-45"
                    onClick={() => handleDeleteBlock(item.id_bloqueo)}
                    disabled={blockDeleteId === item.id_bloqueo}
                    aria-label="Eliminar excepciï¿½n"
                    title="Eliminar excepciï¿½n"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderSucursalTab() {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[var(--mf-text-2)] text-lg">
            Inhabilitar un dï¿½a completo por sucursal
          </p>
          <Button className="gap-2" onClick={() => setBranchDayOffDialogOpen(true)}>
            <Plus size={15} /> Bloquear dï¿½a
          </Button>
        </div>

        {branchDaysOffLoading ? (
          <LoadingSpinner />
        ) : branchDaysOff.length === 0 ? (
          <EmptyState
            icon={Ban}
            title="Sin bloqueos por sucursal"
            description="No hay dï¿½as completos bloqueados en la sucursal seleccionada."
          />
        ) : (
          <div className="citas-block-list">
            {branchDaysOff.map((item) => (
              <div key={item.id_bloqueo} className="citas-branch-card">
                <span className="citas-block-color" style={{ background: '#dc2626' }} />
                <div className="text-xl font-semibold text-[var(--mf-text)]">{item.nombre_sucursal || selectedBranch?.nombre_sucursal || 'Sucursal'}</div>
                <div className="text-[var(--mf-accent)] text-lg">{item.fecha}</div>
                <div className="text-[var(--mf-text-2)]">{item.motivo || 'Sin motivo'}</div>
                <div className="citas-card-actions">
                  <button
                    type="button"
                    className="citas-icon-action"
                    onClick={handleEditBranchDayOff}
                    aria-label="Editar bloqueo por sucursal"
                    title="Editar bloqueo por sucursal"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    type="button"
                    className="citas-icon-action is-danger disabled:opacity-45"
                    onClick={() => handleDeleteBranchDayOff(item.id_bloqueo)}
                    disabled={branchDayOffDeleteId === item.id_bloqueo}
                    aria-label="Eliminar bloqueo por sucursal"
                    title="Eliminar bloqueo por sucursal"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderPreviewMode() {
    return (
      <>
        <div className="citas-toolbar">
          <span className="citas-mode-pill">Modo Vista Previa - Solo lectura</span>
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

        {showPreviewBlockingLoader ? <LoadingSpinner /> : null}
        {previewError ? <ErrorBanner message={previewError} onRetry={fetchPreviewAvailability} /> : null}

        {previewStep === 'barberos' && renderPreviewStepBarberos()}
        {previewStep === 'agenda' && renderPreviewStepAgenda()}
        {previewStep === 'confirmar' && renderPreviewStepConfirmar()}
      </>
    );
  }

  function renderConfigMode() {
    return (
      <>
        <div className="citas-config-tabs scrollbar-hide">
          {CONFIG_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={`citas-config-tab ${selectedConfigTab === tab.id ? 'is-active' : ''}`}
                onClick={() => setSelectedConfigTab(tab.id)}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="citas-config-rail" />
        {['horario', 'bloqueos', 'dias', 'excepciones'].includes(selectedConfigTab)
          ? renderBarberChips({ firstNameOnly: selectedConfigTab === 'excepciones' })
          : null}

        {selectedConfigTab === 'horario' && renderHorarioTab()}
        {selectedConfigTab === 'bloqueos' && renderBloqueosTab()}
        {selectedConfigTab === 'dias' && renderDaysTab()}
        {selectedConfigTab === 'parametros' && renderParamsTab()}
        {selectedConfigTab === 'excepciones' && renderExceptionsTab()}
        {selectedConfigTab === 'sucursal' && renderSucursalTab()}
      </>
    );
  }

  if (contextLoading) {
    return (
      <div className="mf-page citas-page">
        <LoadingSpinner />
      </div>
    );
  }

  if (contextError) {
    return (
      <div className="mf-page citas-page">
        <ErrorBanner message={contextError} onRetry={fetchContext} />
      </div>
    );
  }

  return (
    <div className="mf-page citas-page">
      {!servicesLoading && services.length === 0 && isPreviewMode ? (
        <ErrorBanner message="No hay servicios activos para calcular disponibilidad en vista previa." />
      ) : null}

      {isPreviewMode ? renderPreviewMode() : renderConfigMode()}

      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo bloqueo</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label className="mf-label">Fecha</Label>
              <Input
                type="date"
                className="mf-input mt-1"
                value={blockForm.fecha}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, fecha: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mf-label">Hora inicio</Label>
              <Input
                type="time"
                className="mf-input mt-1"
                value={blockForm.hora_inicio}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, hora_inicio: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mf-label">Hora fin</Label>
              <Input
                type="time"
                className="mf-input mt-1"
                value={blockForm.hora_fin}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, hora_fin: event.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Tipo de bloqueo</Label>
              <select
                className="mf-select mt-1"
                value={blockForm.tipo_bloqueo_codigo}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, tipo_bloqueo_codigo: event.target.value }))}
              >
                {contextData.tipos_bloqueo.map((type) => (
                  <option key={type.tipo_bloqueo_codigo} value={type.tipo_bloqueo_codigo}>
                    {type.descripcion || type.tipo_bloqueo_codigo}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Motivo</Label>
              <Input
                className="mf-input mt-1"
                value={blockForm.motivo}
                onChange={(event) => setBlockForm((prev) => ({ ...prev, motivo: event.target.value }))}
                placeholder="Ej. Cita mÃ©dica"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)} disabled={blockSaving}>Cancelar</Button>
            <Button onClick={handleCreateBlock} disabled={blockSaving}>{blockSaving ? 'Guardando...' : 'Guardar bloqueo'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dayOffDialogOpen} onOpenChange={setDayOffDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Inhabilitar dÃ­a completo</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="mf-label">Fecha</Label>
              <Input
                type="date"
                className="mf-input mt-1"
                value={dayOffForm.fecha}
                onChange={(event) => setDayOffForm((prev) => ({ ...prev, fecha: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mf-label">Motivo</Label>
              <Input
                className="mf-input mt-1"
                value={dayOffForm.motivo}
                onChange={(event) => setDayOffForm((prev) => ({ ...prev, motivo: event.target.value }))}
                placeholder="Ej. Feriado nacional"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDayOffDialogOpen(false)} disabled={dayOffSaving}>Cancelar</Button>
            <Button onClick={handleCreateDayOff} disabled={dayOffSaving}>{dayOffSaving ? 'Guardando...' : 'Inhabilitar dÃ­a'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={branchDayOffDialogOpen} onOpenChange={setBranchDayOffDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bloquear dÃ­a por sucursal</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="mf-label">Fecha</Label>
              <Input
                type="date"
                className="mf-input mt-1"
                value={branchDayOffForm.fecha}
                onChange={(event) => setBranchDayOffForm((prev) => ({ ...prev, fecha: event.target.value }))}
              />
            </div>
            <div>
              <Label className="mf-label">Motivo</Label>
              <Input
                className="mf-input mt-1"
                value={branchDayOffForm.motivo}
                onChange={(event) => setBranchDayOffForm((prev) => ({ ...prev, motivo: event.target.value }))}
                placeholder="Ej. Mantenimiento del local"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBranchDayOffDialogOpen(false)} disabled={branchDayOffSaving}>Cancelar</Button>
            <Button onClick={handleCreateBranchDayOff} disabled={branchDayOffSaving}>
              {branchDayOffSaving ? 'Guardando...' : 'Bloquear dÃ­a'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



