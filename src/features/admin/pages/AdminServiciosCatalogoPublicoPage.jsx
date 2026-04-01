import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Package, Search, Scissors, Sparkles } from 'lucide-react';
import { Label } from '../../../components/ui/label.jsx';
import { Input } from '../../../components/ui/input.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { getPublicCatalog, listPublicCatalogBranches, listPublicCatalogPlans } from '../../public/lib/catalogApi.js';
import { subscribeCatalogSync } from '../../../lib/catalogSync.js';

function extractMessage(error) {
  return error?.data?.error?.message || error?.message || 'Error desconocido.';
}

function sortByVisualOrder(items = [], nameKey) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const orderA = Number(a?.orden_visual ?? 100);
    const orderB = Number(b?.orden_visual ?? 100);
    if (orderA !== orderB) return orderA - orderB;
    return String(a?.[nameKey] || '').localeCompare(String(b?.[nameKey] || ''), 'es');
  });
}

function PublicCard({ icon, title, subtitle, chips = [] }) {
  return (
    <article className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_85%,transparent)] text-[var(--mf-accent)]">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--mf-text)]">{title}</p>
            {subtitle ? <p className="truncate text-xs text-[var(--mf-text-2)]">{subtitle}</p> : null}
          </div>
        </div>
      </div>
      {chips.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span key={`${chip.label}:${chip.value}`} className="mf-badge mf-badge-muted">
              {chip.label}: {chip.value}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export default function AdminServiciosCatalogoPublicoPage() {
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [publicServices, setPublicServices] = useState([]);
  const [publicPackages, setPublicPackages] = useState([]);
  const [publicPlans, setPublicPlans] = useState([]);

  const loadData = useCallback(async (selectedBranchId = '', options = {}) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    setErrorMessage('');

    try {
      const [catalogResult, plansResult] = await Promise.all([
        getPublicCatalog({ id_sucursal: selectedBranchId || undefined }),
        listPublicCatalogPlans({ id_sucursal: selectedBranchId || undefined }),
      ]);

      setPublicServices(sortByVisualOrder(catalogResult?.services || [], 'nombre_servicio'));
      setPublicPackages(sortByVisualOrder(catalogResult?.packages || [], 'nombre_paquete'));
      setPublicPlans(sortByVisualOrder(plansResult?.plans || [], 'nombre_plan'));
    } catch (error) {
      setErrorMessage(extractMessage(error));
      setPublicServices([]);
      setPublicPackages([]);
      setPublicPlans([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await listPublicCatalogBranches();
        if (!mounted) return;
        const nextBranches = Array.isArray(response?.branches) ? response.branches : [];
        setBranches(nextBranches);
        const preferredBranchId = nextBranches.length === 1 ? nextBranches[0].id_sucursal : '';
        setBranchId(preferredBranchId);
        await loadData(preferredBranchId);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(extractMessage(error));
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [loadData]);

  useEffect(() => {
    const unsubscribe = subscribeCatalogSync(() => {
      void loadData(branchId, { silent: true });
    });
    return unsubscribe;
  }, [branchId, loadData]);

  const normalizedSearch = String(search || '').trim().toLowerCase();
  const filteredServices = useMemo(() => {
    if (!normalizedSearch) return publicServices;
    return publicServices.filter((row) => `${row?.nombre_servicio || ''} ${row?.descripcion || ''}`.toLowerCase().includes(normalizedSearch));
  }, [publicServices, normalizedSearch]);
  const filteredAgendableServices = useMemo(
    () => filteredServices.filter((row) => row?.servicio_informativo !== true),
    [filteredServices]
  );
  const filteredInformativeServices = useMemo(
    () => filteredServices.filter((row) => row?.servicio_informativo === true),
    [filteredServices]
  );

  const filteredPackages = useMemo(() => {
    if (!normalizedSearch) return publicPackages;
    return publicPackages.filter((row) => `${row?.nombre_paquete || ''} ${row?.descripcion || ''}`.toLowerCase().includes(normalizedSearch));
  }, [publicPackages, normalizedSearch]);

  const filteredPlans = useMemo(() => {
    if (!normalizedSearch) return publicPlans;
    return publicPlans.filter((row) => `${row?.nombre_plan || ''} ${row?.descripcion || ''}`.toLowerCase().includes(normalizedSearch));
  }, [publicPlans, normalizedSearch]);

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Servicios - Catálogo público</p>
          <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Catálogo público</h1>
          <p className="text-sm text-[var(--mf-text-2)]">Vista operativa del catálogo publicado para clientes externos por sucursal.</p>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,280px)_minmax(0,420px)] lg:items-end">
          <div>
            <Label className="mf-label">Sucursal</Label>
            <select
              className="mf-select mt-1"
              value={branchId}
              onChange={(event) => {
                const nextBranchId = String(event.target.value || '');
                setBranchId(nextBranchId);
                void loadData(nextBranchId);
              }}
            >
              <option value="">Todas</option>
              {branches.map((branch) => (
                <option key={branch.id_sucursal} value={branch.id_sucursal}>
                  {branch.nombre_sucursal}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="mf-label">Búsqueda rápida</Label>
            <div className="relative mt-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre o descripción..."
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </header>

      {errorMessage ? <ErrorBanner message={errorMessage} onRetry={() => void loadData(branchId)} /> : null}
      {loading ? <LoadingSpinner /> : null}

      {!loading && !errorMessage && filteredAgendableServices.length === 0 && filteredInformativeServices.length === 0 && filteredPackages.length === 0 && filteredPlans.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Sin elementos publicados"
          description="No hay servicios, paquetes o planes visibles con los filtros actuales."
        />
      ) : null}

      {!loading && !errorMessage && filteredAgendableServices.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Servicios agendables</h2>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {filteredAgendableServices.slice(0, 50).map((row) => (
              <PublicCard
                key={row.id_servicio}
                icon={<Scissors size={14} />}
                title={row.nombre_servicio}
                subtitle={row.descripcion || 'Sin descripción'}
                chips={[
                  { label: 'Orden', value: Number(row.orden_visual ?? 100) },
                  { label: 'Duración', value: `${Number(row.duracion_min ?? 0)} min` },
                  { label: 'Precio', value: `L ${Number(row.precio_hnl ?? 0).toFixed(2)}` },
                ]}
              />
            ))}
          </div>
        </section>
      ) : null}
      {!loading && !errorMessage && filteredInformativeServices.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Servicios informativos</h2>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {filteredInformativeServices.slice(0, 50).map((row) => (
              <PublicCard
                key={row.id_servicio}
                icon={<Scissors size={14} />}
                title={row.nombre_servicio}
                subtitle={row.descripcion || 'Sin descripción'}
                chips={[
                  { label: 'Tipo', value: 'Informativo' },
                  { label: 'Orden', value: Number(row.orden_visual ?? 100) },
                  { label: 'Precio', value: `L ${Number(row.precio_hnl ?? 0).toFixed(2)}` },
                ]}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !errorMessage && filteredPackages.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Paquetes</h2>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {filteredPackages.slice(0, 50).map((row) => (
              <PublicCard
                key={`${row.id_paquete}:${row.id_sucursal || 'all'}`}
                icon={<Package size={14} />}
                title={row.nombre_paquete}
                subtitle={row.descripcion || 'Sin descripción'}
                chips={[
                  { label: 'Orden', value: Number(row.orden_visual ?? 100) },
                  { label: 'Items', value: Array.isArray(row?.items) ? row.items.length : 0 },
                  { label: 'Precio', value: `L ${Number(row.precio_hnl ?? 0).toFixed(2)}` },
                ]}
              />
            ))}
          </div>
        </section>
      ) : null}

      {!loading && !errorMessage && filteredPlans.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">Planes</h2>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {filteredPlans.slice(0, 50).map((row) => (
              <PublicCard
                key={`${row.id_plan}:${row.id_sucursal || 'all'}`}
                icon={<Sparkles size={14} />}
                title={row.nombre_plan}
                subtitle={row.descripcion || 'Sin descripción'}
                chips={[
                  { label: 'Orden', value: Number(row.orden_visual ?? 100) },
                  { label: 'Periodo', value: row.periodo_membresia_codigo || 'mensual' },
                  { label: 'Precio', value: `L ${Number(row.precio_hnl ?? 0).toFixed(2)}` },
                ]}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
