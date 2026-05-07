import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Filter,
  Loader2,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/ui/dialog.jsx';
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
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ReportesCustomReportModal from '../components/ReportesCustomReportModal.jsx';
import {
  getAdminReportesContext,
  getAdminReportesDashboard,
} from '../lib/adminReportesApi.js';

// JK: Metadatos de UI para tabs/submodulos de reportes en navegacion unificada.
const REPORT_MODULE_META = {
  ingresos: {
    label: 'Ingresos',
    description: 'Seguimiento de ingresos por fecha, servicio, barbero y sucursal con foco operativo.',
  },
  membresias: {
    label: 'Membresías',
    description: 'Analitica de planes, suscripciones activas y participacion comercial de membresias.',
  },
  barberos: {
    label: 'Barberos',
    description: 'Productividad por barbero, ingresos generados y rendimiento por servicios.',
  },
  concurrencia: {
    label: 'Concurrencia',
    description: 'Citas diarias, horas con mayor concurrencia y dia mas concurrido del mes.',
  },
  sucursales: {
    label: 'Sucursales',
    description: 'Comparativo de rentabilidad e impacto operativo por sucursal.',
  },
};

const PAGE_SIZE = 8;
const MODULES_WITH_HEADER_ACTIONS_LAYOUT = new Set(['ingresos', 'membresias', 'barberos', 'concurrencia', 'sucursales']);
const INCOME_CHART_WINDOW_OPTIONS = [7, 30];
const CONCURRENCY_DEFAULT_DAYS = 7;
const CONCURRENCY_FETCH_BATCH_SIZE = 10;
const DEFERRED_MODULE_FETCH_DELAY_MS = 180;
const DEFAULT_INCOME_CHART_WINDOWS = {
  chart_ingresos_fecha: 7,
  chart_ingresos_servicio: 7,
  chart_membresias_adquiridas: 7,
};

function extractMessage(err) {
  return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function formatMoney(value) {
  const amount = toNumber(value, 0);
  return `L ${amount.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// JK: Formato numerico de ingresos sin simbolo monetario para etiquetas dentro de barras.
function formatMoneyNumberOnly(value) {
  const amount = toNumber(value, 0);
  return amount.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInteger(value) {
  return toInt(value, 0).toLocaleString('es-HN');
}

// JK: Etiqueta corta MM/DD para ejes de series temporales.
function formatShortDateLabel(rawDate) {
  const parsed = toUtcDate(rawDate);
  if (!parsed) return '-';
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${month}/${day}`;
}

// JK: Convierte hora 24h (0-23) a formato visual amigable de 12 horas.
function formatHourLabel(hour) {
  const safeHour = Math.max(0, Math.min(23, toInt(hour, 0)));
  const period = safeHour >= 12 ? 'PM' : 'AM';
  const hour12 = safeHour % 12 === 0 ? 12 : safeHour % 12;
  return `${String(hour12).padStart(2, '0')}:00 ${period}`;
}

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

// JK: Formatea fecha local (no UTC) para evitar desfase de un dia en la UI de reportes.
function formatLocalDate(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) return '-';
  const year = dateValue.getFullYear();
  const month = `${dateValue.getMonth() + 1}`.padStart(2, '0');
  const day = `${dateValue.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// JK: Construye serie de fechas YYYY-MM-DD (inclusive) para consultas diarias.
function buildDateKeysBetween(fechaDesde, fechaHasta) {
  const start = toUtcDate(fechaDesde);
  const end = toUtcDate(fechaHasta);
  if (!start || !end || start > end) return [];

  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    keys.push(formatUtcDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

// JK: Rango del mes actual (desde el dia 1 hasta hoy) para calculos independientes.
function buildCurrentMonthDateRange() {
  const todayLocal = formatLocalDate(new Date());
  const [year, month] = String(todayLocal).split('-');
  if (!year || !month) {
    return {
      fecha_desde: '',
      fecha_hasta: '',
    };
  }
  const monthStart = `${year}-${month}-01`;
  return {
    fecha_desde: monthStart,
    fecha_hasta: todayLocal,
  };
}

// JK: Construye rango relativo en fecha local para snapshots independientes de filtros globales.
function buildUtcDateRange(totalDays) {
  const safeTotalDays = Math.max(1, toInt(totalDays, 7));
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (safeTotalDays - 1));
  return {
    fecha_desde: formatLocalDate(startDate),
    fecha_hasta: formatLocalDate(endDate),
    endDate,
  };
}

// JK: Agrupacion client-side para reutilizar la data existente sin cambiar backend.
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
          ingresos_servicios_hnl: toNumber(row?.ingresos_servicios_hnl || 0),
          ingresos_membresias_hnl: toNumber(row?.ingresos_membresias_hnl || 0),
          ingresos_totales_hnl: toNumber(row?.ingresos_totales_hnl || 0),
          pagos_servicios: toInt(row?.pagos_servicios || 0),
          cobros_membresia: toInt(row?.cobros_membresia || 0),
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
      pagos_servicios: 0,
      cobros_membresia: 0,
    };

    current.ingresos_servicios_hnl += toNumber(row?.ingresos_servicios_hnl || 0);
    current.ingresos_membresias_hnl += toNumber(row?.ingresos_membresias_hnl || 0);
    current.ingresos_totales_hnl += toNumber(row?.ingresos_totales_hnl || 0);
    current.pagos_servicios += toInt(row?.pagos_servicios || 0);
    current.cobros_membresia += toInt(row?.cobros_membresia || 0);

    grouped.set(periodKey, current);
  });

  return Array.from(grouped.values()).sort((left, right) => left.periodOrder - right.periodOrder);
}

function chartValueToWidth(value, maxValue) {
  const safeValue = toNumber(value, 0);
  if (safeValue <= 0) return 0;
  if (!maxValue || maxValue <= 0) return 0;
  return Math.max(6, (safeValue / maxValue) * 100);
}

// JK: Construye serie diaria de N dias para tendencias de ingresos/membresias.
function buildDailyTrendRows(rows, endDate, totalDays) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeTotalDays = Math.max(1, toInt(totalDays, 7));
  const rowsByDate = new Map();

  safeRows.forEach((row) => {
    const dateKey = String(row?.fecha || '');
    if (!dateKey) return;
    const parsedDate = toUtcDate(dateKey);
    rowsByDate.set(dateKey, {
      periodKey: dateKey,
      periodLabel: dateKey,
      periodOrder: parsedDate?.getTime?.() || 0,
      ingresos_servicios_hnl: toNumber(row?.ingresos_servicios_hnl || 0),
      ingresos_membresias_hnl: toNumber(row?.ingresos_membresias_hnl || 0),
      ingresos_totales_hnl: toNumber(row?.ingresos_totales_hnl || 0),
      pagos_servicios: toInt(row?.pagos_servicios || 0),
      cobros_membresia: toInt(row?.cobros_membresia || 0),
    });
  });

  const safeEndDate = endDate instanceof Date && !Number.isNaN(endDate.getTime())
    ? endDate
    : new Date();
  const normalizedEndDate = new Date(Date.UTC(
    safeEndDate.getUTCFullYear(),
    safeEndDate.getUTCMonth(),
    safeEndDate.getUTCDate()
  ));

  return Array.from({ length: safeTotalDays }, (_, index) => {
    const day = new Date(normalizedEndDate);
    day.setUTCDate(normalizedEndDate.getUTCDate() - ((safeTotalDays - 1) - index));
    const dayKey = formatUtcDate(day);
    return rowsByDate.get(dayKey) || {
      periodKey: dayKey,
      periodLabel: dayKey,
      periodOrder: day.getTime(),
      ingresos_servicios_hnl: 0,
      ingresos_membresias_hnl: 0,
      ingresos_totales_hnl: 0,
      pagos_servicios: 0,
      cobros_membresia: 0,
    };
  });
}
// JK: Widget KPI reutilizable para todos los submodulos.
function KpiWidget({ title, value, subtitle }) {
  return (
    <article className="mf-premium-card p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">{title}</p>
      <p className="mt-3 text-2xl font-semibold text-[var(--mf-text)]">{value}</p>
      <p className="mt-2 text-xs text-[var(--mf-text-2)]">{subtitle}</p>
    </article>
  );
}

// JK: Switch de rango por grafico (7/30 dias) con alcance local por tarjeta.
function ChartWindowSwitch({ selectedDays = 7, onChangeDays }) {
  if (typeof onChangeDays !== 'function') return null;
  return (
    <div className="inline-flex items-center rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-0.5">
      {INCOME_CHART_WINDOW_OPTIONS.map((days) => {
        const isActive = selectedDays === days;
        return (
          <button
            key={days}
            type="button"
            onClick={() => onChangeDays(days)}
            className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
              isActive
                ? 'bg-[var(--mf-accent)] text-[var(--mf-accent-text)]'
                : 'text-[var(--mf-text-2)] hover:text-[var(--mf-text)]'
            }`}
          >
            {days} días
          </button>
        );
      })}
    </div>
  );
}

// JK: Tarjeta de visualizacion tipo barras para ranking/series.
function ChartCard({
  title,
  subtitle,
  rows,
  valueKey,
  labelKey,
  formatValue,
  limit = 10,
  primaryValue = '',
  primaryValueLabel = 'Total del período',
  chartWindowDays = 7,
  onChartWindowChange,
  independentHint = '',
  loading = false,
  emptyMessage = 'Sin datos para el rango seleccionado.',
  showValueInsideBar = false,
  insideValueFormatter = formatValue,
}) {
  const safeRows = Array.isArray(rows) ? rows.slice(0, limit) : [];
  const maxValue = Math.max(1, ...safeRows.map((row) => toNumber(row?.[valueKey] || 0)));

  return (
    <article className="mf-premium-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-accent)]">{title}</p>
        <ChartWindowSwitch selectedDays={chartWindowDays} onChangeDays={onChartWindowChange} />
      </div>
      <p className="mt-1 text-sm text-[var(--mf-text-2)]">{subtitle}</p>
      {independentHint ? (
        <p className="mt-2 inline-flex rounded-md border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2 py-1 text-[11px] font-medium text-[var(--mf-text-2)]">
          {independentHint}
        </p>
      ) : null}
      {primaryValue ? (
        <div className="mt-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">{primaryValueLabel}</p>
          <p className="mt-1 text-xl font-semibold text-[var(--mf-text)]">{primaryValue}</p>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          <Loader2 size={14} className="animate-spin" />
          Cargando datos independientes...
        </div>
      ) : safeRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          {emptyMessage}
        </div>
      ) : (
        <div className={`mt-4 ${showValueInsideBar ? 'overflow-auto' : ''}`}>
          <div className={`${showValueInsideBar ? 'min-w-[780px] space-y-3' : 'space-y-3'}`}>
            {safeRows.map((row, index) => {
              const rawValue = toNumber(row?.[valueKey] || 0);
              const width = chartValueToWidth(rawValue, maxValue);
              const rowLabel = String(row?.[labelKey] || '-');
              if (showValueInsideBar) {
                return (
                  <div key={`${title}-${rowLabel}-${index}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="truncate text-[var(--mf-text)]">{rowLabel}</span>
                    </div>
                    <div className="h-8 rounded-md bg-[var(--mf-btn-bg)]">
                      <div
                        className="flex h-8 items-center justify-end rounded-md bg-[var(--mf-accent)] px-2 text-xs font-semibold text-[var(--mf-accent-text)]"
                        style={{ width: `${width}%`, minWidth: rawValue > 0 ? '86px' : '42px' }}
                      >
                        {insideValueFormatter(rawValue)}
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div key={`${title}-${rowLabel}-${index}`}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="truncate text-[var(--mf-text)]">{rowLabel}</span>
                    <span className="font-semibold text-[var(--mf-accent)]">{formatValue(rawValue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--mf-btn-bg)]">
                    <div className="h-2 rounded-full bg-[var(--mf-accent)]" style={{ width: `${width}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

// JK: Grafico de barras verticales para tendencias diarias (7/30 dias) independientes de filtros.
function DailyTrendChartCard({
  title,
  subtitle,
  rows,
  formatValue,
  valueKey,
  chartWindowDays = 7,
  onChartWindowChange,
  independentHint = '',
  loading = false,
  emptyMessage = 'Sin datos para el rango seleccionado.',
  valueFormatterInsideBar = formatValue,
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const maxValue = Math.max(1, ...safeRows.map((row) => toNumber(row?.[valueKey] || 0)));
  const isThirtyDaysView = chartWindowDays === 30;

  function toShortDateLabel(rawDate) {
    const parsed = toUtcDate(rawDate);
    if (!parsed) return '-';
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    return `${month}/${day}`;
  }

  return (
    <article className="mf-premium-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-accent)]">{title}</p>
        <ChartWindowSwitch selectedDays={chartWindowDays} onChangeDays={onChartWindowChange} />
      </div>
      <p className="mt-1 text-sm text-[var(--mf-text-2)]">{subtitle}</p>
      {independentHint ? (
        <p className="mt-2 inline-flex rounded-md border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2 py-1 text-[11px] font-medium text-[var(--mf-text-2)]">
          {independentHint}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          <Loader2 size={14} className="animate-spin" />
          Cargando datos independientes...
        </div>
      ) : safeRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          {emptyMessage}
        </div>
      ) : isThirtyDaysView ? (
        <div className="mt-4 max-h-[380px] overflow-auto">
          <div className="min-w-[860px] space-y-2 pr-2">
            {safeRows.map((row) => {
              const value = toNumber(row?.[valueKey] || 0);
              const width = chartValueToWidth(value, maxValue);
              return (
                <div key={row?.periodKey || row?.periodLabel} className="grid grid-cols-[64px_1fr] items-center gap-2">
                  <span className="text-[11px] text-[var(--mf-text-2)]">{toShortDateLabel(row?.periodLabel)}</span>
                  <div className="h-8 rounded-md bg-[color:color-mix(in_srgb,var(--mf-nav-border)_35%,transparent)]">
                    <div
                      className="flex h-8 items-center justify-end rounded-md bg-[var(--mf-accent)] px-2 text-xs font-semibold text-[var(--mf-accent-text)]"
                      style={{ width: `${width}%`, minWidth: value > 0 ? '88px' : '42px' }}
                      title={`${row?.periodLabel || '-'}: ${valueFormatterInsideBar(value)}`}
                    >
                      {valueFormatterInsideBar(value)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div
            className="grid h-[220px] min-w-[680px] items-end gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2 py-3"
            style={{ gridTemplateColumns: `repeat(${safeRows.length}, minmax(0, 1fr))` }}
          >
            {safeRows.map((row) => {
              const value = toNumber(row?.[valueKey] || 0);
              const heightPercent = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 8 : 4) : 4;
              return (
                <div key={row?.periodKey || row?.periodLabel} className="flex h-full flex-col items-center justify-end gap-2">
                  <span className="text-[10px] font-semibold text-[var(--mf-accent)]">{formatValue(value)}</span>
                  <div className="flex h-[150px] w-full items-end justify-center rounded-md bg-[color:color-mix(in_srgb,var(--mf-nav-border)_40%,transparent)] px-1">
                    <div
                      className="w-full rounded-sm bg-[var(--mf-accent)]"
                      style={{ height: `${heightPercent}%` }}
                      title={`${row?.periodLabel || '-'}: ${formatValue(value)}`}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--mf-text-2)]">{toShortDateLabel(row?.periodLabel)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
}

// JK: Tarjeta de tendencia diaria en linea para concurrencia (citas por fecha).
function LineTrendChartCard({
  title,
  subtitle,
  rows,
  valueKey,
  labelKey,
  formatValue,
  independentHint = '',
  loading = false,
  emptyMessage = 'Sin datos para el rango seleccionado.',
}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeValues = safeRows.map((row) => Math.max(0, toNumber(row?.[valueKey] || 0)));
  const maxValue = Math.max(1, ...safeValues);
  const svgWidth = Math.max(760, safeRows.length * 58);
  const svgHeight = 260;
  const chartPadding = { top: 20, right: 18, bottom: 46, left: 42 };
  const chartWidth = Math.max(1, svgWidth - chartPadding.left - chartPadding.right);
  const chartHeight = Math.max(1, svgHeight - chartPadding.top - chartPadding.bottom);
  const horizontalStep = safeRows.length > 1 ? chartWidth / (safeRows.length - 1) : 0;

  const points = safeRows.map((row, index) => {
    const value = Math.max(0, toNumber(row?.[valueKey] || 0));
    const x = chartPadding.left + (horizontalStep * index);
    const y = chartPadding.top + (chartHeight - ((value / maxValue) * chartHeight));
    return {
      x,
      y,
      value,
      label: String(row?.[labelKey] || '-'),
      shortLabel: formatShortDateLabel(row?.[labelKey]),
    };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  const tickValues = [1, 0.75, 0.5, 0.25, 0];
  const xLabelInterval = safeRows.length > 8 ? Math.ceil(safeRows.length / 8) : 1;

  return (
    <article className="mf-premium-card p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-accent)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--mf-text-2)]">{subtitle}</p>
      {independentHint ? (
        <p className="mt-2 inline-flex rounded-md border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2 py-1 text-[11px] font-medium text-[var(--mf-text-2)]">
          {independentHint}
        </p>
      ) : null}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          <Loader2 size={14} className="animate-spin" />
          Cargando serie diaria...
        </div>
      ) : safeRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[760px]">
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="h-[260px] w-full" role="img" aria-label={title}>
              {tickValues.map((ratio, index) => {
                const y = chartPadding.top + (chartHeight - (chartHeight * ratio));
                const value = maxValue * ratio;
                return (
                  <g key={`${title}-line-grid-${ratio}-${index}`}>
                    <line
                      x1={chartPadding.left}
                      y1={y}
                      x2={svgWidth - chartPadding.right}
                      y2={y}
                      stroke="color-mix(in srgb, var(--mf-nav-border) 55%, transparent)"
                      strokeWidth="1"
                    />
                    <text
                      x={chartPadding.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-[var(--mf-text-2)] text-[10px]"
                    >
                      {formatInteger(value)}
                    </text>
                  </g>
                );
              })}

              <path
                d={linePath}
                fill="none"
                stroke="var(--mf-accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {points.map((point, index) => (
                <g key={`${title}-line-point-${point.label}-${index}`}>
                  <circle cx={point.x} cy={point.y} r="3.5" fill="var(--mf-accent)" />
                  <text
                    x={point.x}
                    y={point.y - 8}
                    textAnchor="middle"
                    className="fill-[var(--mf-accent)] text-[10px] font-semibold"
                  >
                    {formatInteger(point.value)}
                  </text>
                  {index % xLabelInterval === 0 || index === points.length - 1 ? (
                    <text
                      x={point.x}
                      y={svgHeight - 12}
                      textAnchor="middle"
                      className="fill-[var(--mf-text-2)] text-[10px]"
                    >
                      {point.shortLabel}
                    </text>
                  ) : null}
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}
      {safeRows.length > 0 ? (
        <p className="mt-3 text-xs text-[var(--mf-text-2)]">
          Total del período: {formatValue(safeValues.reduce((acc, value) => acc + value, 0))}
        </p>
      ) : null}
    </article>
  );
}

// JK: Card de insight puntual para métricas destacadas no comparativas.
function InsightMetricCard({
  title,
  subtitle,
  value = 'Sin datos',
  valueLabel = '',
  secondaryValue = '',
  secondaryLabel = '',
  independentHint = '',
  loading = false,
  hasData = false,
  emptyMessage = 'Sin datos',
}) {
  return (
    <article className="mf-premium-card p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-accent)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--mf-text-2)]">{subtitle}</p>
      {independentHint ? (
        <p className="mt-2 inline-flex rounded-md border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2 py-1 text-[11px] font-medium text-[var(--mf-text-2)]">
          {independentHint}
        </p>
      ) : null}
      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          <Loader2 size={14} className="animate-spin" />
          Calculando métrica independiente...
        </div>
      ) : !hasData ? (
        <div className="mt-4 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3 text-xs text-[var(--mf-text-2)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3">
          {valueLabel ? (
            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">{valueLabel}</p>
          ) : null}
          <p className="mt-1 text-2xl font-semibold text-[var(--mf-text)]">{value}</p>
          {secondaryValue ? (
            <p className="mt-2 text-sm text-[var(--mf-text-2)]">
              {secondaryLabel ? `${secondaryLabel}: ` : ''}
              <span className="font-semibold text-[var(--mf-text)]">{secondaryValue}</span>
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

// JK: Tabla reusable para todos los submodulos con paginacion client-side.
function DataTableSection({ title, columns, rows }) {
  const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(safeRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = useMemo(
    () => safeRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [safePage, safeRows]
  );

  return (
    <article className="mf-premium-card p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-accent)]">{title}</p>
        <p className="text-xs text-[var(--mf-text-2)]">
          Pagina {safePage} de {totalPages}
        </p>
      </div>

      <div className="mt-4 mf-table-wrap">
        <Table>
          <TableHeader>
            <TableRow className="border-[var(--mf-nav-border)]">
              {columns.map((column) => (
                <TableHead key={column.key} className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-accent)]">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.length === 0 ? (
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableCell colSpan={columns.length} className="text-sm text-[var(--mf-text-2)]">
                  Sin datos para el rango seleccionado.
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((row, index) => (
                <TableRow
                  key={`${title}:${safePage}:${index}`}
                  className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_55%,transparent)]"
                >
                  {columns.map((column) => (
                    <TableCell key={`${title}:${index}:${column.key}`} className="text-sm text-[var(--mf-text)]">
                      {column.render ? column.render(row?.[column.key], row) : String(row?.[column.key] ?? '-')}
                    </TableCell>
                  ))}
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
  );
}

// JK: Contenedor principal reutilizable para /reportes/* basado en tabs del header.
export default function AdminReportesSubmodulePage({ moduleType = 'ingresos' }) {
  const notifications = useNotifications();

  // JK: Normaliza submodulo para evitar estados invalidos.
  const resolvedModuleType = REPORT_MODULE_META[moduleType] ? moduleType : 'ingresos';
  const moduleMeta = REPORT_MODULE_META[resolvedModuleType];

  const [contexto, setContexto] = useState({ sucursales: [], barberos: [], rango_default: null });
  const [snapshot, setSnapshot] = useState(null);
  const [loadingContexto, setLoadingContexto] = useState(false);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [customReportOpen, setCustomReportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [filters, setFilters] = useState({
    fecha_desde: '',
    fecha_hasta: '',
    id_sucursal: '',
    id_barbero: '',
    commission_rate: '',
  });
  // JK: Estado temporal del modal de filtros para permitir rango no inicializado al abrir.
  const [modalFilters, setModalFilters] = useState(null);

  const [grouping, setGrouping] = useState('diario');
  // JK: Estado independiente por grafico de Ingresos para alternar 7/30 dias sin afectar KPIs.
  const [incomeChartWindows, setIncomeChartWindows] = useState(DEFAULT_INCOME_CHART_WINDOWS);
  // JK: Snapshots dedicados para graficos de Ingresos sin filtros globales.
  const [independentIncomeCharts, setIndependentIncomeCharts] = useState({
    loading: false,
    error: '',
    snapshotsByDays: { 7: null, 30: null },
    rangesByDays: { 7: null, 30: null },
  });
  // JK: Snapshot independiente para vista default del submodulo Barberos (últimos 7 días).
  const [independentBarbersOverview, setIndependentBarbersOverview] = useState({
    loading: false,
    error: '',
    dayKeys: [],
    snapshotsByDate: {},
  });
  // JK: Serie diaria filtrada para "Citas generadas por día" en Concurrencia.
  const [filteredConcurrencyDaily, setFilteredConcurrencyDaily] = useState({
    loading: false,
    error: '',
    rows: [],
  });
  // JK: KPI independiente del mes actual para "Día más concurrente del mes".
  const [independentConcurrencyPeakDay, setIndependentConcurrencyPeakDay] = useState({
    loading: false,
    error: '',
    topDay: null,
  });
  const [canClearKpiFilters, setCanClearKpiFilters] = useState(false);
  // JK: Evita relanzar cargas independientes en el mismo montaje del submodulo.
  const independentFetchStartedRef = useRef({
    ingresos: false,
    barberos: false,
    concurrenciaPeak: false,
  });
  const viewMode = 'charts';

  // JK: Replica el header de Ingresos en los submodulos solicitados para unificar UX.
  const useHeaderActionsLayout = MODULES_WITH_HEADER_ACTIONS_LAYOUT.has(resolvedModuleType);
  // JK: La agrupacion diaria/semanal/mensual aplica solo al submodulo de Ingresos.
  const supportsGrouping = resolvedModuleType === 'ingresos';
  const showBarberoFilter = resolvedModuleType === 'barberos';

  // JK: Diferir llamadas secundarias para priorizar el primer render del dashboard principal.
  const scheduleDeferredModuleFetch = useCallback((task) => {
    if (typeof task !== 'function') return () => {};
    const timerId = setTimeout(() => {
      void task();
    }, DEFERRED_MODULE_FETCH_DELAY_MS);
    return () => clearTimeout(timerId);
  }, []);

  // JK: Cada grafico de Ingresos conserva su propia ventana temporal local (7/30 dias).
  const handleIncomeChartWindowChange = useCallback((chartKey, days) => {
    const safeDays = days === 30 ? 30 : 7;
    setIncomeChartWindows((current) => {
      if (current[chartKey] === safeDays) return current;
      return { ...current, [chartKey]: safeDays };
    });
  }, []);

  // JK: Restablece configuracion local de graficos al entrar al submodulo de Ingresos.
  useEffect(() => {
    if (resolvedModuleType !== 'ingresos') return;
    setIncomeChartWindows(DEFAULT_INCOME_CHART_WINDOWS);
  }, [resolvedModuleType]);

  // JK: Carga data de graficos de Ingresos sin filtros globales para cumplir independencia visual.
  const fetchIndependentIncomeCharts = useCallback(async () => {
    if (resolvedModuleType !== 'ingresos') return;

    const range7 = buildUtcDateRange(7);
    const range30 = buildUtcDateRange(30);

    setIndependentIncomeCharts((current) => ({
      ...current,
      loading: true,
      error: '',
      rangesByDays: { 7: range7, 30: range30 },
    }));

    try {
      const [snapshot7Response, snapshot30Response] = await Promise.all([
        getAdminReportesDashboard({
          fecha_desde: range7.fecha_desde,
          fecha_hasta: range7.fecha_hasta,
        }),
        getAdminReportesDashboard({
          fecha_desde: range30.fecha_desde,
          fecha_hasta: range30.fecha_hasta,
        }),
      ]);

      setIndependentIncomeCharts({
        loading: false,
        error: '',
        snapshotsByDays: {
          7: snapshot7Response?.data || null,
          30: snapshot30Response?.data || null,
        },
        rangesByDays: { 7: range7, 30: range30 },
      });
    } catch (error) {
      setIndependentIncomeCharts((current) => ({
        ...current,
        loading: false,
        error: extractMessage(error),
      }));
    }
  }, [resolvedModuleType]);

  // JK: Carga 7 snapshots diarios (sin filtros) para la vista general de Barberos.
  const fetchIndependentBarbersOverview = useCallback(async () => {
    if (resolvedModuleType !== 'barberos') return;

    const range7 = buildUtcDateRange(7);
    const dayKeys = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(range7.endDate);
      day.setDate(range7.endDate.getDate() - ((7 - 1) - index));
      return formatLocalDate(day);
    });

    setIndependentBarbersOverview({
      loading: true,
      error: '',
      dayKeys,
      snapshotsByDate: {},
    });

    try {
      const responses = await Promise.all(
        dayKeys.map((dayKey) => getAdminReportesDashboard({ fecha_desde: dayKey, fecha_hasta: dayKey }))
      );

      const snapshotsByDate = {};
      dayKeys.forEach((dayKey, index) => {
        snapshotsByDate[dayKey] = responses[index]?.data || null;
      });

      setIndependentBarbersOverview({
        loading: false,
        error: '',
        dayKeys,
        snapshotsByDate,
      });
    } catch (error) {
      setIndependentBarbersOverview({
        loading: false,
        error: extractMessage(error),
        dayKeys,
        snapshotsByDate: {},
      });
    }
  }, [resolvedModuleType]);

  useEffect(() => {
    if (!supportsGrouping) setGrouping('diario');
  }, [supportsGrouping]);

  // JK: Al ingresar a cada submodulo el boton Limpiar Filtros inicia deshabilitado.
  useEffect(() => {
    setCanClearKpiFilters(false);
  }, [resolvedModuleType]);

  // JK: Reinicia estado local de concurrencia cuando se abandona el submodulo.
  useEffect(() => {
    if (resolvedModuleType === 'concurrencia') return;
    independentFetchStartedRef.current.concurrenciaPeak = false;
    setFilteredConcurrencyDaily({
      loading: false,
      error: '',
      rows: [],
    });
    setIndependentConcurrencyPeakDay({
      loading: false,
      error: '',
      topDay: null,
    });
  }, [resolvedModuleType]);

  // JK: El filtro de barbero solo aplica en el submodulo Barberos.
  useEffect(() => {
    if (showBarberoFilter) return;
    setFilters((current) => (current.id_barbero ? { ...current, id_barbero: '' } : current));
  }, [showBarberoFilter]);

  const loadContexto = useCallback(async () => {
    setLoadingContexto(true);
    setLoadError('');
    try {
      const response = await getAdminReportesContext();
      const payload = response?.data || {};
      // JK: Membresias y Concurrencia operan por defecto en ventana corta de 7 dias.
      const shortDefaultRange = buildUtcDateRange(CONCURRENCY_DEFAULT_DAYS);
      const defaultDateRange = (resolvedModuleType === 'membresias' || resolvedModuleType === 'concurrencia')
        ? {
          fechaDesde: shortDefaultRange.fecha_desde,
          fechaHasta: shortDefaultRange.fecha_hasta,
        }
        : (payload?.rango_default || null);
      setContexto({
        sucursales: Array.isArray(payload?.sucursales) ? payload.sucursales : [],
        barberos: Array.isArray(payload?.barberos) ? payload.barberos : [],
        rango_default: defaultDateRange,
      });

      setFilters((current) => ({
        ...current,
        fecha_desde: current.fecha_desde || defaultDateRange?.fechaDesde || '',
        fecha_hasta: current.fecha_hasta || defaultDateRange?.fechaHasta || '',
        id_sucursal:
          current.id_sucursal ||
          (Array.isArray(payload?.sucursales) && payload.sucursales.length === 1 ? payload.sucursales[0].id_sucursal : ''),
      }));
    } catch (error) {
      setLoadError(extractMessage(error));
    } finally {
      setLoadingContexto(false);
    }
  }, [resolvedModuleType]);

  // JK: Estado base de filtros por submodulo para restaurar KPIs con Limpiar Filtros.
  const getDefaultKpiFilters = useCallback(() => ({
    fecha_desde: contexto?.rango_default?.fechaDesde || '',
    fecha_hasta: contexto?.rango_default?.fechaHasta || '',
    id_sucursal:
      Array.isArray(contexto?.sucursales) && contexto.sucursales.length === 1
        ? contexto.sucursales[0].id_sucursal
        : '',
    id_barbero: '',
    commission_rate: '',
  }), [contexto?.rango_default?.fechaDesde, contexto?.rango_default?.fechaHasta, contexto?.sucursales]);

  // JK: Evalua si existen filtros aplicados que alteran KPIs respecto al estado base.
  const hasAppliedKpiFilterChanges = useCallback((candidateFilters) => {
    const defaults = getDefaultKpiFilters();
    const safeCandidate = {
      ...defaults,
      ...(candidateFilters || {}),
      id_barbero: showBarberoFilter ? (candidateFilters?.id_barbero || '') : '',
    };
    const keys = ['fecha_desde', 'fecha_hasta', 'id_sucursal', 'commission_rate', ...(showBarberoFilter ? ['id_barbero'] : [])];
    return keys.some((key) => String(safeCandidate?.[key] || '').trim() !== String(defaults?.[key] || '').trim());
  }, [getDefaultKpiFilters, showBarberoFilter]);

  // JK: Parametros unificados para dashboard base y reportes personalizados.
  const buildDashboardParams = useCallback((overrides = {}) => ({
    fecha_desde: overrides.fecha_desde ?? filters.fecha_desde,
    fecha_hasta: overrides.fecha_hasta ?? filters.fecha_hasta,
    id_sucursal: (overrides.id_sucursal ?? filters.id_sucursal) || undefined,
    id_barbero: showBarberoFilter
      ? ((overrides.id_barbero ?? filters.id_barbero) || undefined)
      : undefined,
    commission_rate: (overrides.commission_rate ?? filters.commission_rate) || undefined,
  }), [filters.commission_rate, filters.fecha_desde, filters.fecha_hasta, filters.id_barbero, filters.id_sucursal, showBarberoFilter]);

  // JK: Ejecuta consultas diarias en lotes para evitar sobrecargar la API en rangos amplios.
  const fetchDailyTotalsForDateKeys = useCallback(async (dateKeys, buildParamsForDay) => {
    const safeDateKeys = Array.isArray(dateKeys) ? dateKeys.filter(Boolean) : [];
    if (safeDateKeys.length === 0 || typeof buildParamsForDay !== 'function') return [];

    const rows = [];
    for (let offset = 0; offset < safeDateKeys.length; offset += CONCURRENCY_FETCH_BATCH_SIZE) {
      const batchKeys = safeDateKeys.slice(offset, offset + CONCURRENCY_FETCH_BATCH_SIZE);
      const batchResponses = await Promise.all(
        batchKeys.map((dayKey) => getAdminReportesDashboard(buildParamsForDay(dayKey)))
      );

      batchKeys.forEach((dayKey, index) => {
        rows.push({
          periodKey: dayKey,
          periodLabel: dayKey,
          periodOrder: toUtcDate(dayKey)?.getTime?.() || 0,
          total_citas: toInt(batchResponses[index]?.data?.kpis?.total_citas),
        });
      });
    }

    return rows.sort((left, right) => left.periodOrder - right.periodOrder);
  }, []);

  // JK: Construye tendencia diaria filtrada (usa rango aplicado por usuario).
  const fetchFilteredConcurrencyDaily = useCallback(async (appliedFilters = {}) => {
    if (resolvedModuleType !== 'concurrencia') return;

    const fechaDesde = String(appliedFilters?.fecha_desde || '').trim();
    const fechaHasta = String(appliedFilters?.fecha_hasta || '').trim();
    const dateKeys = buildDateKeysBetween(fechaDesde, fechaHasta);

    if (!dateKeys.length) {
      setFilteredConcurrencyDaily({
        loading: false,
        error: '',
        rows: [],
      });
      return;
    }

    setFilteredConcurrencyDaily({
      loading: true,
      error: '',
      rows: [],
    });

    try {
      const rows = await fetchDailyTotalsForDateKeys(dateKeys, (dayKey) => buildDashboardParams({
        fecha_desde: dayKey,
        fecha_hasta: dayKey,
        id_sucursal: appliedFilters?.id_sucursal || '',
        commission_rate: appliedFilters?.commission_rate || '',
      }));

      const hasData = rows.some((row) => toInt(row?.total_citas) > 0);
      setFilteredConcurrencyDaily({
        loading: false,
        error: '',
        rows: hasData ? rows : [],
      });
    } catch (error) {
      setFilteredConcurrencyDaily({
        loading: false,
        error: extractMessage(error),
        rows: [],
      });
    }
  }, [buildDashboardParams, fetchDailyTotalsForDateKeys, resolvedModuleType]);

  // JK: Calcula el día más concurrente del mes actual sin depender de filtros activos.
  const fetchIndependentConcurrencyPeakDay = useCallback(async () => {
    if (resolvedModuleType !== 'concurrencia') return;

    const monthRange = buildCurrentMonthDateRange();
    if (!monthRange.fecha_desde || !monthRange.fecha_hasta) {
      setIndependentConcurrencyPeakDay({
        loading: false,
        error: '',
        topDay: null,
      });
      return;
    }

    setIndependentConcurrencyPeakDay({
      loading: true,
      error: '',
      topDay: null,
    });

    try {
      const response = await getAdminReportesDashboard({
        fecha_desde: monthRange.fecha_desde,
        fecha_hasta: monthRange.fecha_hasta,
      });

      const weekdayRows = (Array.isArray(response?.data?.concurrencia_clientes?.trafico_por_dia_semana)
        ? response.data.concurrencia_clientes.trafico_por_dia_semana
        : [])
        .map((row) => ({
          dia_semana_num: Math.max(1, Math.min(7, toInt(row?.dia_semana_num, 0))),
          dia_semana_label: String(row?.dia_semana_label || '').trim(),
          total_citas: Math.max(0, toInt(row?.total_citas)),
        }))
        .filter((row) => row.dia_semana_num > 0 && row.dia_semana_label);

      const topDay = [...weekdayRows].sort((left, right) => {
        const diff = toInt(right?.total_citas) - toInt(left?.total_citas);
        if (diff !== 0) return diff;
        return toInt(left?.dia_semana_num) - toInt(right?.dia_semana_num);
      })[0] || null;

      const hasData = topDay && toInt(topDay?.total_citas) > 0;
      setIndependentConcurrencyPeakDay({
        loading: false,
        error: '',
        topDay: hasData ? topDay : null,
      });
    } catch (error) {
      setIndependentConcurrencyPeakDay({
        loading: false,
        error: extractMessage(error),
        topDay: null,
      });
    }
  }, [resolvedModuleType]);

  const fetchDashboard = useCallback(async (options = {}) => {
    const overrideFilters = options?.overrideFilters || null;
    const markAsAppliedFilter = Boolean(options?.markAsAppliedFilter);
    const activeFilters = {
      fecha_desde: overrideFilters?.fecha_desde ?? filters.fecha_desde,
      fecha_hasta: overrideFilters?.fecha_hasta ?? filters.fecha_hasta,
      id_sucursal: overrideFilters?.id_sucursal ?? filters.id_sucursal,
      id_barbero: overrideFilters?.id_barbero ?? filters.id_barbero,
      commission_rate: overrideFilters?.commission_rate ?? filters.commission_rate,
    };

    if (!activeFilters.fecha_desde || !activeFilters.fecha_hasta) {
      notifications.warning('Debes seleccionar fecha desde y fecha hasta.');
      return false;
    }

    if (activeFilters.fecha_desde > activeFilters.fecha_hasta) {
      notifications.warning('fecha_desde no puede ser mayor que fecha_hasta.');
      return false;
    }

    setLoadingDashboard(true);
    setLoadError('');
    try {
      const response = await getAdminReportesDashboard(buildDashboardParams(activeFilters));
      setSnapshot(response?.data || null);
      if (markAsAppliedFilter) {
        setCanClearKpiFilters(hasAppliedKpiFilterChanges(activeFilters));
      }
      return true;
    } catch (error) {
      setLoadError(extractMessage(error));
      return false;
    } finally {
      setLoadingDashboard(false);
    }
  }, [
    buildDashboardParams,
    filters.commission_rate,
    filters.fecha_desde,
    filters.fecha_hasta,
    filters.id_barbero,
    filters.id_sucursal,
    hasAppliedKpiFilterChanges,
    notifications,
  ]);

  useEffect(() => {
    void loadContexto();
  }, [loadContexto]);

  useEffect(() => {
    if (!filters.fecha_desde || !filters.fecha_hasta) return;
    if (loadingContexto) return;
    if (snapshot) return;
    void fetchDashboard();
  }, [fetchDashboard, filters.fecha_desde, filters.fecha_hasta, loadingContexto, snapshot]);

  // JK: Dispara consultas independientes de forma diferida una vez que el dashboard base ya está listo.
  useEffect(() => {
    if (!snapshot || loadingDashboard) return;

    if (resolvedModuleType === 'ingresos' && !independentFetchStartedRef.current.ingresos) {
      independentFetchStartedRef.current.ingresos = true;
      return scheduleDeferredModuleFetch(fetchIndependentIncomeCharts);
    }

    if (resolvedModuleType === 'barberos' && !independentFetchStartedRef.current.barberos) {
      independentFetchStartedRef.current.barberos = true;
      return scheduleDeferredModuleFetch(fetchIndependentBarbersOverview);
    }

    if (resolvedModuleType === 'concurrencia' && !independentFetchStartedRef.current.concurrenciaPeak) {
      independentFetchStartedRef.current.concurrenciaPeak = true;
      return scheduleDeferredModuleFetch(fetchIndependentConcurrencyPeakDay);
    }

    return undefined;
  }, [
    fetchIndependentBarbersOverview,
    fetchIndependentConcurrencyPeakDay,
    fetchIndependentIncomeCharts,
    loadingDashboard,
    resolvedModuleType,
    scheduleDeferredModuleFetch,
    snapshot,
  ]);

  // JK: Tendencia diaria de concurrencia atada al rango realmente aplicado en dashboard.
  useEffect(() => {
    if (resolvedModuleType !== 'concurrencia') return;
    const appliedDesde = String(snapshot?.filtros_aplicados?.fecha_desde || '').trim();
    const appliedHasta = String(snapshot?.filtros_aplicados?.fecha_hasta || '').trim();
    if (!appliedDesde || !appliedHasta) return;

    void fetchFilteredConcurrencyDaily({
      fecha_desde: appliedDesde,
      fecha_hasta: appliedHasta,
      id_sucursal: snapshot?.filtros_aplicados?.id_sucursal || '',
      commission_rate: snapshot?.filtros_aplicados?.commission_rate || '',
    });
  }, [
    fetchFilteredConcurrencyDaily,
    resolvedModuleType,
    snapshot?.filtros_aplicados?.commission_rate,
    snapshot?.filtros_aplicados?.fecha_desde,
    snapshot?.filtros_aplicados?.fecha_hasta,
    snapshot?.filtros_aplicados?.id_sucursal,
  ]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'id_sucursal') next.id_barbero = '';
      return next;
    });
  }, []);

  // JK: Al abrir el modal, se inicializa con fechas vacias para que el rango aparezca no inicializado.
  const handleFiltersDialogOpenChange = useCallback((nextOpen) => {
    setFiltersOpen(nextOpen);
    if (nextOpen) {
      setModalFilters({
        ...filters,
        fecha_desde: '',
        fecha_hasta: '',
        id_barbero: showBarberoFilter ? (filters?.id_barbero || '') : '',
      });
      return;
    }
    setModalFilters(null);
  }, [filters, showBarberoFilter]);

  // JK: Cambios locales del formulario de filtros sin afectar dashboard hasta aplicar.
  const handleModalFilterChange = useCallback((key, value) => {
    setModalFilters((current) => {
      const base = current || {
        ...filters,
        fecha_desde: '',
        fecha_hasta: '',
        id_barbero: showBarberoFilter ? (filters?.id_barbero || '') : '',
      };
      const next = { ...base, [key]: value };
      if (key === 'id_sucursal') next.id_barbero = '';
      return next;
    });
  }, [filters, showBarberoFilter]);

  const barberoOptions = useMemo(() => {
    const selectedBranchId = filtersOpen
      ? (modalFilters?.id_sucursal || '')
      : (filters.id_sucursal || '');
    if (!selectedBranchId) return contexto.barberos;
    return contexto.barberos.filter((barbero) => barbero.id_sucursal === selectedBranchId);
  }, [contexto.barberos, filters.id_sucursal, filtersOpen, modalFilters?.id_sucursal]);

  // JK: Callback reutilizable para que el modal genere reporte con rango de fechas custom.
  const fetchCustomReportSnapshot = useCallback(async ({ fecha_desde, fecha_hasta }) => {
    const response = await getAdminReportesDashboard(buildDashboardParams({ fecha_desde, fecha_hasta }));
    return response?.data || null;
  }, [buildDashboardParams]);

  const ventas = snapshot?.ventas_ingresos || {};
  const membresias = snapshot?.membresias || {};
  const concurrencia = snapshot?.concurrencia_clientes || {};
  const productividad = snapshot?.productividad_barberos || {};
  const kpis = snapshot?.kpis || {};

  const groupedIncomeRows = useMemo(
    () => aggregateRowsByGrouping(ventas?.ingresos_por_fecha || [], grouping),
    [grouping, ventas?.ingresos_por_fecha]
  );

  // JK: Serie diaria independiente (7/30) para los graficos de Ingresos, sin usar filtros globales.
  const independentIncomeDailyRowsByDays = useMemo(() => {
    const result = { 7: [], 30: [] };
    INCOME_CHART_WINDOW_OPTIONS.forEach((days) => {
      const snapshotByWindow = independentIncomeCharts.snapshotsByDays?.[days];
      const rows = Array.isArray(snapshotByWindow?.ventas_ingresos?.ingresos_por_fecha)
        ? snapshotByWindow.ventas_ingresos.ingresos_por_fecha
        : [];
      const endDate = toUtcDate(independentIncomeCharts.rangesByDays?.[days]?.fecha_hasta) || new Date();
      result[days] = buildDailyTrendRows(rows, endDate, days);
    });
    return result;
  }, [independentIncomeCharts.rangesByDays, independentIncomeCharts.snapshotsByDays]);

  // JK: Ranking por servicio independiente para 7/30 dias.
  const independentIncomeServicesByDays = useMemo(() => {
    const result = { 7: [], 30: [] };
    INCOME_CHART_WINDOW_OPTIONS.forEach((days) => {
      const snapshotByWindow = independentIncomeCharts.snapshotsByDays?.[days];
      result[days] = Array.isArray(snapshotByWindow?.ventas_ingresos?.ingresos_por_servicio)
        ? snapshotByWindow.ventas_ingresos.ingresos_por_servicio
        : [];
    });
    return result;
  }, [independentIncomeCharts.snapshotsByDays]);

  // JK: Resolucion de ventana por grafico para render independiente de filtros.
  const selectedIncomeTotalWindow = incomeChartWindows.chart_ingresos_fecha === 30 ? 30 : 7;
  const selectedIncomeServiceWindow = incomeChartWindows.chart_ingresos_servicio === 30 ? 30 : 7;
  const selectedMembershipTrendWindow = incomeChartWindows.chart_membresias_adquiridas === 30 ? 30 : 7;

  // JK: Reinicia filtros globales de KPIs al estado base del submodulo.
  const handleClearKpiFilters = useCallback(async () => {
    const defaultFilters = getDefaultKpiFilters();
    setFilters(defaultFilters);
    setCanClearKpiFilters(false);
    setFiltersOpen(false);
    setModalFilters(null);
    await fetchDashboard({ overrideFilters: defaultFilters, markAsAppliedFilter: false });
  }, [fetchDashboard, getDefaultKpiFilters]);

  // JK: Aplica los filtros desde modal con la misma validacion y consulta existente.
  const handleApplyFilters = useCallback(async () => {
    const candidateFilters = useHeaderActionsLayout
      ? {
        ...filters,
        ...(modalFilters || {}),
      }
      : filters;
    const success = await fetchDashboard({
      overrideFilters: candidateFilters,
      markAsAppliedFilter: true,
    });
    if (success) {
      setFilters(candidateFilters);
      setFiltersOpen(false);
      setModalFilters(null);
    }
  }, [fetchDashboard, filters, modalFilters, useHeaderActionsLayout]);

  // JK: Modelo de presentacion unificado para KPIs, graficos y tabla por submodulo.
  const moduleDashboard = useMemo(() => {
    if (resolvedModuleType === 'ingresos') {
      // JK: KPI derivado para membresia mas vendida reutilizando ingresos_por_planes.
      const topMembership = Array.isArray(membresias?.ingresos_por_planes)
        ? [...membresias.ingresos_por_planes].sort((left, right) => {
          const diff = toInt(right?.pagos_registrados) - toInt(left?.pagos_registrados);
          if (diff !== 0) return diff;
          return String(left?.nombre_plan || '').localeCompare(String(right?.nombre_plan || ''), 'es');
        })[0]
        : null;

      // JK: KPI derivado para servicio mas solicitado basado en servicios_realizados.
      const topService = Array.isArray(ventas?.ingresos_por_servicio)
        ? [...ventas.ingresos_por_servicio].sort((left, right) => {
          const diff = toInt(right?.servicios_realizados) - toInt(left?.servicios_realizados);
          if (diff !== 0) return diff;
          return String(left?.nombre_servicio || '').localeCompare(String(right?.nombre_servicio || ''), 'es');
        })[0]
        : null;

      const membershipMostSold = topMembership && toInt(topMembership?.pagos_registrados) > 0
        ? (topMembership?.nombre_plan || 'Sin datos')
        : 'Sin datos';
      const mostRequestedService = topService && toInt(topService?.servicios_realizados) > 0
        ? (topService?.nombre_servicio || 'Sin datos')
        : 'Sin datos';

      return {
        widgets: [
          {
            key: 'ingresos_totales',
            title: 'Ingresos totales',
            value: formatMoney(kpis?.ingresos_totales_hnl),
            subtitle: 'Suma consolidada de servicios + membresias.',
            exportType: 'resumen',
          },
          {
            key: 'ingresos_servicios',
            title: 'Ingresos por servicios',
            value: formatMoney(kpis?.ingresos_servicios_hnl),
            subtitle: 'Pagos confirmados de citas.',
            exportType: 'ingresos_servicio',
          },
          {
            key: 'ingresos_membresias',
            title: 'Ingresos por membresias',
            value: formatMoney(kpis?.ingresos_membresias_hnl),
            subtitle: 'Cobros de suscripciones pagadas.',
            exportType: 'membresias_planes',
          },
          {
            key: 'membresia_mas_vendida',
            title: 'Membresia mas vendida',
            value: membershipMostSold,
            subtitle: 'Plan con mayor volumen de pagos en el periodo.',
            exportType: 'membresias_planes',
          },
          {
            key: 'servicio_mas_solicitado',
            title: 'Servicio mas solicitado',
            value: mostRequestedService,
            subtitle: 'Servicio con mayor cantidad de veces realizado.',
            exportType: 'ingresos_servicio',
          },
        ],
        charts: [
          {
            key: 'chart_ingresos_fecha',
            title: `Tendencia de ingresos totales (últimos ${selectedIncomeTotalWindow} días)`,
            subtitle: 'Ingresos totales por dia.',
            rows: independentIncomeDailyRowsByDays[selectedIncomeTotalWindow] || [],
            variant: 'daily_trend_bars',
            valueKey: 'ingresos_totales_hnl',
            labelKey: 'periodLabel',
            formatValue: formatMoney,
            chartWindowDays: selectedIncomeTotalWindow,
            onChartWindowChange: (days) => handleIncomeChartWindowChange('chart_ingresos_fecha', days),
            independentHint: 'Vista independiente de filtros',
            loading: independentIncomeCharts.loading,
            valueFormatterInsideBar: formatMoneyNumberOnly,
            emptyMessage: independentIncomeCharts.error
              ? `No se pudo cargar la vista independiente: ${independentIncomeCharts.error}`
              : 'Sin datos independientes para el rango seleccionado.',
          },
          {
            key: 'chart_ingresos_servicio',
            title: 'Ingresos por servicio',
            subtitle: `Comparativa entre servicios (últimos ${selectedIncomeServiceWindow} días).`,
            rows: independentIncomeServicesByDays[selectedIncomeServiceWindow] || [],
            valueKey: 'ingresos_hnl',
            labelKey: 'nombre_servicio',
            formatValue: formatMoney,
            showValueInsideBar: selectedIncomeServiceWindow === 30,
            insideValueFormatter: formatMoneyNumberOnly,
            chartWindowDays: selectedIncomeServiceWindow,
            onChartWindowChange: (days) => handleIncomeChartWindowChange('chart_ingresos_servicio', days),
            independentHint: 'Vista independiente de filtros',
            loading: independentIncomeCharts.loading,
            emptyMessage: independentIncomeCharts.error
              ? `No se pudo cargar la vista independiente: ${independentIncomeCharts.error}`
              : 'Sin datos independientes para el rango seleccionado.',
          },
          {
            key: 'chart_membresias_adquiridas',
            title: 'Tendencia de membresias adquiridas',
            subtitle: `Cantidad de membresias adquiridas por dia (últimos ${selectedMembershipTrendWindow} días).`,
            rows: independentIncomeDailyRowsByDays[selectedMembershipTrendWindow] || [],
            variant: 'daily_trend_bars',
            valueKey: 'cobros_membresia',
            labelKey: 'periodLabel',
            formatValue: formatInteger,
            chartWindowDays: selectedMembershipTrendWindow,
            onChartWindowChange: (days) => handleIncomeChartWindowChange('chart_membresias_adquiridas', days),
            independentHint: 'Vista independiente de filtros',
            loading: independentIncomeCharts.loading,
            valueFormatterInsideBar: formatInteger,
            emptyMessage: independentIncomeCharts.error
              ? `No se pudo cargar la vista independiente: ${independentIncomeCharts.error}`
              : 'Sin datos independientes para el rango seleccionado.',
          },
        ],
        table: {
          title: 'Detalle de ingresos por periodo',
          rows: groupedIncomeRows,
          columns: [
            { key: 'periodLabel', label: 'Periodo' },
            { key: 'ingresos_servicios_hnl', label: 'Servicios', render: (value) => formatMoney(value) },
            { key: 'ingresos_membresias_hnl', label: 'Membresias', render: (value) => formatMoney(value) },
            { key: 'ingresos_totales_hnl', label: 'Total', render: (value) => formatMoney(value) },
          ],
        },
        unavailableKpis: [],
      };
    }

    if (resolvedModuleType === 'membresias') {
      const validacionDatos = snapshot?.validacion_datos || {};

      // JK: Sanitiza dataset de ingresos por plan (membership_plans + subscriptions + subscription_payments).
      const ingresosPorPlanes = (Array.isArray(membresias?.ingresos_por_planes) ? membresias.ingresos_por_planes : [])
        .map((row) => ({
          id_plan: row?.id_plan || '',
          nombre_plan: String(row?.nombre_plan || 'Sin plan'),
          pagos_registrados: toInt(row?.pagos_registrados),
          ingresos_hnl: toNumber(row?.ingresos_hnl),
        }))
        .sort((left, right) => toNumber(right.ingresos_hnl) - toNumber(left.ingresos_hnl));

      // JK: Sanitiza dataset de suscripciones activas por plan (subscriptions activas + membership_plans).
      const activasPorPlan = (Array.isArray(membresias?.suscripciones_activas_por_plan) ? membresias.suscripciones_activas_por_plan : [])
        .map((row) => ({
          id_plan: row?.id_plan || '',
          nombre_plan: String(row?.nombre_plan || 'Sin plan'),
          suscripciones_activas: toInt(row?.suscripciones_activas),
        }))
        .sort((left, right) => toInt(right.suscripciones_activas) - toInt(left.suscripciones_activas));

      // JK: Serie temporal de ingresos por membresias en el periodo filtrado para la card principal.
      const ingresosMembresiasTrend = (Array.isArray(ventas?.ingresos_por_fecha) ? ventas.ingresos_por_fecha : [])
        .map((row) => {
          const safeDate = String(row?.fecha || '');
          const parsedDate = toUtcDate(safeDate);
          return {
            periodKey: safeDate,
            periodLabel: safeDate,
            periodOrder: parsedDate?.getTime?.() || 0,
            ingresos_membresias_hnl: toNumber(row?.ingresos_membresias_hnl),
          };
        })
        .filter((row) => row.periodLabel)
        .sort((left, right) => left.periodOrder - right.periodOrder);

      const totalIngresosMembresias = ingresosMembresiasTrend.reduce((acc, row) => acc + toNumber(row.ingresos_membresias_hnl), 0);
      const totalSuscripcionesActivas = activasPorPlan.reduce((acc, row) => acc + toInt(row.suscripciones_activas), 0);
      const totalIngresosPorPlan = ingresosPorPlanes.reduce((acc, row) => acc + toNumber(row.ingresos_hnl), 0);

      // JK: Validaciones de disponibilidad real para evitar KPIs inventados o graficos rotos.
      const hasSubscriptionPaymentsScope = toInt(validacionDatos?.subscription_payments_scope) > 0;
      const hasSubscriptionsScope = toInt(validacionDatos?.subscriptions_scope) > 0;
      const hasActivePlans = toInt(validacionDatos?.planes_activos) > 0;

      const showIngresosMembresiasData = hasSubscriptionPaymentsScope && toNumber(totalIngresosMembresias) > 0;
      const showSuscripcionesActivasData = hasActivePlans && hasSubscriptionsScope && toInt(totalSuscripcionesActivas) > 0;
      const showIngresosPorPlanData = hasActivePlans && hasSubscriptionPaymentsScope && toNumber(totalIngresosPorPlan) > 0;

      return {
        widgets: [],
        charts: [
          {
            key: 'card_membresias_ingresos_periodo',
            title: 'Ingresos por membresías',
            subtitle: 'Total del período con tendencia diaria.',
            primaryValue: showIngresosMembresiasData ? formatMoney(totalIngresosMembresias) : 'Sin datos',
            primaryValueLabel: 'Total del período',
            rows: showIngresosMembresiasData ? ingresosMembresiasTrend : [],
            valueKey: 'ingresos_membresias_hnl',
            labelKey: 'periodLabel',
            formatValue: formatMoney,
            limit: 60,
            emptyMessage: hasSubscriptionPaymentsScope
              ? 'Sin datos de ingresos por membresías en el período seleccionado.'
              : 'Sin datos en subscription_payments para el alcance actual.',
          },
          {
            key: 'card_membresias_activas_por_plan',
            title: 'Suscripciones activas por plan',
            subtitle: 'Cantidad activa por plan.',
            primaryValue: showSuscripcionesActivasData ? formatInteger(totalSuscripcionesActivas) : 'Sin datos',
            primaryValueLabel: 'Total de suscripciones activas',
            rows: showSuscripcionesActivasData ? activasPorPlan : [],
            valueKey: 'suscripciones_activas',
            labelKey: 'nombre_plan',
            formatValue: formatInteger,
            limit: 30,
            emptyMessage: hasActivePlans
              ? 'Sin suscripciones activas para los planes en el alcance actual.'
              : 'Sin planes activos en membership_plans para este alcance.',
          },
          {
            key: 'card_membresias_ingresos_por_plan',
            title: 'Ingresos por plan',
            subtitle: 'Ingresos acumulados por plan.',
            primaryValue: showIngresosPorPlanData ? formatMoney(totalIngresosPorPlan) : 'Sin datos',
            primaryValueLabel: 'Total de ingresos por plan',
            rows: showIngresosPorPlanData ? ingresosPorPlanes : [],
            valueKey: 'ingresos_hnl',
            labelKey: 'nombre_plan',
            formatValue: formatMoney,
            limit: 30,
            emptyMessage: hasSubscriptionPaymentsScope
              ? 'Sin ingresos por plan en el período seleccionado.'
              : 'Sin pagos en subscription_payments para el alcance actual.',
          },
        ],
        table: {
          title: 'Detalle por plan de membresía',
          rows: [],
          columns: [
            { key: 'nombre_plan', label: 'Plan' },
            { key: 'pagos_registrados', label: 'Pagos', render: (value) => formatInteger(value) },
            { key: 'suscripciones_activas', label: 'Suscripciones activas', render: (value) => formatInteger(value) },
            { key: 'ingresos_hnl', label: 'Ingresos', render: (value) => formatMoney(value) },
          ],
        },
        unavailableKpis: [],
      };
    }

    if (resolvedModuleType === 'barberos') {
      const validacionDatos = snapshot?.validacion_datos || {};
      const hasBarberScope = toInt(validacionDatos?.barberos_scope) > 0;
      const hasDetailsInRange = toInt(validacionDatos?.detalles_en_rango) > 0;
      const hasAppointmentsInRange = toInt(validacionDatos?.citas_en_rango) > 0;
      const filtersApplied = canClearKpiFilters;
      const selectedBarberId = String(filters?.id_barbero || '');
      const selectedBarberMeta = barberoOptions.find((barbero) => barbero.id_empleado === selectedBarberId) || null;
      const selectedBarberName = selectedBarberMeta?.nombre_barbero || 'Barbero seleccionado';

      // JK: Vista default sin filtros a partir de snapshots diarios independientes (últimos 7 días).
      const independentDayKeys = Array.isArray(independentBarbersOverview?.dayKeys)
        ? independentBarbersOverview.dayKeys
        : [];
      const independentDailyRows = independentDayKeys.map((dayKey) => {
        const dailySnapshot = independentBarbersOverview?.snapshotsByDate?.[dayKey] || null;
        const dailyProductivityRows = Array.isArray(dailySnapshot?.productividad_barberos?.resumen)
          ? dailySnapshot.productividad_barberos.resumen
          : [];
        const serviciosRealizados = dailyProductivityRows.reduce((acc, row) => acc + toInt(row?.servicios_realizados), 0);
        return {
          periodKey: dayKey,
          periodLabel: dayKey,
          periodOrder: toUtcDate(dayKey)?.getTime?.() || 0,
          ingresos_servicios_hnl: toNumber(dailySnapshot?.kpis?.ingresos_servicios_hnl),
          servicios_realizados: toInt(serviciosRealizados),
        };
      });

      const independentHasIncomeData = independentDailyRows.some((row) => toNumber(row?.ingresos_servicios_hnl) > 0);
      const independentHasServicesData = independentDailyRows.some((row) => toInt(row?.servicios_realizados) > 0);
      const independentTodayRow = independentDailyRows[independentDailyRows.length - 1] || null;

      // JK: Agrega productividad por barbero en últimos 7 días para card "barbero más productivo".
      const independentProductivityByBarber = new Map();
      independentDayKeys.forEach((dayKey) => {
        const dailySnapshot = independentBarbersOverview?.snapshotsByDate?.[dayKey] || null;
        const dailyProductivityRows = Array.isArray(dailySnapshot?.productividad_barberos?.resumen)
          ? dailySnapshot.productividad_barberos.resumen
          : [];
        const dailyIncomeRows = Array.isArray(dailySnapshot?.ventas_ingresos?.ingresos_por_barbero)
          ? dailySnapshot.ventas_ingresos.ingresos_por_barbero
          : [];

        dailyProductivityRows.forEach((row) => {
          const key = row?.id_empleado || row?.nombre_barbero || `prod-${dayKey}`;
          const current = independentProductivityByBarber.get(key) || {
            id_empleado: row?.id_empleado || null,
            nombre_barbero: String(row?.nombre_barbero || 'Sin nombre'),
            servicios_realizados: 0,
            no_show: 0,
            ingresos_hnl: 0,
          };
          current.servicios_realizados += toInt(row?.servicios_realizados);
          current.no_show += toInt(row?.no_show);
          independentProductivityByBarber.set(key, current);
        });

        dailyIncomeRows.forEach((row) => {
          const key = row?.id_empleado || row?.nombre_barbero || `income-${dayKey}`;
          const current = independentProductivityByBarber.get(key) || {
            id_empleado: row?.id_empleado || null,
            nombre_barbero: String(row?.nombre_barbero || 'Sin nombre'),
            servicios_realizados: 0,
            no_show: 0,
            ingresos_hnl: 0,
          };
          current.ingresos_hnl += toNumber(row?.ingresos_hnl);
          independentProductivityByBarber.set(key, current);
        });
      });

      const independentProductivityRows = Array.from(independentProductivityByBarber.values()).sort((left, right) => {
        const diffServices = toInt(right?.servicios_realizados) - toInt(left?.servicios_realizados);
        if (diffServices !== 0) return diffServices;
        const diffIncome = toNumber(right?.ingresos_hnl) - toNumber(left?.ingresos_hnl);
        if (diffIncome !== 0) return diffIncome;
        return String(left?.nombre_barbero || '').localeCompare(String(right?.nombre_barbero || ''), 'es');
      });
      const independentTopBarber = independentProductivityRows[0] || null;
      const independentHasTopBarber = independentTopBarber
        && (toInt(independentTopBarber?.servicios_realizados) > 0 || toNumber(independentTopBarber?.ingresos_hnl) > 0);

      // JK: Sanitiza datasets filtrados para vista analítica por barbero.
      const productividadRows = (Array.isArray(productividad?.resumen) ? productividad.resumen : [])
        .map((row) => ({
          id_empleado: row?.id_empleado || '',
          nombre_barbero: String(row?.nombre_barbero || 'Sin nombre'),
          servicios_realizados: toInt(row?.servicios_realizados),
          no_show: toInt(row?.no_show),
        }));
      const serviciosPorTipoRows = (Array.isArray(ventas?.ingresos_por_servicio) ? ventas.ingresos_por_servicio : [])
        .map((row) => ({
          id_servicio: row?.id_servicio || '',
          nombre_servicio: String(row?.nombre_servicio || 'Sin servicio'),
          servicios_realizados: toInt(row?.servicios_realizados),
        }))
        .sort((left, right) => toInt(right?.servicios_realizados) - toInt(left?.servicios_realizados));

      const serviciosPorBarberoRows = [...productividadRows]
        .sort((left, right) => toInt(right?.servicios_realizados) - toInt(left?.servicios_realizados));
      const noShowPorBarberoRows = [...productividadRows]
        .sort((left, right) => toInt(right?.no_show) - toInt(left?.no_show));

      const totalServiciosPeriodoPorServicio = serviciosPorTipoRows.reduce(
        (acc, row) => acc + toInt(row?.servicios_realizados),
        0
      );
      const totalServiciosPeriodoPorBarbero = serviciosPorBarberoRows.reduce(
        (acc, row) => acc + toInt(row?.servicios_realizados),
        0
      );
      const totalNoShowPeriodo = noShowPorBarberoRows.reduce((acc, row) => acc + toInt(row?.no_show), 0);

      let analysisCharts = [];
      if (filtersApplied) {
        if (selectedBarberId) {
          const noShowBarberTotal = noShowPorBarberoRows.reduce((acc, row) => acc + toInt(row?.no_show), 0);
          analysisCharts = [
            {
              key: 'barberos_analitica_servicios_por_tipo',
              title: 'Servicios realizados en el periodo',
              subtitle: 'Distribución total por servicio para el barbero seleccionado (sin vista diaria).',
              primaryValue: hasDetailsInRange && totalServiciosPeriodoPorServicio > 0
                ? formatInteger(totalServiciosPeriodoPorServicio)
                : 'Sin datos',
              primaryValueLabel: 'Total de servicios del periodo',
              rows: hasDetailsInRange && totalServiciosPeriodoPorServicio > 0
                ? serviciosPorTipoRows.filter((row) => toInt(row?.servicios_realizados) > 0)
                : [],
              valueKey: 'servicios_realizados',
              labelKey: 'nombre_servicio',
              formatValue: formatInteger,
              limit: 30,
              emptyMessage: 'Sin datos de servicios por tipo para el barbero seleccionado.',
            },
            {
              key: 'barberos_analitica_no_show_individual',
              title: 'Inacistencias de Clientes',
              subtitle: 'Total de no-show del barbero seleccionado en el periodo.',
              primaryValue: hasAppointmentsInRange && noShowBarberTotal > 0
                ? formatInteger(noShowBarberTotal)
                : 'Sin datos',
              primaryValueLabel: 'Total de Inacistencias del periodo',
              rows: hasAppointmentsInRange && noShowBarberTotal > 0
                ? [{ nombre_barbero: selectedBarberName, no_show: noShowBarberTotal }]
                : [],
              valueKey: 'no_show',
              labelKey: 'nombre_barbero',
              formatValue: formatInteger,
              limit: 5,
              emptyMessage: 'Sin no-show para el barbero seleccionado.',
            },
          ];
        } else {
          analysisCharts = [
            {
              key: 'barberos_analitica_servicios_por_barbero',
              title: 'Servicios realizados en el periodo',
              subtitle: 'Comparativo de servicios realizados por barbero (filtros activos).',
              primaryValue: hasDetailsInRange && totalServiciosPeriodoPorBarbero > 0
                ? formatInteger(totalServiciosPeriodoPorBarbero)
                : 'Sin datos',
              primaryValueLabel: 'Total de servicios del periodo',
              rows: hasDetailsInRange && totalServiciosPeriodoPorBarbero > 0
                ? serviciosPorBarberoRows.filter((row) => toInt(row?.servicios_realizados) > 0)
                : [],
              valueKey: 'servicios_realizados',
              labelKey: 'nombre_barbero',
              formatValue: formatInteger,
              limit: 30,
              emptyMessage: hasBarberScope
                ? 'Sin servicios realizados para los barberos en el periodo filtrado.'
                : 'Sin barberos disponibles en el alcance actual.',
            },
            {
              key: 'barberos_analitica_no_show_por_barbero',
              title: 'Inacistencias de Clientes',
              subtitle: 'Comparativo de inacistencias por barbero (filtros activos).',
              primaryValue: hasAppointmentsInRange && totalNoShowPeriodo > 0
                ? formatInteger(totalNoShowPeriodo)
                : 'Sin datos',
              primaryValueLabel: 'Total de Inacistencias del periodo',
              rows: hasAppointmentsInRange && totalNoShowPeriodo > 0
                ? noShowPorBarberoRows.filter((row) => toInt(row?.no_show) > 0)
                : [],
              valueKey: 'no_show',
              labelKey: 'nombre_barbero',
              formatValue: formatInteger,
              limit: 30,
              emptyMessage: hasBarberScope
                ? 'Sin no-show registrados en el periodo filtrado.'
                : 'Sin barberos disponibles en el alcance actual.',
            },
          ];
        }
      }

      return {
        widgets: [],
        charts: [
          {
            key: 'barberos_default_ingresos_diarios',
            title: 'Ingresos diarios (todos los barberos)',
            subtitle: 'Total de ingresos del día actual y tendencia de los últimos 7 días.',
            primaryValue: independentHasIncomeData
              ? formatMoney(independentTodayRow?.ingresos_servicios_hnl)
              : 'Sin datos',
            primaryValueLabel: 'Ingresos del día actual',
            rows: independentHasIncomeData ? independentDailyRows : [],
            valueKey: 'ingresos_servicios_hnl',
            labelKey: 'periodLabel',
            formatValue: formatMoney,
            limit: 7,
            independentHint: 'Vista independiente de filtros',
            loading: independentBarbersOverview.loading,
            emptyMessage: independentBarbersOverview.error
              ? `No se pudo cargar la vista independiente: ${independentBarbersOverview.error}`
              : 'Sin datos de ingresos diarios para los últimos 7 días.',
          },
          {
            key: 'barberos_default_servicios_diarios',
            title: 'Servicios realizados',
            subtitle: 'Total de servicios del día actual y comparativo de los últimos 7 días.',
            primaryValue: independentHasServicesData
              ? formatInteger(independentTodayRow?.servicios_realizados)
              : 'Sin datos',
            primaryValueLabel: 'Servicios del día actual',
            rows: independentHasServicesData ? independentDailyRows : [],
            valueKey: 'servicios_realizados',
            labelKey: 'periodLabel',
            formatValue: formatInteger,
            limit: 7,
            independentHint: 'Vista independiente de filtros',
            loading: independentBarbersOverview.loading,
            emptyMessage: independentBarbersOverview.error
              ? `No se pudo cargar la vista independiente: ${independentBarbersOverview.error}`
              : 'Sin datos de servicios diarios para los últimos 7 días.',
          },
          {
            key: 'barberos_default_barbero_top',
            title: 'Barbero más productivo',
            subtitle: 'Comparativo de productividad de barberos en los últimos 7 días.',
            primaryValue: independentHasTopBarber
              ? independentTopBarber?.nombre_barbero
              : 'Sin datos',
            primaryValueLabel: 'Mayor productividad (7 días)',
            rows: independentHasTopBarber ? independentProductivityRows : [],
            valueKey: 'servicios_realizados',
            labelKey: 'nombre_barbero',
            formatValue: formatInteger,
            limit: 20,
            independentHint: 'Vista independiente de filtros',
            loading: independentBarbersOverview.loading,
            emptyMessage: independentBarbersOverview.error
              ? `No se pudo cargar la vista independiente: ${independentBarbersOverview.error}`
              : 'Sin datos de productividad para los últimos 7 días.',
          },
        ],
        table: {
          title: 'Detalle de productividad por barbero',
          rows: [],
          columns: [
            { key: 'nombre_barbero', label: 'Barbero' },
            { key: 'servicios_realizados', label: 'Servicios', render: (value) => formatInteger(value) },
            { key: 'no_show', label: 'No-show', render: (value) => formatInteger(value) },
          ],
        },
        barbersAnalysis: {
          show: filtersApplied,
          prompt: 'Aplique filtros para poder mostrar datos por cada barbero',
          charts: analysisCharts,
        },
        unavailableKpis: [],
      };
    }

    if (resolvedModuleType === 'concurrencia') {
      // JK: Serie diaria por fecha (dependiente del rango filtrado).
      const citasDiarias = (Array.isArray(filteredConcurrencyDaily?.rows) ? filteredConcurrencyDaily.rows : [])
        .map((row) => ({
          periodKey: row?.periodKey || '',
          periodLabel: row?.periodLabel || '',
          total_citas: Math.max(0, toInt(row?.total_citas)),
        }))
        .filter((row) => row.periodLabel);

      // JK: Top 5 de horas pico basado en EXTRACT(HOUR) ya provisto por el snapshot filtrado.
      const topHoras = (Array.isArray(concurrencia?.horas_pico) ? concurrencia.horas_pico : [])
        .map((row) => ({
          hora: Math.max(0, Math.min(23, toInt(row?.hora))),
          total_citas: Math.max(0, toInt(row?.total_citas)),
        }))
        .filter((row) => row.total_citas > 0)
        .sort((left, right) => {
          const diff = toInt(right?.total_citas) - toInt(left?.total_citas);
          if (diff !== 0) return diff;
          return toInt(left?.hora) - toInt(right?.hora);
        })
        .slice(0, 5)
        .map((row) => ({
          ...row,
          hora_label: formatHourLabel(row.hora),
        }));

      const horaTop = topHoras[0] || null;
      const dayPeakOfMonth = independentConcurrencyPeakDay?.topDay || null;
      const hasDayPeakOfMonth = toInt(dayPeakOfMonth?.total_citas) > 0;

      return {
        widgets: [],
        charts: [
          {
            key: 'concurrencia_citas_por_dia',
            variant: 'daily_trend_line',
            title: 'Citas generadas por día',
            subtitle: 'Serie diaria de citas dentro del rango aplicado.',
            rows: citasDiarias,
            valueKey: 'total_citas',
            labelKey: 'periodLabel',
            formatValue: formatInteger,
            loading: filteredConcurrencyDaily.loading,
            emptyMessage: filteredConcurrencyDaily.error
              ? `No se pudo cargar la tendencia diaria: ${filteredConcurrencyDaily.error}`
              : 'Sin datos de citas para el rango seleccionado.',
          },
          {
            key: 'concurrencia_horas_top',
            title: 'Horas con mayor concurrencia',
            subtitle: 'Top 5 horas con más citas en el período filtrado.',
            rows: topHoras,
            valueKey: 'total_citas',
            labelKey: 'hora_label',
            formatValue: formatInteger,
            primaryValue: horaTop ? `${horaTop.hora_label} → ${formatInteger(horaTop.total_citas)} citas` : 'Sin datos',
            primaryValueLabel: 'Mayor concentración',
            emptyMessage: 'Sin datos de horas con citas para el rango seleccionado.',
          },
          {
            key: 'concurrencia_dia_mas_concurrente_mes',
            variant: 'insight_metric',
            title: 'Día más concurrente del mes',
            subtitle: 'Se calcula dentro del mes actual por día de la semana.',
            value: hasDayPeakOfMonth ? String(dayPeakOfMonth?.dia_semana_label || 'Sin datos') : 'Sin datos',
            valueLabel: 'Día de semana con mayor volumen',
            secondaryValue: hasDayPeakOfMonth ? `${formatInteger(dayPeakOfMonth?.total_citas)} citas` : '',
            secondaryLabel: 'Citas acumuladas del mes',
            independentHint: 'Vista independiente de filtros',
            loading: independentConcurrencyPeakDay.loading,
            hasData: hasDayPeakOfMonth,
            emptyMessage: independentConcurrencyPeakDay.error
              ? `No se pudo calcular el día pico del mes: ${independentConcurrencyPeakDay.error}`
              : 'Sin datos de citas en el mes actual.',
          },
        ],
        table: {
          title: 'Detalle diario de concurrencia',
          rows: citasDiarias,
          columns: [
            { key: 'periodLabel', label: 'Fecha' },
            { key: 'total_citas', label: 'Citas totales', render: (value) => formatInteger(value) },
          ],
        },
        unavailableKpis: [],
      };
    }

    const sucursalesRows = Array.isArray(ventas?.ingresos_por_sucursal) ? ventas.ingresos_por_sucursal : [];
    const totalIngresosSucursales = sucursalesRows.reduce((acc, row) => acc + toNumber(row.ingresos_hnl), 0);
    const totalCitasSucursales = sucursalesRows.reduce((acc, row) => acc + toInt(row.citas_pagadas), 0);
    const sucursalTop = sucursalesRows[0] || null;
    const sucursalesConTicket = sucursalesRows.map((row) => {
      const citas = toInt(row.citas_pagadas);
      return {
        ...row,
        ticket_promedio_hnl: citas > 0 ? toNumber(row.ingresos_hnl) / citas : 0,
      };
    });

    return {
      widgets: [
        {
          key: 'sucursales_ingresos',
          title: 'Ingresos por sucursal',
          value: formatMoney(totalIngresosSucursales),
          subtitle: 'Total consolidado entre sucursales filtradas.',
          exportType: 'ingresos_sucursal',
        },
        {
          key: 'sucursales_citas',
          title: 'Citas por sucursal',
          value: formatInteger(totalCitasSucursales),
          subtitle: 'Citas pagadas registradas por sede.',
          exportType: 'ingresos_sucursal',
        },
        {
          key: 'sucursales_rentable',
          title: 'Sucursal mas rentable',
          value: sucursalTop?.nombre_sucursal || 'Sin datos',
          subtitle: `Ingresos: ${formatMoney(sucursalTop?.ingresos_hnl || 0)}`,
          exportType: 'ingresos_sucursal',
        },
      ],
      charts: [
        {
          key: 'chart_sucursal_ingresos',
          title: 'Ingresos por sucursal',
          subtitle: 'Comparativo de rentabilidad.',
          rows: sucursalesRows,
          valueKey: 'ingresos_hnl',
          labelKey: 'nombre_sucursal',
          formatValue: formatMoney,
        },
        {
          key: 'chart_sucursal_citas',
          title: 'Citas por sucursal',
          subtitle: 'Volumen de citas pagadas por sede.',
          rows: sucursalesRows,
          valueKey: 'citas_pagadas',
          labelKey: 'nombre_sucursal',
          formatValue: formatInteger,
        },
        {
          key: 'chart_sucursal_ticket',
          title: 'Ticket promedio por sucursal',
          subtitle: 'Ingresos / citas pagadas.',
          rows: sucursalesConTicket,
          valueKey: 'ticket_promedio_hnl',
          labelKey: 'nombre_sucursal',
          formatValue: formatMoney,
        },
      ],
      table: {
        title: 'Detalle financiero por sucursal',
        rows: sucursalesConTicket,
        columns: [
          { key: 'nombre_sucursal', label: 'Sucursal' },
          { key: 'citas_pagadas', label: 'Citas pagadas', render: (value) => formatInteger(value) },
          { key: 'ingresos_hnl', label: 'Ingresos', render: (value) => formatMoney(value) },
          { key: 'ticket_promedio_hnl', label: 'Ticket promedio', render: (value) => formatMoney(value) },
        ],
      },
      unavailableKpis: [],
    };
  }, [
    barberoOptions,
    canClearKpiFilters,
    concurrencia?.horas_pico,
    filters?.id_barbero,
    filteredConcurrencyDaily?.error,
    filteredConcurrencyDaily?.loading,
    filteredConcurrencyDaily?.rows,
    groupedIncomeRows,
    independentConcurrencyPeakDay?.error,
    independentConcurrencyPeakDay?.loading,
    independentConcurrencyPeakDay?.topDay,
    kpis?.ingresos_membresias_hnl,
    kpis?.ingresos_servicios_hnl,
    kpis?.ingresos_totales_hnl,
    handleIncomeChartWindowChange,
    independentBarbersOverview?.dayKeys,
    independentBarbersOverview?.error,
    independentBarbersOverview?.loading,
    independentBarbersOverview?.snapshotsByDate,
    independentIncomeCharts.error,
    independentIncomeCharts.loading,
    independentIncomeDailyRowsByDays,
    independentIncomeServicesByDays,
    membresias?.ingresos_por_planes,
    membresias?.suscripciones_activas_por_plan,
    productividad?.resumen,
    resolvedModuleType,
    snapshot?.validacion_datos,
    selectedIncomeServiceWindow,
    selectedIncomeTotalWindow,
    selectedMembershipTrendWindow,
    ventas?.ingresos_por_fecha,
    ventas?.ingresos_por_servicio,
    ventas?.ingresos_por_sucursal,
  ]);

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4">
      <section className="mf-premium-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--mf-accent)]">Business Intelligence</p>
            <h1 className="mt-2 mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Reportes · {moduleMeta.label}</h1>
            <p className="mt-2 max-w-3xl text-sm text-[var(--mf-text-2)]">{moduleMeta.description}</p>
          </div>
          {useHeaderActionsLayout ? (
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {/* JK: Header final unificado con acceso a filtros por modal y accion de reporte. */}
              <Button
                type="button"
                variant="outline"
                className={`gap-2 ${canClearKpiFilters ? 'border-[var(--mf-accent)] text-[var(--mf-accent)]' : ''}`}
                onClick={() => handleFiltersDialogOpenChange(true)}
              >
                <SlidersHorizontal size={15} />
                <span>Filtros</span>
                {/* JK: Distintivo visible cuando hay filtros aplicados en el dashboard. */}
                {canClearKpiFilters ? (
                  <span className="inline-flex items-center rounded-full bg-[var(--mf-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--mf-accent-text)]">
                    Activo
                  </span>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => void handleClearKpiFilters()}
                disabled={!canClearKpiFilters || loadingDashboard}
              >
                Limpiar Filtros
              </Button>
              <Button type="button" variant="outline" className="gap-2" onClick={() => setCustomReportOpen(true)}>
                <FilePlus2 size={14} />
                Crear Reporte
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {/* JK: Fallback legacy para submodulos fuera del header unificado. */}
      {!useHeaderActionsLayout ? (
        <section className="mf-premium-card p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-[var(--mf-text-2)]">
              <CalendarDays size={15} />
              <span>Filtros</span>
            </div>
            <Button variant="outline" className="gap-2 self-end" onClick={() => setCustomReportOpen(true)}>
              <FilePlus2 size={14} />
              Crear Reporte
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <Label className="mf-label">Fecha desde</Label>
              <Input
                type="date"
                className="mf-input mt-1"
                value={filters.fecha_desde}
                onChange={(event) => handleFilterChange('fecha_desde', event.target.value)}
              />
            </div>
            <div>
              <Label className="mf-label">Fecha hasta</Label>
              <Input
                type="date"
                className="mf-input mt-1"
                value={filters.fecha_hasta}
                onChange={(event) => handleFilterChange('fecha_hasta', event.target.value)}
              />
            </div>
            {showBarberoFilter ? (
              <div>
                <Label className="mf-label">Barbero</Label>
                <select
                  className="mf-select mt-1"
                  value={filters.id_barbero}
                  onChange={(event) => handleFilterChange('id_barbero', event.target.value)}
                >
                  <option value="">Todos</option>
                  {barberoOptions.map((barbero) => (
                    <option key={barbero.id_empleado} value={barbero.id_empleado}>
                      {barbero.nombre_barbero}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {/* JK: Mostrar agrupacion solo en modulos donde aplica para evitar confusion UX. */}
            {supportsGrouping ? (
              <div>
                <Label className="mf-label">Agrupacion</Label>
                <select
                  className="mf-select mt-1"
                  value={grouping}
                  onChange={(event) => setGrouping(event.target.value)}
                >
                  <option value="diario">Diario</option>
                  <option value="semanal">Semanal</option>
                  <option value="mensual">Mensual</option>
                </select>
              </div>
            ) : null}
            {/* JK: Boton Consultar integrado a la misma fila de filtros para un header mas compacto. */}
            <div className="self-end sm:col-span-2 xl:col-span-1">
              <Button className="w-full gap-2" onClick={() => void fetchDashboard({ markAsAppliedFilter: true })} disabled={loadingDashboard}>
                {loadingDashboard ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Consultar
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {loadError ? <ErrorBanner message={loadError} onRetry={() => void fetchDashboard()} /> : null}
      {loadingDashboard && !snapshot ? <LoadingSpinner label="Construyendo reportes..." /> : null}

      {snapshot ? (
        <>
          {/* JK: Seccion KPI consistente para todos los submodulos (Membresias usa cards integradas). */}
          {moduleDashboard.widgets.length > 0 ? (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {moduleDashboard.widgets.map((widget) => (
                <KpiWidget
                  key={widget.key}
                  title={widget.title}
                  value={widget.value}
                  subtitle={widget.subtitle}
                />
              ))}
            </section>
          ) : null}

          {resolvedModuleType === 'ingresos' ? (
            <section className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
              {/* JK: Separador visual entre KPIs y graficos para claridad de alcance de filtros. */}
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--mf-accent)]">Tendencia de ingresos del período</p>
              <p className="mt-1 text-sm text-[var(--mf-text-2)]">
                Los graficos se calculan en vista independiente y no cambian con los filtros globales.
              </p>
            </section>
          ) : null}

          {/* JK: Seccion de visualizacion unificada (graficos o tabla). */}
          <section className="space-y-4">
            {viewMode === 'charts' ? (
              <div className={`grid grid-cols-1 gap-4 ${(resolvedModuleType === 'membresias' || resolvedModuleType === 'barberos') ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`}>
                {moduleDashboard.charts.map((chart) => (
                  chart.variant === 'daily_trend_bars' ? (
                    <DailyTrendChartCard
                      key={chart.key}
                      title={chart.title}
                      subtitle={chart.subtitle}
                      rows={chart.rows}
                      formatValue={chart.formatValue}
                      valueKey={chart.valueKey}
                      chartWindowDays={chart.chartWindowDays}
                      onChartWindowChange={chart.onChartWindowChange}
                      independentHint={chart.independentHint}
                      loading={chart.loading}
                      valueFormatterInsideBar={chart.valueFormatterInsideBar}
                      emptyMessage={chart.emptyMessage}
                    />
                  ) : chart.variant === 'daily_trend_line' ? (
                    <LineTrendChartCard
                      key={chart.key}
                      title={chart.title}
                      subtitle={chart.subtitle}
                      rows={chart.rows}
                      valueKey={chart.valueKey}
                      labelKey={chart.labelKey}
                      formatValue={chart.formatValue}
                      independentHint={chart.independentHint}
                      loading={chart.loading}
                      emptyMessage={chart.emptyMessage}
                    />
                  ) : chart.variant === 'insight_metric' ? (
                    <InsightMetricCard
                      key={chart.key}
                      title={chart.title}
                      subtitle={chart.subtitle}
                      value={chart.value}
                      valueLabel={chart.valueLabel}
                      secondaryValue={chart.secondaryValue}
                      secondaryLabel={chart.secondaryLabel}
                      independentHint={chart.independentHint}
                      loading={chart.loading}
                      hasData={chart.hasData}
                      emptyMessage={chart.emptyMessage}
                    />
                  ) : (
                    <ChartCard
                      key={chart.key}
                      title={chart.title}
                      subtitle={chart.subtitle}
                      rows={chart.rows}
                      limit={chart.limit}
                      valueKey={chart.valueKey}
                      labelKey={chart.labelKey}
                      formatValue={chart.formatValue}
                      primaryValue={chart.primaryValue}
                      primaryValueLabel={chart.primaryValueLabel}
                      chartWindowDays={chart.chartWindowDays}
                      onChartWindowChange={chart.onChartWindowChange}
                      independentHint={chart.independentHint}
                      loading={chart.loading}
                      showValueInsideBar={chart.showValueInsideBar}
                      insideValueFormatter={chart.insideValueFormatter}
                      emptyMessage={chart.emptyMessage}
                    />
                  )
                ))}
              </div>
            ) : (
              <DataTableSection
                title={moduleDashboard.table.title}
                rows={moduleDashboard.table.rows}
                columns={moduleDashboard.table.columns}
              />
            )}
          </section>

          {resolvedModuleType === 'barberos' ? (
            <section className="space-y-3">
              {!moduleDashboard?.barbersAnalysis?.show ? (
                <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-4">
                  {/* JK: Estado inicial del submodulo Barberos sin analitica filtrada. */}
                  <p className="text-sm font-medium text-[var(--mf-text)]">
                    {moduleDashboard?.barbersAnalysis?.prompt || 'Aplique filtros para poder mostrar datos por cada barbero'}
                  </p>
                </article>
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {moduleDashboard.barbersAnalysis.charts.map((chart) => (
                    <ChartCard
                      key={chart.key}
                      title={chart.title}
                      subtitle={chart.subtitle}
                      rows={chart.rows}
                      limit={chart.limit}
                      valueKey={chart.valueKey}
                      labelKey={chart.labelKey}
                      formatValue={chart.formatValue}
                      primaryValue={chart.primaryValue}
                      primaryValueLabel={chart.primaryValueLabel}
                      chartWindowDays={chart.chartWindowDays}
                      onChartWindowChange={chart.onChartWindowChange}
                      independentHint={chart.independentHint}
                      loading={chart.loading}
                      showValueInsideBar={chart.showValueInsideBar}
                      insideValueFormatter={chart.insideValueFormatter}
                      emptyMessage={chart.emptyMessage}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {moduleDashboard.unavailableKpis.length > 0 ? (
            <section className="mf-premium-card p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-[var(--mf-accent)]" />
                <p className="text-sm font-semibold text-[var(--mf-text)]">KPIs no disponibles en base actual</p>
              </div>
              <div className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)]">
                {moduleDashboard.unavailableKpis.map((message) => (
                  <p key={message} className="rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2">
                    {message}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

        </>
      ) : null}

      {!loadingDashboard && !snapshot && !loadError ? (
        <EmptyState
          icon={BarChart3}
          title="Sin datos de reporte"
          description="Configura filtros y presiona Consultar para construir el dashboard."
          actionLabel="Consultar"
          onAction={() => void fetchDashboard()}
        />
      ) : null}

      <ReportesCustomReportModal
        open={customReportOpen}
        onOpenChange={setCustomReportOpen}
        defaultModuleType={resolvedModuleType}
        onRequestSnapshot={fetchCustomReportSnapshot}
      />

      {useHeaderActionsLayout ? (
        <Dialog open={filtersOpen} onOpenChange={handleFiltersDialogOpenChange}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Filtros de {moduleMeta.label}</DialogTitle>
              <DialogDescription className="sr-only">
                Ajusta el rango de fechas y filtros disponibles para consultar los reportes del submódulo seleccionado.
              </DialogDescription>
            </DialogHeader>
            {/* JK: Modal de filtros para el header unificado entre submodulos clave. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="mf-label">Fecha desde</Label>
                <Input
                  type="date"
                  className="mf-input mt-1"
                  value={modalFilters?.fecha_desde || ''}
                  onChange={(event) => handleModalFilterChange('fecha_desde', event.target.value)}
                />
              </div>
              <div>
                <Label className="mf-label">Fecha hasta</Label>
                <Input
                  type="date"
                  className="mf-input mt-1"
                  value={modalFilters?.fecha_hasta || ''}
                  onChange={(event) => handleModalFilterChange('fecha_hasta', event.target.value)}
                />
              </div>
              {showBarberoFilter ? (
                <div className="sm:col-span-2">
                  <Label className="mf-label">Barbero</Label>
                  <select
                    className="mf-select mt-1"
                    value={modalFilters?.id_barbero || ''}
                    onChange={(event) => handleModalFilterChange('id_barbero', event.target.value)}
                  >
                    <option value="">Todos</option>
                    {barberoOptions.map((barbero) => (
                      <option key={barbero.id_empleado} value={barbero.id_empleado}>
                        {barbero.nombre_barbero}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {supportsGrouping ? (
                <div className="sm:col-span-2">
                  <Label className="mf-label">Agrupacion</Label>
                  <select
                    className="mf-select mt-1"
                    value={grouping}
                    onChange={(event) => setGrouping(event.target.value)}
                  >
                    <option value="diario">Diario</option>
                    <option value="semanal">Semanal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
              ) : null}
            </div>
            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => handleFiltersDialogOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="button" className="gap-2" onClick={() => void handleApplyFilters()} disabled={loadingDashboard}>
                {loadingDashboard ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Aplicar filtros
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
