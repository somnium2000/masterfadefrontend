import { useMemo, useState } from 'react';
import { BarChart3, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Table2 } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu.jsx';

const PAGE_SIZE = 8;

function toUtcDate(rawDate) {
  const [year, month, day] = String(rawDate || '').split('-').map((chunk) => Number(chunk));
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return '-';
  const year = dateValue.getUTCFullYear();
  const month = `${dateValue.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${dateValue.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// JK: Agrupacion client-side para reutilizar la misma data existente sin tocar endpoints.
function aggregateRowsByGrouping(rows, grouping) {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (grouping === 'diario') {
    return safeRows
      .map((row) => {
        const parsedDate = toUtcDate(row?.fecha);
        return {
          periodKey: row?.fecha || '-',
          periodLabel: row?.fecha || '-',
          periodOrder: parsedDate?.getTime?.() || 0,
          ingresos_servicios_hnl: Number(row?.ingresos_servicios_hnl || 0),
          ingresos_membresias_hnl: Number(row?.ingresos_membresias_hnl || 0),
          ingresos_totales_hnl: Number(row?.ingresos_totales_hnl || 0),
        };
      })
      .sort((left, right) => left.periodOrder - right.periodOrder);
  }

  const grouped = new Map();
  safeRows.forEach((row) => {
    const parsedDate = toUtcDate(row?.fecha);
    if (!parsedDate) return;

    let periodKey = '';
    let periodLabel = '';
    let periodOrder = parsedDate.getTime();

    if (grouping === 'semanal') {
      const weekStart = new Date(parsedDate);
      const dayOfWeek = weekStart.getUTCDay();
      const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      weekStart.setUTCDate(weekStart.getUTCDate() + offset);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
      periodKey = `${formatUtcDate(weekStart)}|${formatUtcDate(weekEnd)}`;
      periodLabel = `${formatUtcDate(weekStart)} a ${formatUtcDate(weekEnd)}`;
      periodOrder = weekStart.getTime();
    } else {
      const year = parsedDate.getUTCFullYear();
      const month = `${parsedDate.getUTCMonth() + 1}`.padStart(2, '0');
      periodKey = `${year}-${month}`;
      periodLabel = `${year}-${month}`;
      periodOrder = Date.UTC(year, parsedDate.getUTCMonth(), 1);
    }

    const current = grouped.get(periodKey) || {
      periodKey,
      periodLabel,
      periodOrder,
      ingresos_servicios_hnl: 0,
      ingresos_membresias_hnl: 0,
      ingresos_totales_hnl: 0,
    };

    current.ingresos_servicios_hnl += Number(row?.ingresos_servicios_hnl || 0);
    current.ingresos_membresias_hnl += Number(row?.ingresos_membresias_hnl || 0);
    current.ingresos_totales_hnl += Number(row?.ingresos_totales_hnl || 0);

    grouped.set(periodKey, current);
  });

  return Array.from(grouped.values()).sort((left, right) => left.periodOrder - right.periodOrder);
}

function chartValueToWidth(value, maxValue) {
  if (!maxValue || maxValue <= 0) return 6;
  return Math.max(6, (value / maxValue) * 100);
}

function ChartCard({ title, subtitle, rows, valueKey, labelKey, formatValue, limit = 8 }) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, limit) : [];
  const maxValue = Math.max(1, ...safeRows.map((row) => Number(row?.[valueKey] || 0)));

  return (
    <article className="mf-premium-card p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-accent)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--mf-text-2)]">{subtitle}</p>

      {safeRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          Sin datos para el rango seleccionado.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {safeRows.map((row) => {
            const rawValue = Number(row?.[valueKey] || 0);
            const width = chartValueToWidth(rawValue, maxValue);
            return (
              <div key={`${title}-${row?.[labelKey] || 'item'}`}>
                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-[var(--mf-text)]">{row?.[labelKey] || '-'}</span>
                  <span className="font-semibold text-[var(--mf-accent)]">{formatValue(rawValue)}</span>
                </div>
                <div className="h-2 rounded-full bg-[var(--mf-btn-bg)]">
                  <div className="h-2 rounded-full bg-[var(--mf-accent)]" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function SortableHeader({ label, sortKey, activeSort, onSortChange }) {
  const isActive = activeSort.key === sortKey;
  const arrow = isActive ? (activeSort.direction === 'asc' ? '↑' : '↓') : '';

  return (
    <button
      type="button"
      onClick={() => onSortChange(sortKey)}
      className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.1em] text-[var(--mf-accent)]"
    >
      {label}
      <span className="text-[10px]">{arrow}</span>
    </button>
  );
}

function KpiWidget({ title, value, subtitle, onExport }) {
  return (
    <article className="mf-premium-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">{title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8">
              <ChevronDown size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs">Exportar widget</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExport('pdf')}>
              <Download size={14} /> Exportar PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('excel')}>
              <Download size={14} /> Exportar Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onExport('csv')}>
              <Download size={14} /> Exportar CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-3 text-2xl font-semibold text-[var(--mf-text)]">{value}</p>
      <p className="mt-2 text-xs text-[var(--mf-text-2)]">{subtitle}</p>
    </article>
  );
}

// JK: Dashboard de ingresos totalmente desacoplado de backend y reutilizable.
export default function ReportesIngresosDashboard({
  filters,
  onFilterChange,
  grouping,
  onGroupingChange,
  viewMode,
  onViewModeChange,
  onApplyFilters,
  loadingDashboard,
  ventas,
  kpis,
  formatMoney,
  onWidgetExport,
}) {
  const [sortState, setSortState] = useState({ key: 'periodOrder', direction: 'desc' });
  const [page, setPage] = useState(1);

  const groupedByPeriod = useMemo(
    () => aggregateRowsByGrouping(ventas?.ingresos_por_fecha || [], grouping),
    [grouping, ventas?.ingresos_por_fecha]
  );

  const sortedTableRows = useMemo(() => {
    const rows = [...groupedByPeriod];
    const multiplier = sortState.direction === 'asc' ? 1 : -1;
    return rows.sort((left, right) => {
      if (sortState.key === 'periodLabel') {
        return left.periodLabel.localeCompare(right.periodLabel, 'es') * multiplier;
      }
      const leftValue = Number(left?.[sortState.key] || 0);
      const rightValue = Number(right?.[sortState.key] || 0);
      return (leftValue - rightValue) * multiplier;
    });
  }, [groupedByPeriod, sortState]);

  const totalPages = Math.max(1, Math.ceil(sortedTableRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(
    () => sortedTableRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [safePage, sortedTableRows]
  );

  const ingresosServicios = Number(kpis?.ingresos_servicios_hnl || 0);
  const ingresosMembresias = Number(kpis?.ingresos_membresias_hnl || 0);
  const ingresosTotales = ingresosServicios + ingresosMembresias;

  const ingresosPorSucursal = useMemo(
    () => (Array.isArray(ventas?.ingresos_por_sucursal)
      ? ventas.ingresos_por_sucursal.reduce((acc, row) => acc + Number(row?.ingresos_hnl || 0), 0)
      : 0),
    [ventas]
  );

  const ingresosPorBarbero = useMemo(
    () => (Array.isArray(ventas?.ingresos_por_barbero)
      ? ventas.ingresos_por_barbero.reduce((acc, row) => acc + Number(row?.ingresos_hnl || 0), 0)
      : 0),
    [ventas]
  );

  const widgetList = [
    {
      key: 'ingresos_totales',
      title: 'Ingresos totales',
      value: formatMoney(ingresosTotales),
      subtitle: 'Suma consolidada de servicios + membresias.',
      exportType: 'resumen',
    },
    {
      key: 'ingresos_servicios',
      title: 'Ingresos por servicios',
      value: formatMoney(ingresosServicios),
      subtitle: 'Ingresos provenientes de citas pagadas.',
      exportType: 'ingresos_servicio',
    },
    {
      key: 'ingresos_membresias',
      title: 'Ingresos por membresias',
      value: formatMoney(ingresosMembresias),
      subtitle: 'Ingresos generados por planes activos.',
      exportType: 'membresias_planes',
    },
    {
      key: 'ingresos_sucursal',
      title: 'Ingresos por sucursal',
      value: formatMoney(ingresosPorSucursal),
      subtitle: 'Acumulado del ranking por sucursales.',
      exportType: 'ingresos_sucursal',
    },
    {
      key: 'ingresos_barbero',
      title: 'Ingresos por barbero',
      value: formatMoney(ingresosPorBarbero),
      subtitle: 'Acumulado del ranking por barberos.',
      exportType: 'ingresos_barbero',
    },
    {
      key: 'cantidad_citas',
      title: 'Cantidad de citas',
      value: Number(kpis?.total_citas || 0).toLocaleString('es-HN'),
      subtitle: 'Citas registradas en el periodo filtrado.',
      exportType: 'ingresos_fecha',
    },
  ];

  function handleSortChange(key) {
    setSortState((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  }

  return (
    <div className="space-y-4">
      {/* JK: Seccion 1 - filtros y controles de vista. */}
      <section className="mf-premium-card p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm text-[var(--mf-text-2)]">
          <CalendarDays size={15} />
          <span>Filtros</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label className="mf-label">Fecha desde</Label>
            <Input
              type="date"
              className="mf-input mt-1"
              value={filters.fecha_desde}
              onChange={(event) => onFilterChange('fecha_desde', event.target.value)}
            />
          </div>
          <div>
            <Label className="mf-label">Fecha hasta</Label>
            <Input
              type="date"
              className="mf-input mt-1"
              value={filters.fecha_hasta}
              onChange={(event) => onFilterChange('fecha_hasta', event.target.value)}
            />
          </div>
          <div>
            <Label className="mf-label">Agrupacion</Label>
            <select
              className="mf-select mt-1"
              value={grouping}
              onChange={(event) => onGroupingChange(event.target.value)}
            >
              <option value="diario">Diario</option>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button className="w-full gap-2" onClick={() => void onApplyFilters()} disabled={loadingDashboard}>
              <Filter size={15} />
              Aplicar filtros
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onViewModeChange('charts')}
            className={`gap-2 ${viewMode === 'charts' ? 'border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)]' : ''}`}
          >
            <BarChart3 size={14} />
            Ver Graficos
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onViewModeChange('table')}
            className={`gap-2 ${viewMode === 'table' ? 'border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)]' : ''}`}
          >
            <Table2 size={14} />
            Ver Tabla
          </Button>
        </div>
      </section>

      {/* JK: Seccion 2 - widgets KPI de ingresos con menu de exportacion por tarjeta. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {widgetList.map((widget) => (
          <KpiWidget
            key={widget.key}
            title={widget.title}
            value={widget.value}
            subtitle={widget.subtitle}
            onExport={(format) => onWidgetExport(widget.exportType, format)}
          />
        ))}
      </section>

      {/* JK: Seccion 3 - visualizacion dinamica entre graficos o tabla. */}
      <section className="space-y-4">
        {viewMode === 'charts' ? (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard
              title="Ingresos por fecha"
              subtitle={`Agrupacion: ${grouping}`}
              rows={groupedByPeriod}
              valueKey="ingresos_totales_hnl"
              labelKey="periodLabel"
              formatValue={formatMoney}
              limit={12}
            />
            <ChartCard
              title="Ingresos por servicios"
              subtitle="Top servicios en el periodo."
              rows={ventas?.ingresos_por_servicio || []}
              valueKey="ingresos_hnl"
              labelKey="nombre_servicio"
              formatValue={formatMoney}
              limit={10}
            />
            <ChartCard
              title="Ingresos por barbero"
              subtitle="Ranking de productividad por ingresos."
              rows={ventas?.ingresos_por_barbero || []}
              valueKey="ingresos_hnl"
              labelKey="nombre_barbero"
              formatValue={formatMoney}
              limit={10}
            />
            <ChartCard
              title="Ingresos por sucursal"
              subtitle="Comparativo de sucursales en alcance."
              rows={ventas?.ingresos_por_sucursal || []}
              valueKey="ingresos_hnl"
              labelKey="nombre_sucursal"
              formatValue={formatMoney}
              limit={10}
            />
          </div>
        ) : (
          <article className="mf-premium-card p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-accent)]">Tabla de ingresos</p>
              <p className="text-xs text-[var(--mf-text-2)]">
                Pagina {safePage} de {totalPages}
              </p>
            </div>

            <div className="mt-4 mf-table-wrap">
              <Table>
                <TableHeader>
                  <TableRow className="border-[var(--mf-nav-border)]">
                    <TableHead>
                      <SortableHeader label="Periodo" sortKey="periodOrder" activeSort={sortState} onSortChange={handleSortChange} />
                    </TableHead>
                    <TableHead>
                      <SortableHeader label="Servicios" sortKey="ingresos_servicios_hnl" activeSort={sortState} onSortChange={handleSortChange} />
                    </TableHead>
                    <TableHead>
                      <SortableHeader label="Membresias" sortKey="ingresos_membresias_hnl" activeSort={sortState} onSortChange={handleSortChange} />
                    </TableHead>
                    <TableHead>
                      <SortableHeader label="Total" sortKey="ingresos_totales_hnl" activeSort={sortState} onSortChange={handleSortChange} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedRows.length === 0 ? (
                    <TableRow className="border-[var(--mf-nav-border)]">
                      <TableCell colSpan={4} className="text-sm text-[var(--mf-text-2)]">
                        Sin datos para el rango seleccionado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((row) => (
                      <TableRow key={row.periodKey} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_55%,transparent)]">
                        <TableCell className="text-sm text-[var(--mf-text)]">{row.periodLabel}</TableCell>
                        <TableCell className="text-sm text-[var(--mf-text)]">{formatMoney(row.ingresos_servicios_hnl)}</TableCell>
                        <TableCell className="text-sm text-[var(--mf-text)]">{formatMoney(row.ingresos_membresias_hnl)}</TableCell>
                        <TableCell className="text-sm font-semibold text-[var(--mf-accent)]">{formatMoney(row.ingresos_totales_hnl)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage <= 1}
              >
                <ChevronLeft size={13} />
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage >= totalPages}
              >
                Siguiente
                <ChevronRight size={13} />
              </Button>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
