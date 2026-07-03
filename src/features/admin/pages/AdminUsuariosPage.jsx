import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Building2, CheckCircle2, Eye, KeyRound, RefreshCw, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Users, X } from 'lucide-react';
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

const ACCESS_LABELS = {
  pendiente_password: 'Contraseña pendiente',
  activo: 'Activo',
  bloqueado: 'Bloqueado',
  inactivo: 'Inactivo',
};
const TABLE_PAGE_SIZE = 10;
const CARDS_PAGE_SIZE = 6;

const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  barbero: 'Barbero',
  cliente: 'Cliente',
};

const USER_FILTER_DEFAULTS = {
  estadoAcceso: 'all',
  rol: 'all',
  origen: 'all',
};
const PROTECTED_ROOT_EMAIL = 'somniumia2000@gmail.com';
const PROTECTED_ROOT_MESSAGE = 'El usuario root protegido no puede ser bloqueado ni degradado.';
const PROTECTED_ROOT_ERROR_CODES = new Set([
  'ROOT_USER_PROTECTED',
  'ROOT_ROLE_PROTECTED',
  'ROOT_USER_PROTECTION_CHECK_FAILED',
]);

function quickFilterButtonClass(isActive) {
  // AM: Estado montado en botones rapidos para claridad operativa de filtros activos.
  return isActive
    ? 'rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
    : 'rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60';
}

function extractMessage(err) {
  const errorCode = String(err?.data?.error?.code || err?.code || '').trim();
  if (PROTECTED_ROOT_ERROR_CODES.has(errorCode)) {
    return PROTECTED_ROOT_MESSAGE;
  }

  const rawMessage = String(err?.data?.error?.message || err?.message || '').trim();
  if (!rawMessage) return 'No se pudo completar la operacion de usuarios.';
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

function AccessBadge({ estadoAcceso }) {
  const normalized = String(estadoAcceso || '').trim().toLowerCase();
  let className = 'mf-badge mf-badge-muted';
  if (normalized === 'activo') className = 'mf-badge mf-badge-green';
  if (normalized === 'bloqueado' || normalized === 'inactivo') className = 'mf-badge mf-badge-red';
  if (normalized === 'pendiente_password') className = 'mf-badge mf-badge-gold';
  return <span className={className}>{ACCESS_LABELS[normalized] || 'Sin estado'}</span>;
}

function ProtectedRootBadge() {
  return (
    <span className="mf-badge mf-badge-gold" title={PROTECTED_ROOT_MESSAGE}>
      Root protegido
    </span>
  );
}

function isProtectedRootUser(usuario) {
  if (!usuario) return false;
  if (usuario.is_protected === true || usuario.protected === true || usuario.es_protegido === true) {
    return true;
  }

  // AM: Fallback temporal hasta que la API exponga is_protected desde app_protected_users.
  const email = String(usuario?.correo_principal || usuario?.email || '').trim().toLowerCase();
  return email === PROTECTED_ROOT_EMAIL;
}

function renderUserBadges(usuario) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AccessBadge estadoAcceso={usuario?.estado_acceso} />
      {isProtectedRootUser(usuario) ? <ProtectedRootBadge /> : null}
    </div>
  );
}

function buildRoleLabel(roles) {
  const roleEntries = Array.isArray(roles) ? roles : [];
  if (!roleEntries.length) return 'Sin roles';
  return roleEntries.map((role) => role.rol).join(', ');
}

function getRoleCodes(roles) {
  const roleEntries = Array.isArray(roles) ? roles : [];
  return roleEntries
    .map((role) => String(role?.rol || '').trim().toLowerCase())
    .filter(Boolean);
}

function formatRoleLabel(roleCode) {
  const normalized = String(roleCode || '').trim().toLowerCase();
  if (!normalized) return 'Sin rol';
  return ROLE_LABELS[normalized] || normalized.replace(/_/g, ' ');
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
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(USER_FILTER_DEFAULTS);
  const notifications = useNotifications();
  const [view, setView] = useState(() => {
    try {
      const value = localStorage.getItem('mf-view-usuarios');
      return value === 'table' || value === 'cards' ? value : 'cards';
    } catch {
      return 'cards';
    }
  });

  const roleFilterOptions = useMemo(() => {
    const uniqueRoles = new Set();
    usuarios.forEach((usuario) => {
      getRoleCodes(usuario?.roles).forEach((roleCode) => uniqueRoles.add(roleCode));
    });
    return Array.from(uniqueRoles);
  }, [usuarios]);

  const origenFilterOptions = useMemo(() => {
    const origins = new Set();
    usuarios.forEach((usuario) => {
      const value = String(usuario?.origen || 'interno').trim();
      if (value) origins.add(value);
    });
    return Array.from(origins);
  }, [usuarios]);

  // AM: Filtro compuesto de usuarios para busqueda por texto y estado sin recargar API.
  const filteredUsuarios = useMemo(() => {
    const searchValue = search.trim().toLowerCase();
    return usuarios.filter((usuario) => {
      if (searchValue) {
        const searchable = [
          usuario?.nombre_completo,
          usuario?.email,
          buildRoleLabel(usuario?.roles),
          usuario?.origen || 'interno',
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(searchValue)) return false;
      }

      if (filters.estadoAcceso !== 'all' && String(usuario?.estado_acceso || '') !== filters.estadoAcceso) {
        return false;
      }

      if (filters.rol !== 'all' && !getRoleCodes(usuario?.roles).includes(filters.rol)) {
        return false;
      }

      if (filters.origen !== 'all' && String(usuario?.origen || 'interno') !== filters.origen) {
        return false;
      }

      return true;
    });
  }, [filters, search, usuarios]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== 'all').length,
    [filters]
  );
  const currentPageSize = view === 'table' ? TABLE_PAGE_SIZE : CARDS_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredUsuarios.length / currentPageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedUsuarios = useMemo(() => {
    const start = (safePage - 1) * currentPageSize;
    return filteredUsuarios.slice(start, start + currentPageSize);
  }, [currentPageSize, filteredUsuarios, safePage]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      chips.push({ key: 'search', label: `Busqueda: ${trimmedSearch}` });
    }
    if (filters.estadoAcceso !== 'all') {
      chips.push({ key: 'estadoAcceso', label: `Acceso: ${ACCESS_LABELS[filters.estadoAcceso] || filters.estadoAcceso}` });
    }
    if (filters.rol !== 'all') {
      chips.push({ key: 'rol', label: `Rol: ${formatRoleLabel(filters.rol)}` });
    }
    if (filters.origen !== 'all') {
      chips.push({ key: 'origen', label: `Origen: ${filters.origen}` });
    }
    return chips;
  }, [filters, search]);

  function clearAllFilters() {
    setSearch('');
    setFilters(USER_FILTER_DEFAULTS);
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
    if (!userId || loadingUserId) return;
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

  async function handleResendSetup(usuario) {
    const idUsuario = usuario?.id_usuario;
    if (!idUsuario || loadingUserId) return;
    if (isProtectedRootUser(usuario)) {
      notifications.error(PROTECTED_ROOT_MESSAGE, { dedupeKey: 'personas-usuarios-root-protected' });
      return;
    }

    await runUserAction(
      idUsuario,
      async (userId) => {
        const response = await sendAdminPersonaUserPasswordSetup(userId, { marcar_pendiente_password: true });
        const payload = response?.data ?? response;
        if (!payload?.setup_password?.enviado) {
          const message = payload?.setup_password?.mensaje || 'No se pudo enviar el mensaje de configuracion en este momento.';
          const error = new Error(message);
          error.data = { error: { message } };
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
    if (!shouldActivate && isProtectedRootUser(usuario)) {
      notifications.error(PROTECTED_ROOT_MESSAGE, { dedupeKey: 'personas-usuarios-root-protected' });
      return;
    }

    setConfirmTarget({
      ...usuario,
      _action: shouldActivate ? 'activar' : 'bloquear',
    });
  }

  async function confirmToggleBlock() {
    const usuario = confirmTarget;
    if (!usuario?.id_usuario) return;
    const shouldActivate = usuario?._action === 'activar';
    if (!shouldActivate && isProtectedRootUser(usuario)) {
      notifications.error(PROTECTED_ROOT_MESSAGE, { dedupeKey: 'personas-usuarios-root-protected' });
      setConfirmTarget(null);
      return;
    }

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
    const protectedRoot = isProtectedRootUser(usuario);
    const protectedActionDisabled = protectedRoot && !shouldActivate;
    const protectedTitle = protectedActionDisabled ? PROTECTED_ROOT_MESSAGE : null;
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
          title={protectedTitle || (shouldActivate ? 'Activar usuario' : 'Bloquear usuario')}
          tone={shouldActivate ? 'success' : 'warning'}
          disabled={loadingActions || protectedActionDisabled}
          onClick={() => handleToggleBlock(usuario)}
        />
        <HoverActionButton
          icon={<RefreshCw size={14} strokeWidth={2} />}
          label={loadingActions ? 'Procesando...' : 'Mandar mensaje'}
          title={protectedRoot ? PROTECTED_ROOT_MESSAGE : 'Mandar mensaje para nueva contrasena'}
          disabled={loadingActions || protectedRoot}
          onClick={() => handleResendSetup(usuario)}
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
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Usuarios con Acceso</h1>
            <p className="text-sm text-[var(--mf-text-2)]">Gestion de cuentas internas y control de acceso.</p>
          </div>

          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[var(--mf-text-2)]">
                {loading ? 'Cargando...' : `${filteredUsuarios.length} de ${usuarios.length} registro(s)`}
              </span>
              <ViewToggle defaultView={view} onViewChange={setView} storageKey="usuarios" />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[320px]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nombre, correo o rol..."
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

      {listError && <ErrorBanner message={listError} onRetry={fetchUsuarios} />}
      {loading && !listError && <LoadingSpinner />}

      {!loading && !listError && filteredUsuarios.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="Sin resultados"
          description={usuarios.length ? 'No hay coincidencias con la busqueda o filtros actuales.' : 'Aun no hay usuarios internos habilitados.'}
        />
      )}

      {!loading && !listError && filteredUsuarios.length > 0 && view === 'cards' && (
        <CardsCarousel
          items={pagedUsuarios}
          getItemKey={(usuario) => usuario?.id_usuario}
          renderItem={(usuario, index, pageIndex) => (
            <DataCard
              key={usuario.id_usuario}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<ShieldCheck size={16} />}
              title={usuario.nombre_completo || 'Usuario'}
              subtitle={usuario.email || 'Sin correo'}
              badge={renderUserBadges(usuario)}
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

      {!loading && !listError && filteredUsuarios.length > 0 && view === 'table' && (
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
              {pagedUsuarios.map((usuario) => (
                <TableRow key={usuario.id_usuario} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">
                  <TableCell className="font-medium text-[var(--mf-text)]">{usuario.nombre_completo || 'Usuario'}</TableCell>
                  <TableCell className="text-[var(--mf-text-2)] text-sm">{usuario.email || 'Sin correo'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{buildRoleLabel(usuario.roles)}</TableCell>
                  <TableCell className="text-center">{renderUserBadges(usuario)}</TableCell>
                  <TableCell className="text-center">{renderActions(usuario)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && !listError && filteredUsuarios.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2">
          <p className="text-xs text-[var(--mf-text-2)]">
            Mostrando {pagedUsuarios.length} registro(s) de {filteredUsuarios.length}
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-4xl">
          <DialogHeader><DialogTitle>Detalle de Usuario</DialogTitle></DialogHeader>
          {selectedUsuario && (
            /* AM: Vista de detalle premium orientada a trazabilidad de acceso para soporte operativo. */
            <DetailInfoModalContent
              summary={{
                icon: <Users size={16} />,
                title: selectedUsuario.nombre_completo || '-',
                subtitle: selectedUsuario.email || '-',
                badge: renderUserBadges(selectedUsuario),
              }}
              sections={[
                {
                  id: 'perfil',
                  title: 'Perfil de acceso',
                  icon: <ShieldCheck size={14} />,
                  fields: [
                    { label: 'Nombre', value: selectedUsuario.nombre_completo || '-' },
                    { label: 'Correo', value: selectedUsuario.email || '-' },
                    { label: 'Roles', value: buildRoleLabel(selectedUsuario.roles) },
                    { label: 'Origen', value: selectedUsuario.origen || 'interno' },
                  ],
                },
                {
                  id: 'estado',
                  title: 'Estado y trazabilidad',
                  icon: <KeyRound size={14} />,
                  fields: [
                    { label: 'Estado acceso', value: renderUserBadges(selectedUsuario) },
                    { label: 'Credenciales completadas', value: selectedUsuario.credenciales_completadas_at ? new Date(selectedUsuario.credenciales_completadas_at).toLocaleString() : 'No' },
                    { label: 'Ultimo login', value: selectedUsuario.ultimo_login_at ? new Date(selectedUsuario.ultimo_login_at).toLocaleString() : 'Sin registro' },
                  ],
                },
                {
                  id: 'origen',
                  title: 'Dominio asociado',
                  icon: <Building2 size={14} />,
                  fields: [
                    { label: 'Origen', value: selectedUsuario.origen || 'interno' },
                    {
                      label: 'Perfil vinculado',
                      value: selectedUsuario.tiene_empleado
                        ? 'Empleado'
                        : selectedUsuario.tiene_cliente
                          ? 'Cliente'
                          : 'Super Admin interno',
                    },
                  ],
                },
              ]}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Usuarios</DialogTitle>
          </DialogHeader>
          {/* AM: Atajos de estado para flujos operativos rapidos del equipo administrativo. */}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, estadoAcceso: prev.estadoAcceso === 'activo' ? 'all' : 'activo' }))}
              className={quickFilterButtonClass(filters.estadoAcceso === 'activo')}
            >
              Activos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, estadoAcceso: prev.estadoAcceso === 'bloqueado' ? 'all' : 'bloqueado' }))}
              className={quickFilterButtonClass(filters.estadoAcceso === 'bloqueado')}
            >
              Bloqueados
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFilters((prev) => ({ ...prev, estadoAcceso: prev.estadoAcceso === 'pendiente_password' ? 'all' : 'pendiente_password' }))}
              className={quickFilterButtonClass(filters.estadoAcceso === 'pendiente_password')}
            >
              Contraseña pendiente
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Estado de acceso</Label>
              <select
                className="mf-select mt-1"
                value={filters.estadoAcceso}
                onChange={(event) => setFilters((prev) => ({ ...prev, estadoAcceso: event.target.value }))}
              >
                <option value="all">Todos</option>
                {Object.entries(ACCESS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mf-label">Rol interno</Label>
              <select
                className="mf-select mt-1"
                value={filters.rol}
                onChange={(event) => setFilters((prev) => ({ ...prev, rol: event.target.value }))}
              >
                <option value="all">Todos</option>
                {roleFilterOptions.map((roleCode) => (
                  <option key={roleCode} value={roleCode}>{formatRoleLabel(roleCode)}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label className="mf-label">Origen</Label>
              <select
                className="mf-select mt-1"
                value={filters.origen}
                onChange={(event) => setFilters((prev) => ({ ...prev, origen: event.target.value }))}
              >
                <option value="all">Todos</option>
                {origenFilterOptions.map((origen) => (
                  <option key={origen} value={origen}>{origen}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFilters(USER_FILTER_DEFAULTS); setPage(1); }}>
              Limpiar filtros
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
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

