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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MasterfadeLogo from "../../../components/branding/MasterfadeLogo.jsx";
import PremiumBottomNav from "../../../components/navigation/PremiumBottomNav.jsx";
import ThemeSwitcher from "../../../components/theme/ThemeSwitcher.jsx";
import { useAuth } from "../../../context/AuthContext.jsx";
import { useNotifications } from "../../../context/NotificationsContext.jsx";
import { listPublicCatalogBranches, listPublicPlansByBranch } from "../lib/catalogApi.js";
import { subscribeCatalogSync } from "../../../lib/catalogSync.js";
import { getPlanCategoryTheme, normalizePlanCategory } from "../../plans/lib/planCategoryTheme.js";
import {
  confirmMembershipPayment,
  createMembershipOrder,
  createMembershipPaymentIntent,
  getClientePlanEstado,
} from "../../cliente/lib/clienteApi.js";
import PlanPurchaseFlowDialog from "../../plans/components/PlanPurchaseFlowDialog.jsx";

const CATEGORY_ICONS = {
  1: Shield,
  2: Sparkles,
  3: Crown,
  4: Gem,
  5: Trophy,
};

const MEMBERSHIP_SIMULATION_SCENARIOS = [
  { value: 1.00, label: "Aprobado (1.00)" },
  { value: 1.05, label: "Rechazado (1.05)" },
  { value: 1.23, label: "Tarjeta vencida (1.23)" },
  { value: 1.56, label: "CVV incorrecto (1.56)" },
  { value: 1.57, label: "Timeout (1.57)" },
];

function readEnvFlag(value, fallback = false) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function shouldShowMembershipSimulator() {
  if (import.meta.env.PROD) return false;
  const provider = String(
    import.meta.env.VITE_PAYMENT_PROVIDER
    || import.meta.env.VITE_PAYMENT_PROVIDER_CODE
    || ""
  ).trim().toLowerCase();
  if (provider !== "todopago" && provider !== "simulator") return false;
  return readEnvFlag(import.meta.env.VITE_ENABLE_PAYMENT_SIMULATOR, false)
    && readEnvFlag(import.meta.env.VITE_ENABLE_QA_PAYMENT_SIMULATION, false);
}

function resolvePlanOfferId(plan) {
  if (!plan || typeof plan !== "object") return null;
  const candidates = [
    plan.id_plan_sucursal,
    plan.plan_sucursal_id,
    plan.id_oferta,
    plan.id_membership_plan_sucursal,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || "").trim();
    if (normalized) return normalized;
  }
  return null;
}

function normalizePublicPlan(plan) {
  if (!plan || typeof plan !== "object") return null;
  const normalizedPrice = Number(plan?.precio_hnl ?? plan?.precio ?? 0);
  return {
    ...plan,
    id_plan: String(plan?.id_plan || plan?.plan_id || "").trim() || null,
    id_plan_sucursal: resolvePlanOfferId(plan),
    nombre_plan: String(plan?.nombre_plan || plan?.nombre || "").trim() || "Plan",
    precio_hnl: Number.isFinite(normalizedPrice) ? normalizedPrice : 0,
  };
}

function PlanCard({
  plan,
  onSelect,
  isSpotlight = false,
  ctaLabel = "Quiero este plan",
  disabled = false,
  loading = false,
}) {
  const benefits = Array.isArray(plan?.beneficios) ? plan.beneficios : [];
  const serviceBenefits = benefits.filter((benefit) => String(benefit?.tipo || "").toLowerCase() !== "cortesia");
  const courtesyBenefits = benefits.filter((benefit) => String(benefit?.tipo || "").toLowerCase() === "cortesia");
  const categoryLevel = normalizePlanCategory(plan?.categoria_nivel, 1);
  const categoryTheme = getPlanCategoryTheme(categoryLevel);
  const CategoryIcon = CATEGORY_ICONS[categoryLevel] || Crown;
  const missingBranchOffer = !plan?.id_plan_sucursal;
  const hasValidPrice = Number(plan?.precio_hnl) > 0;
  const canPurchase = !missingBranchOffer && hasValidPrice;

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
            Categoria {categoryLevel} - {categoryTheme.label}
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
            Mas alto
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
        disabled={disabled || loading || !canPurchase}
        title={missingBranchOffer ? "Este plan no tiene oferta valida para esta sucursal" : undefined}
        className="mt-4 inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed"
        style={{
          background: categoryTheme.badgeTone,
          borderColor: categoryTheme.badgeBorder,
          color: categoryTheme.badgeColor,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), ${categoryTheme.glow}`,
        }}
      >
        {loading ? "Procesando..." : (canPurchase ? ctaLabel : "Oferta pendiente")}
      </button>
      {missingBranchOffer ? (
        <p className="mt-2 text-center text-xs text-amber-200">Este plan no tiene oferta valida para esta sucursal.</p>
      ) : null}
    </motion.article>
  );
}

export default function MembershipPlansPage() {
  const navigate = useNavigate();
  const { isAuthenticated, roles = [] } = useAuth();
  const notifications = useNotifications();
  const isMountedRef = useRef(true);
  const selectedBranchRef = useRef("");
  const isClienteSession = Boolean(isAuthenticated && Array.isArray(roles) && roles.includes("cliente"));

  const [status, setStatus] = useState("loading");
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [plans, setPlans] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [membershipState, setMembershipState] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(false);
  const [processingPlanOfferId, setProcessingPlanOfferId] = useState("");

  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState("summary");
  const [purchaseOrderSummary, setPurchaseOrderSummary] = useState(null);
  const [membershipPaymentIntent, setMembershipPaymentIntent] = useState(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseErrorMessage, setPurchaseErrorMessage] = useState("");
  const [purchaseCompleted, setPurchaseCompleted] = useState(false);
  const [selectedSimulationAmount, setSelectedSimulationAmount] = useState(MEMBERSHIP_SIMULATION_SCENARIOS[0].value);

  const scrollRef = useRef(null);
  const showMembershipSimulator = shouldShowMembershipSimulator();

  const resetPurchaseFlow = useCallback(() => {
    setPurchaseStep("summary");
    setPurchaseOrderSummary(null);
    setMembershipPaymentIntent(null);
    setPurchaseLoading(false);
    setPurchaseErrorMessage("");
    setPurchaseCompleted(false);
    setPurchaseModalOpen(false);
  }, []);

  const loadPlansByBranch = useCallback(async (branchId) => {
    const safeBranchId = String(branchId || "").trim();
    if (!safeBranchId) {
      setPlans([]);
      setStatus("idle");
      return;
    }

    setStatus("loading");
    setErrorMessage("");
    try {
      const response = await listPublicPlansByBranch(safeBranchId);
      if (!isMountedRef.current) return;
      const rawPlans = Array.isArray(response?.plans) ? response.plans : [];
      const normalizedPlans = rawPlans
        .map(normalizePublicPlan)
        .filter(Boolean)
        .filter((plan) => {
          const price = Number(plan?.precio_hnl);
          return Number.isFinite(price) && price > 0;
        });
      setPlans(normalizedPlans);
      setStatus("success");
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorMessage(error?.data?.error?.message || error?.message || "No se pudo cargar el catalogo de planes.");
      setStatus("error");
    }
  }, []);

  const loadMembershipState = useCallback(async () => {
    if (!isClienteSession) {
      setMembershipState(null);
      return;
    }
    setMembershipLoading(true);
    try {
      const payload = await getClientePlanEstado();
      if (!isMountedRef.current) return;
      setMembershipState(payload);
    } catch {
      if (!isMountedRef.current) return;
      setMembershipState(null);
    } finally {
      if (isMountedRef.current) setMembershipLoading(false);
    }
  }, [isClienteSession]);

  useEffect(() => {
    isMountedRef.current = true;
    void (async () => {
      setStatus("loading");
      setErrorMessage("");
      try {
        const branchResult = await listPublicCatalogBranches();
        if (!isMountedRef.current) return;
        const nextBranches = Array.isArray(branchResult?.branches)
          ? branchResult.branches.filter((branch) => branch?.id_sucursal)
          : [];
        setBranches(nextBranches);
        setStatus("idle");
      } catch (error) {
        if (!isMountedRef.current) return;
        setErrorMessage(error?.data?.error?.message || error?.message || "No se pudieron cargar las sucursales.");
        setStatus("error");
      }
    })();

    const unsubscribe = subscribeCatalogSync(() => {
      if (!isMountedRef.current) return;
      const currentBranchId = selectedBranchRef.current;
      if (!currentBranchId) return;
      void loadPlansByBranch(currentBranchId);
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [loadPlansByBranch]);

  useEffect(() => {
    void loadMembershipState();
  }, [loadMembershipState]);

  function handleBranchChange(nextBranchId) {
    const safeId = String(nextBranchId || "").trim();
    selectedBranchRef.current = safeId;
    setSelectedBranchId(safeId);
    void loadPlansByBranch(safeId);
  }

  function handleScroll(direction) {
    if (!scrollRef.current) return;
    const track = scrollRef.current;
    const firstCard = track.querySelector("[data-plan-card='true']");
    const styles = window.getComputedStyle(track);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "16") || 16;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    const cardsPerStep = isDesktop ? 3 : 1;
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width : track.clientWidth;
    const step = (cardWidth + gap) * cardsPerStep;
    track.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
  }

  async function handlePlanSelect(plan) {
    if (!selectedBranchId) {
      notifications.warning("Selecciona una sucursal antes de continuar.");
      return;
    }

    if (!isAuthenticated) {
      const params = new URLSearchParams();
      params.set("next", "/membresias-vip");
      params.set("intent", "seleccionar_plan");
      params.set("id_sucursal", selectedBranchId);
      if (plan?.id_plan) params.set("id_plan", String(plan.id_plan));
      navigate(`/login?${params.toString()}`);
      return;
    }

    if (!isClienteSession) {
      notifications.warning("Esta compra solo esta disponible para perfiles cliente.");
      navigate("/home");
      return;
    }

    const planBranchOfferId = resolvePlanOfferId(plan);
    if (!planBranchOfferId) {
      notifications.warning("Este plan no tiene oferta valida para esta sucursal.");
      return;
    }

    setProcessingPlanOfferId(planBranchOfferId);
    try {
      const orderResponse = await createMembershipOrder(planBranchOfferId);
      const summary = orderResponse?.data || orderResponse;
      setPurchaseOrderSummary(summary);
      setMembershipPaymentIntent(null);
      setPurchaseErrorMessage("");
      setPurchaseStep("summary");
      setPurchaseCompleted(false);
      setPurchaseModalOpen(true);
    } catch (error) {
      notifications.error(error?.data?.error?.message || error?.message || "No se pudo crear la orden de compra.");
    } finally {
      setProcessingPlanOfferId("");
    }
  }

  async function handleContinueToPayment() {
    const orderId = String(purchaseOrderSummary?.id_order || "").trim();
    if (!orderId || purchaseLoading) return;

    setPurchaseLoading(true);
    setPurchaseErrorMessage("");
    try {
      const intentResponse = await createMembershipPaymentIntent(orderId);
      const intentData = intentResponse?.data || intentResponse;
      setMembershipPaymentIntent(intentData);
      setPurchaseStep("payment");
    } catch (error) {
      setPurchaseErrorMessage(error?.data?.error?.message || "No se pudo iniciar el pago del plan.");
    } finally {
      setPurchaseLoading(false);
    }
  }

  async function handleConfirmPayment() {
    if (purchaseLoading || purchaseCompleted) return;
    const paymentIntentId = String(membershipPaymentIntent?.id_payment_intent || "").trim();
    if (!paymentIntentId) {
      setPurchaseErrorMessage("No hay intent de pago disponible para confirmar.");
      return;
    }

    setPurchaseLoading(true);
    setPurchaseErrorMessage("");
    try {
      await confirmMembershipPayment(paymentIntentId, {
        monto_prueba_hnl: showMembershipSimulator ? selectedSimulationAmount : undefined,
      });
      setPurchaseCompleted(true);
      setPurchaseStep("success");
      await loadMembershipState();
      notifications.success("Pago confirmado. Tu plan ya esta activo.");
    } catch (error) {
      setPurchaseErrorMessage(error?.data?.error?.message || "No se pudo confirmar el pago del plan.");
    } finally {
      setPurchaseLoading(false);
    }
  }

  const showCarouselControls = plans.length > 3;
  const spotlightCategory = plans.reduce(
    (maxLevel, currentPlan) => Math.max(maxLevel, normalizePlanCategory(currentPlan?.categoria_nivel, 1)),
    1
  );
  const membershipCtaLabel = "Quiero este plan";

  const selectedBranchName = useMemo(
    () => branches.find((branch) => branch.id_sucursal === selectedBranchId)?.nombre_sucursal || "",
    [branches, selectedBranchId]
  );

  const navItems = [
    { id: "inicio", label: "Inicio", icon: House, onClick: () => navigate("/") },
    { id: "servicios", label: "Servicios", icon: Scissors, onClick: () => navigate("/servicios") },
    { id: "login", label: isAuthenticated ? "Mi panel" : "Iniciar sesion", icon: LogIn, onClick: () => navigate(isAuthenticated ? "/home" : "/login") },
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
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Membresias VIP</p>
            <h1 className="mf-font-display mt-4 text-[42px] leading-[0.92] text-[var(--mf-text)]">Eleva tu Estilo Cada Mes</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--mf-text-2)]">
              Selecciona la sucursal donde usaras tu plan y completa tu compra en minutos.
            </p>
            {showMembershipSimulator ? (
              <div className="mt-4 w-full max-w-sm text-left">
                <label className="mf-label">Escenario simulator</label>
                <select
                  className="mf-select"
                  value={String(selectedSimulationAmount)}
                  onChange={(event) => setSelectedSimulationAmount(Number(event.target.value || MEMBERSHIP_SIMULATION_SCENARIOS[0].value))}
                >
                  {MEMBERSHIP_SIMULATION_SCENARIOS.map((scenario) => (
                    <option key={scenario.value} value={scenario.value}>{scenario.label}</option>
                  ))}
                </select>
              </div>
            ) : null}
            {isClienteSession ? (
              <span className="mt-4 inline-flex items-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[var(--mf-accent)]">
                {membershipLoading
                  ? "Consultando estado..."
                  : membershipState?.estado_plan === "activa" || membershipState?.estado_plan === "pendiente_renovacion"
                    ? "Tienes un plan activo"
                    : "Sin plan activo"}
              </span>
            ) : null}
          </div>

          <div className="mf-glass-surface mt-6 overflow-hidden rounded-[26px] border border-[var(--mf-btn-border)]/80 p-4 sm:p-5">
            <div className="relative flex flex-col items-center gap-3 text-center">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-text-2)]">
                  <Building2 size={14} strokeWidth={1.8} />
                  <span>Sucursal de membresia</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--mf-text-2)]">Selecciona la sucursal donde usaras tu plan.</p>
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

          {!selectedBranchId && status !== "error" ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Sucursal requerida</p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">Debes seleccionar una sucursal para ver los planes disponibles.</p>
            </div>
          ) : null}

          {status === "loading" ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Cargando planes</p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">
                {selectedBranchName ? `Consultando planes en ${selectedBranchName}.` : "Consultando planes disponibles."}
              </p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Error de membresias</p>
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">{errorMessage}</p>
              <button type="button" onClick={() => void loadPlansByBranch(selectedBranchRef.current)} className="mf-accent-gradient mt-6 inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold shadow-[var(--mf-shadow-accent)]">Reintentar</button>
            </div>
          ) : null}

          {status === "success" && selectedBranchId ? (
            plans.length > 0 ? (
              <section className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
                      <Crown size={18} strokeWidth={1.9} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Coleccion VIP</p>
                      <h2 className="mf-font-display text-[26px] leading-[1.1] text-[var(--mf-text)] sm:text-[30px] sm:leading-none">Planes en {selectedBranchName || "Sucursal"}</h2>
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
                    {plans.map((plan) => {
                      const planOfferId = resolvePlanOfferId(plan) || "";
                      return (
                        <PlanCard
                          key={`${plan.id_plan || "plan"}:${planOfferId || plan.id_sucursal || "public"}`}
                          plan={plan}
                          onSelect={handlePlanSelect}
                          isSpotlight={normalizePlanCategory(plan?.categoria_nivel, 1) === spotlightCategory}
                          ctaLabel={membershipCtaLabel}
                          loading={Boolean(planOfferId) && processingPlanOfferId === planOfferId}
                          disabled={Boolean(processingPlanOfferId && planOfferId && processingPlanOfferId !== planOfferId)}
                        />
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : (
              <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Sin planes publicados</p>
                <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">Aun no hay planes activos y visibles para esta sucursal.</p>
              </div>
            )
          ) : null}
        </main>
      </div>

      <PlanPurchaseFlowDialog
        open={purchaseModalOpen}
        onOpenChange={(next) => {
          if (!next) resetPurchaseFlow();
          else setPurchaseModalOpen(true);
        }}
        step={purchaseStep}
        orderSummary={purchaseOrderSummary}
        paymentIntent={membershipPaymentIntent}
        loading={purchaseLoading}
        errorMessage={purchaseErrorMessage}
        disableClose={purchaseLoading}
        onCancel={resetPurchaseFlow}
        onContinueToPayment={handleContinueToPayment}
        onConfirmPayment={handleConfirmPayment}
        onFinish={resetPurchaseFlow}
      />

      <PremiumBottomNav
        activeId="servicios"
        sideItems={navItems}
        fabItem={{ id: "agendar", label: "Agendar", icon: Plus, onClick: () => navigate(isAuthenticated ? "/home" : "/login") }}
        isDesktop
      />
    </div>
  );
}
