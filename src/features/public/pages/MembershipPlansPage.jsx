import { motion } from "framer-motion";
import {
  House,
  LogIn,
  Crown,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Scissors,
  Tag,
  Shield,
  Sparkles,
  Gem,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MasterfadeLogo from "../../../components/branding/MasterfadeLogo.jsx";
import PremiumBottomNav from "../../../components/navigation/PremiumBottomNav.jsx";
import ThemeSwitcher from "../../../components/theme/ThemeSwitcher.jsx";
import { useAuth } from "../../../context/AuthContext.jsx";
import { useNotifications } from "../../../context/NotificationsContext.jsx";
import { listPublicCatalogBranches, listPublicCatalogPlans, searchPublicCatalog } from "../lib/catalogApi.js";
import { subscribeCatalogSync } from "../../../lib/catalogSync.js";
import { getPlanCategoryTheme, normalizePlanCategory } from "../../plans/lib/planCategoryTheme.js";
import { acquireClientePlan, getClientePlanEstado } from "../../cliente/lib/clienteApi.js";

const CATEGORY_ICONS = {
  1: Shield,
  2: Sparkles,
  3: Crown,
  4: Gem,
  5: Trophy,
};

function formatUpgradeBlockedMessage(details = {}) {
  const dias = Number(details?.tiempo_restante?.dias || 0);
  const horas = Number(details?.tiempo_restante?.horas || 0);
  const servicios = Number(details?.remanentes?.servicios || 0);
  return `Aún no puedes actualizar. Restan ${dias} día(s), ${horas} hora(s) y ${servicios} servicio(s).`;
}

function PlanCard({ plan, onSelect, isSpotlight = false, ctaLabel = "Quiero este plan", disabled = false, loading = false }) {
  const benefits = Array.isArray(plan?.beneficios) ? plan.beneficios : [];
  const serviceBenefits = benefits.filter((benefit) => String(benefit?.tipo || "").toLowerCase() !== "cortesia");
  const courtesyBenefits = benefits.filter((benefit) => String(benefit?.tipo || "").toLowerCase() === "cortesia");
  const categoryLevel = normalizePlanCategory(plan?.categoria_nivel, 1);
  const categoryTheme = getPlanCategoryTheme(categoryLevel);
  const CategoryIcon = CATEGORY_ICONS[categoryLevel] || Crown;

  return (
    <motion.article
      data-plan-card="true"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex w-[85vw] shrink-0 snap-start flex-col justify-between rounded-[30px] border p-5 sm:w-[68vw] lg:w-[calc((100%-2rem)/3)]"
      style={{
        background: categoryTheme.cardGradient,
        borderColor: categoryTheme.cardBorder,
        boxShadow: categoryTheme.glow,
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: categoryTheme.accentColor }}>
            Categoría {categoryLevel} - {categoryTheme.label}
          </p>
          <h3 className="mf-font-display mt-2 text-[32px] leading-[0.9] text-[var(--mf-text)]">
            {plan.nombre_plan}
          </h3>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--mf-text-2)]">
            {plan.periodo_membresia_label || "Mensual"}
          </p>
        </div>

        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border" style={{ borderColor: categoryTheme.badgeBorder, background: categoryTheme.badgeTone, color: categoryTheme.iconColor }}>
          <CategoryIcon size={18} strokeWidth={2.1} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em]" style={{ borderColor: categoryTheme.badgeBorder, background: categoryTheme.badgeTone, color: categoryTheme.badgeColor }}>
          Nivel {categoryLevel}
        </span>
        {isSpotlight ? (
          <span className="inline-flex items-center rounded-full border border-[var(--mf-accent)]/40 bg-[var(--mf-accent)]/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--mf-accent)]">
            Más alto
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex-1">
        {plan.descripcion ? <p className="mb-4 text-sm leading-6 text-[var(--mf-text-2)]">{plan.descripcion}</p> : null}
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Servicios incluidos</p>
            {serviceBenefits.length ? (
              <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--mf-text)]">
                {serviceBenefits.map((benefit, index) => (
                  <li key={`${plan.id_plan}-srv-${index}`} className="flex items-start gap-3">
                    <CheckCircle2 size={14} className="mt-1 shrink-0 text-[var(--mf-accent)]" />
                    <span>{Number(benefit?.cantidad || 0)}x {benefit?.nombre || "Servicio"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-[var(--mf-text-2)]">No incluye servicios.</p>}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Cortesias incluidas</p>
            {courtesyBenefits.length ? (
              <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--mf-text)]">
                {courtesyBenefits.map((benefit, index) => (
                  <li key={`${plan.id_plan}-cor-${index}`} className="flex items-start gap-3">
                    <CheckCircle2 size={14} className="mt-1 shrink-0 text-[var(--mf-accent)]" />
                    <span>{Number(benefit?.cantidad || 0)}x {benefit?.nombre || benefit?.codigo || "Cortesia"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-xs text-[var(--mf-text-2)]">No incluye cortesias.</p>}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-3xl font-semibold text-[var(--mf-text)]">
          {`L ${Number(plan.precio_hnl).toFixed(2)}`}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onSelect(plan)}
        disabled={disabled || loading}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5"
        style={{
          background: categoryTheme.badgeTone,
          borderColor: categoryTheme.badgeBorder,
          color: categoryTheme.badgeColor,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), ${categoryTheme.glow}`,
        }}
      >
        {loading ? "Procesando..." : ctaLabel}
      </button>
    </motion.article>
  );
}

export default function MembershipPlansPage() {
  const navigate = useNavigate();
  const { isAuthenticated, roles = [] } = useAuth();
  const notifications = useNotifications();
  const isMountedRef = useRef(true);
  const selectedBranchRef = useRef("");
  // AM: Deduplicación de errores para evitar spam visual por fallos repetidos.
  const lastMembershipErrorRef = useRef("");
  const isClienteSession = Boolean(isAuthenticated && Array.isArray(roles) && roles.includes("cliente"));

  const [status, setStatus] = useState("loading");
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [plans, setPlans] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [membershipState, setMembershipState] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [acquiringPlanId, setAcquiringPlanId] = useState("");

  const scrollRef = useRef(null);

  const loadPlans = useCallback(async ({ silent = false, branchId = selectedBranchRef.current, searchTerm = "" } = {}) => {
    if (!silent) setStatus("loading");
    setErrorMessage("");

    try {
      const normalizedSearch = String(searchTerm || "").trim();
      const result = normalizedSearch
        ? await searchPublicCatalog({ q: normalizedSearch, id_sucursal: branchId || undefined })
        : await listPublicCatalogPlans({ id_sucursal: branchId || undefined });
      if (!isMountedRef.current) return;
      const rawPlans = Array.isArray(result?.plans) ? result.plans : [];
      const validPlans = rawPlans.filter((plan) => {
        const price = Number(plan?.precio_hnl);
        if (!Number.isFinite(price) || price <= 0) return false;
        const benefits = Array.isArray(plan?.beneficios) ? plan.beneficios : [];
        return benefits.some((benefit) => String(benefit?.tipo || "").toLowerCase() === "servicio");
      });
      setPlans(validPlans);
      setStatus("success");
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorMessage(error?.data?.error?.message || error?.message || "No se pudo cargar el catálogo de planes.");
      setStatus("error");
    }
  }, []);

  const loadMembershipState = useCallback(async ({ silent = false, notifyOnError = !silent } = {}) => {
    if (!isClienteSession) {
      setMembershipState(null);
      return;
    }

    if (!silent) setMembershipLoading(true);
    try {
      const payload = await getClientePlanEstado();
      if (!isMountedRef.current) return;
      setMembershipState(payload);
      lastMembershipErrorRef.current = "";
    } catch (error) {
      if (!isMountedRef.current) return;
      if (!notifyOnError) return;
      const message = error?.data?.error?.message || error?.message || "No se pudo consultar tu estado de plan.";
      if (lastMembershipErrorRef.current !== message) {
        lastMembershipErrorRef.current = message;
        notifications.error(message);
      }
    } finally {
      if (!silent) setMembershipLoading(false);
    }
  }, [isClienteSession, notifications]);

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

          const initialBranchId = nextBranches[0]?.id_sucursal || "";
          selectedBranchRef.current = initialBranchId;
          setSelectedBranchId(initialBranchId);

          await loadPlans({ branchId: initialBranchId, searchTerm: search });
        } catch (error) {
          if (!isMountedRef.current) return;
          setErrorMessage(error?.data?.error?.message || error?.message || "No se pudo cargar membresías.");
          setStatus("error");
        }
      })();
    });

    const unsubscribe = subscribeCatalogSync(() => {
      if (!isMountedRef.current) return;
      // AM: Refresco silencioso para mantener pantalla VIP alineada con cambios del admin.
      void loadPlans({ silent: true, branchId: selectedBranchRef.current, searchTerm: search });
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [loadPlans, search]);

  useEffect(() => {
    if (!isClienteSession) {
      setMembershipState(null);
      setMembershipLoading(false);
      return;
    }
    void loadMembershipState({ notifyOnError: true });
  }, [isClienteSession, loadMembershipState]);

  useEffect(() => {
    if (status === "loading") return;
    const timerId = window.setTimeout(() => {
      void loadPlans({ silent: true, branchId: selectedBranchRef.current, searchTerm: search });
    }, 280);
    return () => window.clearTimeout(timerId);
  }, [loadPlans, search, status]);

  function handleBranchChange(nextBranchId) {
    if (!nextBranchId || nextBranchId === selectedBranchRef.current) return;
    selectedBranchRef.current = nextBranchId;
    setSelectedBranchId(nextBranchId);
    void loadPlans({ branchId: nextBranchId, silent: true, searchTerm: search });
  }

  function handleScroll(direction) {
    if (!scrollRef.current) return;
    const track = scrollRef.current;
    const firstCard = track.querySelector("[data-plan-card='true']");
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "16") || 16;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    // AM: En desktop mueve 3 planes por clic; en movil 1 para control fino.
    const cardsPerStep = isDesktop ? 3 : 1;
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : track.clientWidth;
    const step = (cardWidth + gap) * cardsPerStep;
    track.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
  }

  async function handlePlanSelect(plan) {
    if (!isAuthenticated) {
      const params = new URLSearchParams();
      params.set("next", "/membresias-vip");
      params.set("intent", "seleccionar_plan");
      if (selectedBranchRef.current) {
        params.set("id_sucursal", selectedBranchRef.current);
      }
      if (plan?.id_plan) {
        params.set("id_plan", plan.id_plan);
      }
      navigate(`/login?${params.toString()}`);
      return;
    }

    if (!isClienteSession) {
      navigate("/home");
      return;
    }

    const idPlan = String(plan?.id_plan || "").trim();
    const idSucursal = String(selectedBranchRef.current || plan?.id_sucursal || "").trim();
    if (!idPlan || !idSucursal) {
      notifications.warning("No se pudo determinar la sucursal para adquirir este plan.");
      return;
    }

    setAcquiringPlanId(idPlan);
    try {
      await acquireClientePlan({
        id_plan: idPlan,
        id_sucursal: idSucursal,
      });
      notifications.success("Plan adquirido correctamente. Ya puedes usar tus beneficios.");
      await loadMembershipState({ silent: true, notifyOnError: false });
    } catch (error) {
      if (Number(error?.status) === 409) {
        notifications.warning(formatUpgradeBlockedMessage(error?.data?.error?.details || {}));
      } else {
        notifications.error(error?.data?.error?.message || error?.message || "No se pudo procesar la solicitud del plan.");
      }
    } finally {
      setAcquiringPlanId("");
    }
  }
  // AM: Flechas y overlays solo cuando hay mas de 3 planes.
  const showCarouselControls = plans.length > 3;
  const spotlightCategory = plans.reduce(
    (maxLevel, currentPlan) => Math.max(maxLevel, normalizePlanCategory(currentPlan?.categoria_nivel, 1)),
    1
  );
  const membershipCtaLabel = membershipState?.cta_recomendada === "actualizar" ? "Actualizar plan" : "Adquirir plan";

  const navItems = [
    { id: "inicio", label: "Inicio", icon: House, onClick: () => navigate("/") },
    { id: "servicios", label: "Servicios", icon: Scissors, onClick: () => navigate("/servicios") },
    { id: "login", label: isAuthenticated ? "Mi panel" : "Iniciar sesión", icon: LogIn, onClick: () => navigate(isAuthenticated ? "/home" : "/login") },
    { id: "promociones", label: "Promociones", icon: Tag, onClick: () => navigate("/promociones") },
  ];

  return (
    <div className="mf-page-gradient min-h-screen pb-[100px]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 pb-10 pt-4 sm:px-8">
        <header className="flex items-start justify-between gap-6">
          <button
            type="button"
            onClick={() => navigate("/")}
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
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Membresías VIP</p>
            <h1 className="mf-font-display mt-4 text-[42px] leading-[0.92] text-[var(--mf-text)]">Eleva tu Estilo Cada Mes</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--mf-text-2)]">
              Selecciona un plan mensual y asegura tus beneficios premium en tu sucursal favorita.
            </p>
            {isClienteSession ? (
              <span className="mt-4 inline-flex items-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[var(--mf-accent)]">
                {membershipLoading
                  ? "Consultando estado..."
                  : membershipState?.estado_plan === "activo"
                    ? "Tienes un plan activo"
                    : "Sin plan activo"}
              </span>
            ) : null}
          </div>

          {branches.length > 1 ? (
            <div className="mf-glass-surface mt-6 overflow-hidden rounded-[26px] border border-[var(--mf-btn-border)]/80 p-4 sm:p-5">
              <div className="relative flex flex-col items-center gap-3 text-center">
                <div className="max-w-xl">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-text-2)]">
                    <Building2 size={14} strokeWidth={1.8} />
                    <span>Sucursal de membresías</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[var(--mf-text-2)]">Elige una sucursal para ver los planes disponibles.</p>
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
                        "inline-flex min-h-10 w-full items-center justify-between gap-2 rounded-full border px-4 py-2 text-sm transition-all duration-200 sm:justify-start lg:w-auto",
                        isActive
                          ? "border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]"
                          : "border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60 hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_8%)]",
                      ].join(" ")}
                    >
                      <span className={["inline-flex h-4 w-4 items-center justify-center rounded-full border", isActive ? "border-[var(--mf-accent-text)]/55 bg-[var(--mf-accent-text)]/15" : "border-[var(--mf-btn-border)] bg-transparent"].join(" ")}>
                        {isActive ? <CheckCircle2 size={11} strokeWidth={2.2} /> : null}
                      </span>
                      {branch.nombre_sucursal}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {status === "loading" ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Cargando planes</p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">Estamos consultando membresías disponibles.</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Error de membresías</p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">{errorMessage}</p>
              <button type="button" onClick={() => void loadPlans()} className="mf-accent-gradient mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold shadow-[var(--mf-shadow-accent)]">Reintentar</button>
            </div>
          ) : null}

          {status === "success" ? (
            plans.length > 0 ? (
              <section className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
                      <Crown size={18} strokeWidth={1.9} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Colección VIP</p>
                      <h2 className="mf-font-display text-[26px] leading-[1.1] text-[var(--mf-text)] sm:text-[30px] sm:leading-none">Planes de Membresía</h2>
                    </div>
                  </div>

                    {showCarouselControls ? (
                    <div className="hidden shrink-0 items-center gap-2 sm:flex">
                      <button type="button" onClick={() => handleScroll("left")} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]" aria-label="Desplazar a la izquierda">
                        <ChevronLeft size={20} strokeWidth={1.5} />
                      </button>
                      <button type="button" onClick={() => handleScroll("right")} className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)] hover:text-[var(--mf-accent)]" aria-label="Desplazar a la derecha">
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
                  <div ref={scrollRef} className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth [&::-webkit-scrollbar]:hidden">
                    {plans.map((plan) => (
                      <PlanCard
                        key={`${plan.id_plan}:${plan.id_sucursal || "public"}`}
                        plan={plan}
                        onSelect={handlePlanSelect}
                        isSpotlight={normalizePlanCategory(plan?.categoria_nivel, 1) === spotlightCategory}
                        ctaLabel={isClienteSession ? membershipCtaLabel : "Quiero este plan"}
                        loading={acquiringPlanId === plan.id_plan}
                        disabled={Boolean(acquiringPlanId && acquiringPlanId !== plan.id_plan)}
                      />
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Sin planes publicados</p>
                <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">Aún no hay planes activos y visibles para esta sucursal.</p>
              </div>
            )
          ) : null}
        </main>
      </div>

      <PremiumBottomNav
        activeId="servicios"
        sideItems={navItems}
        fabItem={{ id: "agendar", label: "Agendar", icon: Plus, onClick: () => navigate(isAuthenticated ? "/home" : "/login") }}
        isDesktop
      />
    </div>
  );
}
