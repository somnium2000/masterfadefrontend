import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, Megaphone, Package, Scissors } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  getPublicCatalog,
  listPublicCatalogBranches,
  listPublicCatalogPromotions,
} from '../../public/lib/catalogApi.js';
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

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">
        <Icon size={14} />
        <span>{title}</span>
      </div>
      <p className="mt-1 text-sm text-[var(--mf-text-2)]">{subtitle}</p>
    </div>
  );
}

export default function ClienteCatalogoPage() {
  const navigate = useNavigate();
  const { error: notifyError } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [promotions, setPromotions] = useState([]);

  const fetchCatalogData = useCallback(async (selectedBranchId) => {
    const [catalogPayload, promotionsPayload] = await Promise.all([
      getPublicCatalog({ id_sucursal: selectedBranchId || undefined }),
      listPublicCatalogPromotions({ id_sucursal: selectedBranchId || undefined }),
    ]);

    setServices(Array.isArray(catalogPayload?.services) ? catalogPayload.services : []);
    setPackages(Array.isArray(catalogPayload?.packages) ? catalogPayload.packages : []);
    setPromotions(Array.isArray(promotionsPayload?.promotions) ? promotionsPayload.promotions : []);
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

      await fetchCatalogData(resolvedBranchId);
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo cargar el catalogo de cliente.');
    } finally {
      setLoading(false);
    }
  }, [fetchCatalogData, notifyError]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function handleBranchChange(event) {
    const nextBranchId = String(event.target.value || '').trim();
    setBranchId(nextBranchId);
    setStoredClienteCatalogBranchId(nextBranchId);

    setLoading(true);
    try {
      await fetchCatalogData(nextBranchId);
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo actualizar el catalogo para la sucursal.');
    } finally {
      setLoading(false);
    }
  }

  const agendables = useMemo(() => services.filter((item) => !item?.servicio_informativo), [services]);

  return (
    <div className="space-y-5">
      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Catalogo premium</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">Servicios y promociones</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate('/agendar')}
            className="mf-accent-gradient inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            <CalendarDays size={15} />
            Nueva cita
          </button>
        </div>

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
          <div className="mf-skeleton h-24 rounded-2xl" />
          <div className="mf-skeleton h-24 rounded-2xl" />
          <div className="mf-skeleton h-24 rounded-2xl" />
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <SectionTitle icon={Scissors} title="Servicios" subtitle="Selecciona tu experiencia agendable." />
            {agendables.length ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {agendables.map((item) => (
                  <article key={item.id_servicio} className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--mf-text)]">{item.nombre_servicio}</p>
                      <span className="text-xs font-semibold text-[var(--mf-accent)]">{formatPrice(item.precio_hnl)}</span>
                    </div>
                    {item.descripcion ? <p className="mt-2 text-xs text-[var(--mf-text-2)]">{item.descripcion}</p> : null}
                    <p className="mt-2 text-xs text-[var(--mf-text-2)]">Duracion: {item.duracion_min} min</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
                No hay servicios publicados para esta sucursal.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <SectionTitle icon={Package} title="Paquetes" subtitle="Combos disponibles para clientes autenticados." />
            {packages.length ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {packages.map((item) => (
                  <article key={item.id_paquete} className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--mf-text)]">{item.nombre_paquete}</p>
                      <span className="text-xs font-semibold text-[var(--mf-accent)]">{formatPrice(item.precio_hnl)}</span>
                    </div>
                    {item.descripcion ? <p className="mt-2 text-xs text-[var(--mf-text-2)]">{item.descripcion}</p> : null}
                    {Array.isArray(item.items) && item.items.length ? (
                      <ul className="mt-2 space-y-1 text-xs text-[var(--mf-text-2)]">
                        {item.items.map((detail) => (
                          <li key={`${item.id_paquete}:${detail.id_servicio}`}>• {detail.nombre_servicio} x{detail.cantidad}</li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
                No hay paquetes activos para esta sucursal.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <SectionTitle icon={Megaphone} title="Promociones" subtitle="Beneficios informativos y promociones vigentes." />
            {promotions.length ? (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {promotions.map((promo) => (
                  <article key={promo.id_promocion} className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <p className="text-sm font-semibold text-[var(--mf-text)]">{promo.titulo}</p>
                    {promo.subtitulo ? <p className="mt-1 text-xs text-[var(--mf-text-2)]">{promo.subtitulo}</p> : null}
                    {Array.isArray(promo.parrafos) && promo.parrafos[0] ? (
                      <p className="mt-2 text-xs text-[var(--mf-text-2)]">{promo.parrafos[0]}</p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
                No hay promociones publicadas para esta sucursal.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}


