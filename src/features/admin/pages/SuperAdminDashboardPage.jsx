import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, CircleDollarSign, Gem, RefreshCw, UsersRound } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { getSuperAdminDashboardSummary } from '../lib/superAdminDashboardApi.js';

const HNL = new Intl.NumberFormat('es-HN', { style: 'currency', currency: 'HNL', minimumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat('es-HN');

function todayInHonduras() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function addDays(dateOnly, days) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function rangeForPreset(preset) {
  const fecha_hasta = todayInHonduras();
  const days = preset === '30' ? 30 : preset === '7' ? 7 : 1;
  return { fecha_desde: addDays(fecha_hasta, -(days - 1)), fecha_hasta };
}

function MetricCard({ icon: Icon, label, value, detail, loading }) {
  return (
    <article className="mf-premium-card min-w-0 p-4 sm:p-5">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--mf-accent)]/12 text-[var(--mf-accent)]">
        <Icon aria-hidden="true" size={22} />
      </div>
      <p className="text-sm font-medium text-[var(--mf-text-2)]">{label}</p>
      {loading ? (
        <div className="mt-2 h-9 w-28 animate-pulse rounded-lg bg-[var(--mf-btn-bg)]" aria-label={`Cargando ${label}`} />
      ) : (
        <p className="mf-font-display mt-1 break-words text-2xl font-semibold text-[var(--mf-text)] sm:text-3xl">{value}</p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-[var(--mf-text-3)]">{detail}</p>
    </article>
  );
}

export default function SuperAdminDashboardPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(() => rangeForPreset('today'));
  const requestRef = useRef(0);

  const loadSummary = useCallback(async (nextRange = range) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const response = await getSuperAdminDashboardSummary(nextRange);
      if (requestRef.current !== requestId) return;
      setSummary(response.data);
    } catch (loadError) {
      if (requestRef.current !== requestId) return;
      setError(loadError?.message || 'No fue posible cargar el resumen global.');
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (!range.fecha_desde || !range.fecha_hasta || range.fecha_desde > range.fecha_hasta) {
      setLoading(false);
      return undefined;
    }
    void loadSummary(range);
    return () => { requestRef.current += 1; };
  }, [loadSummary, range]);

  function selectPreset(nextPreset) {
    setPreset(nextPreset);
    if (nextPreset !== 'custom') setRange(rangeForPreset(nextPreset));
  }

  const cards = [
    { icon: CalendarDays, label: 'Citas totales', value: summary ? NUMBER.format(summary.total_citas) : '—', detail: 'Citas registradas en todo el historial.' },
    { icon: CircleDollarSign, label: 'Valor de citas', value: summary ? HNL.format(summary.valor_citas_hnl) : '—', detail: 'Valor agendado elegible; no representa ingresos cobrados.' },
    { icon: UsersRound, label: 'Planes activados', value: summary ? NUMBER.format(summary.planes_activados) : '—', detail: 'Activaciones registradas en el período seleccionado.' },
    { icon: Gem, label: 'MasterPuntos canjeados', value: summary ? NUMBER.format(summary.masterpuntos_canjeados) : '—', detail: 'Transacciones de canje únicas en el período.' },
  ];

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Superadministración</p>
          <h1 className="mf-font-display mt-1 text-3xl font-semibold text-[var(--mf-text)]">Panel ejecutivo</h1>
          <p className="mt-1 text-sm text-[var(--mf-text-2)]">Resumen global de MasterFade</p>
        </div>
        <Button variant="outline" onClick={() => loadSummary(range)} disabled={loading}>
          <RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : ''} /> Actualizar
        </Button>
      </header>

      <section className="mf-premium-card p-4" aria-label="Período de indicadores">
        <div className="flex flex-wrap gap-2">
          {[['today', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['custom', 'Personalizado']].map(([key, label]) => (
            <Button key={key} size="sm" className="min-h-11" variant={preset === key ? 'default' : 'outline'} onClick={() => selectPreset(key)}>{label}</Button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-[var(--mf-text-2)]">Desde
              <input type="date" value={range.fecha_desde} max={range.fecha_hasta} onChange={(event) => setRange((current) => ({ ...current, fecha_desde: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 text-[var(--mf-text)]" />
            </label>
            <label className="text-sm text-[var(--mf-text-2)]">Hasta
              <input type="date" value={range.fecha_hasta} min={range.fecha_desde} onChange={(event) => setRange((current) => ({ ...current, fecha_hasta: event.target.value }))} className="mt-1 min-h-11 w-full rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 text-[var(--mf-text)]" />
            </label>
          </div>
        )}
      </section>

      {error && (
        <div role="alert" className="mf-premium-card border border-red-500/30 p-4 text-sm text-red-500">
          <p>{error}</p><Button className="mt-3" size="sm" variant="outline" onClick={() => loadSummary(range)}>Reintentar</Button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores ejecutivos">
        {cards.map((card) => <MetricCard key={card.label} {...card} loading={loading && !summary} />)}
      </section>

      {summary?.actualizado_at && !error && (
        <p className="text-right text-xs text-[var(--mf-text-3)]">Actualizado: {new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium', timeStyle: 'short', timeZone: summary.timezone }).format(new Date(summary.actualizado_at))}</p>
      )}
    </div>
  );
}
