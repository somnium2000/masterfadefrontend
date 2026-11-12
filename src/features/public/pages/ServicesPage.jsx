import { motion } from 'framer-motion';
import {
  CalendarDays,
  Crown,
  ArrowUpRight,
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
import { Link, useNavigate } from 'react-router-dom';
import PublicNavigationHeader from '../../../components/layout/PublicNavigationHeader.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import usePrivateCommerce from '../../../hooks/usePrivateCommerce.js';
import {
  listPublicCatalogBranches,
  listPublicCatalogPackages,
  listPublicCatalogServices,
  listPublicPlansByBranch,
} from '../lib/catalogApi.js';
import { subscribeCatalogSync } from '../../../lib/catalogSync.js';
import { getPlanCategoryTheme } from '../../plans/lib/planCategoryTheme.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../../../components/ui/dialog.jsx';

function formatPriceHnl(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return `L ${amount.toFixed(2)}`;
}

function ServiceCard({ item, compact = false, nonBookable = false }) {
  const isInformativeWithoutPrice = item?.servicio_informativo === true && Number(item?.precio_hnl) === 0;
  const displayPrice = isInformativeWithoutPrice ? 'Consultar precio' : formatPriceHnl(item?.precio_hnl);
  return (
    <motion.article
      data-catalog-card="true"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={nonBookable
        ? 'mf-glass-surface flex min-w-0 flex-col justify-between rounded-[28px] p-5'
        : 'mf-glass-surface flex w-[85vw] shrink-0 snap-start flex-col justify-between rounded-[28px] p-5 sm:w-[68vw] lg:w-[calc((100%-2rem)/3)]'}
    >
      <div className="flex items-start gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            {nonBookable ? 'No disponible para agendar' : compact ? 'Informativo' : 'Servicio'}
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

function VipPlanCard({ plan }) {
  const theme = getPlanCategoryTheme(plan.categoria_nivel);
  const benefits = (Array.isArray(plan.beneficios) ? plan.beneficios : [])
    .filter(benefit => benefit?.nombre && Number(benefit.cantidad) > 0);
  const hasCategory = Number.isInteger(Number(plan.categoria_nivel)) && Number(plan.categoria_nivel) >= 1 && Number(plan.categoria_nivel) <= 5;
  const category = hasCategory ? theme.label : 'Categoría no disponible';
  const period = plan.periodo_membresia_label || 'Consultar vigencia';
  return (
    <article data-catalog-card="true" className="flex w-full max-w-[320px] min-w-0 shrink-0 snap-start flex-col rounded-[24px] border p-4 sm:w-[calc((100%-1rem)/2)] sm:max-w-[360px] lg:w-[calc((100%-2rem)/3)] lg:max-w-[320px]" style={{ background: theme.cardGradient, borderColor: theme.cardBorder, boxShadow: theme.glow }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-text-2)]">{category}</p>
      <h3 className="mf-font-display mt-1 break-words text-[22px] leading-tight text-[var(--mf-text)] [overflow-wrap:anywhere]">{plan.nombre_plan}</h3>
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-[var(--mf-text-2)]"><CalendarDays size={14} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" aria-hidden="true" /><span className="min-w-0 break-words">Vigencia: {period}</span></p>
      <p className="mt-2 text-xl font-semibold text-[var(--mf-text)]">{formatPriceHnl(plan.precio_hnl)}</p>
      <div className="mt-3 flex-1 border-t border-[var(--mf-nav-border)] pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Beneficios incluidos</p>
        {benefits.length ? <ul className="mt-2 space-y-1.5 text-xs leading-5 text-[var(--mf-text)]">
          {benefits.slice(0, 2).map((benefit, index) => {
            const name = String(benefit.nombre);
            return <li key={index} className="flex items-start gap-1.5"><CheckCircle2 size={13} className="mt-1 shrink-0 text-[var(--mf-accent)]" aria-hidden="true" /><span className="min-w-0 [overflow-wrap:anywhere]">{Number(benefit.cantidad)} × {name.length > 64 ? `${name.slice(0, 61).trimEnd()}…` : name}</span></li>;
          })}
        </ul> : <p className="mt-2 text-xs leading-5 text-[var(--mf-text-2)]">Consulta los beneficios del plan.</p>}
        {benefits.length > 2 ? <p className="mt-1 text-xs text-[var(--mf-text-2)]">+ {benefits.length - 2} {benefits.length === 3 ? 'beneficio más' : 'beneficios más'}</p> : null}
      </div>
      <Dialog>
        <DialogTrigger asChild><button type="button" aria-label={`Ver detalle de ${plan.nombre_plan}`} className="mf-focus-ring mt-3 flex min-h-11 items-center justify-between gap-2 rounded-lg border-t border-[var(--mf-nav-border)] text-xs font-semibold text-[var(--mf-accent)]">Ver detalle del plan<ArrowUpRight size={15} aria-hidden="true" /></button></DialogTrigger>
        <DialogContent className="max-h-[85dvh] overflow-y-auto [overflow-wrap:anywhere] [&>button]:h-11 [&>button]:w-11">
          <DialogHeader className="pr-10"><DialogTitle>{plan.nombre_plan}</DialogTitle><DialogDescription>Información del plan en la sucursal seleccionada.</DialogDescription></DialogHeader>
          <div className="space-y-4 text-sm text-[var(--mf-text)]">
            <p>{category} · Vigencia: {period}</p>
            <p className="text-xl font-semibold">{formatPriceHnl(plan.precio_hnl)}</p>
            {plan.descripcion ? <p className="whitespace-pre-line leading-6 text-[var(--mf-text-2)]">{plan.descripcion}</p> : null}
            <p className="font-semibold">Beneficios incluidos</p>
            {benefits.length ? <ul className="space-y-3 leading-6">{benefits.map((benefit, index) => <li key={index} className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-1 shrink-0 text-[var(--mf-accent)]" aria-hidden="true" /><span>{Number(benefit.cantidad)} × {benefit.nombre}</span></li>)}</ul> : <p>Consulta los beneficios del plan.</p>}
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function VipPlanCarousel({ plans, status, onRetry }) {
  return <CatalogSection vip icon={Crown} title="Membresías VIP" eyebrow="Experiencia VIP" items={plans} status={status} onRetry={onRetry} emptyMessage="No hay membresías VIP disponibles en esta sucursal.">{plans.map(plan => <VipPlanCard key={plan.id_plan_sucursal || plan.id_plan} plan={plan} />)}</CatalogSection>;
}

function CatalogSection({ icon: Icon, title, eyebrow, items, emptyMessage, children, vip = false, status = 'success', onRetry }) {
  const scrollRef = useRef(null);
  // AM: VIP detecta desbordamiento; los demás catálogos conservan su umbral original.
  const [position, setPosition] = useState({ overflow: false, previous: false, next: false });
  const showCarouselControls = vip ? status === 'success' && items.length > 0 && position.overflow : items.length > 3;

  useEffect(() => {
    if (!vip || status !== 'success') return undefined;
    const track = scrollRef.current;
    if (!track) return undefined;
    const updatePosition = () => {
      const next = {
        overflow: track.scrollWidth > track.clientWidth + 1,
        previous: track.scrollLeft > 1,
        next: track.scrollWidth - track.clientWidth - track.scrollLeft > 1,
      };
      setPosition(current => current.overflow === next.overflow
        && current.previous === next.previous && current.next === next.next ? current : next);
    };
    track.scrollLeft = 0;
    const frame = requestAnimationFrame(updatePosition);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updatePosition) : null;
    observer?.observe(track);
    const card = track.querySelector('[data-catalog-card="true"]');
    if (card) observer?.observe(card);
    track.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      track.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [vip, items, status]);

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

    track.scrollBy({ left: scrollAmount, behavior: vip && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <section className="mt-8" aria-labelledby={vip ? 'services-vip-heading' : undefined}>
      <div className="flex items-center justify-between gap-3">
        <div className={vip ? 'flex min-w-0 flex-1 items-center gap-3' : 'flex items-center gap-3'}>
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
            <Icon size={18} strokeWidth={1.9} />
          </div>
          <div className={vip ? 'min-w-0' : undefined}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">{eyebrow}</p>
            <h2 id={vip ? 'services-vip-heading' : undefined} className={`mf-font-display ${vip ? 'text-[24px]' : 'text-[26px]'} leading-[1.1] text-[var(--mf-text)] sm:text-[30px] sm:leading-none`}>{title}</h2>
          </div>
        </div>

        {showCarouselControls && (
          <div className={vip ? 'flex shrink-0 items-center gap-2' : 'hidden shrink-0 items-center gap-2 sm:flex'}>
            <button
              type="button"
              onClick={() => handleScroll('left')}
              className={`flex ${vip ? 'h-11 w-11 disabled:opacity-40' : 'h-10 w-10'} items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)] ${vip ? 'mf-focus-ring' : ''}`}
              disabled={vip ? !position.previous : undefined}
              aria-controls={vip ? 'services-vip-plans' : undefined}
              aria-label={vip ? 'Membresía VIP anterior' : 'Desplazar a la izquierda'}
            >
              <ChevronLeft size={20} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => handleScroll('right')}
              className={`flex ${vip ? 'h-11 w-11 disabled:opacity-40' : 'h-10 w-10'} items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)] ${vip ? 'mf-focus-ring' : ''}`}
              disabled={vip ? !position.next : undefined}
              aria-controls={vip ? 'services-vip-plans' : undefined}
              aria-label={vip ? 'Membresía VIP siguiente' : 'Desplazar a la derecha'}
            >
              <ChevronRight size={20} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>

      {vip ? (
        <Link to="/membresias-vip" className="mf-focus-ring mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-[var(--mf-accent)] underline-offset-4 hover:underline">Ver membresías VIP<ArrowUpRight size={15} aria-hidden="true" /></Link>
      ) : null}
      {vip && status === 'loading' ? <p role="status" className="mt-4 text-sm text-[var(--mf-text-2)]">Cargando membresías VIP…</p>
        : vip && status === 'error' ? <CatalogLoadError message="No se pudieron cargar las membresías VIP de esta sucursal." onRetry={onRetry} />
        : items.length > 0 ? (
        <div className="relative mt-5">
          {showCarouselControls && !vip ? (
            <>
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] hidden w-14 bg-gradient-to-r from-[var(--mf-bg)]/85 via-[var(--mf-bg)]/35 to-transparent blur-[1px] lg:block" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] hidden w-14 bg-gradient-to-l from-[var(--mf-bg)]/85 via-[var(--mf-bg)]/35 to-transparent blur-[1px] lg:block" />
            </>
          ) : null}
          <div
            ref={scrollRef}
            id={vip ? 'services-vip-plans' : undefined}
            role={vip ? 'region' : undefined}
            aria-label={vip ? 'Planes de membresías VIP' : undefined}
            aria-roledescription={vip ? 'carrusel' : undefined}
            tabIndex={vip ? 0 : undefined}
            className={`flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth [&::-webkit-scrollbar]:hidden ${vip ? 'mf-focus-ring min-w-0 overflow-y-hidden motion-reduce:scroll-auto' : ''}`}
          >
            {children}
          </div>
        </div>
      ) : (
        <div role={vip ? 'status' : undefined} className="mf-glass-surface mt-5 rounded-[24px] p-5 text-sm leading-6 text-[var(--mf-text-2)]">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

function CatalogLoadError({ message, onRetry }) {
  return (
    <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center" role="alert">
      <p className="text-sm leading-6 text-[var(--mf-text-2)]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mf-accent-gradient mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
      >
        Reintentar
      </button>
    </div>
  );
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { booking: PUBLIC_BOOKING_ENABLED } = usePrivateCommerce();
  const isMountedRef = useRef(true);
  const selectedBranchRef = useRef('');
  const validBranchIdsRef = useRef(new Set());
  const catalogRequestRef = useRef(0);
  const branchRequestRef = useRef(0);
  const plansRequestRef = useRef(0);
  const [status, setStatus] = useState('loading');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [services, setServices] = useState([]);
  const [packages, setPackages] = useState([]);
  const [servicesError, setServicesError] = useState(false);
  const [packagesError, setPackagesError] = useState(false);
  const [plans, setPlans] = useState([]);
  const [plansStatus, setPlansStatus] = useState('idle');

  const invalidatePendingRequests = useCallback(() => {
    ++catalogRequestRef.current;
    ++branchRequestRef.current;
    ++plansRequestRef.current;
  }, []);

  const loadPlans = useCallback(async ({ branchId = selectedBranchRef.current } = {}) => {
    if (!branchId || !validBranchIdsRef.current.has(branchId) || branchId !== selectedBranchRef.current) return;
    const requestId = ++plansRequestRef.current;
    const isCurrent = () => isMountedRef.current && requestId === plansRequestRef.current
      && branchId === selectedBranchRef.current;
    setPlans([]);
    setPlansStatus('loading');
    try {
      const payload = await listPublicPlansByBranch(branchId);
      if (!isCurrent()) return;
      const rows = Array.isArray(payload?.plans) ? payload.plans : [];
      setPlans(rows.filter(plan => plan?.id_plan && plan.activo !== false
        && (!plan.id_sucursal || plan.id_sucursal === branchId)
        && Number.isFinite(Number(plan.precio_hnl)) && Number(plan.precio_hnl) > 0));
      setPlansStatus('success');
    } catch {
      if (!isCurrent()) return;
      setPlansStatus('error');
    }
  }, []);

  const loadCatalog = useCallback(async ({ silent = false, branchId = selectedBranchRef.current } = {}) => {
    if (!branchId || !validBranchIdsRef.current.has(branchId) || branchId !== selectedBranchRef.current) return;
    const requestId = ++catalogRequestRef.current;
    const isCurrent = () => isMountedRef.current
      && requestId === catalogRequestRef.current
      && branchId === selectedBranchRef.current;
    if (!silent) {
      setStatus('loading');
    }
    const [servicesResult, packagesResult] = await Promise.allSettled([
      listPublicCatalogServices({ id_sucursal: branchId }),
      listPublicCatalogPackages({ id_sucursal: branchId }),
    ]);
    if (!isCurrent()) return;

    const failedServices = servicesResult.status === 'rejected';
    const failedPackages = packagesResult.status === 'rejected';
    setServices(failedServices ? [] : (Array.isArray(servicesResult.value?.services) ? servicesResult.value.services : []));
    setPackages(failedPackages ? [] : (Array.isArray(packagesResult.value?.packages) ? packagesResult.value.packages : []));
    setServicesError(failedServices);
    setPackagesError(failedPackages);
    setStatus(failedServices && failedPackages ? 'error' : 'success');
  }, []);

  const loadBranches = useCallback(async () => {
    const requestId = ++branchRequestRef.current;
    ++catalogRequestRef.current;
    ++plansRequestRef.current;
    setPlans([]);
    setPlansStatus('idle');
    setStatus('loading');
    setServicesError(false);
    setPackagesError(false);
    try {
      const branchResult = await listPublicCatalogBranches();
      if (!isMountedRef.current || requestId !== branchRequestRef.current) return;
      const nextBranches = Array.isArray(branchResult?.branches)
        ? branchResult.branches.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
        : [];
      setBranches(nextBranches);
      validBranchIdsRef.current = new Set(nextBranches.map((branch) => branch.id_sucursal));
      const initialBranchId = nextBranches[0]?.id_sucursal || '';
      selectedBranchRef.current = initialBranchId;
      setSelectedBranchId(initialBranchId);
      setServices([]);
      setPackages([]);
      if (initialBranchId) {
        void loadCatalog({ branchId: initialBranchId });
        void loadPlans({ branchId: initialBranchId });
      } else {
        setStatus('noBranches');
      }
    } catch {
      if (!isMountedRef.current || requestId !== branchRequestRef.current) return;
      setBranches([]);
      validBranchIdsRef.current = new Set();
      selectedBranchRef.current = '';
      setSelectedBranchId('');
      setServices([]);
      setPackages([]);
      setStatus('branchesError');
    }
  }, [loadCatalog, loadPlans]);

  useEffect(() => {
    isMountedRef.current = true;
    let active = true;
    queueMicrotask(() => {
      if (active) void loadBranches();
    });

    const unsubscribe = subscribeCatalogSync(() => {
      if (!active || !isMountedRef.current) return;
      // AM: Refresco silencioso para reflejar cambios admin sin recargar toda la vista publica.
      void loadCatalog({ silent: true, branchId: selectedBranchRef.current });
      void loadPlans({ branchId: selectedBranchRef.current });
    });

    return () => {
      active = false;
      isMountedRef.current = false;
      invalidatePendingRequests();
      unsubscribe();
    };
  }, [invalidatePendingRequests, loadBranches, loadCatalog, loadPlans]);

  function handleBranchChange(nextBranchId) {
    // AM: Evita refrescos redundantes al pulsar la misma sucursal activa.
    if (!validBranchIdsRef.current.has(nextBranchId) || nextBranchId === selectedBranchRef.current) return;
    // AM: Mantiene seleccion de sucursal y refresca catalogo sin recargar la pantalla completa.
    ++catalogRequestRef.current;
    ++plansRequestRef.current;
    setPlans([]);
    setPlansStatus('loading');
    selectedBranchRef.current = nextBranchId;
    setSelectedBranchId(nextBranchId);
    setServices([]);
    setPackages([]);
    setServicesError(false);
    setPackagesError(false);
    setStatus('loading');
    void loadCatalog({ branchId: nextBranchId });
    void loadPlans({ branchId: nextBranchId });
  }

  function handleAgendar() {
    if (!PUBLIC_BOOKING_ENABLED) return;
    navigate('/agendar/barberos');
  }

  const agendableServices = services.filter((item) => item?.agendable === true && item?.servicio_informativo !== true);
  const informativeServices = services.filter((item) => item?.servicio_informativo === true || item?.agendable !== true);

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
        <PublicNavigationHeader onHome={() => navigate('/')} />

        <main className="mx-auto mt-8 w-full max-w-4xl">
          <div className="flex flex-col items-center text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
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

          {selectedBranchId ? <VipPlanCarousel plans={plans} status={plansStatus} onRetry={() => void loadPlans()} /> : null}

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

          {status === 'branchesError' ? (
            <CatalogLoadError message="No se pudieron cargar las sucursales." onRetry={() => void loadBranches()} />
          ) : null}

          {status === 'noBranches' ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center" role="status">
              No hay sucursales disponibles en este momento.
            </div>
          ) : null}

          {status === 'error' ? (
            <CatalogLoadError message="No se pudieron cargar los servicios ni los paquetes." onRetry={() => void loadCatalog()} />
          ) : null}

          {status === 'success' ? (
            <>
              {servicesError ? (
                <CatalogLoadError message="No se pudieron cargar los servicios." onRetry={() => void loadCatalog()} />
              ) : (
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

                </>
              )}

              {packagesError ? (
                <CatalogLoadError message="No se pudieron cargar los paquetes." onRetry={() => void loadCatalog()} />
              ) : (
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
              )}

            </>
          ) : null}
        </main>
      </div>

      <PremiumBottomNav
        activeId="servicios"
        sideItems={navItems}
        fabItem={{ id: 'agendar', label: PUBLIC_BOOKING_ENABLED ? 'Agendar' : 'Pausado', icon: Plus, onClick: handleAgendar, disabled: !PUBLIC_BOOKING_ENABLED }}
        isDesktop
      />
    </div>
  );
}

