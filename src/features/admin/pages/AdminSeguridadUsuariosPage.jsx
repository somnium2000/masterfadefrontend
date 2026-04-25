import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Search, ShieldAlert } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  listAdminSecurityUsers,
  updateAdminSecurityUserAccessState,
} from '../lib/adminSeguridadApi.js';

const USER_STATE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pendiente_password', label: 'Pendiente password' },
  { value: 'activo', label: 'Activo' },
  { value: 'bloqueado', label: 'Bloqueado' },
  { value: 'inactivo', label: 'Inactivo' },
];

const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Actualizacion' },
  { value: 'failed_login_count', label: 'Intentos fallidos' },
  { value: 'last_login_at', label: 'Ultimo login' },
];

const DIRECTION_OPTIONS = [
  { value: 'desc', label: 'Descendente' },
  { value: 'asc', label: 'Ascendente' },
];

const DEFAULT_FILTERS = {
  estadoAcceso: 'all',
  sortBy: 'updated_at',
  sortDir: 'desc',
  limit: 20,
};

function unwrapCollectionResponse(response) {
  const payload = response?.data && typeof response.data === 'object'
    ? response.data
    : (response || {});
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const pagination = payload?.pagination || {
    page: 1,
    limit: DEFAULT_FILTERS.limit,
    total: 0,
    total_pages: 1,
  };
  return { items, pagination };
}

function normalizeDisplayText(value, fallback = '-') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function StateBadge({ value }) {
  const normalized = String(value || '').trim().toLowerCase();
  let className = 'mf-badge mf-badge-muted';
  if (normalized === 'activo') className = 'mf-badge mf-badge-green';
  if (normalized === 'bloqueado' || normalized === 'inactivo') className = 'mf-badge mf-badge-red';
  if (normalized === 'pendiente_password') className = 'mf-badge mf-badge-gold';
  return <span className={className}>{normalizeDisplayText(normalized, 'desconocido')}</span>;
}

function buildUserDisplayName(row) {
  const names = [row?.nombres, row?.apellidos].filter(Boolean).join(' ').trim();
  if (names) return names;
  return normalizeDisplayText(row?.email_masked, 'Usuario interno');
}

function formatRolesLabel(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return 'Sin rol';
  return roles.join(', ');
}

function resolveListErrorMessage(error) {
  const status = Number(error?.status || 0);
  if (status === 400) return 'No se pudieron aplicar los filtros solicitados.';
  return 'No fue posible cargar el estado de acceso de usuarios.';
}

function resolveActionMessage(error) {
  const status = Number(error?.status || 0);
  if (status === 409) return 'No fue posible completar la accion solicitada por politica de seguridad.';
  if (status === 404) return 'El usuario ya no se encuentra disponible para esta accion.';
  return 'No fue posible actualizar el estado de acceso en este momento.';
}

export default function AdminSeguridadUsuariosPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { roles } = useAuth();

  const canWrite = useMemo(
    () => roles.includes('super_admin') || roles.includes('security_admin'),
    [roles]
  );

  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: DEFAULT_FILTERS.limit, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState('');

  const hasActiveFilters = useMemo(() => (
    filters.estadoAcceso !== DEFAULT_FILTERS.estadoAcceso
    || filters.sortBy !== DEFAULT_FILTERS.sortBy
    || filters.sortDir !== DEFAULT_FILTERS.sortDir
    || Number(filters.limit) !== Number(DEFAULT_FILTERS.limit)
    || Boolean(searchTerm)
  ), [filters, searchTerm]);

  useEffect(() => {
    const handler = setTimeout(() => {
      const normalized = String(searchInput || '').normalize('NFC').trim();
      setSearchTerm((previous) => {
        if (previous === normalized) return previous;
        setPage(1);
        return normalized;
      });
    }, 350);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listAdminSecurityUsers({
        page,
        limit: filters.limit,
        estadoAcceso: filters.estadoAcceso === 'all' ? '' : filters.estadoAcceso,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        q: searchTerm,
      });
      const parsed = unwrapCollectionResponse(response);
      setRows(parsed.items);
      setPagination(parsed.pagination);
    } catch (requestError) {
      if (requestError?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (requestError?.status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      setError(resolveListErrorMessage(requestError));
      setRows([]);
      setPagination({ page: 1, limit: filters.limit, total: 0, total_pages: 1 });
    } finally {
      setLoading(false);
    }
  }, [filters, navigate, page, searchTerm]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  function clearFilters() {
    setFilters(DEFAULT_FILTERS);
    setSearchInput('');
    setSearchTerm('');
    setPage(1);
  }

  function resolveTargetState(currentState) {
    const normalized = String(currentState || '').toLowerCase();
    return normalized === 'activo' ? 'bloqueado' : 'activo';
  }

  async function confirmAccessChange() {
    if (!confirmTarget?.id_usuario || !confirmTarget?.nextState || actionLoadingId) return;
    setActionLoadingId(confirmTarget.id_usuario);
    try {
      await updateAdminSecurityUserAccessState(confirmTarget.id_usuario, confirmTarget.nextState);
      notifications.success('Estado de acceso actualizado correctamente.', {
        dedupeKey: 'security-users-access-updated',
      });
      setConfirmTarget(null);
      await fetchRows();
    } catch (requestError) {
      if (requestError?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (requestError?.status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      notifications.error(resolveActionMessage(requestError), {
        dedupeKey: 'security-users-access-update-error',
      });
    } finally {
      setActionLoadingId('');
    }
  }

  const safePage = Math.max(1, Number(pagination?.page || page));
  const totalPages = Math.max(1, Number(pagination?.total_pages || 1));

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Seguridad</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Usuarios de Acceso</h1>
            <p className="text-sm text-[var(--mf-text-2)]">
              Estado de bloqueo, intentos fallidos y control de acceso por cuenta.
            </p>
          </div>
          <div className="text-sm text-[var(--mf-text-2)]">
            {loading ? 'Cargando...' : `${pagination.total || 0} registro(s)`}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Label className="mf-label">Busqueda</Label>
            <Input
              className="mt-1"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por nombre o correo enmascarado..."
            />
          </div>
          <div>
            <Label className="mf-label">Estado acceso</Label>
            <select
              className="mf-select mt-1"
              value={filters.estadoAcceso}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, estadoAcceso: event.target.value }));
                setPage(1);
              }}
            >
              {USER_STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mf-label">Ordenar por</Label>
            <select
              className="mf-select mt-1"
              value={filters.sortBy}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, sortBy: event.target.value }));
                setPage(1);
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mf-label">Direccion</Label>
            <select
              className="mf-select mt-1"
              value={filters.sortDir}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, sortDir: event.target.value }));
                setPage(1);
              }}
            >
              {DIRECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label className="mf-label !mb-0">Tamano de pagina</Label>
            <select
              className="mf-select min-w-[100px]"
              value={String(filters.limit)}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, limit: Number(event.target.value) }));
                setPage(1);
              }}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" className="gap-2" onClick={clearFilters}>
              <RotateCcw size={14} />
              Restablecer filtros
            </Button>
          ) : (
            <span className="text-xs text-[var(--mf-text-2)] inline-flex items-center gap-1">
              <Search size={12} />
              Busqueda con debounce de 350ms
            </span>
          )}
        </div>
      </section>

      {error ? <ErrorBanner message={error} onRetry={() => void fetchRows()} /> : null}
      {loading && !error ? <LoadingSpinner label="Consultando usuarios de seguridad..." /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No hay usuarios para los filtros aplicados"
          description="Prueba con un estado diferente o limpia la busqueda."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Usuario</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Correo</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Roles</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Estado</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Bloqueado hasta</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Fallidos</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Forzar cambio</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Ultimo login</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Accion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const nextState = resolveTargetState(row.estado_acceso);
                const isActivating = nextState === 'activo';
                return (
                  <TableRow key={row.id_usuario} className="border-[var(--mf-nav-border)]">
                    <TableCell>{buildUserDisplayName(row)}</TableCell>
                    <TableCell>{normalizeDisplayText(row.email_masked)}</TableCell>
                    <TableCell>{formatRolesLabel(row.roles)}</TableCell>
                    <TableCell><StateBadge value={row.estado_acceso} /></TableCell>
                    <TableCell>{formatDateTime(row.locked_until_at)}</TableCell>
                    <TableCell className="text-center">{Number(row.failed_login_count || 0)}</TableCell>
                    <TableCell className="text-center">
                      {row.force_password_change === true ? 'Si' : row.force_password_change === false ? 'No' : 'No disponible'}
                    </TableCell>
                    <TableCell>{formatDateTime(row.last_login_at)}</TableCell>
                    <TableCell className="text-center">
                      {canWrite ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={actionLoadingId === row.id_usuario}
                          onClick={() => setConfirmTarget({
                            id_usuario: row.id_usuario,
                            currentState: row.estado_acceso,
                            nextState,
                            label: buildUserDisplayName(row),
                            actionLabel: isActivating ? 'Activar' : 'Bloquear',
                          })}
                        >
                          {isActivating ? 'Activar' : 'Bloquear'}
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--mf-text-2)]">Solo lectura</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2">
          <p className="text-xs text-[var(--mf-text-2)]">
            Mostrando {rows.length} de {pagination.total || 0}
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

      <ActionConfirmDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open && !actionLoadingId) setConfirmTarget(null);
        }}
        tone={confirmTarget?.nextState === 'bloqueado' ? 'danger' : 'warning'}
        title={confirmTarget?.nextState === 'bloqueado' ? 'Bloquear acceso' : 'Activar acceso'}
        description={
          confirmTarget
            ? `Se actualizara el estado de acceso de ${confirmTarget.label} a ${confirmTarget.nextState}.`
            : ''
        }
        confirmLabel={confirmTarget?.actionLabel || 'Confirmar'}
        cancelLabel="Cancelar"
        loading={Boolean(actionLoadingId)}
        onConfirm={confirmAccessChange}
      />
    </div>
  );
}

