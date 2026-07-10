import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter, RotateCcw, Search, Shield } from 'lucide-react';
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
import SecurityDetailModal from '../components/SecurityDetailModal.jsx';
import SecurityInfoGrid from '../components/SecurityInfoGrid.jsx';
import SecurityResponsiveCard from '../components/SecurityResponsiveCard.jsx';
import {
  getAdminSecurityLoginLogDetail,
  listAdminSecurityLoginLogs,
} from '../lib/adminSeguridadApi.js';

const RESULT_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'success', label: 'Exitoso' },
  { value: 'failed', label: 'Fallido' },
  { value: 'blocked', label: 'Bloqueado' },
  { value: 'session_limit', label: 'Limite de sesion' },
  { value: 'error', label: 'Error controlado' },
];

const PROVIDER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'supabase_password', label: 'Correo y contrasena' },
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'apple', label: 'Apple' },
];

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Fecha' },
  { value: 'resultado', label: 'Resultado' },
  { value: 'provider', label: 'Proveedor' },
];

const DIRECTION_OPTIONS = [
  { value: 'desc', label: 'Descendente' },
  { value: 'asc', label: 'Ascendente' },
];

const DEFAULT_FILTERS = {
  resultado: 'all',
  provider: 'all',
  sortBy: 'created_at',
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

function toDatetimeLocal(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const withOffset = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60000));
  return withOffset.toISOString().slice(0, 16);
}

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString();
}

function normalizeDisplayText(value, fallback = '-') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function formatReasonCode(value) {
  const code = String(value || '').trim().toUpperCase();
  const dictionary = {
    LOGIN_SUCCESS: 'Inicio de sesion correcto',
    LOGIN_INVALID_CREDENTIALS: 'Credenciales invalidas',
    LOGIN_PROVIDER_ERROR: 'Error de proveedor',
    LOGIN_INTERNAL_ERROR: 'Error interno controlado',
    LOGIN_SESSION_LIMIT: 'Limite de sesion',
    LOGIN_RATE_LIMITED: 'Login limitado por demasiados intentos',
    LOGIN_TEMPORARILY_LOCKED: 'Usuario bloqueado temporalmente',
  };
  return dictionary[code] || 'Evento controlado';
}

function formatProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider === 'supabase_password') return 'Correo y contrasena';
  if (provider === 'google') return 'Google';
  if (provider === 'facebook') return 'Facebook';
  if (provider === 'apple') return 'Apple';
  return 'Otro';
}

function ResultBadge({ value }) {
  const normalized = String(value || '').trim().toLowerCase();
  let className = 'mf-badge mf-badge-muted';
  if (normalized === 'success') className = 'mf-badge mf-badge-green';
  if (normalized === 'failed' || normalized === 'error') className = 'mf-badge mf-badge-red';
  if (normalized === 'blocked' || normalized === 'session_limit') className = 'mf-badge mf-badge-gold';
  return <span className={className}>{normalizeDisplayText(normalized, 'desconocido')}</span>;
}

function resolveListErrorMessage(error) {
  const status = Number(error?.status || 0);
  if (status === 400) return 'No se pudieron aplicar los filtros solicitados.';
  return 'No fue posible cargar los logs de seguridad en este momento.';
}

function safeStringify(value) {
  if (!value || typeof value !== 'object') return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export default function AdminSeguridadLoginLogsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: DEFAULT_FILTERS.limit, total: 0, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(DEFAULT_FILTERS);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailData, setDetailData] = useState(null);

  const hasActiveFilters = useMemo(() => (
    filters.resultado !== DEFAULT_FILTERS.resultado
    || filters.provider !== DEFAULT_FILTERS.provider
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
      const response = await listAdminSecurityLoginLogs({
        page,
        limit: filters.limit,
        resultado: filters.resultado === 'all' ? '' : filters.resultado,
        provider: filters.provider === 'all' ? '' : filters.provider,
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

  async function openDetail(idLoginLog) {
    if (!idLoginLog) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError('');
    setDetailData(null);
    try {
      const response = await getAdminSecurityLoginLogDetail(idLoginLog);
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
      setDetailError('No fue posible cargar el detalle del intento.');
    } finally {
      setDetailLoading(false);
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
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Login Logs</h1>
            <p className="text-sm text-[var(--mf-text-2)]">
              Vista resumida en tabla y detalle ampliado en modal seguro.
            </p>
          </div>
          <div className="text-sm text-[var(--mf-text-2)]">
            {loading ? 'Cargando...' : `${pagination.total || 0} registro(s)`}
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
              <Label className="mf-label">Resultado</Label>
              <select
                className="mf-select mt-1"
                value={draftFilters.resultado}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, resultado: event.target.value }))}
              >
                {RESULT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mf-label">Proveedor</Label>
              <select
                className="mf-select mt-1"
                value={draftFilters.provider}
                onChange={(event) => setDraftFilters((prev) => ({ ...prev, provider: event.target.value }))}
              >
                {PROVIDER_OPTIONS.map((option) => (
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
      {loading && !error ? <LoadingSpinner label="Consultando logs de seguridad..." /> : null}

      {!loading && !error && rows.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No hay registros para los filtros aplicados"
          description="Ajusta el rango de fechas o el resultado para ver actividad."
        />
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <>
          <div className="mf-table-wrap hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-[var(--mf-nav-border)]">
                  <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Fecha</TableHead>
                  <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Resultado</TableHead>
                  <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Correo</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] lg:table-cell">IP</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] xl:table-cell">Proveedor</TableHead>
                  <TableHead className="hidden text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] xl:table-cell">Dispositivo</TableHead>
                  <TableHead className="text-center text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Accion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id_login_log} className="border-[var(--mf-nav-border)]">
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell><ResultBadge value={row.resultado} /></TableCell>
                    <TableCell>{normalizeDisplayText(row.email_masked)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{normalizeDisplayText(row.ip)}</TableCell>
                    <TableCell className="hidden xl:table-cell">{formatProvider(row.provider)}</TableCell>
                    <TableCell className="hidden xl:table-cell">{normalizeDisplayText(row.device_summary)}</TableCell>
                    <TableCell className="text-center">
                      <Button type="button" size="sm" variant="outline" onClick={() => void openDetail(row.id_login_log)}>
                        Ver detalle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((row) => (
              <SecurityResponsiveCard
                key={row.id_login_log}
                title={formatDateTime(row.created_at)}
                subtitle={formatReasonCode(row.motivo_codigo)}
                rows={[
                  { key: 'resultado', label: 'Resultado', value: normalizeDisplayText(row.resultado) },
                  { key: 'correo', label: 'Correo', value: normalizeDisplayText(row.email_masked) },
                  { key: 'ip', label: 'IP', value: normalizeDisplayText(row.ip) },
                  { key: 'provider', label: 'Proveedor', value: formatProvider(row.provider) },
                  { key: 'device', label: 'Dispositivo', value: normalizeDisplayText(row.device_summary) },
                ]}
                actions={(
                  <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => void openDetail(row.id_login_log)}>
                    Ver detalle
                  </Button>
                )}
              />
            ))}
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
        title="Detalle de intento de login"
        description="Vista ampliada del registro seleccionado."
      >
        {detailLoading ? <LoadingSpinner label="Cargando detalle..." /> : null}
        {!detailLoading && detailError ? <ErrorBanner message={detailError} /> : null}
        {!detailLoading && !detailError && detailData ? (
          <div className="space-y-4">
            <SecurityInfoGrid
              items={[
                { key: 'fecha', label: 'Fecha', value: formatDateTime(detailData.created_at) },
                { key: 'resultado', label: 'Resultado', value: normalizeDisplayText(detailData.resultado) },
                { key: 'motivo', label: 'Motivo', value: formatReasonCode(detailData.motivo_codigo) },
                { key: 'provider', label: 'Proveedor', value: formatProvider(detailData.provider) },
                { key: 'correo', label: 'Correo', value: normalizeDisplayText(detailData.email || detailData.email_masked) },
                { key: 'idusuario', label: 'ID usuario', value: normalizeDisplayText(detailData.id_usuario) },
                { key: 'ip', label: 'IP', value: normalizeDisplayText(detailData.ip) },
                { key: 'device', label: 'Dispositivo', value: normalizeDisplayText(detailData.device_summary) },
                { key: 'hash', label: 'Identificador hash', value: normalizeDisplayText(detailData.identificador_hash) },
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
    </div>
  );
}
