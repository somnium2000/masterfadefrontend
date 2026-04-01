import { useCallback, useEffect, useState } from 'react';
import { Building2, Crown } from 'lucide-react';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { listPublicCatalogBranches, listPublicCatalogPlans } from '../../public/lib/catalogApi.js';
import {
  getStoredClienteCatalogBranchId,
  resolveValidClienteBranchId,
  setStoredClienteCatalogBranchId,
} from '../lib/clienteCatalogBranch.js';

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '-';
  return `L ${amount.toFixed(2)}`;
}

export default function ClientePlanesPage() {
  const { error: notifyError } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [plans, setPlans] = useState([]);

  const fetchPlans = useCallback(async (selectedBranchId) => {
    const plansPayload = await listPublicCatalogPlans({ id_sucursal: selectedBranchId || undefined });
    setPlans(Array.isArray(plansPayload?.plans) ? plansPayload.plans : []);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const branchPayload = await listPublicCatalogBranches();
      const nextBranches = Array.isArray(branchPayload?.branches) ? branchPayload.branches : [];
      setBranches(nextBranches);

      const preferredBranchId = getStoredClienteCatalogBranchId();
      const resolvedBranchId = resolveValidClienteBranchId(preferredBranchId, nextBranches);
      setBranchId(resolvedBranchId);
      setStoredClienteCatalogBranchId(resolvedBranchId);

      await fetchPlans(resolvedBranchId);
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo cargar el catalogo de planes.');
    } finally {
      setLoading(false);
    }
  }, [fetchPlans, notifyError]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function handleBranchChange(event) {
    const nextBranchId = String(event.target.value || '').trim();
    setBranchId(nextBranchId);
    setStoredClienteCatalogBranchId(nextBranchId);

    setLoading(true);
    try {
      await fetchPlans(nextBranchId);
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo actualizar los planes para la sucursal.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Planes premium</p>
        <h1 className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">Membresias disponibles</h1>
        <p className="mt-1 text-sm text-[var(--mf-text-2)]">Explora beneficios y elige el plan que se adapte a tu rutina.</p>

        <div className="mt-4 w-full max-w-sm">
          <label className="mf-label">Sucursal</label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" size={15} />
            <select className="mf-select pl-9" value={branchId} onChange={(event) => void handleBranchChange(event)}>
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => <div key={idx} className="mf-skeleton h-36 rounded-2xl" />)}
        </div>
      ) : plans.length ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {plans.map((plan) => (
            <article key={`${plan.id_plan}:${plan.id_sucursal || 'public'}`} className="mf-glass-surface rounded-[22px] border border-[var(--mf-nav-border)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Membresia</p>
                  <h2 className="mt-2 text-xl font-semibold text-[var(--mf-text)]">{plan.nombre_plan}</h2>
                </div>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
                  <Crown size={17} />
                </span>
              </div>

              {plan.descripcion ? <p className="mt-3 text-sm text-[var(--mf-text-2)]">{plan.descripcion}</p> : null}

              <p className="mt-3 text-lg font-semibold text-[var(--mf-text)]">{formatPrice(plan.precio_hnl)}</p>
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--mf-text-2)]">{plan.periodo_membresia_label || plan.periodo_membresia_codigo}</p>

              {Array.isArray(plan.beneficios) && plan.beneficios.length ? (
                <ul className="mt-3 space-y-1 text-xs text-[var(--mf-text-2)]">
                  {plan.beneficios.map((beneficio, idx) => (
                    <li key={`${plan.id_plan}:${idx}`}>• {beneficio.cantidad}x {beneficio.nombre}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
          No hay planes publicados para la sucursal seleccionada.
        </p>
      )}
    </div>
  );
}


