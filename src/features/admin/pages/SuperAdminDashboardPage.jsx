import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CircleDollarSign, Gem, RefreshCw, RotateCcw, SlidersHorizontal, UsersRound } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { getSuperAdminDashboardSummary } from '../lib/superAdminDashboardApi.js';

const HNL = new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', minimumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat('es-HN');
const PRESETS = [['today', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['custom', 'Personalizado']];

function todayInHonduras() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function addDays(dateOnly, days) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function rangeForPreset(preset) {
  const fecha_hasta = todayInHonduras();
  const days = preset === '30' ? 30 : preset === '7' ? 7 : 1;
  return { fecha_desde: addDays(fecha_hasta, -(days - 1)), fecha_hasta };
}

function rangesMatch(left, right) {
  return Boolean(left && right && left.fecha_desde === right.fecha_desde && left.fecha_hasta === right.fecha_hasta);
}

function validateRange(range) {
  if (!range.fecha_desde || !range.fecha_hasta) return 'Selecciona ambas fechas para consultar el período.';
  if (range.fecha_desde > range.fecha_hasta) return 'La fecha desde no puede ser posterior a la fecha hasta.';
  return '';
}

function periodLabel(range) {
  if (!range?.fecha_desde || !range?.fecha_hasta) return 'Período sin definir';
  return range.fecha_desde === range.fecha_hasta ? range.fecha_desde : `${range.fecha_desde} al ${range.fecha_hasta}`;
}

function bucketLabel(value, grouping) {
  const raw = String(value || '');
  const [year, month, day] = raw.slice(0, 10).split('-');
  if (grouping === 'hour') return `${raw.slice(11, 16)} h`;
  if (grouping === 'month') return `${month}/${year}`;
  if (grouping === 'year') return year;
  if (grouping === 'week') return `Sem. ${day}/${month}`;
  return `${day}/${month}`;
}

function useCompactChart() {
  const query = '(max-width: 639px)';
  const [compact, setCompact] = useState(() => (typeof window !== 'undefined'
    ? (window.matchMedia?.(query).matches ?? window.innerWidth < 640)
    : false));
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const update = (event) => setCompact(event.matches);
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);
  return compact;
}

function MetricCard({ icon: Icon, label, value, detail, secondary, loading }) {
  return (
    <article className="mf-premium-card min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--mf-accent)]/12 text-[var(--mf-accent)]"><Icon aria-hidden="true" size={22} /></div>
      <p className="text-sm font-medium text-[var(--mf-text-2)]">{label}</p>
      {loading ? <div className="mt-2 h-9 w-28 animate-pulse rounded-lg bg-[var(--mf-btn-bg)]" aria-label={`Cargando ${label}`} /> : <p className="mf-font-display mt-1 break-words text-2xl font-semibold text-[var(--mf-text)] sm:text-3xl">{value}</p>}
      {secondary && !loading ? <p className="mt-2 text-sm font-semibold text-[var(--mf-accent)]">{secondary}</p> : null}
      <p className="mt-2 text-xs leading-relaxed text-[var(--mf-text-3)]">{detail}</p>
    </article>
  );
}

function ChartShell({ title, subtitle, children, loading, empty }) {
  return (
    <article className="mf-premium-card min-w-0 overflow-hidden p-4 sm:p-5">
      <h2 className="mf-font-display text-xl text-[var(--mf-text)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--mf-text-2)]">{subtitle}</p>
      {loading ? <div className="mt-5 h-64 animate-pulse rounded-2xl bg-[var(--mf-btn-bg)]" aria-label={`Cargando ${title}`} /> : null}
      {!loading && empty ? <div className="mt-5 flex h-64 items-center justify-center rounded-2xl border border-dashed border-[var(--mf-nav-border)] px-4 text-center text-sm text-[var(--mf-text-2)]">Sin datos para el período seleccionado.</div> : null}
      {!loading && !empty ? children : null}
    </article>
  );
}

function IncomeChart({ rows, grouping, range, loading }) {
  const compact = useCompactChart();
  const values = rows.map((item) => Number(item.ingresos_hnl || 0));
  const maxValue = Math.max(...values, 1);
  const width = compact ? 340 : 720; const height = compact ? 230 : 250;
  const left = compact ? 38 : 46; const right = compact ? 10 : 18; const top = 22; const bottom = compact ? 38 : 42;
  const chartWidth = width - left - right; const chartHeight = height - top - bottom;
  const points = rows.map((item, index) => ({
    ...item,
    x: left + (rows.length === 1 ? chartWidth / 2 : (index / (rows.length - 1)) * chartWidth),
    y: top + chartHeight - (Number(item.ingresos_hnl || 0) / maxValue) * chartHeight,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = points.length ? `${left},${top + chartHeight} ${line} ${points.at(-1).x},${top + chartHeight}` : '';
  const labelStep = Math.max(1, Math.ceil(rows.length / (compact ? 4 : 6)));
  return (
    <ChartShell title="Evolución de ingresos por citas" subtitle={`${periodLabel(range)} · Total ${HNL.format(values.reduce((sum, value) => sum + value, 0))}`} loading={loading} empty={!rows.length}>
      <div className="mt-4 w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto max-w-full" role="img" aria-label="Evolución temporal de ingresos confirmados por citas">
          {[0, 0.5, 1].map((ratio) => <line key={ratio} x1={left} x2={width - right} y1={top + chartHeight * ratio} y2={top + chartHeight * ratio} stroke="var(--mf-nav-border)" />)}
          <polygon points={area} fill="var(--mf-accent)" opacity="0.12" /><polyline points={line} fill="none" stroke="var(--mf-accent)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((point, index) => <g key={point.periodo}><circle cx={point.x} cy={point.y} r={compact ? 4 : 5} fill="var(--mf-card)" stroke="var(--mf-accent)" strokeWidth="3"><title>{`${bucketLabel(point.periodo, grouping)}: ${HNL.format(point.ingresos_hnl)}`}</title></circle>{index % labelStep === 0 || index === points.length - 1 ? <text x={point.x} y={height - 10} textAnchor="middle" fill="var(--mf-text-2)" fontSize={compact ? 10 : 12}>{bucketLabel(point.periodo, grouping)}</text> : null}</g>)}
          <text x="2" y={top + 4} fill="var(--mf-text-2)" fontSize={compact ? 9 : 12}>{HNL.format(maxValue)}</text><text x={compact ? 12 : 20} y={top + chartHeight + 4} fill="var(--mf-text-2)" fontSize={compact ? 9 : 12}>L 0</text>
        </svg>
      </div>
      <ul className="sr-only">{rows.map((item) => <li key={item.periodo}>{bucketLabel(item.periodo, grouping)}: {HNL.format(item.ingresos_hnl)}</li>)}</ul>
    </ChartShell>
  );
}

function ActivityChart({ rows, grouping, range, loading }) {
  const compact = useCompactChart();
  const maxValue = Math.max(...rows.flatMap((item) => [Number(item.planes_activados || 0), Number(item.masterpuntos_canjeados || 0)]), 1);
  const width = compact ? 340 : 720; const height = compact ? 230 : 250;
  const left = compact ? 26 : 36; const right = compact ? 8 : 18; const top = 20; const bottom = compact ? 38 : 44;
  const chartHeight = height - top - bottom; const groupWidth = (width - left - right) / Math.max(rows.length, 1);
  const barWidth = Math.min(compact ? 10 : 24, Math.max(compact ? 2 : 5, groupWidth * 0.3)); const labelStep = Math.max(1, Math.ceil(rows.length / (compact ? 4 : 6)));
  return (
    <ChartShell title="Activaciones y canjes" subtitle={`${periodLabel(range)} · Comparación temporal`} loading={loading} empty={!rows.length}>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--mf-text-2)]" aria-label="Leyenda"><span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-[var(--mf-accent)]" /> Planes activados</span><span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-cyan-500" /> Canjes MasterPuntos</span></div>
      <div className="mt-2 w-full overflow-hidden">
        <svg viewBox={`0 0 ${width} ${height}`} className="block h-auto max-w-full" role="img" aria-label="Comparación temporal de planes activados y canjes MasterPuntos">
          <line x1={left} x2={width - right} y1={top + chartHeight} y2={top + chartHeight} stroke="var(--mf-nav-border)" />
          {rows.map((item, index) => { const center = left + groupWidth * index + groupWidth / 2; const plans = Number(item.planes_activados || 0); const points = Number(item.masterpuntos_canjeados || 0); const plansHeight = (plans / maxValue) * chartHeight; const pointsHeight = (points / maxValue) * chartHeight; return <g key={item.periodo}><rect x={center - barWidth - 1} y={top + chartHeight - plansHeight} width={barWidth} height={plansHeight} rx="2" fill="var(--mf-accent)"><title>{`${bucketLabel(item.periodo, grouping)}: ${plans} planes activados`}</title></rect><rect x={center + 1} y={top + chartHeight - pointsHeight} width={barWidth} height={pointsHeight} rx="2" fill="#06b6d4"><title>{`${bucketLabel(item.periodo, grouping)}: ${points} canjes MasterPuntos`}</title></rect>{index % labelStep === 0 || index === rows.length - 1 ? <text x={center} y={height - 10} textAnchor="middle" fill="var(--mf-text-2)" fontSize={compact ? 10 : 12}>{bucketLabel(item.periodo, grouping)}</text> : null}</g>; })}
          <text x="2" y={top + 4} fill="var(--mf-text-2)" fontSize={compact ? 9 : 12}>{NUMBER.format(maxValue)}</text>
        </svg>
      </div>
      <ul className="sr-only">{rows.map((item) => <li key={item.periodo}>{bucketLabel(item.periodo, grouping)}: {item.planes_activados} planes activados y {item.masterpuntos_canjeados} canjes</li>)}</ul>
    </ChartShell>
  );
}

export default function SuperAdminDashboardPage() {
  const [summary, setSummary] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [failedRange, setFailedRange] = useState(null); const [preset, setPreset] = useState('today'); const [range, setRange] = useState(() => rangeForPreset('today'));
  const [filtersOpen, setFiltersOpen] = useState(false); const requestRef = useRef(0);
  const loadSummary = useCallback(async (nextRange) => { const requestId = requestRef.current + 1; requestRef.current = requestId; setLoading(true); setError(''); setFailedRange(null); try { const response = await getSuperAdminDashboardSummary(nextRange); if (requestRef.current !== requestId) return; setSummary(response.data); } catch (loadError) { if (requestRef.current !== requestId) return; setError(loadError?.message || 'No fue posible cargar el resumen global.'); setFailedRange({ ...nextRange }); } finally { if (requestRef.current === requestId) setLoading(false); } }, []);
  useEffect(() => { if (validateRange(range)) { requestRef.current += 1; setLoading(false); return undefined; } void loadSummary(range); return () => { requestRef.current += 1; }; }, [loadSummary, range]);
  function selectPreset(nextPreset) { setPreset(nextPreset); if (nextPreset !== 'custom') setRange(rangeForPreset(nextPreset)); }
  function clearFilters() { setPreset('today'); setRange(rangeForPreset('today')); }
  const rangeError = validateRange(range); const summaryMatchesRange = rangesMatch(summary?.periodo, range); const failedCurrentRange = rangesMatch(failedRange, range);
  const periodLoading = !rangeError && !summaryMatchesRange && !failedCurrentRange; const keepingLastValidReading = Boolean(error && failedCurrentRange && summaryMatchesRange); const currentSummary = summaryMatchesRange ? summary : null;
  const incomeRows = useMemo(() => currentSummary?.ingresos_serie || [], [currentSummary]); const activityRows = useMemo(() => currentSummary?.actividad_serie || [], [currentSummary]);
  const cards = [
    { icon: CalendarDays, label: 'Citas confirmadas y atendidas', value: summary ? NUMBER.format(summary.total_citas) : '—', detail: 'Total histórico de citas confirmadas, en salón, en atención o completadas.', loading: loading && !summary },
    { icon: CircleDollarSign, label: 'Ingresos por citas (HNL)', value: summary ? HNL.format(summary.ingresos_citas_hnl_total) : '—', secondary: currentSummary ? `Período: ${HNL.format(currentSummary.ingresos_citas_hnl_periodo)}` : null, detail: 'Cobros confirmados asociados exclusivamente a citas.', loading: loading && !summary },
    { icon: UsersRound, label: 'Planes activados', value: currentSummary ? NUMBER.format(currentSummary.planes_activados) : '—', detail: 'Activaciones registradas en el período seleccionado.', loading: periodLoading },
    { icon: Gem, label: 'MasterPuntos canjeados', value: currentSummary ? NUMBER.format(currentSummary.masterpuntos_canjeados) : '—', detail: 'Transacciones de canje únicas en el período.', loading: periodLoading },
  ];
  return <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
    <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5"><div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between"><div className="space-y-1"><p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Inicio - Dashboard</p><h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Panel Ejecutivo</h1><p className="text-sm text-[var(--mf-text-2)]">Resumen global de actividad e ingresos de MasterFade.</p></div><div className="flex w-full flex-col gap-2 xl:w-auto"><p className="text-sm text-[var(--mf-text-2)] xl:text-right">Período: {periodLabel(range)}</p><div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end"><Button type="button" variant="outline" className="gap-2" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}><SlidersHorizontal size={15} /> Filtros</Button><Button type="button" variant="ghost" className="gap-2" onClick={clearFilters} disabled={preset === 'today' && rangesMatch(range, rangeForPreset('today'))}><RotateCcw size={14} /> Limpiar</Button><Button type="button" className="gap-2" onClick={() => loadSummary(range)} disabled={loading || Boolean(rangeError)}><RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : ''} /> Actualizar</Button></div></div></div></header>
    {filtersOpen ? <section className="mf-premium-card p-4" aria-label="Período de indicadores"><div className="flex flex-wrap gap-2">{PRESETS.map(([key, label]) => <Button key={key} size="sm" className="min-h-11" variant={preset === key ? 'default' : 'outline'} onClick={() => selectPreset(key)}>{label}</Button>)}</div>{preset === 'custom' ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm text-[var(--mf-text-2)]">Desde<input type="date" value={range.fecha_desde} max={range.fecha_hasta} onChange={(event) => setRange((current) => ({ ...current, fecha_desde: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 text-[var(--mf-text)]" /></label><label className="text-sm text-[var(--mf-text-2)]">Hasta<input type="date" value={range.fecha_hasta} min={range.fecha_desde} onChange={(event) => setRange((current) => ({ ...current, fecha_hasta: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 text-[var(--mf-text)]" /></label></div> : null}{rangeError ? <p role="alert" className="mt-3 text-sm text-red-500">{rangeError}</p> : null}</section> : null}
    {error && failedCurrentRange ? <div role="alert" className="mf-premium-card border border-red-500/30 p-4 text-sm text-red-500"><p>{error}</p>{keepingLastValidReading ? <p className="mt-1 text-[var(--mf-text-2)]">Mostrando la última lectura válida de este período.</p> : null}<Button className="mt-3" size="sm" variant="outline" onClick={() => loadSummary(range)}>Reintentar</Button></div> : null}
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores ejecutivos">{cards.map((card) => <MetricCard key={card.label} {...card} />)}</section>
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2" aria-label="Gráficas ejecutivas"><IncomeChart rows={incomeRows} grouping={currentSummary?.agrupacion} range={range} loading={periodLoading} /><ActivityChart rows={activityRows} grouping={currentSummary?.agrupacion} range={range} loading={periodLoading} /></section>
    {summary?.actualizado_at && summaryMatchesRange && (!error || keepingLastValidReading) ? <p className="text-right text-xs text-[var(--mf-text-3)]">Actualizado: {new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium', timeStyle: 'short', timeZone: summary.timezone }).format(new Date(summary.actualizado_at))}</p> : null}
  </div>;
}
