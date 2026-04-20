import { motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Package, Scissors, Search, Sparkles, Tag } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import {
  getPublicCatalog,
  listPublicCatalogBranches,
  listPublicCatalogPromotions,
  searchPublicCatalog,
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

function SectionAccordionHeader({ icon: Icon, title, subtitle, expanded, onActivate }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-expanded={expanded}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-left transition-colors hover:border-[var(--mf-accent)]/45"
    >
      <SectionTitle icon={Icon} title={title} subtitle={subtitle} />
      <span
        className={[
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--mf-btn-border)] text-[var(--mf-text)] transition-transform duration-200',
          expanded ? 'rotate-180 border-[var(--mf-accent)]/45 text-[var(--mf-accent)]' : '',
        ].join(' ')}
      >
        <ChevronDown size={16} />
      </span>
    </button>
  );
}

function CatalogRailSection({
  sectionId,
  titleIcon,
  title,
  subtitle,
  items = [],
  emptyMessage,
  renderItem,
  forceRail = false,
  expanded = false,
  onActivate = () => {},
}) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const useRail = forceRail || items.length >= 3;
  const safeActiveIndex = Math.max(0, Math.min(activeIndex, Math.max(0, items.length - 1)));

  function scrollByCards(direction = 1) {
    const track = trackRef.current;
    if (!track) return;

    const firstCard = track.querySelector('[data-cliente-catalog-card="true"]');
    const gap = 12;
    const cardWidth = firstCard?.getBoundingClientRect?.().width || 320;
    track.scrollBy({ left: direction * (cardWidth + gap), behavior: 'smooth' });
  }

  function handleTrackScroll() {
    const track = trackRef.current;
    if (!track) return;
    const firstCard = track.querySelector('[data-cliente-catalog-card="true"]');
    const cardWidth = firstCard?.getBoundingClientRect?.().width || 1;
    const nextIndex = Math.round(track.scrollLeft / (cardWidth + 12));
    setActiveIndex(Math.max(0, Math.min(nextIndex, items.length - 1)));
  }

  return (
    <section id={sectionId} className="space-y-3 scroll-mt-28">
      <SectionAccordionHeader
        icon={titleIcon}
        title={title}
        subtitle={subtitle}
        expanded={expanded}
        onActivate={onActivate}
      />

      {expanded ? (
        <>
          {useRail ? (
            <div className="flex justify-end">
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => scrollByCards(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
                  aria-label={`Desplazar ${title} a la izquierda`}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollByCards(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
                  aria-label={`Desplazar ${title} a la derecha`}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : null}

          {!items.length ? (
            <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
              {emptyMessage}
            </p>
          ) : useRail ? (
            <>
              <div
                ref={trackRef}
                onScroll={handleTrackScroll}
                className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {items.map((item) => renderItem(item, true))}
              </div>
              <div className="flex items-center justify-center gap-1.5">
                {items.map((item, index) => (
                  <span
                    key={`${sectionId}-dot-${String(item?.id_servicio || item?.id_paquete || item?.id_promocion || index)}`}
                    className={[
                      'h-1.5 rounded-full transition-all duration-200',
                      index === safeActiveIndex ? 'w-6 bg-[var(--mf-accent)]' : 'w-2 bg-[var(--mf-nav-border)]',
                    ].join(' ')}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{items.map((item) => renderItem(item, false))}</div>
          )}
        </>
      ) : null}
    </section>
  );
}

function CatalogServicesTwoRowsSection({
  sectionId,
  titleIcon,
  title,
  subtitle,
  items = [],
  emptyMessage,
  renderItem,
  expanded = false,
  onActivate = () => {},
}) {
  const trackRef = useRef(null);

  function scrollServices(direction = 1) {
    const track = trackRef.current;
    if (!track) return;
    const offset = Math.max(track.clientWidth * 0.78, 280);
    track.scrollBy({ left: direction * offset, behavior: 'smooth' });
  }

  return (
    <section id={sectionId} className="space-y-3 scroll-mt-28">
      <SectionAccordionHeader
        icon={titleIcon}
        title={title}
        subtitle={subtitle}
        expanded={expanded}
        onActivate={onActivate}
      />

      {expanded ? (
        <>
          {items.length > 2 ? (
            <div className="flex justify-end">
              <div className="hidden items-center gap-2 sm:flex">
                <button
                  type="button"
                  onClick={() => scrollServices(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
                  aria-label={`Desplazar ${title} hacia la izquierda`}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollServices(1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
                  aria-label={`Desplazar ${title} hacia la derecha`}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          ) : null}

          {!items.length ? (
            <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
              {emptyMessage}
            </p>
          ) : (
            <div
              ref={trackRef}
              className="grid grid-flow-col grid-rows-2 auto-cols-[minmax(260px,1fr)] gap-3 overflow-x-auto pb-2 scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {items.map((item) => renderItem(item))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

function CatalogItemCard({ title, subtitle, description, price, footer, isRail = false }) {
  return (
    <article
      data-cliente-catalog-card="true"
      className={[
        'rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4',
        isRail ? 'w-[82vw] shrink-0 snap-start sm:w-[56vw] lg:w-[34vw] xl:w-[29vw]' : '',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--mf-text)]">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-[var(--mf-text-2)]">{subtitle}</p> : null}
        </div>
        {price ? <span className="text-xs font-semibold text-[var(--mf-accent)]">{price}</span> : null}
      </div>

      {description ? <p className="mt-2 text-xs leading-6 text-[var(--mf-text-2)]">{description}</p> : null}
      {footer}
    </article>
  );
}

function PromotionHeroImage({ promotion }) {
  const [failed, setFailed] = useState(false);
  const desktopSrc = String(promotion?.imagen_principal_url || '').trim();
  const mobileSrc = String(promotion?.imagen_mobile_url || '').trim();
  const src = !failed ? (desktopSrc || mobileSrc) : '';

  if (!src) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[var(--mf-text-2)]">
        <Sparkles size={28} strokeWidth={1.8} />
      </div>
    );
  }

  return (
    <picture>
      {!failed && mobileSrc ? <source media="(max-width: 640px)" srcSet={mobileSrc} /> : null}
      <img
        src={src}
        alt={promotion?.imagen_alt || promotion?.titulo || 'Promoción MasterFade'}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </picture>
  );
}

function PromotionPublicCard({ promotion }) {
  const paragraphs = Array.isArray(promotion?.parrafos) ? promotion.parrafos.filter(Boolean) : [];
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
        <PromotionHeroImage promotion={promotion} />
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
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Promoción vigente</p>
        <h2 className="mf-font-display mt-3 text-[30px] leading-[0.9] text-[var(--mf-text)]">{promotion?.titulo}</h2>

        {promotion?.subtitulo ? <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">{promotion.subtitulo}</p> : null}

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

      </div>
    </motion.article>
  );
}

export default function ClienteCatalogoPage() {
  const location = useLocation();
  const { error: notifyError } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [activeSection, setActiveSection] = useState('servicios');
  const [search, setSearch] = useState('');

  const promotionsRef = useRef(null);
  const promotionsCarouselRef = useRef(null);

  const fetchCatalogData = useCallback(async (selectedBranchId, searchTerm = '') => {
    const normalizedSearch = String(searchTerm || '').trim();
    const [catalogPayload, promotionsPayload] = await Promise.all([
      normalizedSearch
        ? searchPublicCatalog({ q: normalizedSearch, id_sucursal: selectedBranchId || undefined })
        : getPublicCatalog({ id_sucursal: selectedBranchId || undefined }),
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

      await fetchCatalogData(resolvedBranchId, '');
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo cargar el catálogo de cliente.');
    } finally {
      setLoading(false);
    }
  }, [fetchCatalogData, notifyError]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (loading) return;
    if (location.hash !== '#promociones') return;
    setActiveSection('promociones');
    window.setTimeout(() => {
      promotionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [loading, location.hash]);

  async function handleBranchChange(event) {
    const nextBranchId = String(event.target.value || '').trim();
    setBranchId(nextBranchId);
    setStoredClienteCatalogBranchId(nextBranchId);

    setLoading(true);
    try {
      await fetchCatalogData(nextBranchId, search);
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || 'No se pudo actualizar el catálogo para la sucursal.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const normalizedSearch = String(search || '').trim();
    if (!normalizedSearch) return;
    const controller = new AbortController();
    const timerId = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          await fetchCatalogData(branchId, normalizedSearch);
        } catch (error) {
          if (!controller.signal.aborted) {
            notifyError(error?.data?.error?.message || error?.message || 'No se pudo buscar en el catálogo.');
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timerId);
    };
  }, [branchId, fetchCatalogData, notifyError, search]);

  const agendables = useMemo(() => services.filter((item) => !item?.servicio_informativo), [services]);
  const sortedPromotions = useMemo(() => {
    return [...promotions].sort((a, b) => {
      const featuredDiff = Number(Boolean(b?.destacada)) - Number(Boolean(a?.destacada));
      if (featuredDiff !== 0) return featuredDiff;
      const orderDiff = Number(a?.orden_visual ?? 100) - Number(b?.orden_visual ?? 100);
      if (orderDiff !== 0) return orderDiff;
      return String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'es');
    });
  }, [promotions]);

  const showPromotionCarouselControls = sortedPromotions.length > 3;

  function handlePromotionScroll(direction) {
    const track = promotionsCarouselRef.current;
    if (!track) return;
    const firstCard = track.querySelector('[data-promotion-card="true"]');
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '16') || 16;
    const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
    const cardsPerStep = isDesktop ? 3 : 1;
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : track.clientWidth;
    const step = (cardWidth + gap) * cardsPerStep;
    track.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
  }

  return (
    <div className="space-y-5">
      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Catálogo premium</p>
            <h1 className="mf-font-display mt-2 text-2xl text-[var(--mf-text)] sm:text-3xl">Servicios, paquetes y promociones</h1>
            <p className="mt-1 text-sm text-[var(--mf-text-2)]">Explora tu oferta disponible de forma informativa y clara.</p>
          </div>
        </div>

        <div className="mt-4 w-full max-w-sm">
          <label className="mf-label">Sucursal</label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" size={14} />
            <select className="mf-select !pl-11 pr-10" value={branchId} onChange={(event) => void handleBranchChange(event)}>
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 w-full max-w-sm">
          <label className="mf-label">Búsqueda global</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" size={14} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar servicios o paquetes..."
              className="mf-input w-full pl-11"
            />
          </div>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">
          <div className="mf-skeleton h-24 rounded-2xl" />
          <div className="mf-skeleton h-28 rounded-2xl" />
          <div className="mf-skeleton h-28 rounded-2xl" />
        </div>
      ) : (
        <>
          <CatalogServicesTwoRowsSection
            sectionId="servicios"
            titleIcon={Scissors}
            title="Servicios"
            subtitle="Selecciona tu experiencia agendable."
            items={agendables}
            emptyMessage="No hay servicios publicados para esta sucursal."
            expanded={activeSection === 'servicios'}
            onActivate={() => setActiveSection('servicios')}
            renderItem={(item) => (
              <CatalogItemCard
                key={item.id_servicio}
                title={item.nombre_servicio}
                description={item.descripcion || ''}
                price={Number(item?.precio_hnl) > 0 ? formatPrice(item.precio_hnl) : null}
                footer={<p className="mt-2 text-xs text-[var(--mf-text-2)]">Duración: {item.duracion_min} min</p>}
              />
            )}
          />

          <CatalogRailSection
            sectionId="paquetes"
            titleIcon={Package}
            title="Paquetes"
            subtitle="Combos disponibles para clientes autenticados."
            items={packages}
            emptyMessage="No hay paquetes activos para esta sucursal."
            forceRail
            expanded={activeSection === 'paquetes'}
            onActivate={() => setActiveSection('paquetes')}
            renderItem={(item, isRail) => (
              <CatalogItemCard
                key={item.id_paquete}
                title={item.nombre_paquete}
                description={item.descripcion || ''}
                price={Number(item?.precio_hnl) > 0 ? formatPrice(item.precio_hnl) : null}
                footer={Array.isArray(item.items) && item.items.length ? (
                  <ul className="mt-2 space-y-1 text-xs text-[var(--mf-text-2)]">
                    {item.items.map((detail) => (
                      <li key={`${item.id_paquete}:${detail.id_servicio}`}>- {detail.nombre_servicio} x{detail.cantidad}</li>
                    ))}
                  </ul>
                ) : null}
                isRail={isRail}
              />
            )}
          />

          <section id="promociones" ref={promotionsRef} className="space-y-3 scroll-mt-28">
            <SectionAccordionHeader
              icon={Tag}
              title="Promociones"
              subtitle="Beneficios vigentes y ofertas especiales."
              expanded={activeSection === 'promociones'}
              onActivate={() => setActiveSection('promociones')}
            />

            {activeSection === 'promociones' ? (
              <>
                {showPromotionCarouselControls ? (
                  <div className="flex justify-end">
                    <div className="hidden shrink-0 items-center gap-2 sm:flex">
                      <button
                        type="button"
                        onClick={() => handlePromotionScroll('left')}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
                        aria-label="Desplazar promociones a la izquierda"
                      >
                        <ChevronLeft size={20} strokeWidth={1.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePromotionScroll('right')}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]"
                        aria-label="Desplazar promociones a la derecha"
                      >
                        <ChevronRight size={20} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                ) : null}

                {!sortedPromotions.length ? (
                  <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
                    Aún no hay promociones visibles para esta sucursal.
                  </p>
                ) : (
                  <div className="relative">
                    {showPromotionCarouselControls ? (
                      <>
                        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] hidden w-14 bg-gradient-to-r from-[var(--mf-bg)]/85 via-[var(--mf-bg)]/35 to-transparent blur-[1px] lg:block" />
                        <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] hidden w-14 bg-gradient-to-l from-[var(--mf-bg)]/85 via-[var(--mf-bg)]/35 to-transparent blur-[1px] lg:block" />
                      </>
                    ) : null}
                    <div
                      ref={promotionsCarouselRef}
                      className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth [&::-webkit-scrollbar]:hidden"
                    >
                      {sortedPromotions.map((promotion) => (
                        <PromotionPublicCard
                          key={`${promotion.id_promocion}:${promotion.id_sucursal || 'public'}`}
                          promotion={promotion}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

