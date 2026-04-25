import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Search, ShieldCheck } from 'lucide-react';
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
  listAdminSecuritySessions,
  listAdminSecurityUsers,
  revokeAdminSecuritySession,
} from '../lib/adminSeguridadApi.js';

const SESSION_STATE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'activa', label: 'Activa' },
  { value: 'cerrada', label: 'Cerrada' },
  { value: 'revocada', label: 'Revocada' },
  { value: 'expirada', label: 'Expirada' },
];

const SORT_OPTIONS = [
  { value: 'inicio_at', label: 'Inicio' },
  { value: 'ultimo_uso_at', label: 'Ultimo uso' },
  { value: 'expira_at', label: 'Expiracion' },
  { value: 'estado', label: 'Estado' },
];

const DIRECTION_OPTIONS = [
  { value: 'desc', label: 'Descendente' },
  { value: 'asc', label: 'Ascendente' },
];

const DEFAULT_FILTERS = {
  estado: 'all',
  sortBy: 'inicio_at',
  sortDir: 'desc',
  fromAt: '',
  toAt: '',
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

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function toDatetimeLocal(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const withOffset = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
  return withOffset.toISOString().slice(0, 16);
}

function normalizeDisplayText(value, fallback = '-') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function formatRoleLabel(roles = []) {
  if (!Array.isArray(roles) || roles.length === 0) return 'Sin rol';
  return roles.join(', ');
}

function buildUserDisplayName(userItem) {
  const names = [userItem?.nombres, userItem?.apellidos].filter(Boolean).join(' ').trim();
  if (names) return names;
  return normalizeDisplayText(userItem?.email_masked, 'Usuario');
}

function StateBadge({ value }) {
  const normalized = String(value || '').trim().toLowerCase();
  let className = 'mf-badge mf-badge-muted';
  if (normalized === 'activa') className = 'mf-badge mf-badge-green';
  if (normalized === 'revocada' || normalized === 'cerrada') className = 'mf-badge mf-badge-red';
  if (normalized === 'expirada') className = 'mf-badge mf-badge-gold';
  return <span className={className}>{normalizeDisplayText(normalized, 'desconocido')}</span>;
}

function resolveListErrorMessage(error) {
  const status = Number(error?.status || 0);
  if (status === 400) return 'No se pudieron aplicar los filtros solicitados.';
  return 'No fue posible cargar las sesiones de seguridad en este momento.';
}

export default function AdminSeguridadSesionesPage() {
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
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [userDirectory, setUserDirectory] = useState({});

  const hasActiveFilters = useMemo(() => (
    filters.estado !== DEFAULT_FILTERS.estado
    || filters.sortBy !== DEFAULT_FILTERS.sortBy
    || filters.sortDir !== DEFAULT_FILTERS.sortDir
    || filters.fromAt !== DEFAULT_FILTERS.fromAt
    || filters.toAt !== DEFAULT_FILTERS.toAt
    || Number(filters.limit) !== Number(DEFAULT_FILTERS.limit)
  ), [filters]);

  const hydrateDirectory = useCallback(async (items) => {
    try {
      const ids = Array.from(new Set((items || []).map((item) => item?.id_usuario).filter(Boolean)));
      if (!ids.length) return;

      const pending = ids.filter((idUsuario) => !userDirectory[idUsuario]);
      if (!pending.length) return;

      const collected = {};
      let currentPage = 1;
      const maxPages = 5;

      while (currentPage <= maxPages && pending.some((idUsuario) => !collected[idUsuario])) {
        const response = await listAdminSecurityUsers({
          page: currentPage,
          limit: 100,
          sortBy: 'updated_at',
          sortDir: 'desc',
        });
        const parsed = unwrapCollectionResponse(response);
        (parsed.items || []).forEach((userItem) => {
          if (pending.includes(userItem.id_usuario)) {
            collected[userItem.id_usuario] = {
              label: buildUserDisplayName(userItem),
              rolesLabel: formatRoleLabel(userItem.roles),
            };
          }
        });
        if (currentPage >= Number(parsed.pagination?.total_pages || 1)) break;
        currentPage += 1;
      }

      if (Object.keys(collected).length > 0) {
        setUserDirectory((prev) => ({ ...prev, ...collected }));
      }
    } catch {
      // noop: si falla el enriquecimiento, mantenemos datos resumidos sin romper la pagina.
    }
  }, [userDirectory]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listAdminSecuritySessions({
        page,
        limit: filters.limit,
        estado: filters.estado === 'all' ? '' : filters.estado,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        fromAt: filters.fromAt,
        toAt: filters.toAt,
      });
      const parsed = unwrapCollectionResponse(response);
      setRows(parsed.items);
      setPagination(parsed.pagination);
      void hydrateDirectory(parsed.items);
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
  }, [filters, hydrateDirectory, navigate, page]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  function applyFilters() {
    setPage(1);
    setFilters({
      ...draftFilters,
      limit: Number(draftFilters.limit) || DEFAULT_FILTERS.limit,
    });
  }

  function resetFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  async function confirmRevoke() {
    if (!confirmTarget?.id_sesion || actionLoadingId) return;
    setActionLoadingId(confirmTarget.id_sesion);
    try {
      await revokeAdminSecuritySession(confirmTarget.id_sesion);
      notifications.success('Sesion revocada correctamente.', { dedupeKey: 'security-sessions-revoke-ok' });
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
      if (requestError?.status === 400) {
        notifications.warning('No se puede cerrar tu sesion actual desde este panel.', {
          dedupeKey: 'security-sessions-revoke-self-forbidden',
        });
      } else if (requestError?.status === 404) {
        notifications.info('La sesion seleccionada ya no estaba activa.', {
          dedupeKey: 'security-sessions-revoke-not-found',
        });
      } else {
        notifications.error('No fue posible cerrar la sesion en este momento.', {
          dedupeKey: 'security-sessions-revoke-error',
        });
      }
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
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Sesiones Activas</h1>
            <p className="text-sm text-[var(--mf-text-2)]">
              Control de sesiones con IP parcial y dispositivo resumido.
            </p>
          </div>
          <div className="text-sm text-[var(--mf-text-2)]">
            {loading ? 'Cargando...' : `${pagination.total || 0} registro(s)`}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
          <div>
            <Label className="mf-label">Estado</Label>
            <select
              className="mf-select mt-1"
              value={draftFilters.estado}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, estado: event.target.value }))}
            >
              {SESSION_STATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mf-label">Ordenar por</Label>
            <select
              className="mf-select mt-1"
              value={draftFilters.sortBy}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, sortBy: event.target.value }))}
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
              value={draftFilters.sortDir}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, sortDir: event.target.value }))}
            >
              {DIRECTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mf-label">Desde</Label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={toDatetimeLocal(draftFilters.fromAt)}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, fromAt: event.target.value }))}
            />
          </div>
          <div>
            <Label className="mf-label">Hasta</Label>
            <Input
              type="datetime-local"
              className="mt-1"
              value={toDatetimeLocal(draftFilters.toAt)}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, toAt: event.target.value }))}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Label className="mf-label !mb-0">Tamano de pagina</Label>
            <select
              className="mf-select min-w-[100px]"
              value={String(draftFilters.limit)}
              onChange={(event) => setDraftFilters((prev) => ({ ...prev, limit: Number(event.target.value) }))}
            >
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="gap-2" onClick={applyFilters}>
              <Search size={14} />
              Aplicar filtros
            </Button>
            {hasActiveFilters ? (
              <Button type="button" variant="ghost" className="gap-2" onClick={resetFilters}>
                <RotateCcw size={14} />
                Restablecer
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? <ErrorBanner message={error} onRetry={() => void fetchRows()} /> : null}
      {loading && !error ? <LoadingSpinner label="Consultando sesiones de seguridad..." /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No hay sesiones para los filtros aplicados"
          description="Ajusta estado o rango de fechas para continuar."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Usuario</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Rol</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Estado</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Inicio</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Ultimo uso</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Expira</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">IP</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Dispositivo</TableHead>
                <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Accion</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const userMeta = userDirectory[row.id_usuario] || null;
                return (
                  <TableRow key={row.id_sesion} className="border-[var(--mf-nav-border)]">
                    <TableCell>{userMeta?.label || 'Usuario interno'}</TableCell>
                    <TableCell>{userMeta?.rolesLabel || 'No disponible'}</TableCell>
                    <TableCell><StateBadge value={row.estado} /></TableCell>
                    <TableCell>{formatDateTime(row.inicio_at)}</TableCell>
                    <TableCell>{formatDateTime(row.ultimo_uso_at)}</TableCell>
                    <TableCell>{formatDateTime(row.expira_at)}</TableCell>
                    <TableCell>{normalizeDisplayText(row.ip_ultimo_uso || row.ip_inicio)}</TableCell>
                    <TableCell>{normalizeDisplayText(row.user_agent_hint)}</TableCell>
                    <TableCell className="text-center">
                      {canWrite && row.estado === 'activa' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={actionLoadingId === row.id_sesion}
                          onClick={() => setConfirmTarget(row)}
                        >
                          Cerrar sesion
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--mf-text-2)]">-</span>
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
        tone="warning"
        title="Cerrar sesion activa"
        description="La sesion seleccionada se revocara y dejara de poder acceder a endpoints privados."
        confirmLabel="Cerrar sesion"
        cancelLabel="Cancelar"
        loading={Boolean(actionLoadingId)}
        onConfirm={confirmRevoke}
      />
    </div>
  );
}
