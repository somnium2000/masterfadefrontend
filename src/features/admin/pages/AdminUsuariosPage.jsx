import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  activateAdminPersonaUsuario,
  blockAdminPersonaUsuario,
  listAdminPersonasUsuarios,
  sendAdminPersonaUserPasswordSetup,
} from '../lib/adminPersonasApi.js';
import { Button } from '../../../components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
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

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function AccessBadge({ estadoAcceso }) {
  const normalized = String(estadoAcceso || '').trim().toLowerCase();
  let className = 'mf-badge mf-badge-muted';
  if (normalized === 'activo') className = 'mf-badge mf-badge-green';
  if (normalized === 'bloqueado' || normalized === 'inactivo') className = 'mf-badge mf-badge-red';
  if (normalized === 'pendiente_password') className = 'mf-badge mf-badge-gold';
  return <span className={className}>{ACCESS_LABELS[normalized] || 'Sin estado'}</span>;
}

function buildRoleLabel(roles) {
  const roleEntries = Array.isArray(roles) ? roles : [];
  if (!roleEntries.length) return 'Sin roles';
  return roleEntries.map((role) => role.rol).join(', ');
}

function isActivationState(estadoAcceso) {
  const state = String(estadoAcceso || '').toLowerCase();
  return state === 'bloqueado' || state === 'inactivo';
}

export default function AdminUsuariosPage() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [loadingUserId, setLoadingUserId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedUsuario, setSelectedUsuario] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const notifications = useNotifications();
  const [view, setView] = useState(() => {
    try {
      const value = localStorage.getItem('mf-view-usuarios');
      return value === 'table' || value === 'cards' ? value : 'cards';
    } catch {
      return 'cards';
    }
  });

  const fetchUsuarios = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setListError('');
    }
    try {
      const response = await listAdminPersonasUsuarios();
      const payload = response?.data ?? response;
      setUsuarios(Array.isArray(payload?.usuarios) ? payload.usuarios : []);
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

  useEffect(() => {
    void fetchUsuarios();
  }, [fetchUsuarios]);

  function openDetail(usuario) {
    setSelectedUsuario(usuario || null);
    setDetailOpen(true);
  }

  async function runUserAction(userId, action, options) {
    const successMessage = options?.successMessage || 'Operacion completada.';
    const loadingMessage = options?.loadingMessage || '';
    const loadingId = loadingMessage
      ? notifications.loading(loadingMessage, { dedupeKey: options?.loadingDedupeKey || '' })
      : null;

    setLoadingUserId(userId);
    try {
      const response = await action(userId);
      const payload = response?.data ?? response;
      if (payload?.usuario) {
        setUsuarios((prev) => replaceItemById(prev, payload.usuario, (entry) => entry?.id_usuario));
      }
      if (loadingId) {
        notifications.update(loadingId, {
          type: 'success',
          message: successMessage,
          persist: false,
          duration: 2600,
        });
      } else {
        notifications.success(successMessage, { dedupeKey: options?.successDedupeKey || 'personas-usuarios-action-ok' });
      }
      void fetchUsuarios({ silent: true });
    } catch (err) {
      const errorMessage = extractMessage(err);
      if (loadingId) {
        notifications.update(loadingId, {
          type: 'error',
          message: errorMessage,
          persist: false,
          duration: 7000,
        });
      } else {
        notifications.error(errorMessage, { dedupeKey: options?.errorDedupeKey || 'personas-usuarios-action-error' });
      }
    } finally {
      setLoadingUserId('');
    }
  }

  async function handleResendSetup(idUsuario) {
    await runUserAction(
      idUsuario,
      async (userId) => {
        const response = await sendAdminPersonaUserPasswordSetup(userId, { marcar_pendiente_password: true });
        const payload = response?.data ?? response;
        if (!payload?.setup_password?.enviado) {
          const errorMessage = payload?.setup_password?.mensaje || 'No se pudo enviar el mensaje de configuracion.';
          const error = new Error(errorMessage);
          // AM: Normaliza error de servicio SMTP para mantener feedback consistente en UI.
          error.data = { error: { message: errorMessage } };
          throw error;
        }
        return response;
      },
      {
        successMessage: 'Mensaje de nueva contrasena enviado.',
        loadingMessage: 'Enviando mensaje de configuracion...',
        loadingDedupeKey: 'personas-usuarios-resend-loading',
      }
    );
  }

  async function handleToggleBlock(usuario) {
    const shouldActivate = isActivationState(usuario?.estado_acceso);
    setConfirmTarget({
      ...usuario,
      _action: shouldActivate ? 'activar' : 'bloquear',
    });
  }

  async function confirmToggleBlock() {
    const usuario = confirmTarget;
    if (!usuario?.id_usuario) return;
    const shouldActivate = usuario?._action === 'activar';

    await runUserAction(
      usuario.id_usuario,
      shouldActivate ? activateAdminPersonaUsuario : blockAdminPersonaUsuario,
      {
        successMessage: shouldActivate ? 'Usuario activado.' : 'Usuario bloqueado.',
      }
    );

    setConfirmTarget(null);
  }

  function renderActions(usuario) {
    const loadingActions = loadingUserId === usuario.id_usuario;
    const shouldActivate = isActivationState(usuario.estado_acceso);
    return (
      <div className="flex w-full flex-wrap items-center justify-start gap-2">
        <HoverActionButton
          icon={<Eye size={14} strokeWidth={2} />}
          label="Ver detalle"
          title="Ver detalle de usuario"
          disabled={loadingActions}
          onClick={() => openDetail(usuario)}
        />
        <HoverActionButton
          icon={shouldActivate ? <CheckCircle2 size={14} strokeWidth={2} /> : <Ban size={14} strokeWidth={2} />}
          label={loadingActions ? 'Procesando...' : shouldActivate ? 'Activar' : 'Bloquear'}
          title={shouldActivate ? 'Activar usuario' : 'Bloquear usuario'}
          tone={shouldActivate ? 'success' : 'warning'}
          disabled={loadingActions}
          onClick={() => handleToggleBlock(usuario)}
        />
        <HoverActionButton
          icon={<RefreshCw size={14} strokeWidth={2} />}
          label={loadingActions ? 'Procesando...' : 'Mandar mensaje'}
          title="Mandar mensaje para nueva contrasena"
          disabled={loadingActions}
          onClick={() => handleResendSetup(usuario.id_usuario)}
        />
      </div>
    );
  }

  return (
    <div className="mf-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">Personas - Gestion</p>
          <h1 className="mf-font-display mt-1 text-3xl leading-tight text-[var(--mf-text)]">Usuarios con Acceso</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--mf-text-2)]">{loading ? 'Cargando...' : `${usuarios.length} registro(s)`}</span>
          <ViewToggle defaultView={view} onViewChange={setView} storageKey="usuarios" />
        </div>
      </div>

      <div className="mf-divider" />

      {listError && <ErrorBanner message={listError} onRetry={fetchUsuarios} />}
      {loading && !listError && <LoadingSpinner />}

      {!loading && !listError && usuarios.length === 0 && (
        <EmptyState icon={ShieldCheck} title="Sin usuarios con acceso" description="Aun no hay usuarios internos habilitados." />
      )}

      {!loading && !listError && usuarios.length > 0 && view === 'cards' && (
        <CardsCarousel
          items={usuarios}
          getItemKey={(usuario) => usuario?.id_usuario}
          renderItem={(usuario, index, pageIndex) => (
            <DataCard
              key={usuario.id_usuario}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<ShieldCheck size={16} />}
              title={usuario.nombre_completo || 'Usuario'}
              subtitle={usuario.email || 'Sin correo'}
              badge={<AccessBadge estadoAcceso={usuario.estado_acceso} />}
              fields={[
                { label: 'Roles', value: buildRoleLabel(usuario.roles) },
                { label: 'Origen', value: usuario.origen || 'interno' },
                { label: 'Ultimo login', value: usuario.ultimo_login_at ? new Date(usuario.ultimo_login_at).toLocaleString() : 'Sin registro' },
              ]}
              actions={renderActions(usuario)}
            />
          )}
        />
      )}

      {!loading && !listError && usuarios.length > 0 && view === 'table' && (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Correo</TableHead>
                <TableHead className="hidden md:table-cell text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Roles</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Estado Acceso</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((usuario) => (
                <TableRow key={usuario.id_usuario} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">
                  <TableCell className="font-medium text-[var(--mf-text)]">{usuario.nombre_completo || 'Usuario'}</TableCell>
                  <TableCell className="text-[var(--mf-text-2)] text-sm">{usuario.email || 'Sin correo'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{buildRoleLabel(usuario.roles)}</TableCell>
                  <TableCell className="text-center"><AccessBadge estadoAcceso={usuario.estado_acceso} /></TableCell>
                  <TableCell className="text-center">{renderActions(usuario)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Detalle de Usuario</DialogTitle></DialogHeader>
          {selectedUsuario && (
            <div className="space-y-2 text-sm">
              <p><strong>Nombre:</strong> {selectedUsuario.nombre_completo || '-'}</p>
              <p><strong>Correo:</strong> {selectedUsuario.email || '-'}</p>
              <p><strong>Origen:</strong> {selectedUsuario.origen || 'interno'}</p>
              <p><strong>Roles:</strong> {buildRoleLabel(selectedUsuario.roles)}</p>
              <p><strong>Estado de acceso:</strong> <AccessBadge estadoAcceso={selectedUsuario.estado_acceso} /></p>
              <p><strong>Credenciales completadas:</strong> {selectedUsuario.credenciales_completadas_at ? new Date(selectedUsuario.credenciales_completadas_at).toLocaleString() : 'No'}</p>
              <p><strong>Ultimo login:</strong> {selectedUsuario.ultimo_login_at ? new Date(selectedUsuario.ultimo_login_at).toLocaleString() : 'Sin registro'}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open && !loadingUserId) setConfirmTarget(null);
        }}
        tone={confirmTarget?._action === 'activar' ? 'warning' : 'danger'}
        title={confirmTarget?._action === 'activar' ? 'Activar usuario' : 'Bloquear usuario'}
        description={
          confirmTarget
            ? `Vas a ${confirmTarget._action} a ${confirmTarget.nombre_completo || confirmTarget.email || 'este usuario'}.`
            : ''
        }
        confirmLabel={confirmTarget?._action === 'activar' ? 'Activar' : 'Bloquear'}
        cancelLabel="Cancelar"
        loading={Boolean(loadingUserId)}
        onConfirm={confirmToggleBlock}
      />
    </div>
  );
}
