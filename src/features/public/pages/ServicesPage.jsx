import { motion } from 'framer-motion';
import {
  CalendarDays,
  Building2,
  CheckCircle2,
  Clock3,
  House,
  LogIn,
  Plus,
  Scissors,
  Sparkles,
  Tag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
  listPublicCatalogBranches,
  listPublicCatalogPackages,
  listPublicCatalogServices,
} from '../lib/catalogApi.js';
import { subscribeCatalogSync } from '../../../lib/catalogSync.js';

function formatPriceHnl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return `L ${amount.toFixed(2)}`;
}

function ServiceCard({ item, compact = false }) {
  const displayPrice = formatPriceHnl(item?.precio_hnl);
  return (
    <motion.article
      data-catalog-card="true"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="mf-glass-surface flex w-[85vw] shrink-0 snap-start flex-col justify-between rounded-[28px] p-5 sm:w-[68vw] lg:w-[calc((100%-2rem)/3)]"
    >
      <div className="flex items-start gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            {compact ? 'Informativo' : 'Servicio'}
          </p>
          <h3 className="mf-font-display mt-3 text-[28px] leading-[0.95] text-[var(--mf-text)]">
            {item.nombre_servicio}
          </h3>
        </div>
      </div>

      <div className="mt-auto pt-4">
        {item.descripcion ? (
          <p className="mb-4 text-sm leading-6 text-[var(--mf-text-2)]">{item.descripcion}</p>
        ) : null}

        {displayPrice ? (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--mf-nav-border)] px-3 py-2 text-xs uppercase tracking-[0.14em] text-[var(--mf-text)]">
            <Tag size={14} strokeWidth={1.8} />
            <span>{displayPrice}</span>
          </div>
        ) : null}

        {!compact ? (
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--mf-nav-border)] px-3 py-2 text-xs uppercase tracking-[0.14em] text-[var(--mf-text-2)]">
            <Clock3 size={14} strokeWidth={1.8} />
            <span>{item.duracion_min} min</span>
          </div>
        ) : null}
      </div>
    </motion.article>
  );
}

function PackageCard({ item }) {
  const details = Array.isArray(item.items) ? item.items : [];
  const displayPrice = formatPriceHnl(item?.precio_hnl);

  return (
    <motion.article
      data-catalog-card="true"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="mf-glass-surface flex w-[85vw] shrink-0 snap-start flex-col justify-between rounded-[28px] p-5 sm:w-[68vw] lg:w-[calc((100%-2rem)/3)]"
    >
      <div className="flex items-start gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            Paquete
          </p>
          <h3 className="mf-font-display mt-3 text-[28px] leading-[0.95] text-[var(--mf-text)]">
            {item.nombre_paquete}
          </h3>
        </div>
      </div>

      <div className="mt-auto pt-4">
        {item.descripcion ? (
          <p className="mb-4 text-sm leading-6 text-[var(--mf-text-2)]">{item.descripcion}</p>
        ) : null}

        {displayPrice ? (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--mf-nav-border)] px-3 py-2 text-xs uppercase tracking-[0.14em] text-[var(--mf-text)]">
            <Tag size={14} strokeWidth={1.8} />
            <span>{displayPrice}</span>
          </div>
        ) : null}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-text-2)]">
            Incluye
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--mf-text)]">
            {details.map((detail) => (
              <li key={`${item.id_paquete}-${detail.id_servicio}`} className="flex items-start gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--mf-accent)]" />
                <span>
                  {detail.nombre_servicio}
                  {detail.cantidad > 1 ? ` x${detail.cantidad}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </motion.article>
  );
}

function CatalogSection({ icon: Icon, title, eyebrow, items, emptyMessage, children }) {
  const scrollRef = useRef(null);
  // AM: Solo mostramos controles de carrusel cuando hay mas de 3 tarjetas.
  const showCarouselControls = items.length > 3;

  const handleScroll = (direction) => {
    if (!scrollRef.current) return;

    const track = scrollRef.current;
    const firstCard = track.querySelector('[data-catalog-card="true"]');
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '16') || 16;
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    // AM: En desktop avanza 3 tarjetas por clic; en móvil/tablet avanza 1 para mantener control fino.
    const cardsPerStep = isDesktop ? 3 : 1;
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : track.clientWidth;
    const step = (cardWidth + gap) * cardsPerStep;
    const scrollAmount = direction === 'left' ? -step : step;

    track.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
            <Icon size={18} strokeWidth={1.9} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">{eyebrow}</p>
            <h2 className="mf-font-display text-[26px] leading-[1.1] text-[var(--mf-text)] sm:text-[30px] sm:leading-none">{title}</h2>
          </div>
        </div>

        {showCarouselControls && (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => handleScroll('left')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
              aria-label="Desplazar a la izquierda"
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => handleScroll('right')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
              aria-label="Desplazar a la derecha"
            >
              <ChevronRight size={20} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="relative mt-5">
          {showCarouselControls ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] hidden w-14 bg-gradient-to-r from-[var(--mf-bg)]/85 via-[var(--mf-bg)]/35 to-transparent blur-[1px] lg:block" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] hidden w-14 bg-gradient-to-l from-[var(--mf-bg)]/85 via-[var(--mf-bg)]/35 to-transparent blur-[1px] lg:block" />
            </>
          ) : null}
          <div
            ref={scrollRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth [&::-webkit-scrollbar]:hidden"
          >
            {children}
          </div>
        </div>
      ) : (
        <div className="mf-glass-surface mt-5 rounded-[24px] p-5 text-sm leading-6 text-[var(--mf-text-2)]">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isMountedRef = useRef(true);
  const selectedBranchRef = useRef('');
  const [status, setStatus] = useState('loading');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const loadCatalog = useCallback(async ({ silent = false, branchId = selectedBranchRef.current } = {}) => {
    if (!silent) {
      setStatus('loading');
    }
    setErrorMessage('');

    try {
      const [servicesResult, packagesResult] = await Promise.allSettled([
        listPublicCatalogServices({ id_sucursal: branchId || undefined }),
        listPublicCatalogPackages({ id_sucursal: branchId || undefined }),
      ]);

      if (servicesResult.status !== 'fulfilled') {
        throw servicesResult.reason;
      }

      if (!isMountedRef.current) return;
      setServices(Array.isArray(servicesResult.value?.services) ? servicesResult.value.services : []);
      setPackages(
        packagesResult.status === 'fulfilled' && Array.isArray(packagesResult.value?.packages)
          ? packagesResult.value.packages
          : []
      );
      setStatus('success');
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorMessage(error?.data?.error?.message || error?.message || 'No se pudo cargar el catalogo.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    // AM: Carga sucursales activas y luego levanta el catalogo en el scope de sucursal seleccionado.
    queueMicrotask(() => {
      if (!isMountedRef.current) return;
      void (async () => {
        try {
          const branchResult = await listPublicCatalogBranches();
          if (!isMountedRef.current) return;

          const nextBranches = Array.isArray(branchResult?.branches)
            ? branchResult.branches.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
            : [];
          setBranches(nextBranches);

          const initialBranchId = nextBranches[0]?.id_sucursal || '';
          selectedBranchRef.current = initialBranchId;
          setSelectedBranchId(initialBranchId);

          await loadCatalog({ branchId: initialBranchId });
        } catch (error) {
          if (!isMountedRef.current) return;
          setErrorMessage(error?.data?.error?.message || error?.message || 'No se pudo cargar el catalogo.');
          setStatus('error');
        }
      })();
    });

    const unsubscribe = subscribeCatalogSync(() => {
      if (!isMountedRef.current) return;
      // AM: Refresco silencioso para reflejar cambios admin sin recargar toda la vista publica.
      void loadCatalog({ silent: true, branchId: selectedBranchRef.current });
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [loadCatalog]);

  function handleBranchChange(nextBranchId) {
    // AM: Evita refrescos redundantes al pulsar la misma sucursal activa.
    if (!nextBranchId || nextBranchId === selectedBranchRef.current) return;
    // AM: Mantiene seleccion de sucursal y refresca catalogo sin recargar la pantalla completa.
    selectedBranchRef.current = nextBranchId;
    setSelectedBranchId(nextBranchId);
    void loadCatalog({ branchId: nextBranchId, silent: true });
  }

  function handleAgendar() {
    navigate('/agendar/barberos');
  }

  const agendableServices = services.filter((item) => item?.servicio_informativo !== true);
  const informativeServices = services.filter((item) => item?.servicio_informativo === true);

  const navItems = [
    { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate('/') },
    { id: 'servicios', label: 'Servicios', icon: Scissors, onClick: () => navigate('/servicios') },
    {
      id: 'login',
      label: isAuthenticated ? 'Mi panel' : 'Iniciar sesión',
      icon: LogIn,
      onClick: () => navigate(isAuthenticated ? '/home' : '/login'),
    },
    { id: 'promociones', label: 'Promociones', icon: Tag, onClick: () => navigate('/promociones') },
  ];
  return (
    <div className="mf-page-gradient min-h-screen pb-[100px]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-4 sm:px-8">
        <header className="flex items-start justify-between gap-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 py-2 text-sm text-[var(--mf-text)] transition-colors duration-200 hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)]"
          >
            <House size={16} strokeWidth={1.8} />
            <span>Volver al inicio</span>
          </button>

          <ThemeSwitcher />
        </header>

        <main className="mx-auto mt-8 w-full max-w-4xl">
          <div className="flex flex-col items-center text-center">
            <MasterfadeLogo variant="publicPromotions" className="-my-6 sm:-my-8 md:-my-10" />
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
              Catalogo publico
            </p>
            <h1 className="mf-font-display mt-4 text-[42px] leading-[0.92] text-[var(--mf-text)]">
              Servicios y Experiencias Premium
            </h1>
          </div>

          {branches.length > 1 ? (
            // AM: Selector visual premium para sucursal publica, conservando claridad en mobile y desktop.
            <div className="mf-glass-surface mt-6 overflow-hidden rounded-[26px] border border-[var(--mf-btn-border)]/80 p-4 sm:p-5">
              <div className="relative">
                <div className="pointer-events-none absolute -right-12 -top-10 h-28 w-28 rounded-full bg-[var(--mf-accent)]/10 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-[var(--mf-accent)]/8 blur-xl" />
                <div className="relative flex flex-col items-center gap-3 text-center">
                  <div className="max-w-xl">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-text-2)]">
                      <Building2 size={14} strokeWidth={1.8} />
                      <span>Sucursal del catalogo</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--mf-text-2)]">
                      Elige una sucursal para ver sus servicios y paquetes disponibles en tiempo real.
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)]">
                    {branches.length} sucursales
                  </span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:justify-center">
                {branches.map((branch) => {
                  const isActive = branch.id_sucursal === selectedBranchId;
                  return (
                    <button
                      key={branch.id_sucursal}
                      type="button"
                      onClick={() => handleBranchChange(branch.id_sucursal)}
                      className={[
                        'inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-full border px-4 py-2 text-sm transition-all duration-200 sm:justify-start lg:w-auto',
                        isActive
                          ? 'border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
                          : 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60 hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_8%)]',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'inline-flex h-4 w-4 items-center justify-center rounded-full border',
                          isActive
                            ? 'border-[var(--mf-accent-text)]/55 bg-[var(--mf-accent-text)]/15'
                            : 'border-[var(--mf-btn-border)] bg-transparent',
                        ].join(' ')}
                      >
                        {isActive ? <CheckCircle2 size={11} strokeWidth={2.2} /> : null}
                      </span>
                      {branch.nombre_sucursal}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {branches.length === 1 ? (
            <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 py-2 text-xs text-[var(--mf-text-2)]">
              <Building2 size={13} strokeWidth={1.8} />
              <span>Sucursal activa: {branches[0]?.nombre_sucursal}</span>
            </p>
          ) : null}

          {status === 'loading' ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                Cargando catalogo
              </p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">
                Estamos consultando servicios y paquetes disponibles.
              </p>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                Error de catalogo
              </p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">{errorMessage}</p>
              <button
                type="button"
                onClick={() => void loadCatalog()}
                className="mf-accent-gradient mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {status === 'success' ? (
            <>
              <CatalogSection
                icon={Scissors}
                eyebrow="Servicios"
                title="Servicios agendables"
                items={agendableServices}
                emptyMessage="Aun no hay servicios agendables visibles."
              >
                {agendableServices.map((item) => (
                  <ServiceCard key={item.id_servicio} item={item} />
                ))}
              </CatalogSection>

              <CatalogSection
                icon={Sparkles}
                eyebrow="Informativo"
                title="Servicios informativos"
                items={informativeServices}
                emptyMessage="Aun no hay servicios informativos visibles."
              >
                {informativeServices.map((item) => (
                  <ServiceCard key={item.id_servicio} item={item} compact />
                ))}
              </CatalogSection>

              <CatalogSection
                icon={CalendarDays}
                eyebrow="Experiencias"
                title="Combos / Paquetes"
                items={packages}
                emptyMessage="Aun no hay paquetes visibles."
              >
                {packages.map((item) => (
                  <PackageCard key={item.id_paquete} item={item} />
                ))}
              </CatalogSection>

            </>
          ) : null}
        </main>
      </div>

      <PremiumBottomNav
        activeId="servicios"
        sideItems={navItems}
        fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, onClick: handleAgendar }}
        isDesktop
      />
    </div>
  );
}

