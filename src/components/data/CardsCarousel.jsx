import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Waves } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/utils.js';

function resolvePageSize(pageSizeByViewport) {
  if (typeof window === 'undefined') return 6;
  const width = window.innerWidth;
  if (width >= 1280) return Number(pageSizeByViewport?.desktop ?? 6); // AM: Desktop => 3 columnas x 2 filas.
  if (width >= 640) return Number(pageSizeByViewport?.tablet ?? 4); // Tablet => 2x2.
  return Number(pageSizeByViewport?.mobile ?? 2); // Mobile => 1x2.
}

function chunkItems(items, pageSize) {
  const source = Array.isArray(items) ? items : [];
  if (!source.length || pageSize <= 0) return [];

  const chunks = [];
  for (let index = 0; index < source.length; index += pageSize) {
    chunks.push(source.slice(index, index + pageSize));
  }
  return chunks;
}

function CarouselActionButton({ onClick, icon, label, disabled = false, compact = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        compact
          ? 'group inline-flex h-8 items-center justify-center gap-1.5 rounded-full border px-2.5'
          : 'group inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3',
        'border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_72%,transparent)]',
        'backdrop-blur-md text-[var(--mf-text-2)] shadow-[var(--mf-shadow-soft)]',
        'transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--mf-accent)]/45 hover:text-[var(--mf-accent)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mf-accent)]/40',
        'disabled:cursor-not-allowed disabled:opacity-45'
      )}
    >
      {icon}
      <span className={cn('text-xs font-semibold uppercase tracking-[0.08em]', compact ? 'hidden lg:inline' : 'hidden sm:inline')}>
        {label}
        </span>
    </button>
  );
}

export default function CardsCarousel({
  items,
  renderItem,
  getItemKey,
  className = '',
  // --- Props combinadas de tus nuevos cambios y la rama dev ---
  pageSizeByViewport,
  gridClassName = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3',
  compactControls = false,
  showHeaderTag = true,
  // Prop añadida por REPORTES_f
  showViewBadge = true,
  resetKey = null,
}) {
  const reducedMotion = useReducedMotion();
  const [pageSize, setPageSize] = useState(() => resolvePageSize(pageSizeByViewport));
  const [pageIndex, setPageIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const onResize = () => setPageSize(resolvePageSize(pageSizeByViewport));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pageSizeByViewport]);

  const pages = useMemo(() => chunkItems(items, pageSize), [items, pageSize]);
  const totalPages = pages.length;

  if (!Array.isArray(items) || items.length === 0) return null;

  const safePageIndex = totalPages ? Math.min(pageIndex, totalPages - 1) : 0;
  const activePage = pages[safePageIndex] || [];
  const canMove = totalPages > 1;
  const isFirstPage = safePageIndex <= 0;
  const isLastPage = safePageIndex >= (totalPages - 1);

  useEffect(() => {
    if (!totalPages) {
      if (pageIndex !== 0) setPageIndex(0);
      return;
    }
    if (pageIndex > (totalPages - 1)) {
      setPageIndex(totalPages - 1);
    }
  }, [pageIndex, totalPages]);

  useEffect(() => {
    setPageIndex(0);
    setDirection(0);
  }, [resetKey]);

  const movePage = (nextDirection) => {
    if (!canMove) return;
    setDirection(nextDirection);
    setPageIndex((prev) => {
      if (nextDirection < 0) return Math.max(0, prev - 1);
      return Math.min(totalPages - 1, prev + 1);
    });
  };

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-[24px] border border-[var(--mf-nav-border)] p-3 sm:p-4',
        'bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] backdrop-blur-md',
        className
      )}
    >
      {/* AM: Efecto visual tipo agua/vidrio, suave y no invasivo. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-14 top-[-56px] h-40 w-40 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="absolute right-[-56px] top-1/3 h-44 w-44 rounded-full bg-sky-200/10 blur-3xl" />
        <div className="absolute bottom-[-54px] left-1/3 h-36 w-36 rounded-full bg-white/8 blur-3xl" />
      </div>

      {/* --- Integración de la sección Header con lógica combinada --- */}
      {((showViewBadge || showHeaderTag) || canMove) ? (
        <div
          className={cn(
            'relative z-10 mb-3 flex items-center gap-2',
            // Adopta la lógica de justificación dinámica si cualquiera de las flags de Badge es verdadera
            (showViewBadge || showHeaderTag) ? 'justify-between' : 'justify-end'
          )}
        >
          {/* Renderiza el Badge si cualquiera de las flags es verdadera */}
          {(showViewBadge || showHeaderTag) ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">
              <Waves size={13} className="text-[var(--mf-accent)]" />
              <span>Vista Carrusel</span>
            </div>
          ) : null}
          {canMove && (
            <div className="flex items-center gap-2">
              <CarouselActionButton
                label="Anterior"
                onClick={() => movePage(-1)}
                icon={<ChevronLeft size={15} strokeWidth={2.1} />}
                disabled={isFirstPage}
                // Integra la propiedad funcional de la rama dev
                compact={compactControls}
              />
              <CarouselActionButton
                label="Siguiente"
                onClick={() => movePage(1)}
                icon={<ChevronRight size={15} strokeWidth={2.1} />}
                disabled={isLastPage || totalPages <= 1}
                // Integra la propiedad funcional de la rama dev
                compact={compactControls}
              />
            </div>
          )}
        </div>
      ) : null}

      <div className="relative z-10 min-h-[220px]">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={`carousel-page-${safePageIndex}`}
            custom={direction}
            initial={reducedMotion ? false : { opacity: 0, x: direction >= 0 ? 22 : -22 }}
            animate={reducedMotion ? undefined : { opacity: 1, x: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, x: direction >= 0 ? -22 : 22 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            // Integra gridClassName funcional de la rama dev
            className={gridClassName}
          >
            {activePage.map((item, index) => (
              <motion.div
                // AM: Fallback robusto cuando una entidad no define id único explícito.
                key={String(getItemKey?.(item) ?? `${safePageIndex}-${index}`)}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: reducedMotion ? 0 : index * 0.04 }}
              >
                {renderItem(item, index, safePageIndex)}
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {canMove && (
        <div className="relative z-10 mt-3 flex items-center justify-center gap-1.5">
          {pages.map((_, idx) => (
            <button
              key={`dot-${idx}`}
              type="button"
              aria-label={`Ir a pagina ${idx + 1}`}
              onClick={() => {
                setDirection(idx > safePageIndex ? 1 : -1);
                setPageIndex(idx);
              }}
              className={cn(
                'h-1.5 rounded-full transition-all duration-200',
                idx === safePageIndex
                  ? 'w-7 bg-[var(--mf-accent)]'
                  : 'w-3 bg-[var(--mf-text-2)]/35 hover:bg-[var(--mf-text-2)]/55'
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}
