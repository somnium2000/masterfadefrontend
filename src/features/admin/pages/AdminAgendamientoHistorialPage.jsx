import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/ui/table.jsx';
import ViewToggle from '../../../components/data/ViewToggle.jsx';
import DataCard from '../../../components/data/DataCard.jsx';
import CardsCarousel from '../../../components/data/CardsCarousel.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { getAdminCitasOperativasContexto, listAdminCitasHistorial } from '../lib/adminCitasApi.js';

const FILTER_DEFAULTS = {
  idSucursal: 'all',
  idBarbero: 'all',
  estado: 'all',
  fechaDesde: '',
  fechaHasta: '',
};
const HISTORIAL_PAGE_SIZE = 9;

const STATE_LABELS = {
  en_espera: 'En espera',
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  en_salon: 'En salón',
  en_atencion: 'En atención',
  completada: 'Completada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  no_show: 'No show',
  anulada: 'Anulada',
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function mapAdminCitasHistoryErrorMessage(err, fallback = 'No fue posible cargar la información de la cita.') {
  const code = String(err?.data?.error?.code || '').trim().toUpperCase();
  if (code === 'BOOKING_NOT_FOUND') return 'La cita solicitada no existe.';
  if (code === 'BOOKING_GROUP_NOT_FOUND') return 'No se encontró la reserva solicitada.';
  if (code === 'BOOKING_DETAIL_LOAD_FAILED') return 'No fue posible cargar el detalle de la cita.';
  if (code === 'BOOKING_RECEIPT_NOT_FOUND') return 'No se encontró comprobante para esta reserva.';
  if (code === 'BOOKING_ADMIN_QUERY_FAILED') return 'No fue posible consultar la información de citas.';
  if (code === 'SLOT_NOT_AVAILABLE') return 'El horario seleccionado ya no está disponible.';
  if (code === 'EMAIL_BELONGS_TO_ACTIVE_USER') return 'El correo ingresado pertenece a una cuenta activa.';
  return extractMessage(err) || fallback;
}

function formatDateTime(isoValue) {
  const parsed = new Date(isoValue || '');
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

function formatCurrencyHnl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'L 0.00';
  return new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL' }).format(amount);
}

function getStateBadgeClass(state) {
  const normalized = String(state || '').toLowerCase();
  if (['completada', 'confirmada', 'en_salon', 'en_atencion'].includes(normalized)) return 'mf-badge mf-badge-green';
  if (['en_espera', 'pendiente_pago'].includes(normalized)) return 'mf-badge mf-badge-gold';
  if (['cancelada', 'expirada', 'no_show', 'anulada'].includes(normalized)) return 'mf-badge mf-badge-red';
  return 'mf-badge mf-badge-muted';
}

function buildFilterParams(filters, search) {
  const params = {};
  if (filters.idSucursal !== 'all') params.id_sucursal = filters.idSucursal;
  if (filters.idBarbero !== 'all') params.id_empleado_barbero = filters.idBarbero;
  if (filters.estado !== 'all') params.estado = filters.estado;
  if (filters.fechaDesde) params.fecha_desde = filters.fechaDesde;
  if (filters.fechaHasta) params.fecha_hasta = filters.fechaHasta;
  if (search.trim()) params.q = search.trim();
  return params;
}

function getSelectionTypeLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'package') return 'Paquete';
  if (normalized === 'mixed') return 'Mixta';
  return 'Servicios';
}

function getAppointmentDisplayInfo(cita) {
  const integrante = cita?.integrante || null;
  const titular = cita?.titular || null;
  const aliasIntegrante = String(
    integrante?.alias_integrante
    || integrante?.nombre_snapshot
    || cita?.alias_integrante
    || ''
  ).trim() || 'Titular';
  const titularNombre = String(
    titular?.nombre_snapshot
    || cita?.nombre_cliente
    || ''
  ).trim() || 'Cliente';
  const paqueteNombre = String(
    cita?.paquete?.nombre_paquete_snapshot
    || cita?.paquete?.nombre_paquete
    || ''
  ).trim() || null;
  const serviciosManual = Array.isArray(cita?.servicios_manual) ? cita.servicios_manual : [];
  const serviciosExtra = Array.isArray(cita?.servicios_extra) ? cita.servicios_extra : [];
  const serviciosIncluidos = Array.isArray(cita?.servicios_incluidos) ? cita.servicios_incluidos : [];
  const promociones = Array.isArray(cita?.promociones) ? cita.promociones : [];
  const comprobante = cita?.comprobante || null;

  return {
    aliasIntegrante,
    titularNombre,
    selectionLabel: getSelectionTypeLabel(cita?.selection_type),
    paqueteNombre,
    serviciosManualCount: serviciosManual.length,
    serviciosExtraCount: serviciosExtra.length,
    serviciosIncluidosCount: serviciosIncluidos.length,
    promocionesCount: promociones.length,
    comprobanteCodigo: comprobante?.codigo_comprobante || null,
  };
}

export default function AdminAgendamientoHistorialPage() {
  const navigate = useNavigate();
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');
  const [context, setContext] = useState({ sucursales: [], barberos: [], estados: [] });

  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [citas, setCitas] = useState([]);
  const [view, setView] = useState(() => {
    try {
      const value = localStorage.getItem('mf-view-agendamiento-historial');
      return value === 'table' || value === 'cards' ? value : 'cards';
    } catch {
      return 'cards';
    }
  });
  const [filters, setFilters] = useState(FILTER_DEFAULTS);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [historialPage, setHistorialPage] = useState(1);
  const [historialPagination, setHistorialPagination] = useState({
    page: 1,
    limit: HISTORIAL_PAGE_SIZE,
    total: 0,
    total_pages: 1,
    has_next: false,
    has_prev: false,
  });
  const [detailDialog, setDetailDialog] = useState({ open: false, cita: null });

  const sucursales = Array.isArray(context?.sucursales) ? context.sucursales : [];
  const barberos = Array.isArray(context?.barberos) ? context.barberos : [];
  const estados = Array.isArray(context?.estados) ? context.estados : [];
  const isInitialPageLoading = contextLoading || (loading && citas.length === 0 && !listError);
  const canRenderHistorialContent = !isInitialPageLoading && !listError;

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== 'all' && value !== '').length + (search.trim() ? 1 : 0),
    [filters, search]
  );

  const handleAuthError = useCallback((err) => {
    if (err?.status === 401) {
      navigate('/login');
      return true;
    }
    if (err?.status === 403) {
      navigate('/unauthorized');
      return true;
    }
    return false;
  }, [navigate]);

  const fetchContext = useCallback(async () => {
    setContextLoading(true);
    setContextError('');
    try {
      const response = await getAdminCitasOperativasContexto();
      const payload = response?.data ?? response;
      setContext({
        sucursales: Array.isArray(payload?.sucursales) ? payload.sucursales : [],
        barberos: Array.isArray(payload?.barberos) ? payload.barberos : [],
        estados: Array.isArray(payload?.estados) ? payload.estados : [],
      });
    } catch (err) {
      if (handleAuthError(err)) return;
      setContextError(mapAdminCitasHistoryErrorMessage(err, 'No fue posible cargar el contexto operativo.'));
    } finally {
      setContextLoading(false);
    }
  }, [handleAuthError]);

  const fetchHistorial = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const response = await listAdminCitasHistorial({
        ...buildFilterParams(filters, search),
        page: historialPage,
        limit: HISTORIAL_PAGE_SIZE,
      });
      const payload = response?.data ?? response;
      const rows = Array.isArray(payload?.citas) ? payload.citas : [];
      rows.sort((left, right) => new Date(right?.inicio_at || '').getTime() - new Date(left?.inicio_at || '').getTime());
      setCitas(rows);
      const pagination = payload?.pagination || null;
      setHistorialPagination({
        page: Number(pagination?.page ?? historialPage),
        limit: Number(pagination?.limit ?? HISTORIAL_PAGE_SIZE),
        total: Number(pagination?.total ?? rows.length),
        total_pages: Math.max(1, Number(pagination?.total_pages ?? 1)),
        has_next: Boolean(pagination?.has_next),
        has_prev: Boolean(pagination?.has_prev),
      });
    } catch (err) {
      if (handleAuthError(err)) return;
      setListError(mapAdminCitasHistoryErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters, handleAuthError, historialPage, search]);

  useEffect(() => {
    void fetchContext();
  }, [fetchContext]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchHistorial();
    }, 260);
    return () => clearTimeout(timer);
  }, [fetchHistorial]);

  function clearAllFilters() {
    setSearch('');
    setFilters(FILTER_DEFAULTS);
    setHistorialPage(1);
  }

  function handlePageChange(nextPage) {
    if (!Number.isFinite(nextPage)) return;
    const safe = Math.max(1, Math.min(nextPage, historialPagination.total_pages || 1));
    setHistorialPage(safe);
  }

  function updateSearch(value) {
    setSearch(value);
    setHistorialPage(1);
  }

  function updateFilters(patch) {
    setFilters((prev) => ({ ...prev, ...patch }));
    setHistorialPage(1);
  }

  function getServiciosResumen(cita) {
    const detalles = Array.isArray(cita?.servicios_detalle) ? cita.servicios_detalle : [];
    const nombres = detalles
      .map((item) => String(item?.nombre_servicio || item?.nombre_servicio_snapshot || '').trim())
      .filter(Boolean);
    return nombres.length ? nombres.join(' · ') : 'Sin servicios registrados';
  }

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Agendamiento - Historial</p>
            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Historial</h1>
            <p className="text-sm text-[var(--mf-text-2)]">Consulta completa de citas por sucursal, estado, fecha y barbero.</p>
          </div>
          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[620px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-[var(--mf-text-2)]">{loading ? 'Cargando...' : `${historialPagination.total} registro(s)`}</span>
              <ViewToggle defaultView={view} onViewChange={setView} storageKey="agendamiento-historial" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[340px]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                <Input value={search} onChange={(event) => updateSearch(event.target.value)} placeholder="Buscar por cliente, barbero o ID..." className="pl-9 pr-9" />
                {search.trim() ? (
                  <button type="button" onClick={() => updateSearch('')} className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--mf-text-2)] transition-colors hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)]">
                    <X size={12} />
                  </button>
                ) : null}
              </div>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={15} />
                Filtros
                {activeFilterCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-xs text-[var(--mf-accent-text)]">{activeFilterCount}</span> : null}
              </Button>
              {activeFilterCount > 0 ? (
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={clearAllFilters}>
                  <RotateCcw size={13} />
                  Limpiar
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {isInitialPageLoading ? <LoadingSpinner /> : null}
      {contextError ? <ErrorBanner message={contextError} onRetry={fetchContext} /> : null}
      {listError ? <ErrorBanner message={listError} onRetry={fetchHistorial} /> : null}

      {canRenderHistorialContent && citas.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Sin historial para mostrar" description="No hay citas que coincidan con los filtros seleccionados." />
      ) : null}

      {canRenderHistorialContent && citas.length > 0 && view === 'cards' ? (
        <CardsCarousel
          items={citas}
          getItemKey={(cita) => cita?.id_cita}
          renderItem={(cita, index, pageIndex) => (
            (() => {
              const viewInfo = getAppointmentDisplayInfo(cita);
              return (
                <DataCard
                  key={cita.id_cita}
                  animationDelay={(pageIndex * 0.02) + (index * 0.05)}
                  avatar={<CalendarRange size={16} />}
                  title={viewInfo.titularNombre}
                  subtitle={`${cita.nombre_barbero || 'Sin registrar'} · ${formatDateTime(cita.inicio_at)}`}
                  badge={<span className={getStateBadgeClass(cita.estado_cita_codigo)}>{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo}</span>}
                  fields={[
                    { label: 'Sucursal', value: cita.nombre_sucursal || 'Sin registrar' },
                    { label: 'Integrante', value: viewInfo.aliasIntegrante },
                    { label: 'Inicio', value: formatDateTime(cita.inicio_at) },
                    { label: 'Monto', value: formatCurrencyHnl(cita.total_pagar_hnl) },
                  ]}
                  actions={<Button size="sm" variant="outline" onClick={() => setDetailDialog({ open: true, cita })}>Ver detalle</Button>}
                />
              );
            })()
          )}
        />
      ) : null}

      {canRenderHistorialContent && citas.length > 0 && view === 'table' ? (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Cliente</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Sucursal</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Inicio</TableHead>
                <TableHead className="text-center text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Estado</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Monto</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {citas.map((cita) => (
                (() => {
                  const viewInfo = getAppointmentDisplayInfo(cita);
                  return (
                    <TableRow key={cita.id_cita} className="border-[var(--mf-nav-border)]">
                      <TableCell className="font-medium">
                        {viewInfo.titularNombre}
                        <p className="text-xs text-[var(--mf-text-2)]">{viewInfo.aliasIntegrante}</p>
                        <p className="text-xs text-[var(--mf-text-2)]">{cita.nombre_barbero || 'Sin registrar'}</p>
                      </TableCell>
                      <TableCell>{cita.nombre_sucursal || '-'}</TableCell>
                      <TableCell>
                        {formatDateTime(cita.inicio_at)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={getStateBadgeClass(cita.estado_cita_codigo)}>{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo}</span>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrencyHnl(cita.total_pagar_hnl)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setDetailDialog({ open: true, cita })}>Ver detalle</Button>
                      </TableCell>
                    </TableRow>
                  );
                })()
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {!loading && !listError && historialPagination.total_pages > 1 ? (
        <div className="flex items-center justify-center gap-2 overflow-x-auto pb-1">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={!historialPagination.has_prev}
            onClick={() => handlePageChange(historialPage - 1)}
          >
            Anterior
          </Button>
          {Array.from({ length: historialPagination.total_pages }, (_, idx) => idx + 1)
            .filter((page) => page === 1 || page === historialPagination.total_pages || Math.abs(page - historialPage) <= 1)
            .map((page, idx, arr) => (
              <div key={`hist-page-${page}`} className="flex items-center gap-2">
                {idx > 0 && page - arr[idx - 1] > 1 ? <span className="text-xs text-[var(--mf-text-2)]">...</span> : null}
                <button
                  type="button"
                  onClick={() => handlePageChange(page)}
                  className={`h-9 min-w-9 rounded-full px-3 text-sm font-semibold ${
                    page === historialPage
                      ? 'bg-[var(--mf-accent)] text-[var(--mf-accent-text)]'
                      : 'border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)]'
                  }`}
                >
                  {page}
                </button>
              </div>
            ))}
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={!historialPagination.has_next}
            onClick={() => handlePageChange(historialPage + 1)}
          >
            Siguiente
          </Button>
        </div>
      ) : null}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Historial</DialogTitle>
            <DialogDescription>Refina el historial por sucursal, barbero, estado y rango de fechas.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Sucursal</Label>
              <select className="mf-select mt-1" value={filters.idSucursal} onChange={(event) => updateFilters({ idSucursal: event.target.value })}>
                <option value="all">Todas</option>
                {sucursales.map((sucursal) => <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre_sucursal}</option>)}
              </select>
            </div>
            <div>
              <Label className="mf-label">Barbero</Label>
              <select className="mf-select mt-1" value={filters.idBarbero} onChange={(event) => updateFilters({ idBarbero: event.target.value })}>
                <option value="all">Todos</option>
                {barberos.map((barbero) => <option key={barbero.id_empleado} value={barbero.id_empleado}>{barbero.nombre_completo}</option>)}
              </select>
            </div>
            <div>
              <Label className="mf-label">Estado</Label>
              <select className="mf-select mt-1" value={filters.estado} onChange={(event) => updateFilters({ estado: event.target.value })}>
                <option value="all">Todos</option>
                {estados.map((estado) => <option key={estado.estado_cita_codigo} value={estado.estado_cita_codigo}>{STATE_LABELS[estado.estado_cita_codigo] || estado.descripcion || estado.estado_cita_codigo}</option>)}
              </select>
            </div>
            <div>
              <Label className="mf-label">Desde</Label>
              <Input type="date" className="mf-input mt-1" value={filters.fechaDesde} onChange={(event) => updateFilters({ fechaDesde: event.target.value })} />
            </div>
            <div>
              <Label className="mf-label">Hasta</Label>
              <Input type="date" className="mf-input mt-1" value={filters.fechaHasta} onChange={(event) => updateFilters({ fechaHasta: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearAllFilters}>Limpiar filtros</Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailDialog.open} onOpenChange={(open) => setDetailDialog((prev) => ({ ...prev, open, cita: open ? prev.cita : null }))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ver detalle</DialogTitle>
            <DialogDescription>Información completa de la cita seleccionada.</DialogDescription>
          </DialogHeader>
          {detailDialog.cita ? (
            <div className="grid grid-cols-1 gap-2 text-sm text-[var(--mf-text-2)] sm:grid-cols-2">
              <p>Titular: <span className="text-[var(--mf-text)]">{getAppointmentDisplayInfo(detailDialog.cita).titularNombre}</span></p>
              <p>Integrante: <span className="text-[var(--mf-text)]">{getAppointmentDisplayInfo(detailDialog.cita).aliasIntegrante}</span></p>
              {detailDialog.cita?.telefono_cliente ? <p>Teléfono: <span className="text-[var(--mf-text)]">{detailDialog.cita.telefono_cliente}</span></p> : null}
              {detailDialog.cita?.correo_cliente ? <p>Correo: <span className="text-[var(--mf-text)]">{detailDialog.cita.correo_cliente}</span></p> : null}
              <p>Sucursal: <span className="text-[var(--mf-text)]">{detailDialog.cita?.nombre_sucursal || 'Sin registrar'}</span></p>
              <p>Barbero: <span className="text-[var(--mf-text)]">{detailDialog.cita?.nombre_barbero || 'Sin registrar'}</span></p>
              <p>Fecha y hora: <span className="text-[var(--mf-text)]">{formatDateTime(detailDialog.cita?.inicio_at)}</span></p>
              <p>Estado: <span className="text-[var(--mf-text)]">{STATE_LABELS[detailDialog.cita?.estado_cita_codigo] || detailDialog.cita?.estado_cita_codigo || 'Sin registrar'}</span></p>
              <p className="sm:col-span-2">Servicios: <span className="text-[var(--mf-text)]">{getServiciosResumen(detailDialog.cita)}</span></p>
              {getAppointmentDisplayInfo(detailDialog.cita).paqueteNombre ? <p className="sm:col-span-2">Paquete: <span className="text-[var(--mf-text)]">{getAppointmentDisplayInfo(detailDialog.cita).paqueteNombre}</span></p> : null}
              {getAppointmentDisplayInfo(detailDialog.cita).promocionesCount > 0 ? <p>Promociones: <span className="text-[var(--mf-text)]">{getAppointmentDisplayInfo(detailDialog.cita).promocionesCount}</span></p> : null}
              <p>Monto: <span className="text-[var(--mf-text)]">{formatCurrencyHnl(detailDialog.cita?.total_pagar_hnl)}</span></p>
              {getAppointmentDisplayInfo(detailDialog.cita).comprobanteCodigo ? <p className="sm:col-span-2">Comprobante: <span className="text-[var(--mf-text)]">{getAppointmentDisplayInfo(detailDialog.cita).comprobanteCodigo}</span></p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialog({ open: false, cita: null })}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

