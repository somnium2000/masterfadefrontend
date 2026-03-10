import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, Pencil, Plus, Users } from 'lucide-react';
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
  const notifications = useNotifications();

  const sucursalNameById = useMemo(() => {
    const map = new Map();
    sucursales.forEach((item) => map.set(item.id_sucursal, item.nombre_sucursal));
    return map;
  }, [sucursales]);

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
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--mf-text-2)]">{loading ? 'Cargando...' : `${empleados.length} registro(s)`}</span>
          <ViewToggle defaultView={view} onViewChange={setView} storageKey="empleados" />
          <Button size="sm" onClick={openCreate} className="gap-2"><Plus size={14} /> Nuevo</Button>
        </div>
      </div>

      <div className="mf-divider" />

      {listError && <ErrorBanner message={listError} onRetry={fetchEmpleados} />}
      {loading && !listError && <LoadingSpinner />}

      {!loading && !listError && empleados.length === 0 && (
        <EmptyState icon={Users} title="Sin empleados" description="No hay empleados registrados aun." action={<Button size="sm" onClick={openCreate}>Crear primero</Button>} />
      )}

      {!loading && !listError && empleados.length > 0 && view === 'cards' && (
        <CardsCarousel
          items={empleados}
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

      {!loading && !listError && empleados.length > 0 && view === 'table' && (
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
              {empleados.map((empleado) => (
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Detalle Empleado</DialogTitle></DialogHeader>
          {selectedEmpleado && (
            <div className="space-y-2 text-sm">
              <p><strong>Nombre:</strong> {selectedEmpleado.nombre_completo}</p>
              <p><strong>Correo:</strong> {selectedEmpleado.correo_principal || '-'}</p>
              <p><strong>Rol principal:</strong> {ROLE_LABELS[resolvePrimaryRole(selectedEmpleado.roles)] || '-'}</p>
              <p><strong>Sucursal:</strong> {selectedEmpleado.nombre_sucursal || '-'}</p>
              <p><strong>Fecha nacimiento:</strong> {selectedEmpleado.fecha_nacimiento ? String(selectedEmpleado.fecha_nacimiento).slice(0, 10) : '-'}</p>
              <p><strong>DNI:</strong> {selectedEmpleado.dni || '-'}</p>
              <p><strong>RTN:</strong> {selectedEmpleado.rtn || '-'}</p>
              <p><strong>Telefono:</strong> {selectedEmpleado.telefono_principal || '-'}</p>
              <p><strong>Direccion:</strong> {selectedEmpleado.direccion_texto || '-'}</p>
              <p><strong>Observaciones:</strong> {selectedEmpleado.observaciones || '-'}</p>
              <p><strong>Fecha ingreso:</strong> {selectedEmpleado.fecha_ingreso ? String(selectedEmpleado.fecha_ingreso).slice(0, 10) : '-'}</p>
              <p><strong>Salario base:</strong> {selectedEmpleado.salario_base ?? '-'}</p>
              <p><strong>Es barbero:</strong> {selectedEmpleado.es_barbero ? 'Si' : 'No'}</p>
              <p><strong>Estado laboral:</strong> {selectedEmpleado.estado_laboral ? 'Activo' : 'Inactivo'}</p>
              <p><strong>Estado acceso:</strong> <EstadoAccesoBadge estado={selectedEmpleado.estado_acceso} /></p>
              <p><strong>Credenciales completadas:</strong> {selectedEmpleado.credenciales_completadas_at ? new Date(selectedEmpleado.credenciales_completadas_at).toLocaleString() : 'No'}</p>
              <p><strong>Ultimo login:</strong> {selectedEmpleado.ultimo_login_at ? new Date(selectedEmpleado.ultimo_login_at).toLocaleString() : 'Sin registro'}</p>
            </div>
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
    </div>
  );
}
