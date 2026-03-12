import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Building2, CheckCircle2, MapPin, Pencil, Phone, Plus, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
  activateAdminSucursal,
  createAdminSucursal,
  getAdminSucursal,
  inactivateAdminSucursal,
  listAdminEmpresas,
  listAdminSucursales,
  updateAdminSucursal,
} from '../lib/adminSucursalesApi.js';
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

const PHONE_ALLOWED_PATTERN = /^[+()\-.\s\d]{6,30}$/;

const FORM_DEFAULTS = {
  id_empresa: '',
  nombre_sucursal: '',
  direccion: '',
  telefono: '',
  fecha_inauguracion: '',
};

const FILTER_DEFAULTS = {
  estado: 'all',
  idEmpresa: 'all',
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function quickFilterButtonClass(isActive) {
  // JK: Realce visual para filtros rapidos en mobile y desktop.
  return isActive
    ? 'rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
    : 'rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60';
}

function mapSucursalToForm(sucursal) {
  return {
    id_empresa: sucursal?.id_empresa || '',
    nombre_sucursal: sucursal?.nombre_sucursal || '',
    direccion: sucursal?.direccion || '',
    telefono: sucursal?.telefono || '',
    fecha_inauguracion: sucursal?.fecha_inauguracion ? String(sucursal.fecha_inauguracion).slice(0, 10) : '',
  };
}

function validateForm(values) {
  if (!values.id_empresa) return 'Selecciona una empresa.';

  const nombre = String(values.nombre_sucursal || '').trim();
  if (!nombre) return 'Nombre de sucursal es obligatorio.';
  if (nombre.length > 140) return 'Nombre de sucursal no puede exceder 140 caracteres.';

  const direccion = String(values.direccion || '').trim();
  if (direccion.length > 300) return 'Direccion no puede exceder 300 caracteres.';

  const telefono = String(values.telefono || '').trim();
  if (telefono && !PHONE_ALLOWED_PATTERN.test(telefono)) {
    return 'Telefono tiene formato invalido.';
  }

  return null;
}

function buildPayload(values) {
  return {
    id_empresa: values.id_empresa,
    nombre_sucursal: String(values.nombre_sucursal || '').trim(),
    direccion: String(values.direccion || '').trim() || null,
    telefono: String(values.telefono || '').trim() || null,
    fecha_inauguracion: values.fecha_inauguracion || null,
  };
}

function EstadoSucursalBadge({ estado }) {
  return (
    <span className={`mf-badge ${estado ? 'mf-badge-green' : 'mf-badge-red'}`}>
      {estado ? 'Activa' : 'Inactiva'}
    </span>
  );
}

function SucursalForm({ values, onChange, empresas }) {
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label className="mf-label">Empresa *</Label>
        <select
          className="mf-select mt-1"
          value={values.id_empresa}
          onChange={(event) => onChange('id_empresa', event.target.value)}
        >
          <option value="">Selecciona empresa</option>
          {empresas.map((empresa) => (
            <option key={empresa.id_empresa} value={empresa.id_empresa}>
              {empresa.nombre_empresa}
            </option>
          ))}
        </select>
      </div>

      <div className="sm:col-span-2">
        <Label className="mf-label">Nombre de sucursal *</Label>
        <Input
          className="mf-input mt-1"
          value={values.nombre_sucursal}
          onChange={(event) => onChange('nombre_sucursal', event.target.value)}
          maxLength={140}
          placeholder="Ej. Sucursal Centro"
        />
      </div>

      <div className="sm:col-span-2">
        <Label className="mf-label flex items-center gap-1.5">
          <MapPin size={12} /> Direccion
        </Label>
        <Input
          className="mf-input mt-1"
          value={values.direccion}
          onChange={(event) => onChange('direccion', event.target.value)}
          maxLength={300}
          placeholder="Ej. Col. Palmira, Tegucigalpa"
        />
      </div>

      <div>
        <Label className="mf-label flex items-center gap-1.5">
          <Phone size={12} /> Telefono
        </Label>
        <Input
          className="mf-input mt-1"
          value={values.telefono}
          onChange={(event) => onChange('telefono', event.target.value)}
          maxLength={30}
          placeholder="Ej. +504 2222-3333"
        />
      </div>

      <div>
        <Label className="mf-label">Fecha inauguracion</Label>
        <Input
          type="date"
          className="mf-input mt-1"
          value={values.fecha_inauguracion}
          onChange={(event) => onChange('fecha_inauguracion', event.target.value)}
        />
      </div>
    </div>
  );
}

function SucursalCards({ sucursales, renderActions, isSuperAdmin }) {
  return (
    <CardsCarousel
      items={sucursales}
      getItemKey={(sucursal) => sucursal?.id_sucursal}
      renderItem={(sucursal, index, pageIndex) => (
        <DataCard
          key={sucursal.id_sucursal}
          animationDelay={(pageIndex * 0.02) + (index * 0.05)}
          avatar={<Building2 size={18} />}
          title={sucursal.nombre_sucursal}
          subtitle={sucursal.nombre_empresa || 'Empresa no definida'}
          badge={<EstadoSucursalBadge estado={sucursal.estado} />}
          fields={[
            { label: 'Nombre sucursal', value: sucursal.nombre_sucursal || '-' },
            { label: 'Direccion', value: sucursal.direccion || '-' },
            { label: 'Telefono', value: sucursal.telefono || '-' },
            { label: 'Fecha inauguracion', value: sucursal.fecha_inauguracion ? String(sucursal.fecha_inauguracion).slice(0, 10) : '-' },
            { label: 'Estado', value: sucursal.estado ? 'Activa' : 'Inactiva' },
          ]}
          actions={isSuperAdmin ? renderActions(sucursal) : null}
        />
      )}
    />
  );
}

function SucursalTable({ sucursales, renderActions, isSuperAdmin }) {
  return (
    <div className="mf-table-wrap">
      <Table>
        <TableHeader>
          <TableRow className="border-[var(--mf-nav-border)]">
            <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
            <TableHead className="hidden md:table-cell text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Empresa</TableHead>
            <TableHead className="hidden lg:table-cell text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Direccion</TableHead>
            <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Telefono</TableHead>
            <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Estado</TableHead>
            {isSuperAdmin ? (
              <TableHead className="text-right text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acciones</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sucursales.map((sucursal) => (
            <TableRow
              key={sucursal.id_sucursal}
              className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors"
            >
              <TableCell className="font-medium text-[var(--mf-text)] whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <Building2 size={15} className="text-[var(--mf-accent)] shrink-0" />
                  {sucursal.nombre_sucursal}
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell text-[var(--mf-text-2)]">{sucursal.nombre_empresa || '-'}</TableCell>
              <TableCell className="hidden lg:table-cell text-[var(--mf-text-2)] max-w-[220px] truncate">{sucursal.direccion || '-'}</TableCell>
              <TableCell className="text-[var(--mf-text-2)] text-sm whitespace-nowrap">{sucursal.telefono || '-'}</TableCell>
              <TableCell className="text-center"><EstadoSucursalBadge estado={sucursal.estado} /></TableCell>
              {isSuperAdmin ? (
                <TableCell className="text-center">
                  {renderActions(sucursal)}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function AdminSucursalesPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { roles } = useAuth();

  const isSuperAdmin = Array.isArray(roles) && roles.includes('super_admin');

  const [sucursales, setSucursales] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [view, setView] = useState(() => {
    try {
      const value = localStorage.getItem('mf-view-sucursales');
      return value === 'table' || value === 'cards' ? value : 'cards';
    } catch {
      return 'cards';
    }
  });

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState('');

  const empresaNameById = useMemo(() => {
    const map = new Map();
    empresas.forEach((empresa) => map.set(String(empresa.id_empresa), empresa.nombre_empresa));
    return map;
  }, [empresas]);

  const filteredSucursales = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return sucursales.filter((sucursal) => {
      if (searchValue) {
        const searchable = [
          sucursal?.nombre_sucursal,
          sucursal?.nombre_empresa || empresaNameById.get(String(sucursal?.id_empresa)),
          sucursal?.direccion,
          sucursal?.telefono,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable.includes(searchValue)) {
          return false;
        }
      }

      if (filters.estado !== 'all') {
        const expected = filters.estado === 'activo';
        if (Boolean(sucursal?.estado) !== expected) return false;
      }

      if (filters.idEmpresa !== 'all' && String(sucursal?.id_empresa || '') !== filters.idEmpresa) {
        return false;
      }

      return true;
    });
  }, [empresaNameById, filters, search, sucursales]);

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

    if (filters.estado !== 'all') {
      chips.push({ key: 'estado', label: filters.estado === 'activo' ? 'Estado: Activa' : 'Estado: Inactiva' });
    }

    if (filters.idEmpresa !== 'all') {
      chips.push({
        key: 'idEmpresa',
        label: `Empresa: ${empresaNameById.get(filters.idEmpresa) || 'Seleccionada'}`,
      });
    }

    return chips;
  }, [empresaNameById, filters, search]);

  const fetchSucursales = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setListError('');
    }

    try {
      const response = await listAdminSucursales();
      const payload = response?.data ?? response;
      setSucursales(Array.isArray(payload?.sucursales) ? payload.sucursales : []);
    } catch (err) {
      if (err.status === 401) {
        navigate('/login');
        return;
      }
      if (err.status === 403) {
        navigate('/unauthorized');
        return;
      }
      if (!silent) {
        setListError(extractMessage(err));
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [navigate]);

  const fetchEmpresas = useCallback(async () => {
    try {
      const response = await listAdminEmpresas();
      const payload = response?.data ?? response;
      setEmpresas(Array.isArray(payload?.empresas) ? payload.empresas : []);
    } catch {
      setEmpresas([]);
    }
  }, []);

  useEffect(() => {
    void fetchSucursales();
    if (isSuperAdmin) {
      void fetchEmpresas();
    }
  }, [fetchEmpresas, fetchSucursales, isSuperAdmin]);

  function clearAllFilters() {
    setSearch('');
    setFilters(FILTER_DEFAULTS);
  }

  function clearFilterChip(key) {
    if (key === 'search') {
      setSearch('');
      return;
    }
    setFilters((prev) => ({ ...prev, [key]: 'all' }));
  }

  function handleFormChange(field, value) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  function openCreate() {
    setEditingId('');
    setFormValues(FORM_DEFAULTS);
    setFormError('');
    setFormOpen(true);
  }

  async function openEdit(idSucursal) {
    setFormError('');
    setFormLoading(true);

    try {
      const response = await getAdminSucursal(idSucursal);
      const payload = response?.data ?? response;
      setEditingId(idSucursal);
      setFormValues(mapSucursalToForm(payload?.sucursal || null));
      setFormOpen(true);
    } catch (err) {
      if (err.status === 401) {
        navigate('/login');
        return;
      }
      if (err.status === 403) {
        navigate('/unauthorized');
        return;
      }
      notifications.error(extractMessage(err), { dedupeKey: 'sucursales-open-edit-error' });
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
        ? await updateAdminSucursal(editingId, payload)
        : await createAdminSucursal({ ...payload, estado: true });

      const data = response?.data ?? response;
      if (data?.sucursal) {
        setSucursales((prev) => replaceItemById(prev, data.sucursal, (entry) => entry?.id_sucursal));
      }

      notifications.success(editingId ? 'Sucursal actualizada.' : 'Sucursal creada.', {
        dedupeKey: 'sucursales-save-ok',
      });

      setFormOpen(false);
      setEditingId('');
      setFormValues(FORM_DEFAULTS);

      // JK: Revalidacion silenciosa para mantener consistencia sin parpadeo de interfaz.
      void fetchSucursales({ silent: true });
    } catch (err) {
      if (err.status === 401) {
        navigate('/login');
        return;
      }
      const message = extractMessage(err);
      setFormError(message);
      notifications.error(message, { dedupeKey: 'sucursales-save-error' });
    } finally {
      setFormLoading(false);
    }
  }

  function requestToggleLifecycle(sucursal) {
    setConfirmTarget(sucursal || null);
  }

  async function handleToggleLifecycle() {
    const sucursal = confirmTarget;
    if (!sucursal) return;

    const isActive = Boolean(sucursal.estado);
    setActionLoadingId(sucursal.id_sucursal);

    try {
      const response = isActive
        ? await inactivateAdminSucursal(sucursal.id_sucursal)
        : await activateAdminSucursal(sucursal.id_sucursal);

      const payload = response?.data ?? response;
      if (payload?.sucursal) {
        setSucursales((prev) => replaceItemById(prev, payload.sucursal, (entry) => entry?.id_sucursal));
      }

      notifications[isActive ? 'warning' : 'success'](
        isActive ? 'Sucursal inactivada.' : 'Sucursal activada.',
        { dedupeKey: 'sucursales-toggle-ok' }
      );

      setConfirmTarget(null);
      void fetchSucursales({ silent: true });
    } catch (err) {
      if (err.status === 401) {
        navigate('/login');
        return;
      }
      notifications.error(extractMessage(err), { dedupeKey: 'sucursales-toggle-error' });
    } finally {
      setActionLoadingId('');
    }
  }

  function renderActions(sucursal) {
    const loadingActions = actionLoadingId === sucursal.id_sucursal;
    const isActive = Boolean(sucursal.estado);

    return (
      <div className="flex w-full flex-wrap items-center justify-start gap-2">
        {/* JK: Reutilizamos el patron animado del modulo Personas para mantener UX consistente. */}
        <HoverActionButton
          icon={<Pencil size={14} strokeWidth={2} />}
          label="Editar"
          title="Editar sucursal"
          disabled={loadingActions}
          onClick={() => openEdit(sucursal.id_sucursal)}
        />
        <HoverActionButton
          icon={isActive ? <Ban size={14} strokeWidth={2} /> : <CheckCircle2 size={14} strokeWidth={2} />}
          label={loadingActions ? (isActive ? 'Inactivando...' : 'Activando...') : (isActive ? 'Inactivar' : 'Activar')}
          title={isActive ? 'Inactivar sucursal' : 'Activar sucursal'}
          tone={isActive ? 'danger' : 'success'}
          disabled={loadingActions}
          onClick={() => requestToggleLifecycle(sucursal)}
        />
      </div>
    );
  }

  return (
    <div className="mf-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">Gestion - Sucursales</p>
          <h1 className="mf-font-display mt-1 text-3xl leading-tight text-[var(--mf-text)]">Sucursales</h1>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
          <span className="text-sm text-[var(--mf-text-2)]">
            {loading ? 'Cargando...' : `${filteredSucursales.length} de ${sucursales.length} registro(s)`}
          </span>

          <ViewToggle defaultView={view} onViewChange={setView} storageKey="sucursales" />

          <div className="relative min-w-[190px] flex-1 sm:flex-none sm:w-[260px]">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre, empresa o telefono..."
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

          {isSuperAdmin ? (
            <Button size="sm" onClick={openCreate} className="gap-2">
              <Plus size={14} /> Nueva
            </Button>
          ) : null}
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

      {listError ? <ErrorBanner message={listError} onRetry={fetchSucursales} /> : null}
      {loading && !listError ? <LoadingSpinner /> : null}

      {!loading && !listError && filteredSucursales.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin resultados"
          description={sucursales.length ? 'No hay coincidencias con la busqueda o filtros actuales.' : 'No hay sucursales registradas aun.'}
          action={
            isSuperAdmin ? (
              <Button size="sm" onClick={openCreate} className="gap-2">
                <Plus size={14} /> Crear primera
              </Button>
            ) : null
          }
        />
      ) : null}

      {!loading && !listError && filteredSucursales.length > 0 && view === 'cards' ? (
        <SucursalCards
          sucursales={filteredSucursales}
          renderActions={renderActions}
          isSuperAdmin={isSuperAdmin}
        />
      ) : null}

      {!loading && !listError && filteredSucursales.length > 0 && view === 'table' ? (
        <SucursalTable
          sucursales={filteredSucursales}
          renderActions={renderActions}
          isSuperAdmin={isSuperAdmin}
        />
      ) : null}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
          </DialogHeader>

          <SucursalForm values={formValues} onChange={handleFormChange} empresas={empresas} />

          {formError ? (
            <p className="mt-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-sm text-red-400">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={formLoading}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={formLoading} className="min-w-[110px]">
              {formLoading ? 'Guardando...' : editingId ? 'Actualizar' : 'Crear sucursal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open && !actionLoadingId) {
            setConfirmTarget(null);
          }
        }}
        tone={confirmTarget?.estado ? 'danger' : 'warning'}
        title={confirmTarget?.estado ? 'Inactivar sucursal' : 'Activar sucursal'}
        description={
          confirmTarget
            ? `Vas a ${confirmTarget.estado ? 'inactivar' : 'activar'} ${confirmTarget.nombre_sucursal}.`
            : ''
        }
        confirmLabel={confirmTarget?.estado ? 'Inactivar' : 'Activar'}
        cancelLabel="Cancelar"
        loading={Boolean(actionLoadingId)}
        onConfirm={handleToggleLifecycle}
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Sucursales</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, estado: prev.estado === 'activo' ? 'all' : 'activo' }))}
              className={quickFilterButtonClass(filters.estado === 'activo')}
            >
              Solo activas
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, estado: prev.estado === 'inactivo' ? 'all' : 'inactivo' }))}
              className={quickFilterButtonClass(filters.estado === 'inactivo')}
            >
              Solo inactivas
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Estado</Label>
              <select
                className="mf-select mt-1"
                value={filters.estado}
                onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value }))}
              >
                <option value="all">Todas</option>
                <option value="activo">Activas</option>
                <option value="inactivo">Inactivas</option>
              </select>
            </div>

            <div>
              <Label className="mf-label">Empresa</Label>
              <select
                className="mf-select mt-1"
                value={filters.idEmpresa}
                onChange={(event) => setFilters((prev) => ({ ...prev, idEmpresa: event.target.value }))}
              >
                <option value="all">Todas</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id_empresa} value={empresa.id_empresa}>{empresa.nombre_empresa}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFilters(FILTER_DEFAULTS)}>Limpiar filtros</Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}