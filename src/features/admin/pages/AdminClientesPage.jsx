import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, Pencil, Plus, Users } from 'lucide-react';
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
  fecha_ingreso: '',
  genero_codigo: '',
  dni: '',
  rtn: '',
  telefono_principal: '',
  direccion_texto: '',
  observaciones: '',
  habilitar_acceso: false,
  correo_principal: '',
  id_sucursal_origen: '',
  estado: true,
  consentimiento_marketing: false,
  acepta_terminos: false,
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function toDateTimeIso(dateValue) {
  if (!dateValue) return null;
  return new Date(`${dateValue}T00:00:00`).toISOString();
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
  };
}

function validateForm(values, { isEditing, selectedCliente }) {
  if (!values.nombres.trim()) return 'Nombres es obligatorio.';
  if (!values.apellidos.trim()) return 'Apellidos es obligatorio.';
  if (!values.correo_principal.trim() || !values.correo_principal.includes('@')) {
    return 'Correo principal es obligatorio y debe ser valido.';
  }

  if (values.fecha_nacimiento) {
    const birth = new Date(`${values.fecha_nacimiento}T00:00:00`);
    if (birth.getTime() > Date.now()) return 'fecha_nacimiento no puede ser futura.';
  }
  if (values.fecha_ingreso) {
    // AM: "Fecha de cliente" no debe registrar fechas futuras para evitar trazabilidad invalida.
    const since = new Date(`${values.fecha_ingreso}T00:00:00`);
    if (since.getTime() > Date.now()) return 'Fecha de cliente no puede ser futura.';
  }

  if (values.habilitar_acceso) {
    if (!values.id_sucursal_origen) {
      return 'Cliente con acceso requiere sucursal de origen.';
    }
    if (!values.acepta_terminos) {
      return 'Cliente con acceso debe aceptar terminos.';
    }
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
      habilitar_acceso: Boolean(values.habilitar_acceso),
      correo_principal: values.correo_principal.trim().toLowerCase(),
    },
    cliente: {
      id_sucursal_origen: values.id_sucursal_origen || null,
      fecha_ingreso: toDateTimeIso(values.fecha_ingreso),
      estado: Boolean(values.estado),
      consentimiento_marketing: Boolean(values.consentimiento_marketing),
      acepta_terminos: Boolean(values.acepta_terminos),
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
  const notifications = useNotifications();

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
        // AM: Retroalimentación reutilizable del envío setup password en alta/edición de cliente con acceso.
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
    if (!cliente) return;
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

  const lockAccessToggle = Boolean(editingId && selectedCliente?.id_usuario);

  return (
    <div className="mf-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">Personas - Gestion</p>
          <h1 className="mf-font-display mt-1 text-3xl leading-tight text-[var(--mf-text)]">Clientes</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--mf-text-2)]">{loading ? 'Cargando...' : `${clientes.length} registro(s)`}</span>
          <ViewToggle defaultView={view} onViewChange={setView} storageKey="clientes" />
          <Button onClick={openCreate} size="sm" className="gap-2"><Plus size={14} /> Nuevo</Button>
        </div>
      </div>

      <div className="mf-divider" />

      {listError && <ErrorBanner message={listError} onRetry={fetchClientes} />}
      {loading && !listError && <LoadingSpinner />}

      {!loading && !listError && clientes.length === 0 && (
        <EmptyState icon={Users} title="Sin clientes" description="No hay clientes registrados en este momento." />
      )}

      {!loading && !listError && clientes.length > 0 && view === 'cards' && (
        <CardsCarousel
          items={clientes}
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
                { label: 'Sucursal', value: cliente.nombre_sucursal || 'Sin sucursal' },
                { label: 'Estado cliente', value: cliente.estado_cliente ? 'Activo' : 'Inactivo' },
                { label: 'Fecha de cliente', value: cliente.fecha_ingreso ? String(cliente.fecha_ingreso).slice(0, 10) : 'Sin fecha' },
                { label: 'Marketing', value: cliente.consentimiento_marketing ? 'Si' : 'No' },
              ]}
              actions={renderActions(cliente)}
            />
          )}
        />
      )}

      {!loading && !listError && clientes.length > 0 && view === 'table' && (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Correo</TableHead>
                <TableHead className="hidden md:table-cell text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursal</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acceso</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((cliente) => (
                <TableRow key={cliente.id_cliente} className="border-[var(--mf-nav-border)]">
                  <TableCell className="font-medium">{cliente.nombre_completo || 'Cliente'}</TableCell>
                  <TableCell>{cliente.correo_principal || 'Sin correo'}</TableCell>
                  <TableCell className="hidden md:table-cell">{cliente.nombre_sucursal || 'Sin sucursal'}</TableCell>
                  <TableCell className="text-center"><AccessBadge cliente={cliente} /></TableCell>
                  <TableCell className="text-center">{renderActions(cliente)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle></DialogHeader>

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
          </div>

          <div className="mt-3 rounded-[12px] border border-[var(--mf-nav-border)] p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={formValues.habilitar_acceso}
                disabled={lockAccessToggle}
                onChange={(e) => setFormValues((p) => ({ ...p, habilitar_acceso: e.target.checked }))}
              />
              <span>Cliente con acceso al sistema</span>
            </label>

            {lockAccessToggle && (
              <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                Este cliente ya tiene usuario creado. Para restringir acceso usa Inactivar.
              </p>
            )}

            {formValues.habilitar_acceso && (
              <div className="mt-3 grid grid-cols-1 gap-2">
                <div>
                  <Label className="mf-label">Sucursal de acceso *</Label>
                  <select className="mf-select mt-1" value={formValues.id_sucursal_origen} onChange={(e) => setFormValues((p) => ({ ...p, id_sucursal_origen: e.target.value }))}>
                    <option value="">Selecciona sucursal</option>
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
            )}
          </div>

          {formError && <p className="mt-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-sm text-red-400">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={formLoading}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={formLoading}>{formLoading ? 'Guardando...' : editingId ? 'Actualizar cliente' : 'Crear cliente'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Detalle Cliente</DialogTitle></DialogHeader>
          {selectedCliente && (
            <div className="space-y-2 text-sm">
              <p><strong>Nombre:</strong> {selectedCliente.nombre_completo || '-'}</p>
              <p><strong>Correo:</strong> {selectedCliente.correo_principal || 'Sin correo'}</p>
              <p><strong>Sucursal:</strong> {selectedCliente.nombre_sucursal || 'Sin sucursal'}</p>
              <p><strong>Acceso:</strong> <AccessBadge cliente={selectedCliente} /></p>
              <p><strong>Fecha nacimiento:</strong> {selectedCliente.fecha_nacimiento ? String(selectedCliente.fecha_nacimiento).slice(0, 10) : '-'}</p>
              <p><strong>Fecha de cliente:</strong> {selectedCliente.fecha_ingreso ? String(selectedCliente.fecha_ingreso).slice(0, 10) : '-'}</p>
              <p><strong>DNI:</strong> {selectedCliente.dni || '-'}</p>
              <p><strong>RTN:</strong> {selectedCliente.rtn || '-'}</p>
              <p><strong>Telefono:</strong> {selectedCliente.telefono_principal || '-'}</p>
              <p><strong>Direccion:</strong> {selectedCliente.direccion_texto || '-'}</p>
              <p><strong>Observaciones:</strong> {selectedCliente.observaciones || '-'}</p>
              <p><strong>Consentimiento marketing:</strong> {selectedCliente.consentimiento_marketing ? 'Si' : 'No'}</p>
              <p><strong>Acepta terminos:</strong> {selectedCliente.acepta_terminos ? 'Si' : 'No'}</p>
              <p><strong>Estado cliente:</strong> {selectedCliente.estado_cliente ? 'Activo' : 'Inactivo'}</p>
              <p><strong>Credenciales completadas:</strong> {selectedCliente.credenciales_completadas_at ? new Date(selectedCliente.credenciales_completadas_at).toLocaleString() : 'No'}</p>
              <p><strong>Ultimo login:</strong> {selectedCliente.ultimo_login_at ? new Date(selectedCliente.ultimo_login_at).toLocaleString() : 'Sin registro'}</p>
            </div>
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
    </div>
  );
}
