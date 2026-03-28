import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarRange, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
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

const STATE_LABELS = {
  en_espera: 'En espera',
  pendiente_pago: 'Pendiente de pago',
  confirmada: 'Confirmada',
  en_salon: 'En salón',
  completada: 'Completada',
  cancelada: 'Cancelada',
  expirada: 'Expirada',
  no_show: 'No show',
  anulada: 'Anulada',
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
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
  if (['completada', 'confirmada', 'en_salon'].includes(normalized)) return 'mf-badge mf-badge-green';
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

  const sucursales = Array.isArray(context?.sucursales) ? context.sucursales : [];
  const barberos = Array.isArray(context?.barberos) ? context.barberos : [];
  const estados = Array.isArray(context?.estados) ? context.estados : [];

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
      setContextError(extractMessage(err));
    } finally {
      setContextLoading(false);
    }
  }, [handleAuthError]);

  const fetchHistorial = useCallback(async () => {
    setLoading(true);
    setListError('');
    try {
      const response = await listAdminCitasHistorial(buildFilterParams(filters, search));
      const payload = response?.data ?? response;
      setCitas(Array.isArray(payload?.citas) ? payload.citas : []);
    } catch (err) {
      if (handleAuthError(err)) return;
      setListError(extractMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters, handleAuthError, search]);

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
              <span className="text-sm text-[var(--mf-text-2)]">{loading ? 'Cargando...' : `${citas.length} registro(s)`}</span>
              <ViewToggle defaultView={view} onViewChange={setView} storageKey="agendamiento-historial" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[340px]">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cliente, barbero o ID..." className="pl-9 pr-9" />
                {search.trim() ? (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--mf-text-2)] transition-colors hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)]">
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

      {contextLoading ? <LoadingSpinner /> : null}
      {contextError ? <ErrorBanner message={contextError} onRetry={fetchContext} /> : null}
      {listError ? <ErrorBanner message={listError} onRetry={fetchHistorial} /> : null}
      {loading && !listError ? <LoadingSpinner /> : null}

      {!loading && !listError && citas.length === 0 ? (
        <EmptyState icon={CalendarRange} title="Sin historial para mostrar" description="No hay citas que coincidan con los filtros seleccionados." />
      ) : null}

      {!loading && !listError && citas.length > 0 && view === 'cards' ? (
        <CardsCarousel
          items={citas}
          getItemKey={(cita) => cita?.id_cita}
          renderItem={(cita, index, pageIndex) => (
            <DataCard
              key={cita.id_cita}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<CalendarRange size={16} />}
              title={cita.nombre_cliente || 'Cliente'}
              subtitle={`${cita.nombre_barbero || '-'} · ${formatDateTime(cita.inicio_at)}`}
              badge={<span className={getStateBadgeClass(cita.estado_cita_codigo)}>{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo}</span>}
              fields={[
                { label: 'Sucursal', value: cita.nombre_sucursal || '-' },
                { label: 'Integrante', value: cita.alias_integrante || 'Titular' },
                { label: 'Inicio', value: formatDateTime(cita.inicio_at) },
                { label: 'Monto', value: formatCurrencyHnl(cita.total_pagar_hnl) },
              ]}
            />
          )}
        />
      ) : null}

      {!loading && !listError && citas.length > 0 && view === 'table' ? (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Cliente</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Sucursal</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Barbero</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Inicio</TableHead>
                <TableHead className="text-center text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Estado</TableHead>
                <TableHead className="text-right text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {citas.map((cita) => (
                <TableRow key={cita.id_cita} className="border-[var(--mf-nav-border)]">
                  <TableCell className="font-medium">
                    {cita.nombre_cliente}
                    {cita.alias_integrante ? <p className="text-xs text-[var(--mf-text-2)]">{cita.alias_integrante}</p> : null}
                  </TableCell>
                  <TableCell>{cita.nombre_sucursal || '-'}</TableCell>
                  <TableCell>{cita.nombre_barbero || '-'}</TableCell>
                  <TableCell>{formatDateTime(cita.inicio_at)}</TableCell>
                  <TableCell className="text-center">
                    <span className={getStateBadgeClass(cita.estado_cita_codigo)}>{STATE_LABELS[cita.estado_cita_codigo] || cita.estado_cita_codigo}</span>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrencyHnl(cita.total_pagar_hnl)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Filtros de Historial</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Sucursal</Label>
              <select className="mf-select mt-1" value={filters.idSucursal} onChange={(event) => setFilters((prev) => ({ ...prev, idSucursal: event.target.value }))}>
                <option value="all">Todas</option>
                {sucursales.map((sucursal) => <option key={sucursal.id_sucursal} value={sucursal.id_sucursal}>{sucursal.nombre_sucursal}</option>)}
              </select>
            </div>
            <div>
              <Label className="mf-label">Barbero</Label>
              <select className="mf-select mt-1" value={filters.idBarbero} onChange={(event) => setFilters((prev) => ({ ...prev, idBarbero: event.target.value }))}>
                <option value="all">Todos</option>
                {barberos.map((barbero) => <option key={barbero.id_empleado} value={barbero.id_empleado}>{barbero.nombre_completo}</option>)}
              </select>
            </div>
            <div>
              <Label className="mf-label">Estado</Label>
              <select className="mf-select mt-1" value={filters.estado} onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value }))}>
                <option value="all">Todos</option>
                {estados.map((estado) => <option key={estado.estado_cita_codigo} value={estado.estado_cita_codigo}>{STATE_LABELS[estado.estado_cita_codigo] || estado.descripcion || estado.estado_cita_codigo}</option>)}
              </select>
            </div>
            <div>
              <Label className="mf-label">Desde</Label>
              <Input type="date" className="mf-input mt-1" value={filters.fechaDesde} onChange={(event) => setFilters((prev) => ({ ...prev, fechaDesde: event.target.value }))} />
            </div>
            <div>
              <Label className="mf-label">Hasta</Label>
              <Input type="date" className="mf-input mt-1" value={filters.fechaHasta} onChange={(event) => setFilters((prev) => ({ ...prev, fechaHasta: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearAllFilters}>Limpiar filtros</Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
