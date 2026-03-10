import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Building2, CheckCircle2, Eye, KeyRound, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import {
  activateAdminPersonaEmpleado,
  createAdminPersonaEmpleado,
  getAdminPersonaEmpleado,
  inactivateAdminPersonaEmpleado,
  listAdminPersonasCatalogos,
  listAdminPersonasEmpleados,
  updateAdminPersonaEmpleado,
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

const DNI_PATTERN = /^\d{13}$/;

const ROLE_OPTIONS = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Administrador' },
  { value: 'barbero', label: 'Barbero' },
];

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  barbero: 'Barbero',
};

const ACCESS_LABELS = {
  pendiente_password: 'Contrasena pendiente',
  activo: 'Activo',
  bloqueado: 'Bloqueado',
  inactivo: 'Inactivo',
};

const FORM_DEFAULTS = {
  nombres: '',
  apellidos: '',
  fecha_nacimiento: '',
  genero_codigo: '',
  dni: '',
  rtn: '',
  telefono_principal: '',
  direccion_texto: '',
  observaciones: '',
  correo_principal: '',
  id_sucursal: '',
  fecha_ingreso: '',
  salario_base: '',
  rol_principal: 'admin',
};

const EMPLEADO_FILTER_DEFAULTS = {
  estadoLaboral: 'all',
  estadoAcceso: 'all',
  rol: 'all',
  idSucursal: 'all',
};

const EMPLEADO_ESTADO_LABELS = {
  activo: 'Laboral: Activo',
  inactivo: 'Laboral: Inactivo',
};

function quickFilterButtonClass(isActive) {
  // AM: Estado visual montado para que el usuario identifique filtros rapidos activos al instante.
  return isActive
    ? 'rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
    : 'rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60';
}

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function toDateTimeIso(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T00:00:00`).toISOString();
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function resolvePrimaryRole(roles) {
  const currentRoles = Array.isArray(roles) ? roles : [];
  if (currentRoles.includes('super_admin')) return 'super_admin';
  if (currentRoles.includes('admin')) return 'admin';
  if (currentRoles.includes('barbero')) return 'barbero';
  return 'admin';
}

function mapEmpleadoToForm(empleado) {
  return {
    nombres: empleado?.nombres || '',
    apellidos: empleado?.apellidos || '',
    fecha_nacimiento: empleado?.fecha_nacimiento ? String(empleado.fecha_nacimiento).slice(0, 10) : '',
    genero_codigo: empleado?.genero_codigo || '',
    dni: empleado?.dni || '',
    rtn: empleado?.rtn || '',
    telefono_principal: empleado?.telefono_principal || '',
    direccion_texto: empleado?.direccion_texto || '',
    observaciones: empleado?.observaciones || '',
    correo_principal: empleado?.correo_principal || '',
    id_sucursal: empleado?.id_sucursal || '',
    fecha_ingreso: empleado?.fecha_ingreso ? String(empleado.fecha_ingreso).slice(0, 10) : '',
    salario_base: empleado?.salario_base ?? '',
    rol_principal: resolvePrimaryRole(empleado?.roles),
  };
}

function validateForm(values) {
  if (!values.nombres.trim()) return 'Nombres es obligatorio.';
  if (!values.apellidos.trim()) return 'Apellidos es obligatorio.';
  if (!values.correo_principal.trim() || !values.correo_principal.includes('@')) return 'Correo de acceso invalido.';
  if (!values.id_sucursal) return 'Sucursal es obligatoria.';

  const birth = values.fecha_nacimiento ? new Date(`${values.fecha_nacimiento}T00:00:00`) : null;
  if (birth && birth.getTime() > Date.now()) return 'fecha_nacimiento no puede ser futura.';

  const dni = normalizeDigits(values.dni);
  if (dni && !DNI_PATTERN.test(dni)) return 'DNI debe tener 13 digitos.';

  const salary = values.salario_base === '' ? null : Number(values.salario_base);
  if (salary !== null && (!Number.isFinite(salary) || salary < 0)) return 'Salario base debe ser >= 0.';

  return null;
}

function buildPayload(values) {
  const rolPrincipal = values.rol_principal;
  return {
    persona: {
      nombres: values.nombres.trim(),
      apellidos: values.apellidos.trim(),
      fecha_nacimiento: values.fecha_nacimiento || null,
      genero_codigo: values.genero_codigo.trim() || null,
      dni: normalizeDigits(values.dni) || null,
      rtn: normalizeDigits(values.rtn) || null,
      telefono_principal: values.telefono_principal.trim() || null,
      direccion_texto: values.direccion_texto.trim() || null,
      observaciones: values.observaciones.trim() || null,
    },
    acceso: {
      correo_principal: values.correo_principal.trim().toLowerCase(),
      roles: [rolPrincipal],
    },
    empleado: {
      id_sucursal: values.id_sucursal,
      fecha_ingreso: toDateTimeIso(values.fecha_ingreso),
      salario_base: values.salario_base === '' ? null : Number(values.salario_base),
      // AM: Regla UX simplificada: rol principal barbero determina es_barbero.
      es_barbero: rolPrincipal === 'barbero',
    },
  };
}

function EstadoAccesoBadge({ estado }) {
  const normalized = String(estado || '').toLowerCase();
  if (normalized === 'activo') return <span className="mf-badge mf-badge-green">Activo</span>;
  if (normalized === 'bloqueado' || normalized === 'inactivo') return <span className="mf-badge mf-badge-red">{ACCESS_LABELS[normalized]}</span>;
  return <span className="mf-badge mf-badge-gold">{ACCESS_LABELS.pendiente_password}</span>;
}

export default function AdminEmpleadosPage() {
  const navigate = useNavigate();
  const [empleados, setEmpleados] = useState([]);
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [view, setView] = useState(() => {
    try {
      const value = localStorage.getItem('mf-view-empleados');
      return value === 'table' || value === 'cards' ? value : 'cards';
    } catch {
      return 'cards';
    }
  });

  const [formOpen, setFormOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [editingId, setEditingId] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedEmpleado, setSelectedEmpleado] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(EMPLEADO_FILTER_DEFAULTS);
  const notifications = useNotifications();

  const sucursalNameById = useMemo(() => {
    const map = new Map();
    sucursales.forEach((item) => map.set(item.id_sucursal, item.nombre_sucursal));
    return map;
  }, [sucursales]);

  // AM: Filtro compuesto por submodulo para busqueda y segmentacion sin recargar backend.
  const filteredEmpleados = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return empleados.filter((empleado) => {
      if (searchValue) {
        const searchable = [
          empleado?.nombre_completo,
          empleado?.correo_principal,
          empleado?.dni,
          empleado?.telefono_principal,
          empleado?.nombre_sucursal || sucursalNameById.get(empleado?.id_sucursal),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(searchValue)) return false;
      }

      if (filters.estadoLaboral !== 'all') {
        const expected = filters.estadoLaboral === 'activo';
        if (Boolean(empleado?.estado_laboral) !== expected) return false;
      }

      if (filters.estadoAcceso !== 'all' && String(empleado?.estado_acceso || '') !== filters.estadoAcceso) {
        return false;
      }

      if (filters.rol !== 'all' && resolvePrimaryRole(empleado?.roles) !== filters.rol) {
        return false;
      }

      if (filters.idSucursal !== 'all' && String(empleado?.id_sucursal || '') !== filters.idSucursal) {
        return false;
      }

      return true;
    });
  }, [empleados, filters, search, sucursalNameById]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== 'all').length,
    [filters]
  );

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      chips.push({ key: 'search', label: `Busqueda: ${trimmedSearch}` });
    }
    if (filters.estadoLaboral !== 'all') {
      chips.push({ key: 'estadoLaboral', label: EMPLEADO_ESTADO_LABELS[filters.estadoLaboral] || 'Estado laboral' });
    }
    if (filters.estadoAcceso !== 'all') {
      chips.push({ key: 'estadoAcceso', label: `Acceso: ${ACCESS_LABELS[filters.estadoAcceso] || filters.estadoAcceso}` });
    }
    if (filters.rol !== 'all') {
      chips.push({ key: 'rol', label: `Rol: ${ROLE_LABELS[filters.rol] || filters.rol}` });
    }
    if (filters.idSucursal !== 'all') {
      chips.push({ key: 'idSucursal', label: `Sucursal: ${sucursalNameById.get(filters.idSucursal) || 'Seleccionada'}` });
    }
    return chips;
  }, [filters, search, sucursalNameById]);

  function clearAllFilters() {
    setSearch('');
    setFilters(EMPLEADO_FILTER_DEFAULTS);
  }

  function clearFilterChip(key) {
    if (key === 'search') {
      setSearch('');
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: 'all' }));
  }

  const fetchEmpleados = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setListError('');
    }
    try {
      const response = await listAdminPersonasEmpleados();
      const payload = response?.data ?? response;
      setEmpleados(Array.isArray(payload?.empleados) ? payload.empleados : []);
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
    void fetchEmpleados();
    void fetchCatalogos();
  }, [fetchCatalogos, fetchEmpleados]);

  function openCreate() {
    setEditingId('');
    setFormValues(FORM_DEFAULTS);
    setFormError('');
    setFormOpen(true);
  }

  async function openEdit(idEmpleado) {
    setFormError('');
    setFormLoading(true);
    try {
      const response = await getAdminPersonaEmpleado(idEmpleado);
      const payload = response?.data ?? response;
      setEditingId(idEmpleado);
      setFormValues(mapEmpleadoToForm(payload?.empleado));
      setFormOpen(true);
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'personas-empleados-open-edit-error' });
    } finally {
      setFormLoading(false);
    }
  }

  async function openDetail(idEmpleado) {
    setFormLoading(true);
    try {
      const response = await getAdminPersonaEmpleado(idEmpleado);
      const payload = response?.data ?? response;
      setSelectedEmpleado(payload?.empleado || null);
      setDetailOpen(true);
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'personas-empleados-open-detail-error' });
    } finally {
      setFormLoading(false);
    }
  }

  async function handleSubmit() {
    const error = validateForm(formValues);
    if (error) {
      setFormError(error);
      return;
    }

    setFormError('');
    setFormLoading(true);
    try {
      const payload = buildPayload(formValues);
      const response = editingId
        ? await updateAdminPersonaEmpleado(editingId, payload)
        : await createAdminPersonaEmpleado(payload);
      const data = response?.data ?? response;
      const baseMessage = editingId ? 'Empleado actualizado.' : 'Empleado creado.';
      notifications.success(baseMessage, { dedupeKey: 'personas-empleados-save-ok' });
      if (data?.setup_password?.mensaje) {
        // AM: Muestra resultado de setup password sin saturar UI con banners permanentes.
        const tone = data?.setup_password?.enviado ? 'info' : 'warning';
        notifications[tone](data.setup_password.mensaje, { dedupeKey: 'personas-empleados-setup-message' });
      }
      setFormOpen(false);
      setEditingId('');
      setFormValues(FORM_DEFAULTS);
      if (data?.empleado) {
        setEmpleados((prev) =>
          replaceItemById(prev, data.empleado, (entry) => entry?.id_empleado)
        );
      }
      // AM: Revalidacion silenciosa para evitar parpadeo de cards/lista y mantener consistencia.
      void fetchEmpleados({ silent: true });
    } catch (err) {
      setFormError(extractMessage(err));
    } finally {
      setFormLoading(false);
    }
  }

  function requestToggleLifecycle(empleado) {
    setConfirmTarget(empleado || null);
  }

  async function handleToggleLifecycle() {
    const empleado = confirmTarget;
    if (!empleado) return;
    const isActive = Boolean(empleado?.estado_laboral);
    setActionLoadingId(empleado.id_empleado);
    try {
      if (isActive) {
        const response = await inactivateAdminPersonaEmpleado(empleado.id_empleado);
        const payload = response?.data ?? response;
        if (payload?.empleado) {
          setEmpleados((prev) =>
            replaceItemById(prev, payload.empleado, (entry) => entry?.id_empleado)
          );
        }
        notifications.warning('Empleado inactivado y acceso bloqueado.', { dedupeKey: 'personas-empleados-toggle-ok' });
      } else {
        const response = await activateAdminPersonaEmpleado(empleado.id_empleado);
        const payload = response?.data ?? response;
        if (payload?.empleado) {
          setEmpleados((prev) =>
            replaceItemById(prev, payload.empleado, (entry) => entry?.id_empleado)
          );
        }
        notifications.success('Empleado activado y acceso restaurado segun estado de credenciales.', { dedupeKey: 'personas-empleados-toggle-ok' });
      }
      setConfirmTarget(null);
      void fetchEmpleados({ silent: true });
    } catch (err) {
      notifications.error(extractMessage(err), { dedupeKey: 'personas-empleados-toggle-error' });
    } finally {
      setActionLoadingId('');
    }
  }

  function renderActions(empleado) {
    const loadingActions = actionLoadingId === empleado.id_empleado;
    const isActive = Boolean(empleado.estado_laboral);
    return (
      <div className="flex w-full flex-wrap items-center justify-start gap-2">
        <HoverActionButton
          icon={<Eye size={14} strokeWidth={2} />}
          label="Ver detalle"
          title="Ver detalle de empleado"
          disabled={loadingActions}
          onClick={() => openDetail(empleado.id_empleado)}
        />
        <HoverActionButton
          icon={<Pencil size={14} strokeWidth={2} />}
          label="Editar"
          title="Editar empleado"
          disabled={loadingActions}
          onClick={() => openEdit(empleado.id_empleado)}
        />
        <HoverActionButton
          icon={isActive ? <Ban size={14} strokeWidth={2} /> : <CheckCircle2 size={14} strokeWidth={2} />}
          label={loadingActions ? (isActive ? 'Inactivando...' : 'Activando...') : (isActive ? 'Inactivar' : 'Activar')}
          title={isActive ? 'Inactivar empleado' : 'Activar empleado'}
          tone={isActive ? 'danger' : 'success'}
          disabled={loadingActions}
          onClick={() => requestToggleLifecycle(empleado)}
        />
      </div>
    );
  }

  return (
    <div className="mf-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">Personas - Gestion</p>
          <h1 className="mf-font-display mt-1 text-3xl leading-tight text-[var(--mf-text)]">Empleados</h1>
        </div>
        {/* AM: Header compacto: switch + busqueda + filtros + nuevo en una sola linea responsive. */}
        <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
          <span className="text-sm text-[var(--mf-text-2)]">
            {loading ? 'Cargando...' : `${filteredEmpleados.length} de ${empleados.length} registro(s)`}
          </span>
          <ViewToggle defaultView={view} onViewChange={setView} storageKey="empleados" />
          <div className="relative min-w-[190px] flex-1 sm:flex-none sm:w-[260px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, correo o DNI..."
              className="h-9 rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_72%,transparent)] pl-9 pr-9 text-sm"
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
            size="sm"
            onClick={() => setFiltersOpen(true)}
            className="group gap-2 rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_76%,transparent)] transition-all duration-200 hover:-translate-y-0.5"
          >
            <SlidersHorizontal size={14} />
            Filtros
            {activeFilterCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-[10px] font-semibold text-[var(--mf-bg)]">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
          {(activeFilterCount > 0 || search.trim()) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="gap-1.5 rounded-full border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_52%,transparent)] text-[var(--mf-text-2)] hover:text-[var(--mf-text)]"
            >
              <RotateCcw size={13} />
              Limpiar
            </Button>
          ) : null}
          <Button size="sm" onClick={openCreate} className="gap-2"><Plus size={14} /> Nuevo</Button>
        </div>
      </div>

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

      <div className="mf-divider" />

      {listError && <ErrorBanner message={listError} onRetry={fetchEmpleados} />}
      {loading && !listError && <LoadingSpinner />}

      {!loading && !listError && filteredEmpleados.length === 0 && (
        <EmptyState
          icon={Users}
          title="Sin resultados"
          description={empleados.length ? 'No hay coincidencias con la busqueda o filtros actuales.' : 'No hay empleados registrados aun.'}
          action={<Button size="sm" onClick={openCreate}>Crear primero</Button>}
        />
      )}

      {!loading && !listError && filteredEmpleados.length > 0 && view === 'cards' && (
        <CardsCarousel
          items={filteredEmpleados}
          getItemKey={(empleado) => empleado?.id_empleado}
          renderItem={(empleado, index, pageIndex) => (
            <DataCard
              key={empleado.id_empleado}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<Users size={16} />}
              title={empleado.nombre_completo}
              subtitle={empleado.correo_principal || 'Sin correo'}
              badge={<EstadoAccesoBadge estado={empleado.estado_acceso} />}
              fields={[
                { label: 'Sucursal', value: empleado.nombre_sucursal || sucursalNameById.get(empleado.id_sucursal) || 'Sin sucursal' },
                { label: 'Rol principal', value: ROLE_LABELS[resolvePrimaryRole(empleado.roles)] || '-' },
                { label: 'Estado laboral', value: empleado.estado_laboral ? 'Activo' : 'Inactivo' },
              ]}
              actions={renderActions(empleado)}
            />
          )}
        />
      )}

      {!loading && !listError && filteredEmpleados.length > 0 && view === 'table' && (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Correo</TableHead>
                <TableHead className="hidden md:table-cell text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Rol</TableHead>
                <TableHead className="hidden md:table-cell text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursal</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acceso</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEmpleados.map((empleado) => (
                <TableRow key={empleado.id_empleado} className="border-[var(--mf-nav-border)]">
                  <TableCell className="font-medium">{empleado.nombre_completo}</TableCell>
                  <TableCell>{empleado.correo_principal || '-'}</TableCell>
                  <TableCell className="hidden md:table-cell">{ROLE_LABELS[resolvePrimaryRole(empleado.roles)] || '-'}</TableCell>
                  <TableCell className="hidden md:table-cell">{empleado.nombre_sucursal || '-'}</TableCell>
                  <TableCell className="text-center"><EstadoAccesoBadge estado={empleado.estado_acceso} /></TableCell>
                  <TableCell className="text-center">{renderActions(empleado)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Empleado' : 'Nuevo Empleado'}</DialogTitle></DialogHeader>

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
              <Label className="mf-label">Fecha nacimiento</Label>
              <Input type="date" className="mf-input mt-1" value={formValues.fecha_nacimiento} onChange={(e) => setFormValues((p) => ({ ...p, fecha_nacimiento: e.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">DNI</Label>
              <Input className="mf-input mt-1" value={formValues.dni} onChange={(e) => setFormValues((p) => ({ ...p, dni: e.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">RTN (opcional)</Label>
              <Input className="mf-input mt-1" value={formValues.rtn} onChange={(e) => setFormValues((p) => ({ ...p, rtn: e.target.value }))} />
            </div>

            <div className="sm:col-span-2">
              <Label className="mf-label">Correo de acceso *</Label>
              <Input className="mf-input mt-1" type="email" value={formValues.correo_principal} onChange={(e) => setFormValues((p) => ({ ...p, correo_principal: e.target.value }))} />
            </div>

            <div>
              <Label className="mf-label">Rol principal *</Label>
              <select
                className="mf-select mt-1"
                value={formValues.rol_principal}
                onChange={(e) => setFormValues((p) => ({ ...p, rol_principal: e.target.value }))}
              >
                {ROLE_OPTIONS.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-[var(--mf-text-2)]">Si el rol es barbero, el sistema marca es_barbero automaticamente.</p>
            </div>
            <div>
              <Label className="mf-label">Sucursal *</Label>
              <select className="mf-select mt-1" value={formValues.id_sucursal} onChange={(e) => setFormValues((p) => ({ ...p, id_sucursal: e.target.value }))}>
                <option value="">Selecciona sucursal</option>
                {sucursales.map((sucursal) => <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre_sucursal}</option>)}
              </select>
            </div>

            <div>
              <Label className="mf-label">Telefono</Label>
              <Input className="mf-input mt-1" value={formValues.telefono_principal} onChange={(e) => setFormValues((p) => ({ ...p, telefono_principal: e.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">Fecha ingreso</Label>
              <Input className="mf-input mt-1" type="date" value={formValues.fecha_ingreso} onChange={(e) => setFormValues((p) => ({ ...p, fecha_ingreso: e.target.value }))} />
            </div>

            <div>
              <Label className="mf-label">Salario base HNL</Label>
              <Input className="mf-input mt-1" type="number" min="0" step="0.01" value={formValues.salario_base} onChange={(e) => setFormValues((p) => ({ ...p, salario_base: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Direccion</Label>
              <Input className="mf-input mt-1" value={formValues.direccion_texto} onChange={(e) => setFormValues((p) => ({ ...p, direccion_texto: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Observaciones</Label>
              <Input className="mf-input mt-1" value={formValues.observaciones} onChange={(e) => setFormValues((p) => ({ ...p, observaciones: e.target.value }))} />
            </div>
          </div>

          {formError && <p className="mt-3 rounded-[12px] bg-red-500/10 px-3 py-2 text-sm text-red-400">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={formLoading}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={formLoading}>{formLoading ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear empleado'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-5xl">
          <DialogHeader><DialogTitle>Detalle Empleado</DialogTitle></DialogHeader>
          {selectedEmpleado && (
            /* AM: Vista de detalle premium por secciones para mejorar legibilidad y jerarquia visual. */
            <DetailInfoModalContent
              summary={{
                icon: <Users size={16} />,
                title: selectedEmpleado.nombre_completo,
                subtitle: selectedEmpleado.correo_principal || 'Sin correo',
                badge: <EstadoAccesoBadge estado={selectedEmpleado.estado_acceso} />,
              }}
              sections={[
                {
                  id: 'identidad',
                  title: 'Identidad',
                  icon: <Users size={14} />,
                  fields: [
                    { label: 'Nombre', value: selectedEmpleado.nombre_completo || '-' },
                    { label: 'Correo', value: selectedEmpleado.correo_principal || '-' },
                    { label: 'DNI', value: selectedEmpleado.dni || '-' },
                    { label: 'RTN', value: selectedEmpleado.rtn || '-' },
                    { label: 'Telefono', value: selectedEmpleado.telefono_principal || '-' },
                    { label: 'Fecha nacimiento', value: selectedEmpleado.fecha_nacimiento ? String(selectedEmpleado.fecha_nacimiento).slice(0, 10) : '-' },
                    { label: 'Direccion', value: selectedEmpleado.direccion_texto || '-', span: 'full' },
                    { label: 'Observaciones', value: selectedEmpleado.observaciones || '-', span: 'full' },
                  ],
                },
                {
                  id: 'laboral',
                  title: 'Laboral',
                  icon: <Building2 size={14} />,
                  fields: [
                    { label: 'Rol principal', value: ROLE_LABELS[resolvePrimaryRole(selectedEmpleado.roles)] || '-' },
                    { label: 'Sucursal', value: selectedEmpleado.nombre_sucursal || '-' },
                    { label: 'Fecha ingreso', value: selectedEmpleado.fecha_ingreso ? String(selectedEmpleado.fecha_ingreso).slice(0, 10) : '-' },
                    { label: 'Salario base', value: selectedEmpleado.salario_base ?? '-' },
                    { label: 'Es barbero', value: selectedEmpleado.es_barbero ? 'Si' : 'No' },
                    { label: 'Estado laboral', value: selectedEmpleado.estado_laboral ? 'Activo' : 'Inactivo' },
                  ],
                },
                {
                  id: 'acceso',
                  title: 'Acceso',
                  icon: <KeyRound size={14} />,
                  fields: [
                    { label: 'Estado acceso', value: <EstadoAccesoBadge estado={selectedEmpleado.estado_acceso} /> },
                    { label: 'Credenciales completadas', value: selectedEmpleado.credenciales_completadas_at ? new Date(selectedEmpleado.credenciales_completadas_at).toLocaleString() : 'No' },
                    { label: 'Ultimo login', value: selectedEmpleado.ultimo_login_at ? new Date(selectedEmpleado.ultimo_login_at).toLocaleString() : 'Sin registro' },
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
        tone={confirmTarget?.estado_laboral ? 'danger' : 'warning'}
        title={confirmTarget?.estado_laboral ? 'Inactivar empleado' : 'Activar empleado'}
        description={
          confirmTarget
            ? `Vas a ${confirmTarget.estado_laboral ? 'inactivar' : 'activar'} a ${confirmTarget.nombre_completo || 'este empleado'}. Esta accion tambien actualiza su acceso de usuario cuando aplique.`
            : ''
        }
        confirmLabel={confirmTarget?.estado_laboral ? 'Inactivar' : 'Activar'}
        cancelLabel="Cancelar"
        loading={Boolean(actionLoadingId)}
        onConfirm={handleToggleLifecycle}
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Empleados</DialogTitle>
          </DialogHeader>
          {/* AM: Atajos de filtro para reducir pasos y acelerar la seleccion frecuente. */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, estadoLaboral: prev.estadoLaboral === 'activo' ? 'all' : 'activo' }))}
              className={quickFilterButtonClass(filters.estadoLaboral === 'activo')}
            >
              Solo activos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, estadoLaboral: prev.estadoLaboral === 'inactivo' ? 'all' : 'inactivo' }))}
              className={quickFilterButtonClass(filters.estadoLaboral === 'inactivo')}
            >
              Solo inactivos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, rol: prev.rol === 'barbero' ? 'all' : 'barbero' }))}
              className={quickFilterButtonClass(filters.rol === 'barbero')}
            >
              Solo barberos
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Estado laboral</Label>
              <select
                className="mf-select mt-1"
                value={filters.estadoLaboral}
                onChange={(event) => setFilters((prev) => ({ ...prev, estadoLaboral: event.target.value }))}
              >
                <option value="all">Todos</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
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
                {Object.keys(ACCESS_LABELS).map((key) => (
                  <option key={key} value={key}>{ACCESS_LABELS[key]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mf-label">Rol principal</Label>
              <select
                className="mf-select mt-1"
                value={filters.rol}
                onChange={(event) => setFilters((prev) => ({ ...prev, rol: event.target.value }))}
              >
                <option value="all">Todos</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mf-label">Sucursal</Label>
              <select
                className="mf-select mt-1"
                value={filters.idSucursal}
                onChange={(event) => setFilters((prev) => ({ ...prev, idSucursal: event.target.value }))}
              >
                <option value="all">Todas</option>
                {sucursales.map((sucursal) => (
                  <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>
                    {sucursal.nombre_sucursal}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFilters(EMPLEADO_FILTER_DEFAULTS)}
            >
              Limpiar filtros
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
