import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, RotateCcw, Search, ShieldCheck } from 'lucide-react';
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
import SecurityActionConfirmModal from '../components/SecurityActionConfirmModal.jsx';
import SecurityDetailModal from '../components/SecurityDetailModal.jsx';
import SecurityInfoGrid from '../components/SecurityInfoGrid.jsx';
import SecurityResponsiveCard from '../components/SecurityResponsiveCard.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  getAdminSecuritySessionDetail,
  listAdminSecuritySessions,
  listAdminSecurityUsers,
  revokeAdminSecuritySession,
} from '../lib/adminSeguridadApi.js';
import useSecurityRealtime from '../lib/useSecurityRealtime.js';

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

function unwrapSingleResponse(response) {
  const payload = response?.data && typeof response.data === 'object'
    ? response.data
    : (response || {});
  return payload || {};
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

function safeStringify(value) {
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export default function AdminSeguridadSesionesPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { roles } = useAuth();
  const realtimeChannels = useMemo(() => ['security.sessions.changed'], []);

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
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [userDirectory, setUserDirectory] = useState({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailData, setDetailData] = useState(null);

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
      // noop
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

  const realtime = useSecurityRealtime({
    enabled: true,
    channels: realtimeChannels,
    signalDebounceMs: 500,
    maxReconnectAttempts: 5,
    onSignal: () => {
      void fetchRows();
    },
  });

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  function applyFilters() {
    setPage(1);
    setFilters({
      ...draftFilters,
      limit: Number(draftFilters.limit) || DEFAULT_FILTERS.limit,
    });
    setShowMobileFilters(false);
  }

  function resetFilters() {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  async function openDetail(idSesion) {
    if (!idSesion) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailData(null);
    try {
      const response = await getAdminSecuritySessionDetail(idSesion);
      setDetailData(unwrapSingleResponse(response));
    } catch (requestError) {
      if (requestError?.status === 401) {
        navigate('/login', { replace: true });
        return;
      }
      if (requestError?.status === 403) {
        navigate('/unauthorized', { replace: true });
        return;
      }
      setDetailError('No fue posible cargar el detalle de la sesion.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function confirmRevoke() {
    if (!confirmTarget?.id_sesion || actionLoadingId) return;
    setActionLoadingId(confirmTarget.id_sesion);
    try {
      await revokeAdminSecuritySession(confirmTarget.id_sesion);
      notifications.success('Sesion cerrada correctamente.', { dedupeKey: 'security-sessions-revoke-ok' });
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
        notifications.warning('No se permite cerrar tu propia sesion desde este endpoint.', {
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
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Sesiones</h1>
            <p className="text-sm text-[var(--mf-text-2)]">
              Listado resumido con detalle ampliado y cierre de sesion confirmado.
            </p>
            <p className="text-xs text-[var(--mf-text-2)]">
              {realtime.freshnessLabel}
              {' | '}
              {realtime.isUnavailable ? 'Realtime no disponible' : (realtime.isConnected ? 'En vivo' : 'Reconectando...')}
            </p>
          </div>
          <div className="text-sm text-[var(--mf-text-2)]">
            {loading ? 'Cargando...' : `${pagination.total || 0} registro(s) | ${realtime.signalCount} evento(s)`}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2 md:hidden">
          <Button type="button" variant="outline" className="gap-2" onClick={() => setShowMobileFilters((prev) => !prev)}>
            <Filter size={14} />
            Filtros
          </Button>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" className="gap-2" onClick={resetFilters}>
              <RotateCcw size={14} />
              Restablecer
            </Button>
          ) : null}
        </div>

        <div className={`${showMobileFilters ? 'block' : 'hidden'} space-y-3 md:block`}>
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
                <Button type="button" variant="ghost" className="hidden gap-2 md:inline-flex" onClick={resetFilters}>
                  <RotateCcw size={14} />
                  Restablecer
                </Button>
              ) : null}
            </div>
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
        <>
          <div className="mf-table-wrap hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--mf-nav-border)]">
                  <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Usuario</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] lg:table-cell">Estado</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] lg:table-cell">Ultimo uso</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] xl:table-cell">IP</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] xl:table-cell">Dispositivo</TableHead>
                  <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const userMeta = userDirectory[row.id_usuario] || null;
                  const isCurrentSession = row.is_current_session === true;
                  const canClose = canWrite && row.estado === 'activa' && !isCurrentSession;
                  return (
                    <TableRow key={row.id_sesion} className="border-[var(--mf-nav-border)]">
                      <TableCell>{userMeta?.label || 'Usuario interno'}</TableCell>
                      <TableCell className="hidden lg:table-cell"><StateBadge value={row.estado} /></TableCell>
                      <TableCell className="hidden lg:table-cell">{formatDateTime(row.ultimo_uso_at)}</TableCell>
                      <TableCell className="hidden xl:table-cell">{normalizeDisplayText(row.ip_ultimo_uso || row.ip_inicio)}</TableCell>
                      <TableCell className="hidden xl:table-cell">{normalizeDisplayText(row.device_summary)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => void openDetail(row.id_sesion)}>
                            Ver detalle
                          </Button>
                          {canClose ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={actionLoadingId === row.id_sesion}
                              onClick={() => setConfirmTarget(row)}
                            >
                              Cerrar sesion
                            </Button>
                          ) : isCurrentSession ? (
                            <Button type="button" size="sm" variant="outline" disabled>
                              Sesion actual
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((row) => {
              const userMeta = userDirectory[row.id_usuario] || null;
              const isCurrentSession = row.is_current_session === true;
              const canClose = canWrite && row.estado === 'activa' && !isCurrentSession;
              return (
                <SecurityResponsiveCard
                  key={row.id_sesion}
                  title={userMeta?.label || 'Usuario interno'}
                  subtitle={formatDateTime(row.ultimo_uso_at)}
                  rows={[
                    { key: 'estado', label: 'Estado', value: normalizeDisplayText(row.estado) },
                    { key: 'expira', label: 'Expira', value: formatDateTime(row.expira_at) },
                    { key: 'ip', label: 'IP', value: normalizeDisplayText(row.ip_ultimo_uso || row.ip_inicio) },
                    { key: 'device', label: 'Dispositivo', value: normalizeDisplayText(row.device_summary) },
                  ]}
                  actions={(
                    <div className="grid grid-cols-1 gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void openDetail(row.id_sesion)}>
                        Ver detalle
                      </Button>
                      {canClose ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={actionLoadingId === row.id_sesion}
                          onClick={() => setConfirmTarget(row)}
                        >
                          Cerrar sesion
                        </Button>
                      ) : isCurrentSession ? (
                        <Button type="button" size="sm" variant="outline" disabled>
                          Sesion actual
                        </Button>
                      ) : null}
                    </div>
                  )}
                />
              );
            })}
          </div>
        </>
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

      <SecurityDetailModal
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) {
            setDetailData(null);
            setDetailError('');
            setDetailLoading(false);
          }
        }}
        title="Detalle de sesion"
        description="Informacion ampliada de la sesion seleccionada."
      >
        {detailLoading ? <LoadingSpinner label="Cargando detalle..." /> : null}
        {!detailLoading && detailError ? <ErrorBanner message={detailError} /> : null}
        {!detailLoading && !detailError && detailData ? (
          <div className="space-y-4">
            <SecurityInfoGrid
              items={[
                { key: 'id', label: 'ID sesion', value: normalizeDisplayText(detailData.id_sesion) },
                { key: 'estado', label: 'Estado', value: normalizeDisplayText(detailData.estado) },
                { key: 'inicio', label: 'Inicio', value: formatDateTime(detailData.inicio_at) },
                { key: 'ultimo', label: 'Ultimo uso', value: formatDateTime(detailData.ultimo_uso_at) },
                { key: 'expira', label: 'Expira', value: formatDateTime(detailData.expira_at) },
                { key: 'cierre', label: 'Cierre', value: formatDateTime(detailData.cierre_at) },
                { key: 'motivo', label: 'Motivo cierre', value: normalizeDisplayText(detailData.motivo_cierre) },
                { key: 'correo', label: 'Correo', value: normalizeDisplayText(detailData?.usuario?.email) },
                { key: 'ipInicio', label: 'IP inicio', value: normalizeDisplayText(detailData.ip_inicio) },
                { key: 'ipUltimo', label: 'IP ultimo uso', value: normalizeDisplayText(detailData.ip_ultimo_uso) },
                { key: 'device', label: 'Dispositivo', value: normalizeDisplayText(detailData.device_summary) },
                { key: 'request', label: 'Request ID', value: normalizeDisplayText(detailData.request_id) },
              ]}
            />

            <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-accent)]">User-Agent</p>
              <p className="mt-1 break-all text-sm text-[var(--mf-text)]">{normalizeDisplayText(detailData.user_agent)}</p>
            </article>

            {detailData.metadata && typeof detailData.metadata === 'object' ? (
              <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-accent)]">Metadata</p>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-[var(--mf-text)]">
                  {safeStringify(detailData.metadata)}
                </pre>
              </article>
            ) : null}
          </div>
        ) : null}
      </SecurityDetailModal>

      <SecurityActionConfirmModal
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open && !actionLoadingId) setConfirmTarget(null);
        }}
        title="Cerrar sesion activa"
        description="Se revocara la sesion seleccionada. Esta accion requiere confirmacion."
        confirmLabel="Cerrar sesion"
        cancelLabel="Cancelar"
        loading={Boolean(actionLoadingId)}
        requireComment={false}
        showCommentInput={false}
        onConfirm={confirmRevoke}
        tone="warning"
      />
    </div>
  );
}
