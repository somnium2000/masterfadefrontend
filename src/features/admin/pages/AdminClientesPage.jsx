import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Building2, CheckCircle2, Eye, KeyRound, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import {
  activateAdminPersonaCliente,
  createAdminPersonaCliente,
  getAdminPersonaCliente,
  inactivateAdminPersonaCliente,
  listAdminPersonasCatalogos,
  listAdminPersonasClientes,
  updateAdminPersonaCliente,
} from '../lib/adminPersonasApi.js';
import { Button } from '../../../components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import ViewToggle from '../../../components/data/ViewToggle.jsx';
import DataCard from '../../../components/data/DataCard.jsx';
import CardsCarousel from '../../../components/data/CardsCarousel.jsx';
import HoverActionButton from '../../../components/data/HoverActionButton.jsx';
import DetailInfoModalContent from '../../../components/data/DetailInfoModalContent.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import ImageUploaderField from '../../../components/data/ImageUploaderField.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { replaceItemById } from '../../../lib/collectionState.js';

const ACCESS_LABELS = {
  pendiente_password: 'ContraseÃ±a pendiente',
  activo: 'Activo',
  bloqueado: 'Bloqueado',
  inactivo: 'Inactivo',
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI_PATTERN = /^\d{13}$/;
const RTN_PATTERN = /^\d{14}$/;
const TABLE_PAGE_SIZE = 10;
const CARDS_PAGE_SIZE = 6;

const FORM_DEFAULTS = {
  nombres: '',
  apellidos: '',
  fecha_nacimiento: '',
  fecha_ingreso: '',
  genero_codigo: '',
  dni: '',
  rtn: '',
  telefono_principal: '',
  direccion_texto: '',
  observaciones: '',
  habilitar_acceso: true,
  correo_principal: '',
  id_sucursal_origen: '',
  estado: true,
  consentimiento_marketing: false,
  acepta_terminos: false,
  foto_perfil_asset_id: null,
  foto_perfil_signed_url: '',
};

const CLIENTE_FILTER_DEFAULTS = {
  estadoCliente: 'all',
  tipoAcceso: 'all',
  estadoAcceso: 'all',
};

const CLIENTE_ESTADO_LABELS = {
  activo: 'Cliente: Activo',
  inactivo: 'Cliente: Inactivo',
};

const CLIENTE_TIPO_ACCESO_LABELS = {
  con: 'Con acceso',
  sin: 'Sin acceso',
};

function quickFilterButtonClass(isActive) {
  // AM: Estado visual montado para botones rapidos, con feedback inmediato de seleccion.
  return isActive
    ? 'rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
    : 'rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60';
}

function extractMessage(err) {
  const rawMessage = String(err?.data?.error?.message || err?.message || '').trim();
  if (!rawMessage) return 'No se pudo completar la operacion de clientes.';
  const lowered = rawMessage.toLowerCase();
  const hasSensitivePattern =
    lowered.includes('sql')
    || lowered.includes('syntax error')
    || lowered.includes('supabase')
    || lowered.includes('auth.users')
    || lowered.includes('stack')
    || lowered.includes('trace')
    || lowered.includes('relation')
    || lowered.includes('constraint');
  if (hasSensitivePattern) {
    return 'Ocurrio un error procesando la solicitud. Intenta nuevamente.';
  }
  return rawMessage;
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function toDateTimeIso(dateValue) {
  if (!dateValue) return null;
  const normalized = String(dateValue).slice(0, 10);
  // AM: date-time estable en UTC al mediodia para preservar el dia logico seleccionado.
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T12:00:00.000Z` : null;
}

function normalizeUnicodeText(value) {
  return String(value || '').normalize('NFC').trim();
}

function mapClienteToForm(cliente) {
  return {
    nombres: cliente?.nombres || '',
    apellidos: cliente?.apellidos || '',
    fecha_nacimiento: cliente?.fecha_nacimiento ? String(cliente.fecha_nacimiento).slice(0, 10) : '',
    fecha_ingreso: cliente?.fecha_ingreso ? String(cliente.fecha_ingreso).slice(0, 10) : '',
    genero_codigo: cliente?.genero_codigo || '',
    dni: cliente?.dni || '',
    rtn: cliente?.rtn || '',
    telefono_principal: cliente?.telefono_principal || '',
    direccion_texto: cliente?.direccion_texto || '',
    observaciones: cliente?.observaciones || '',
    habilitar_acceso: Boolean(cliente?.tiene_acceso),
    correo_principal: cliente?.correo_principal || '',
    id_sucursal_origen: cliente?.id_sucursal_origen || '',
    estado: Boolean(cliente?.estado_cliente),
    consentimiento_marketing: Boolean(cliente?.consentimiento_marketing),
    acepta_terminos: Boolean(cliente?.acepta_terminos),
    foto_perfil_asset_id: cliente?.foto_perfil_asset_id || null,
    foto_perfil_signed_url: cliente?.foto_perfil_signed_url || '',
  };
}

function validateForm(values, { isEditing, selectedCliente }) {
  if (!normalizeUnicodeText(values.nombres)) return 'Nombres es obligatorio.';
  if (!normalizeUnicodeText(values.apellidos)) return 'Apellidos es obligatorio.';
  const correo = values.correo_principal.trim().toLowerCase();
  if (!correo || !EMAIL_PATTERN.test(correo)) {
    return 'Correo principal es obligatorio y debe ser valido.';
  }
  const dni = normalizeDigits(values.dni);
  if (!dni) return 'DNI es obligatorio.';
  if (!DNI_PATTERN.test(dni)) return 'DNI debe tener 13 digitos.';
  if (!normalizeUnicodeText(values.telefono_principal)) return 'Telefono es obligatorio.';
  const rtn = normalizeDigits(values.rtn);
  if (rtn && !RTN_PATTERN.test(rtn)) return 'RTN debe tener 14 digitos si se proporciona.';

  if (values.fecha_nacimiento) {
    const birth = new Date(`${values.fecha_nacimiento}T00:00:00`);
    if (birth.getTime() > Date.now()) return 'fecha_nacimiento no puede ser futura.';
  }
  if (values.fecha_ingreso) {
    // AM: "Fecha de cliente" no debe registrar fechas futuras para evitar trazabilidad invalida.
    const since = new Date(`${values.fecha_ingreso}T00:00:00`);
    if (since.getTime() > Date.now()) return 'Fecha de cliente no puede ser futura.';
  }

  // AM: Si el cliente ya tiene usuario interno, el acceso se administra por estado (no deshabilitando toggle).
  if (isEditing && selectedCliente?.id_usuario && !values.habilitar_acceso) {
    return 'Este cliente ya tiene acceso. Usa la accion de inactivar para restringirlo.';
  }

  return null;
}

function buildPayload(values) {
  return {
    persona: {
      nombres: normalizeUnicodeText(values.nombres),
      apellidos: normalizeUnicodeText(values.apellidos),
      fecha_nacimiento: values.fecha_nacimiento || null,
      genero_codigo: normalizeUnicodeText(values.genero_codigo) || null,
      dni: normalizeDigits(values.dni) || null,
      rtn: normalizeDigits(values.rtn) || null,
      telefono_principal: normalizeUnicodeText(values.telefono_principal) || null,
      direccion_texto: normalizeUnicodeText(values.direccion_texto) || null,
      observaciones: normalizeUnicodeText(values.observaciones) || null,
    },
    acceso: {
      habilitar_acceso: true,
      correo_principal: values.correo_principal.trim().toLowerCase(),
    },
    cliente: {
      id_sucursal_origen: values.id_sucursal_origen || null,
      fecha_ingreso: toDateTimeIso(values.fecha_ingreso),
      estado: Boolean(values.estado),
      consentimiento_marketing: Boolean(values.consentimiento_marketing),
      acepta_terminos: Boolean(values.acepta_terminos),
      foto_perfil_asset_id: values.foto_perfil_asset_id || null,
    },
  };
}

function AccessBadge({ cliente }) {
  if (!cliente?.tiene_acceso) {
    return <span className="mf-badge mf-badge-muted">Sin acceso</span>;
  }

  const state = String(cliente.estado_acceso || '').toLowerCase();
  if (state === 'activo') return <span className="mf-badge mf-badge-green">Activo</span>;
  if (state === 'bloqueado' || state === 'inactivo') return <span className="mf-badge mf-badge-red">{ACCESS_LABELS[state]}</span>;
  return <span className="mf-badge mf-badge-gold">{ACCESS_LABELS.pendiente_password}</span>;
}

export default function AdminClientesPage() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [view, setView] = useState(() => {
    try {
      const value = localStorage.getItem('mf-view-clientes');
      return value === 'table' || value === 'cards' ? value : 'cards';
    } catch {
      return 'cards';
    }
  });

  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [selectedCliente, setSelectedCliente] = useState(null);
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(CLIENTE_FILTER_DEFAULTS);
  const notifications = useNotifications();

  // AM: Filtro compuesto por submodulo para busqueda rapida y filtros funcionales.
  const filteredClientes = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return clientes.filter((cliente) => {
      if (searchValue) {
        const searchable = [
          cliente?.nombre_completo,
          cliente?.correo_principal,
          cliente?.dni,
          cliente?.telefono_principal,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(searchValue)) return false;
      }

      if (filters.estadoCliente !== 'all') {
        const expected = filters.estadoCliente === 'activo';
        if (Boolean(cliente?.estado_cliente) !== expected) return false;
      }

      if (filters.tipoAcceso !== 'all') {
        const expected = filters.tipoAcceso === 'con';
        if (Boolean(cliente?.tiene_acceso) !== expected) return false;
      }

      if (filters.estadoAcceso !== 'all' && String(cliente?.estado_acceso || '') !== filters.estadoAcceso) {
        return false;
      }

      return true;
    });
  }, [clientes, filters, search]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== 'all').length,
    [filters]
  );
  const currentPageSize = view === 'table' ? TABLE_PAGE_SIZE : CARDS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredClientes.length / currentPageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedClientes = useMemo(() => {
    const start = (safePage - 1) * currentPageSize;
    return filteredClientes.slice(start, start + currentPageSize);
  }, [currentPageSize, filteredClientes, safePage]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      chips.push({ key: 'search', label: `Busqueda: ${trimmedSearch}` });
    }
    if (filters.estadoCliente !== 'all') {
      chips.push({ key: 'estadoCliente', label: CLIENTE_ESTADO_LABELS[filters.estadoCliente] || 'Estado cliente' });
    }
    if (filters.tipoAcceso !== 'all') {
      chips.push({ key: 'tipoAcceso', label: CLIENTE_TIPO_ACCESO_LABELS[filters.tipoAcceso] || 'Tipo acceso' });
    }
    if (filters.estadoAcceso !== 'all') {
      chips.push({ key: 'estadoAcceso', label: `Acceso: ${ACCESS_LABELS[filters.estadoAcceso] || filters.estadoAcceso}` });
    }
    return chips;
  }, [filters, search]);

  function clearAllFilters() {
    setSearch('');
    setFilters(CLIENTE_FILTER_DEFAULTS);
    setPage(1);
  }

  function clearFilterChip(key) {
    if (key === 'search') {
      setSearch('');
      setPage(1);
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: 'all' }));
    setPage(1);
  }

  useEffect(() => {
    setPage(1);
  }, [search, filters, view]);

  const fetchClientes = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setListError('');
    }
    try {
      const response = await listAdminPersonasClientes();
      const payload = response?.data ?? response;
      setClientes(Array.isArray(payload?.clientes) ? payload.clientes : []);
    } catch (err) {
      if (err.status === 401) return navigate('/login');
      if (err.status === 403) return navigate('/unauthorized');
      if (!silent) {
        setListError(extractMessage(err));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [navigate]);

  const fetchCatalogos = useCallback(async () => {
    try {
      const response = await listAdminPersonasCatalogos();
      const payload = response?.data ?? response;
      setSucursales(Array.isArray(payload?.sucursales) ? payload.sucursales : []);
    } catch {
      setSucursales([]);
    }
  }, []);

  useEffect(() => {
    void fetchClientes();
    void fetchCatalogos();
  }, [fetchCatalogos, fetchClientes]);

  function openCreate() {
    setEditingId('');
    setSelectedCliente(null);
    setFormValues(FORM_DEFAULTS);
    setFormError('');
    setFormOpen(true);
  }

  async function openEdit(idCliente) {
    setFormError('');
    setFormLoading(true);
    try {
      const response = await getAdminPersonaCliente(idCliente);
      const payload = response?.data ?? response;
      const cliente = payload?.cliente || null;
      setSelectedCliente(cliente);
      setEditingId(idCliente);
      setFormValues(mapClienteToForm(cliente));
      setFormOpen(true);
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'personas-clientes-open-edit-error' });
    } finally {
      setFormLoading(false);
    }
  }

  async function openDetail(idCliente) {
    setFormLoading(true);
    try {
      const response = await getAdminPersonaCliente(idCliente);
      const payload = response?.data ?? response;
      setSelectedCliente(payload?.cliente || null);
      setDetailOpen(true);
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'personas-clientes-open-detail-error' });
    } finally {
      setFormLoading(false);
    }
  }

  async function handleSubmit() {
    if (formLoading) return;
    const error = validateForm(formValues, { isEditing: Boolean(editingId), selectedCliente });
    if (error) {
      setFormError(error);
      return;
    }
    setFormError('');
    setFormLoading(true);

    try {
      const payload = buildPayload(formValues);
      const response = editingId
        ? await updateAdminPersonaCliente(editingId, payload)
        : await createAdminPersonaCliente(payload);
      const data = response?.data ?? response;
      const baseMessage = editingId ? 'Cliente actualizado.' : 'Cliente creado.';
      notifications.success(baseMessage, { dedupeKey: 'personas-clientes-save-ok' });
      if (data?.setup_password?.mensaje) {
        // AM: RetroalimentaciÃ³n reutilizable del envÃ­o setup password en alta/ediciÃ³n de cliente con acceso.
        const tone = data?.setup_password?.enviado ? 'info' : 'warning';
        notifications[tone](data.setup_password.mensaje, { dedupeKey: 'personas-clientes-setup-message' });
      }
      setFormOpen(false);
      setEditingId('');
      setSelectedCliente(null);
      setFormValues(FORM_DEFAULTS);
      if (data?.cliente) {
        setClientes((prev) => replaceItemById(prev, data.cliente, (entry) => entry?.id_cliente));
      }
      // AM: Revalida en segundo plano para no mostrar recarga brusca al usuario.
      void fetchClientes({ silent: true });
    } catch (err) {
      setFormError(extractMessage(err));
    } finally {
      setFormLoading(false);
    }
  }

  function requestToggleLifecycle(cliente) {
    setConfirmTarget(cliente || null);
  }

  async function handleToggleLifecycle() {
    const cliente = confirmTarget;
    if (!cliente || actionLoadingId) return;
    const isActive = Boolean(cliente?.estado_cliente);
    setActionLoadingId(cliente.id_cliente);
    try {
      if (isActive) {
        const response = await inactivateAdminPersonaCliente(cliente.id_cliente);
        const payload = response?.data ?? response;
        if (payload?.cliente) {
          setClientes((prev) => replaceItemById(prev, payload.cliente, (entry) => entry?.id_cliente));
        }
        notifications.warning('Cliente inactivado y acceso bloqueado.', { dedupeKey: 'personas-clientes-toggle-ok' });
      } else {
        const response = await activateAdminPersonaCliente(cliente.id_cliente);
        const payload = response?.data ?? response;
        if (payload?.cliente) {
          setClientes((prev) => replaceItemById(prev, payload.cliente, (entry) => entry?.id_cliente));
        }
        notifications.success('Cliente activado y acceso restaurado segun estado de credenciales.', { dedupeKey: 'personas-clientes-toggle-ok' });
      }
      setConfirmTarget(null);
      void fetchClientes({ silent: true });
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'personas-clientes-toggle-error' });
    } finally {
      setActionLoadingId('');
    }
  }

  function renderActions(cliente) {
    const loadingActions = actionLoadingId === cliente.id_cliente;
    const isActive = Boolean(cliente.estado_cliente);
    return (
      <div className="flex w-full flex-wrap items-center justify-start gap-2">
        <HoverActionButton
          icon={<Eye size={14} strokeWidth={2} />}
          label="Ver detalle"
          title="Ver detalle de cliente"
          disabled={loadingActions}
          onClick={() => openDetail(cliente.id_cliente)}
        />
        <HoverActionButton
          icon={<Pencil size={14} strokeWidth={2} />}
          label="Editar"
          title="Editar cliente"
          disabled={loadingActions}
          onClick={() => openEdit(cliente.id_cliente)}
        />
        <HoverActionButton
          icon={isActive ? <Ban size={14} strokeWidth={2} /> : <CheckCircle2 size={14} strokeWidth={2} />}
          label={loadingActions ? (isActive ? 'Inactivando...' : 'Activando...') : (isActive ? 'Inactivar' : 'Activar')}
          title={isActive ? 'Inactivar cliente' : 'Activar cliente'}
          tone={isActive ? 'danger' : 'success'}
          disabled={loadingActions}
          onClick={() => requestToggleLifecycle(cliente)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      {/* AM: Replica el header base de Servicios para unificar estructura visual en Personas. */}
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Personas - Gestion</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Clientes</h1>
            <p className="text-sm text-[var(--mf-text-2)]">Gestion operativa de clientes, acceso y estado comercial.</p>
          </div>

          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[var(--mf-text-2)]">
                {loading ? 'Cargando...' : `${filteredClientes.length} de ${clientes.length} registro(s)`}
              </span>
              <ViewToggle defaultView={view} onViewChange={setView} storageKey="clientes" />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[320px]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nombre, correo o DNI..."
                  className="pl-9 pr-9"
                />
                {search.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--mf-text-2)] transition-colors hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)]"
                    aria-label="Limpiar busqueda"
                    title="Limpiar busqueda"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={15} /> Filtros
                {activeFilterCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-xs text-[var(--mf-accent-text)]">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
              {(activeFilterCount > 0 || search.trim()) ? (
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={clearAllFilters}>
                  <RotateCcw size={13} /> Limpiar
                </Button>
              ) : null}
              <Button onClick={openCreate} className="gap-2">
                <Plus size={15} /> Nuevo
              </Button>
            </div>
          </div>
        </div>
      </header>

      {activeFilterChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_45%,transparent)] px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Activos</span>
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => clearFilterChip(chip.key)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-2.5 py-1 text-xs text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)]/60"
            >
              <span>{chip.label}</span>
              <X size={11} />
            </button>
          ))}
        </div>
      ) : null}

      {listError && <ErrorBanner message={listError} onRetry={fetchClientes} />}
      {loading && !listError && <LoadingSpinner />}

      {!loading && !listError && filteredClientes.length === 0 && (
        <EmptyState
          icon={Users}
          title="Sin resultados"
          description={clientes.length ? 'No hay coincidencias con la busqueda o filtros actuales.' : 'No hay clientes registrados en este momento.'}
        />
      )}

      {!loading && !listError && filteredClientes.length > 0 && view === 'cards' && (
        <CardsCarousel
          items={pagedClientes}
          getItemKey={(cliente) => cliente?.id_cliente}
          renderItem={(cliente, index, pageIndex) => (
            <DataCard
              key={cliente.id_cliente}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<Users size={16} />}
              title={cliente.nombre_completo || 'Cliente'}
              subtitle={cliente.correo_principal || 'Sin correo'}
              badge={<AccessBadge cliente={cliente} />}
              fields={[
                { label: 'Estado cliente', value: cliente.estado_cliente ? 'Activo' : 'Inactivo' },
                { label: 'Fecha de cliente', value: cliente.fecha_ingreso ? String(cliente.fecha_ingreso).slice(0, 10) : 'Sin fecha' },
                { label: 'Marketing', value: cliente.consentimiento_marketing ? 'Si' : 'No' },
              ]}
              actions={renderActions(cliente)}
            />
          )}
        />
      )}

      {!loading && !listError && filteredClientes.length > 0 && view === 'table' && (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
                <TableRow className="border-[var(--mf-nav-border)]">
                  <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                  <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Correo</TableHead>
                  <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acceso</TableHead>
                  <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acciones</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
              {pagedClientes.map((cliente) => (
                <TableRow key={cliente.id_cliente} className="border-[var(--mf-nav-border)]">
                  <TableCell className="font-medium">{cliente.nombre_completo || 'Cliente'}</TableCell>
                  <TableCell>{cliente.correo_principal || 'Sin correo'}</TableCell>
                  <TableCell className="text-center"><AccessBadge cliente={cliente} /></TableCell>
                  <TableCell className="text-center">{renderActions(cliente)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && !listError && filteredClientes.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2">
          <p className="text-xs text-[var(--mf-text-2)]">
            Mostrando {pagedClientes.length} registro(s) de {filteredClientes.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Anterior
            </Button>
            <span className="text-xs text-[var(--mf-text-2)]">Pagina {safePage} de {totalPages}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={safePage >= totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              Siguiente
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle></DialogHeader>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Nombres *</Label>
              <Input className="mf-input mt-1" value={formValues.nombres} onChange={(e) => setFormValues((p) => ({ ...p, nombres: e.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">Apellidos *</Label>
              <Input className="mf-input mt-1" value={formValues.apellidos} onChange={(e) => setFormValues((p) => ({ ...p, apellidos: e.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">Fecha de nacimiento</Label>
              <Input type="date" className="mf-input mt-1" value={formValues.fecha_nacimiento} onChange={(e) => setFormValues((p) => ({ ...p, fecha_nacimiento: e.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">Fecha de cliente</Label>
              <Input type="date" className="mf-input mt-1" value={formValues.fecha_ingreso} onChange={(e) => setFormValues((p) => ({ ...p, fecha_ingreso: e.target.value }))} />
              <p className="mt-1 text-xs text-[var(--mf-text-2)]">
                {/* AM: Helper de negocio para evitar ambiguedad del campo fecha_ingreso en clientes. */}
                Fecha desde la que contamos a esta persona como cliente para historial y reportes.
              </p>
            </div>
            <div>
              <Label className="mf-label">DNI</Label>
              <Input className="mf-input mt-1" value={formValues.dni} onChange={(e) => setFormValues((p) => ({ ...p, dni: e.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">RTN (opcional)</Label>
              <Input className="mf-input mt-1" value={formValues.rtn} onChange={(e) => setFormValues((p) => ({ ...p, rtn: e.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">Telefono</Label>
              <Input className="mf-input mt-1" value={formValues.telefono_principal} onChange={(e) => setFormValues((p) => ({ ...p, telefono_principal: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Correo principal *</Label>
              <Input className="mf-input mt-1" type="email" value={formValues.correo_principal} onChange={(e) => setFormValues((p) => ({ ...p, correo_principal: e.target.value }))} />
              <p className="mt-1 text-xs text-[var(--mf-text-2)]">
                {/* AM: Regla obligatoria: el correo se conserva como identidad de login cuando exista acceso. */}
                Este correo identifica al cliente y se usa como login cuando tenga acceso.
              </p>
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Direccion</Label>
              <Input className="mf-input mt-1" value={formValues.direccion_texto} onChange={(e) => setFormValues((p) => ({ ...p, direccion_texto: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Observaciones</Label>
              <Input className="mf-input mt-1" value={formValues.observaciones} onChange={(e) => setFormValues((p) => ({ ...p, observaciones: e.target.value }))} />
            </div>

            <div className="sm:col-span-2">
              {editingId ? (
                <ImageUploaderField
                  label="Foto de perfil privada"
                  helperText="Imagen interna del cliente (bucket privado). La vista usa URL firmada temporal."
                  scopeKey="private_client_profile"
                  entityType="cliente"
                  entityId={editingId}
                  idSucursal={formValues.id_sucursal_origen || selectedCliente?.id_sucursal_origen || null}
                  allowedMimeTypes={['image/jpeg', 'image/png', 'image/webp']}
                  valueAssetId={formValues.foto_perfil_asset_id}
                  initialPreviewUrl={formValues.foto_perfil_signed_url}
                  onChange={(payload) => {
                    setFormValues((prev) => ({
                      ...prev,
                      foto_perfil_asset_id: payload?.asset_id || null,
                      foto_perfil_signed_url: payload?.signed_read_url || payload?.public_url || '',
                    }));
                  }}
                />
              ) : (
                <p className="rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] px-3 py-2 text-xs text-[var(--mf-text-2)]">
                  Guarda primero el cliente para habilitar carga de foto de perfil privada.
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 rounded-[12px] border border-[var(--mf-nav-border)] p-3 text-sm">
            <p className="text-xs text-[var(--mf-text-2)]">
              Cliente con acceso habilitado. Para restringir el login utiliza la accion de inactivar.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <div>
                <Label className="mf-label">Sucursal de origen (opcional)</Label>
                <select className="mf-select mt-1" value={formValues.id_sucursal_origen} onChange={(e) => setFormValues((p) => ({ ...p, id_sucursal_origen: e.target.value }))}>
                  <option value="">Sin sucursal de origen</option>
                  {sucursales.map((sucursal) => <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre_sucursal}</option>)}
                </select>
              </div>
              <p className="text-xs text-[var(--mf-text-2)]">El cliente creara su propia contrasena con flujo seguro.</p>

              <label className="mt-1 flex items-center gap-2">
                <input type="checkbox" checked={formValues.consentimiento_marketing} onChange={(e) => setFormValues((p) => ({ ...p, consentimiento_marketing: e.target.checked }))} />
                <span>Consentimiento de marketing</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={formValues.acepta_terminos} onChange={(e) => setFormValues((p) => ({ ...p, acepta_terminos: e.target.checked }))} />
                <span>Aceptacion de terminos</span>
              </label>
            </div>
          </div>

          {formError && <p className="mt-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-sm text-red-400">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={formLoading}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={formLoading}>{formLoading ? 'Guardando...' : editingId ? 'Actualizar cliente' : 'Crear cliente'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-5xl">
          <DialogHeader><DialogTitle>Detalle Cliente</DialogTitle></DialogHeader>
          {selectedCliente && (
            /* AM: Vista de detalle premium por secciones para mostrar informacion completa sin formato plano. */
            <DetailInfoModalContent
              summary={{
                icon: <Users size={16} />,
                title: selectedCliente.nombre_completo || '-',
                subtitle: selectedCliente.correo_principal || 'Sin correo',
                badge: <AccessBadge cliente={selectedCliente} />,
              }}
              sections={[
                {
                  id: 'identidad',
                  title: 'Identidad',
                  icon: <Users size={14} />,
                  fields: [
                    {
                      label: 'Foto perfil',
                      value: selectedCliente.foto_perfil_signed_url
                        ? (
                          <img
                            src={selectedCliente.foto_perfil_signed_url}
                            alt={`Foto de ${selectedCliente.nombre_completo || 'cliente'}`}
                            className="h-24 w-24 rounded-lg border border-[var(--mf-nav-border)] object-cover"
                            loading="lazy"
                          />
                        )
                        : 'Sin foto',
                    },
                    { label: 'Nombre', value: selectedCliente.nombre_completo || '-' },
                    { label: 'Correo', value: selectedCliente.correo_principal || 'Sin correo' },
                    { label: 'DNI', value: selectedCliente.dni || '-' },
                    { label: 'RTN', value: selectedCliente.rtn || '-' },
                    { label: 'Telefono', value: selectedCliente.telefono_principal || '-' },
                    { label: 'Fecha nacimiento', value: selectedCliente.fecha_nacimiento ? String(selectedCliente.fecha_nacimiento).slice(0, 10) : '-' },
                    { label: 'Direccion', value: selectedCliente.direccion_texto || '-', span: 'full' },
                    { label: 'Observaciones', value: selectedCliente.observaciones || '-', span: 'full' },
                  ],
                },
                {
                  id: 'cliente',
                  title: 'Cliente',
                  icon: <Building2 size={14} />,
                  fields: [
                    { label: 'Estado cliente', value: selectedCliente.estado_cliente ? 'Activo' : 'Inactivo' },
                    { label: 'Fecha de cliente', value: selectedCliente.fecha_ingreso ? String(selectedCliente.fecha_ingreso).slice(0, 10) : '-' },
                    { label: 'Consentimiento marketing', value: selectedCliente.consentimiento_marketing ? 'Si' : 'No' },
                    { label: 'Acepta terminos', value: selectedCliente.acepta_terminos ? 'Si' : 'No' },
                  ],
                },
                {
                  id: 'acceso',
                  title: 'Acceso',
                  icon: <KeyRound size={14} />,
                  fields: [
                    { label: 'Estado acceso', value: <AccessBadge cliente={selectedCliente} /> },
                    { label: 'Credenciales completadas', value: selectedCliente.credenciales_completadas_at ? new Date(selectedCliente.credenciales_completadas_at).toLocaleString() : 'No' },
                    { label: 'Ultimo login', value: selectedCliente.ultimo_login_at ? new Date(selectedCliente.ultimo_login_at).toLocaleString() : 'Sin registro' },
                  ],
                },
              ]}
            />
          )}
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open && !actionLoadingId) setConfirmTarget(null);
        }}
        tone={confirmTarget?.estado_cliente ? 'danger' : 'warning'}
        title={confirmTarget?.estado_cliente ? 'Inactivar cliente' : 'Activar cliente'}
        description={
          confirmTarget
            ? `Vas a ${confirmTarget.estado_cliente ? 'inactivar' : 'activar'} a ${confirmTarget.nombre_completo || 'este cliente'}. Esta accion tambien actualiza su acceso de usuario cuando aplique.`
            : ''
        }
        confirmLabel={confirmTarget?.estado_cliente ? 'Inactivar' : 'Activar'}
        cancelLabel="Cancelar"
        loading={Boolean(actionLoadingId)}
        onConfirm={handleToggleLifecycle}
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Clientes</DialogTitle>
          </DialogHeader>
          {/* AM: Atajos para filtrar rapidamente sin configurar todos los campos manualmente. */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, estadoCliente: prev.estadoCliente === 'activo' ? 'all' : 'activo' }))}
              className={quickFilterButtonClass(filters.estadoCliente === 'activo')}
            >
              Solo activos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, tipoAcceso: prev.tipoAcceso === 'con' ? 'all' : 'con' }))}
              className={quickFilterButtonClass(filters.tipoAcceso === 'con')}
            >
              Con acceso
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, tipoAcceso: prev.tipoAcceso === 'sin' ? 'all' : 'sin' }))}
              className={quickFilterButtonClass(filters.tipoAcceso === 'sin')}
            >
              Sin acceso
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Estado cliente</Label>
              <select
                className="mf-select mt-1"
                value={filters.estadoCliente}
                onChange={(event) => setFilters((prev) => ({ ...prev, estadoCliente: event.target.value }))}
              >
                <option value="all">Todos</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div>
              <Label className="mf-label">Tipo de acceso</Label>
              <select
                className="mf-select mt-1"
                value={filters.tipoAcceso}
                onChange={(event) => setFilters((prev) => ({ ...prev, tipoAcceso: event.target.value }))}
              >
                <option value="all">Todos</option>
                <option value="con">Con acceso</option>
                <option value="sin">Sin acceso</option>
              </select>
            </div>
            <div>
              <Label className="mf-label">Estado de acceso</Label>
              <select
                className="mf-select mt-1"
                value={filters.estadoAcceso}
                onChange={(event) => setFilters((prev) => ({ ...prev, estadoAcceso: event.target.value }))}
              >
                <option value="all">Todos</option>
                <option value="pendiente_password">ContraseÃ±a pendiente</option>
                <option value="activo">Activo</option>
                <option value="bloqueado">Bloqueado</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFilters(CLIENTE_FILTER_DEFAULTS)}>
              Limpiar filtros
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


