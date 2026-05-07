import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, RotateCcw, Search, Siren } from 'lucide-react';
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
  getAdminSecurityAlertDetail,
  listAdminSecurityAlerts,
  updateAdminSecurityAlertState,
} from '../lib/adminSeguridadApi.js';
import useSecurityRealtime from '../lib/useSecurityRealtime.js';

const ALERT_STATE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'abierta', label: 'Abierta' },
  { value: 'en_revision', label: 'En revision' },
  { value: 'resuelta', label: 'Resuelta' },
  { value: 'descartada', label: 'Descartada' },
];

const ALERT_SEVERITY_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
  { value: 'critica', label: 'Critica' },
];

const ALERT_TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'muchos_fallos_misma_ip', label: 'Muchos fallos misma IP' },
  { value: 'muchos_fallos_mismo_usuario', label: 'Muchos fallos mismo usuario' },
  { value: 'usuario_bloqueado', label: 'Usuario bloqueado' },
  { value: 'intentos_contra_super_admin', label: 'Intentos contra super admin' },
  { value: 'cliente_intenta_nueva_sesion', label: 'Nueva sesion cliente' },
];

const SORT_OPTIONS = [
  { value: 'detectada_at', label: 'Fecha' },
  { value: 'severidad', label: 'Severidad' },
  { value: 'estado', label: 'Estado' },
];

const DIRECTION_OPTIONS = [
  { value: 'desc', label: 'Descendente' },
  { value: 'asc', label: 'Ascendente' },
];

const DEFAULT_FILTERS = {
  estado: 'all',
  severidad: 'all',
  tipo: 'all',
  sortBy: 'detectada_at',
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

function toDatetimeLocal(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const withOffset = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
  return withOffset.toISOString().slice(0, 16);
}

function formatAlertType(value) {
  const map = {
    muchos_fallos_misma_ip: 'Muchos fallos misma IP',
    muchos_fallos_mismo_usuario: 'Muchos fallos mismo usuario',
    usuario_bloqueado: 'Usuario bloqueado',
    intentos_contra_super_admin: 'Intentos contra super admin',
    cliente_intenta_nueva_sesion: 'Nueva sesion cliente',
  };
  return map[String(value || '').trim()] || 'Alerta de seguridad';
}

function formatImpactLevel(value) {
  const map = {
    usuario: 'Usuario',
    ip: 'IP',
    sistema: 'Sistema',
    sesion: 'Sesion',
  };
  return map[String(value || '').trim().toLowerCase()] || 'Sistema';
}

function SeverityBadge({ value }) {
  const normalized = String(value || '').trim().toLowerCase();
  let className = 'mf-badge mf-badge-muted';
  if (normalized === 'baja') className = 'mf-badge mf-badge-green';
  if (normalized === 'media') className = 'mf-badge mf-badge-gold';
  if (normalized === 'alta' || normalized === 'critica') className = 'mf-badge mf-badge-red';
  return <span className={className}>{normalizeDisplayText(normalized, 'sin severidad')}</span>;
}

function StateBadge({ value }) {
  const normalized = String(value || '').trim().toLowerCase();
  let className = 'mf-badge mf-badge-muted';
  if (normalized === 'abierta') className = 'mf-badge mf-badge-red';
  if (normalized === 'en_revision') className = 'mf-badge mf-badge-gold';
  if (normalized === 'resuelta' || normalized === 'descartada') className = 'mf-badge mf-badge-green';
  return <span className={className}>{normalizeDisplayText(normalized, 'desconocido')}</span>;
}

function resolveListErrorMessage(error) {
  const status = Number(error?.status || 0);
  if (status === 400) return 'No se pudieron aplicar los filtros solicitados.';
  return 'No fue posible cargar las alertas de seguridad.';
}

function resolveActionMessage(error) {
  const status = Number(error?.status || 0);
  if (status === 404) return 'La alerta seleccionada ya no se encuentra disponible.';
  if (status === 400) return 'Debes ingresar un comentario para resolver o descartar.';
  return 'No fue posible actualizar el estado de la alerta.';
}

function safeStringify(value) {
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export default function AdminSeguridadAlertasPage() {
  const navigate = useNavigate();
  const notifications = useNotifications();
  const { roles } = useAuth();
  const realtimeChannels = useMemo(() => ['security.alerts.changed'], []);

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
  const [resolutionComment, setResolutionComment] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailData, setDetailData] = useState(null);

  const hasActiveFilters = useMemo(() => (
    filters.estado !== DEFAULT_FILTERS.estado
    || filters.severidad !== DEFAULT_FILTERS.severidad
    || filters.tipo !== DEFAULT_FILTERS.tipo
    || filters.sortBy !== DEFAULT_FILTERS.sortBy
    || filters.sortDir !== DEFAULT_FILTERS.sortDir
    || filters.fromAt !== DEFAULT_FILTERS.fromAt
    || filters.toAt !== DEFAULT_FILTERS.toAt
    || Number(filters.limit) !== Number(DEFAULT_FILTERS.limit)
  ), [filters]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listAdminSecurityAlerts({
        page,
        limit: filters.limit,
        estado: filters.estado === 'all' ? '' : filters.estado,
        severidad: filters.severidad === 'all' ? '' : filters.severidad,
        tipo: filters.tipo === 'all' ? '' : filters.tipo,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        fromAt: filters.fromAt,
        toAt: filters.toAt,
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
  }, [filters, navigate, page]);

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

  function openConfirmModal(row, nextState) {
    setConfirmTarget({
      id_alerta: row.id_alerta,
      nextState,
      actionLabel: nextState === 'descartada' ? 'Descartar' : 'Resolver',
    });
    setResolutionComment('');
  }

  async function openDetail(idAlerta) {
    if (!idAlerta) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailData(null);
    try {
      const response = await getAdminSecurityAlertDetail(idAlerta);
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
      setDetailError('No fue posible cargar el detalle de la alerta.');
    } finally {
      setDetailLoading(false);
    }
  }

  async function confirmStateUpdate() {
    if (!confirmTarget?.id_alerta || !confirmTarget?.nextState || actionLoadingId) return;
    setActionLoadingId(confirmTarget.id_alerta);
    try {
      await updateAdminSecurityAlertState(
        confirmTarget.id_alerta,
        confirmTarget.nextState,
        resolutionComment
      );
      notifications.success('Estado de alerta actualizado correctamente.', {
        dedupeKey: 'security-alerts-state-updated',
      });
      setConfirmTarget(null);
      setResolutionComment('');
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
        dedupeKey: 'security-alerts-state-update-error',
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
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Alertas</h1>
            <p className="text-sm text-[var(--mf-text-2)]">
              Vista resumida por riesgo y flujo de resolucion con comentario obligatorio.
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
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
            <div>
              <Label className="mf-label">Estado</Label>
              <select
                className="mf-select mt-1"
                value={draftFilters.estado}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, estado: event.target.value }))}
              >
                {ALERT_STATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mf-label">Severidad</Label>
              <select
                className="mf-select mt-1"
                value={draftFilters.severidad}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, severidad: event.target.value }))}
              >
                {ALERT_SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mf-label">Tipo</Label>
              <select
                className="mf-select mt-1"
                value={draftFilters.tipo}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, tipo: event.target.value }))}
              >
                {ALERT_TYPE_OPTIONS.map((option) => (
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
      {loading && !error ? <LoadingSpinner label="Consultando alertas de seguridad..." /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          icon={Siren}
          title="No hay alertas para los filtros aplicados"
          description="Ajusta los criterios para ver la actividad relevante."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <>
          <div className="mf-table-wrap hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--mf-nav-border)]">
                  <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Tipo</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] lg:table-cell">Nivel</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] lg:table-cell">Severidad</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] lg:table-cell">Estado</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] xl:table-cell">Fecha</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] xl:table-cell">Resumen</TableHead>
                  <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const canResolve = canWrite && (row.estado === 'abierta' || row.estado === 'en_revision');
                  return (
                    <TableRow key={row.id_alerta} className="border-[var(--mf-nav-border)]">
                      <TableCell>{formatAlertType(row.tipo)}</TableCell>
                      <TableCell className="hidden lg:table-cell">{formatImpactLevel(row.nivel_afectacion)}</TableCell>
                      <TableCell className="hidden lg:table-cell"><SeverityBadge value={row.severidad} /></TableCell>
                      <TableCell className="hidden lg:table-cell"><StateBadge value={row.estado} /></TableCell>
                      <TableCell className="hidden xl:table-cell">{formatDateTime(row.detectada_at)}</TableCell>
                      <TableCell className="hidden xl:table-cell">{normalizeDisplayText(row.resumen)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => void openDetail(row.id_alerta)}>
                            Ver detalle
                          </Button>
                          {canResolve ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={actionLoadingId === row.id_alerta}
                                onClick={() => openConfirmModal(row, 'resuelta')}
                              >
                                Resolver
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={actionLoadingId === row.id_alerta}
                                onClick={() => openConfirmModal(row, 'descartada')}
                              >
                                Descartar
                              </Button>
                            </>
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
              const canResolve = canWrite && (row.estado === 'abierta' || row.estado === 'en_revision');
              return (
                <SecurityResponsiveCard
                  key={row.id_alerta}
                  title={formatAlertType(row.tipo)}
                  subtitle={formatDateTime(row.detectada_at)}
                  rows={[
                    { key: 'nivel', label: 'Nivel', value: formatImpactLevel(row.nivel_afectacion) },
                    { key: 'severidad', label: 'Severidad', value: normalizeDisplayText(row.severidad) },
                    { key: 'estado', label: 'Estado', value: normalizeDisplayText(row.estado) },
                    { key: 'resumen', label: 'Resumen', value: normalizeDisplayText(row.resumen) },
                  ]}
                  actions={(
                    <div className="grid grid-cols-1 gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void openDetail(row.id_alerta)}>
                        Ver detalle
                      </Button>
                      {canResolve ? (
                        <>
                          <Button type="button" size="sm" variant="outline" onClick={() => openConfirmModal(row, 'resuelta')}>
                            Resolver
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => openConfirmModal(row, 'descartada')}>
                            Descartar
                          </Button>
                        </>
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
        title="Detalle de alerta"
        description="Vista ampliada de la alerta seleccionada."
      >
        {detailLoading ? <LoadingSpinner label="Cargando detalle..." /> : null}
        {!detailLoading && detailError ? <ErrorBanner message={detailError} /> : null}
        {!detailLoading && !detailError && detailData ? (
          <div className="space-y-4">
            <SecurityInfoGrid
              items={[
                { key: 'id', label: 'ID alerta', value: normalizeDisplayText(detailData.id_alerta) },
                { key: 'tipo', label: 'Tipo', value: formatAlertType(detailData.tipo) },
                { key: 'nivel', label: 'Nivel afectado', value: formatImpactLevel(detailData.nivel_afectacion) },
                { key: 'estado', label: 'Estado', value: normalizeDisplayText(detailData.estado) },
                { key: 'severidad', label: 'Severidad', value: normalizeDisplayText(detailData.severidad) },
                { key: 'fecha', label: 'Detectada', value: formatDateTime(detailData.detectada_at) },
                { key: 'usuario', label: 'ID usuario', value: normalizeDisplayText(detailData.id_usuario) },
                { key: 'ip', label: 'IP', value: normalizeDisplayText(detailData.ip) },
                { key: 'resueltaAt', label: 'Resuelta', value: formatDateTime(detailData.resuelta_at) },
                { key: 'resueltaPor', label: 'Resuelta por', value: normalizeDisplayText(detailData.resuelta_por) },
              ]}
            />

            <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-accent)]">Resumen</p>
              <p className="mt-1 break-all text-sm text-[var(--mf-text)]">{normalizeDisplayText(detailData.resumen)}</p>
            </article>

            <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
              <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-accent)]">Comentario de resolucion</p>
              <p className="mt-1 break-all text-sm text-[var(--mf-text)]">{normalizeDisplayText(detailData.comentario_resolucion)}</p>
            </article>

            {detailData.detalle && typeof detailData.detalle === 'object' ? (
              <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-accent)]">Detalle tecnico</p>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs text-[var(--mf-text)]">
                  {safeStringify(detailData.detalle)}
                </pre>
              </article>
            ) : null}
          </div>
        ) : null}
      </SecurityDetailModal>

      <SecurityActionConfirmModal
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open && !actionLoadingId) {
            setConfirmTarget(null);
            setResolutionComment('');
          }
        }}
        title={confirmTarget?.nextState === 'descartada' ? 'Descartar alerta' : 'Resolver alerta'}
        description="Solo se actualizara el estado de la alerta. No se ejecutan acciones automaticas."
        confirmLabel={confirmTarget?.actionLabel || 'Confirmar'}
        cancelLabel="Cancelar"
        loading={Boolean(actionLoadingId)}
        comment={resolutionComment}
        onCommentChange={setResolutionComment}
        requireComment
        onConfirm={confirmStateUpdate}
        tone={confirmTarget?.nextState === 'descartada' ? 'danger' : 'warning'}
        commentLabel="Comentario obligatorio"
        commentPlaceholder="Describe la razon de resolucion o descarte"
      />
    </div>
  );
}
