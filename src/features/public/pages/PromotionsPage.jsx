import { motion } from 'framer-motion';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  House,
  LogIn,
  Plus,
  Scissors,
  Sparkles,
  Tag,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { subscribeCatalogSync } from '../../../lib/catalogSync.js';
import { listPublicCatalogBranches, listPublicCatalogPromotions } from '../lib/catalogApi.js';

function formatDateLabel(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatRangeLabel(start, end) {
  const fromLabel = formatDateLabel(start);
  const toLabel = formatDateLabel(end);

  if (fromLabel && toLabel) return `${fromLabel} - ${toLabel}`;
  if (fromLabel && !toLabel) return `Desde ${fromLabel}`;
  if (!fromLabel && toLabel) return `Hasta ${toLabel}`;
  return 'Vigencia abierta';
}

function resolveInternalHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    } catch {
      return '';
    }
  }
  return `/${raw.replace(/^\/+/, '')}`;
}

function resolveExternalHref(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return `https://${raw.replace(/^\/+/, '')}`;
}

function PromotionCard({ promotion, onAction }) {
  const paragraphs = Array.isArray(promotion?.parrafos) ? promotion.parrafos.filter(Boolean) : [];
  const hasImage = Boolean(promotion?.imagen_principal_url || promotion?.imagen_mobile_url);
  const internalHref = promotion?.cta_tipo === 'interno' ? resolveInternalHref(promotion?.cta_url) : '';
  const externalHref = promotion?.cta_tipo === 'externo' ? resolveExternalHref(promotion?.cta_url) : '';
  // AM: Evita CTA visibles sin destino valido en datos legacy o inconsistentes.
  const hasAction = Boolean(internalHref || externalHref);
  const ctaLabel = String(promotion?.cta_texto || '').trim() || 'Ver mas';
  const dateRangeLabel = formatRangeLabel(promotion?.vigencia_desde, promotion?.vigencia_hasta);

  return (
    <motion.article
      data-promotion-card="true"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="mf-glass-surface flex w-[85vw] shrink-0 snap-start flex-col overflow-hidden rounded-[28px] sm:w-[68vw] lg:w-[calc((100%-2rem)/3)]"
    >
      <div className="relative h-44 w-full bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_82%,black_18%)]">
        {hasImage ? (
          <picture>
            {promotion?.imagen_mobile_url ? <source media="(max-width: 640px)" srcSet={promotion.imagen_mobile_url} /> : null}
            <img
              src={promotion?.imagen_principal_url || promotion?.imagen_mobile_url}
              alt={promotion?.imagen_alt || promotion?.titulo || 'Promocion MasterFade'}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </picture>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--mf-text-2)]">
            <Sparkles size={28} strokeWidth={1.8} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[color:color-mix(in_srgb,var(--mf-bg)_85%,transparent)] via-transparent to-transparent" />

        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          {promotion?.destacada ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mf-accent)]/45 bg-[var(--mf-accent)]/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-accent)]">
              <Sparkles size={11} strokeWidth={2} />
              Destacada
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
          Promocion vigente
        </p>
        <h2 className="mf-font-display mt-3 text-[30px] leading-[0.9] text-[var(--mf-text)]">
          {promotion?.titulo}
        </h2>

        {promotion?.subtitulo ? (
          <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">{promotion.subtitulo}</p>
        ) : null}

        {paragraphs.length > 0 ? (
          <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--mf-text)]">
            {paragraphs.slice(0, 2).map((paragraph, index) => (
              <p key={`${promotion?.id_promocion}-${index}`}>{paragraph}</p>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mf-nav-border)]/80 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-[var(--mf-text)]">
            <CalendarDays size={13} strokeWidth={1.8} />
            {dateRangeLabel}
          </span>
        </div>

        {hasAction ? (
          <button
            type="button"
            onClick={() => onAction(promotion)}
            className="mf-accent-gradient mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
          >
            <span>{ctaLabel}</span>
            {promotion?.cta_tipo === 'externo' ? <ExternalLink size={14} strokeWidth={2} /> : null}
          </button>
        ) : null}
      </div>
    </motion.article>
  );
}

export default function PromotionsPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isMountedRef = useRef(true);
  const selectedBranchRef = useRef('');
  const carouselRef = useRef(null);

  const [status, setStatus] = useState('loading');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [promotions, setPromotions] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');

  const showCarouselControls = promotions.length > 3;

  const loadPromotions = useCallback(async ({ silent = false, branchId = selectedBranchRef.current } = {}) => {
    if (!silent) setStatus('loading');
    setErrorMessage('');

    try {
      const result = await listPublicCatalogPromotions({ id_sucursal: branchId || undefined });
      if (!isMountedRef.current) return;
      const nextPromotions = Array.isArray(result?.promotions) ? result.promotions : [];
      setPromotions(nextPromotions);
      setStatus('success');
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorMessage(error?.data?.error?.message || error?.message || 'No se pudo cargar promociones.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

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

          await loadPromotions({ branchId: initialBranchId });
        } catch (error) {
          if (!isMountedRef.current) return;
          setErrorMessage(error?.data?.error?.message || error?.message || 'No se pudo cargar promociones.');
          setStatus('error');
        }
      })();
    });

    const unsubscribe = subscribeCatalogSync(() => {
      if (!isMountedRef.current) return;
      void loadPromotions({ silent: true, branchId: selectedBranchRef.current });
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [loadPromotions]);

  function handleBranchChange(nextBranchId) {
    if (!nextBranchId || nextBranchId === selectedBranchRef.current) return;
    selectedBranchRef.current = nextBranchId;
    setSelectedBranchId(nextBranchId);
    void loadPromotions({ branchId: nextBranchId, silent: true });
  }

  function handleScroll(direction) {
    if (!carouselRef.current) return;
    const track = carouselRef.current;
    const firstCard = track.querySelector('[data-promotion-card="true"]');
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '16') || 16;
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    const cardsPerStep = isDesktop ? 3 : 1;
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : track.clientWidth;
    const step = (cardWidth + gap) * cardsPerStep;
    track.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
  }

  function handlePromotionAction(promotion) {
    if (!promotion) return;

    if (promotion.cta_tipo === 'interno') {
      const target = resolveInternalHref(promotion.cta_url);
      if (target) navigate(target);
      return;
    }

    if (promotion.cta_tipo === 'externo') {
      const target = resolveExternalHref(promotion.cta_url);
      if (target) {
        window.open(target, '_blank', 'noopener,noreferrer');
      }
    }
  }

  const sortedPromotions = useMemo(() => {
    return [...promotions].sort((a, b) => {
      const featuredDiff = Number(Boolean(b?.destacada)) - Number(Boolean(a?.destacada));
      if (featuredDiff !== 0) return featuredDiff;
      const orderDiff = Number(a?.orden_visual ?? 100) - Number(b?.orden_visual ?? 100);
      if (orderDiff !== 0) return orderDiff;
      return String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'es');
    });
  }, [promotions]);

  const navItems = [
    { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate('/') },
    { id: 'servicios', label: 'Servicios', icon: Scissors, onClick: () => navigate('/servicios') },
    {
      id: 'login',
      label: isAuthenticated ? 'Mi panel' : 'Iniciar sesion',
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
              Promociones y Beneficios Exclusivos
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--mf-text-2)]">
              Descubre ofertas activas y experiencias destacadas en tu sucursal MasterFade.
            </p>
          </div>

          {branches.length > 1 ? (
            <div className="mf-glass-surface mt-6 overflow-hidden rounded-[26px] border border-[var(--mf-btn-border)]/80 p-4 sm:p-5">
              <div className="relative flex flex-col items-center gap-3 text-center">
                <div className="max-w-xl">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-text-2)]">
                    <Building2 size={14} strokeWidth={1.8} />
                    <span>Sucursal de promociones</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--mf-text-2)]">
                    Elige una sucursal para ver sus promociones publicas vigentes.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)]">
                  {branches.length} sucursales
                </span>
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
                      <span className={['inline-flex h-4 w-4 items-center justify-center rounded-full border', isActive ? 'border-[var(--mf-accent-text)]/55 bg-[var(--mf-accent-text)]/15' : 'border-[var(--mf-btn-border)] bg-transparent'].join(' ')}>
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
                Cargando promociones
              </p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">
                Estamos consultando ofertas activas para tu sucursal.
              </p>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                Error de promociones
              </p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">{errorMessage}</p>
              <button
                type="button"
                onClick={() => void loadPromotions()}
                className="mf-accent-gradient mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {status === 'success' ? (
            sortedPromotions.length > 0 ? (
              <section className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
                      <Tag size={18} strokeWidth={1.9} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                        Seleccion activa
                      </p>
                      <h2 className="mf-font-display text-[26px] leading-[1.1] text-[var(--mf-text)] sm:text-[30px] sm:leading-none">
                        Promociones Disponibles
                      </h2>
                    </div>
                  </div>

                  {showCarouselControls ? (
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
                  ) : null}
                </div>

                <div className="relative mt-5">
                  {showCarouselControls ? (
                    <>
                      <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] hidden w-14 bg-gradient-to-r from-[var(--mf-bg)]/85 via-[var(--mf-bg)]/35 to-transparent blur-[1px] lg:block" />
                      <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] hidden w-14 bg-gradient-to-l from-[var(--mf-bg)]/85 via-[var(--mf-bg)]/35 to-transparent blur-[1px] lg:block" />
                    </>
                  ) : null}
                  <div
                    ref={carouselRef}
                    className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth [&::-webkit-scrollbar]:hidden"
                  >
                    {sortedPromotions.map((promotion) => (
                      <PromotionCard key={`${promotion.id_promocion}:${promotion.id_sucursal || 'public'}`} promotion={promotion} onAction={handlePromotionAction} />
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                  Sin promociones publicadas
                </p>
                <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">
                  Aun no hay promociones visibles para esta sucursal.
                </p>
              </div>
            )
          ) : null}
        </main>
      </div>

      <PremiumBottomNav
        activeId="promociones"
        sideItems={navItems}
        fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, onClick: () => navigate('/agendar/barberos') }}
        isDesktop
      />
    </div>
  );
}
