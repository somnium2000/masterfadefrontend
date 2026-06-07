import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Crown,
  Sparkles,
  Shield,
  Gem,
  Trophy,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  WalletCards,
  AlertTriangle,
} from "lucide-react";
import { useNotifications } from "../../../context/NotificationsContext.jsx";
import CardsCarousel from "../../../components/data/CardsCarousel.jsx";
import { Button } from "../../../components/ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";
import { listPublicCatalogBranches, listPublicPlansByBranch } from "../../public/lib/catalogApi.js";
import { setStoredClienteCatalogBranchId } from "../lib/clienteCatalogBranch.js";
import { getPlanCategoryTheme, normalizePlanCategory } from "../../plans/lib/planCategoryTheme.js";
import {
  cancelClientePlanBySubscription,
  confirmMembershipPayment,
  createMembershipOrder,
  createMembershipPaymentIntent,
  getClientePlanEstado,
} from "../lib/clienteApi.js";
import PlanPurchaseFlowDialog from "../../plans/components/PlanPurchaseFlowDialog.jsx";

const CATEGORY_ICONS = {
  1: Shield,
  2: Sparkles,
  3: Crown,
  4: Gem,
  5: Trophy,
};

const MEMBERSHIP_STATUS_LABELS = {
  activa: "Activa",
  pendiente_renovacion: "Pendiente de renovación",
  agotada: "Agotada",
  vencida: "Vencida",
  cancelada: "Cancelada",
  sin_plan_activo: "Sin plan activo",
};

const SAME_BRANCH_REPLACE_WARNING = "Al cambiar de plan perderás los servicios y cortesías restantes del plan actual en esta sucursal.";
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

function isPlanOperationalForCoverage(planLike) {
  return String(planLike?.estado_visible || "").trim().toLowerCase() === "activa";
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

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "L 0.00";
  return `L ${amount.toFixed(2)}`;
}

function formatConsumptionDate(value) {
  if (!value) return "Sin fecha";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sin fecha";
  return parsed.toLocaleString("es-HN", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPlanAcquisitionDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("es-HN", {
    timeZone: "America/Tegucigalpa",
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
}

function isOperationalMembershipConsumption(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.invalidado) return false;
  const sourceKind = String(entry.source_kind || "").trim().toLowerCase();
  if (sourceKind && sourceKind !== "appointment_completed") return false;
  return true;
}

function toBenefitItems(rawBenefits) {
  if (Array.isArray(rawBenefits)) return rawBenefits;
  if (rawBenefits && Array.isArray(rawBenefits.items)) return rawBenefits.items;
  return [];
}

function normalizeBenefitName(item = {}, fallback) {
  return String(item?.nombre || item?.codigo || fallback || "Beneficio").trim();
}

function resolvePlanBenefitsSnapshot(activePlan) {
  const candidates = [
    activePlan?.beneficios_snapshot,
    activePlan?.plan_snapshot?.beneficios,
    activePlan?.beneficios,
  ];
  for (const candidate of candidates) {
    const items = toBenefitItems(candidate);
    if (items.length) return items;
  }
  return [];
}

function buildDetailedBenefits(activePlan, type) {
  const key = type === "cortesia" ? "cortesias" : "servicios";
  const fallbackLabel = type === "cortesia" ? "Cortesia" : "Servicio";
  const remanentes = Array.isArray(activePlan?.remanentes?.[key]) ? activePlan.remanentes[key] : [];

  if (remanentes.length) {
    return remanentes.map((item) => ({
      nombre: normalizeBenefitName(item, fallbackLabel),
      total: Number(item?.total || 0),
      restante: Number(item?.restante || 0),
      hasRemainder: true,
    }));
  }

  const snapshotBenefits = resolvePlanBenefitsSnapshot(activePlan)
    .filter((benefit) => String(benefit?.tipo || "").toLowerCase() === type);
  return snapshotBenefits.map((item) => ({
    nombre: normalizeBenefitName(item, fallbackLabel),
    total: Number(item?.cantidad || 0),
    restante: null,
    hasRemainder: false,
  }));
}

function resolveActivePlansFromState(state) {
  const multi = Array.isArray(state?.planes_activos) ? state.planes_activos : [];
  const source = multi.length ? multi : (state?.plan_activo ? [state.plan_activo] : []);
  const deduped = new Map();
  source.forEach((plan) => {
    const id = String(plan?.id_suscripcion || "").trim();
    if (!id || deduped.has(id)) return;
    deduped.set(id, plan);
  });
  return Array.from(deduped.values());
}

function normalizePlan(plan) {
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
  index,
  recommendedKey,
  onPurchase,
  loading = false,
  disabled = false,
}) {
  const benefits = Array.isArray(plan?.beneficios) ? plan.beneficios : [];
  const categoryLevel = normalizePlanCategory(plan?.categoria_nivel, 1);
  const categoryTheme = getPlanCategoryTheme(categoryLevel);
  const Icon = CATEGORY_ICONS[categoryLevel] || Crown;
  const isRecommended = `${plan?.id_plan || ""}:${plan?.id_sucursal || "public"}` === recommendedKey;
  const missingBranchOffer = !plan?.id_plan_sucursal;
  const hasValidPrice = Number(plan?.precio_hnl) > 0;
  const canPurchase = !missingBranchOffer && hasValidPrice;

  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, ease: "easeOut", delay: Math.min(index * 0.04, 0.24) }}
      className="relative h-full overflow-hidden rounded-[24px] border p-5"
      style={{
        background: categoryTheme.cardGradient,
        borderColor: categoryTheme.cardBorder,
        boxShadow: categoryTheme.glow,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: categoryTheme.accentColor }}>
            Nivel {categoryLevel} · {categoryTheme.label}
          </p>
          <h2 className="mf-font-display mt-2 text-2xl leading-tight text-[var(--mf-text)]">
            {plan.nombre_plan}
          </h2>
          <p className="mt-1 text-xs uppercase tracking-[0.15em] text-[var(--mf-text-2)]">
            {plan.periodo_membresia_label || plan.periodo_membresia_codigo}
          </p>
        </div>

        <span
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
          style={{
            borderColor: categoryTheme.badgeBorder,
            background: categoryTheme.badgeTone,
            color: categoryTheme.iconColor,
          }}
          aria-hidden="true"
        >
          <Icon size={18} strokeWidth={2} />
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{
            borderColor: categoryTheme.badgeBorder,
            background: categoryTheme.badgeTone,
            color: categoryTheme.badgeColor,
          }}
        >
          {categoryTheme.label}
        </span>
        {isRecommended ? (
          <span className="inline-flex rounded-full border border-[var(--mf-accent)]/45 bg-[var(--mf-accent)]/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
            Recomendado
          </span>
        ) : null}
      </div>

      {plan.descripcion ? (
        <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">{plan.descripcion}</p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">{categoryTheme.helper}</p>
      )}

      <div className="mt-4">
        <p className="text-[30px] font-semibold leading-none text-[var(--mf-text)]">{formatPrice(plan.precio_hnl)}</p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-[var(--mf-text-2)]">
          Pago {plan.periodo_membresia_label || "mensual"}
        </p>
      </div>

      {benefits.length ? (
        <ul className="mt-4 space-y-2 text-sm text-[var(--mf-text)]">
          {benefits.map((beneficio, idx) => (
            <li key={`${plan.id_plan}:${idx}`} className="flex items-start gap-2.5 text-[var(--mf-text-2)]">
              <CheckCircle2 size={14} className="mt-[2px] shrink-0" style={{ color: categoryTheme.accentColor }} />
              <span>
                <strong className="font-semibold text-[var(--mf-text)]">{beneficio.cantidad}x</strong>{" "}
                {beneficio.nombre}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        className="mt-5 w-full rounded-xl"
        onClick={() => onPurchase(plan)}
        disabled={disabled || loading || !canPurchase}
        title={missingBranchOffer ? "Este plan no tiene oferta valida para esta sucursal" : undefined}
      >
        {loading ? "Procesando..." : (canPurchase ? "Quiero este plan" : "Oferta pendiente")}
      </Button>
      {missingBranchOffer ? (
        <p className="mt-2 text-center text-xs text-amber-200">Este plan no tiene oferta valida para esta sucursal.</p>
      ) : null}
    </motion.article>
  );
}

export default function ClientePlanesPage() {
  const notifications = useNotifications();
  const { error: notifyError, success: notifySuccess, warning: notifyWarning } = notifications;
  const lastErrorMessageRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [plans, setPlans] = useState([]);
  const [membershipState, setMembershipState] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [cancelingSubscriptionId, setCancelingSubscriptionId] = useState("");
  const [loadingPlanOfferId, setLoadingPlanOfferId] = useState("");

  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState("summary");
  const [purchaseOrderSummary, setPurchaseOrderSummary] = useState(null);
  const [membershipPaymentIntent, setMembershipPaymentIntent] = useState(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseErrorMessage, setPurchaseErrorMessage] = useState("");
  const [purchaseCompleted, setPurchaseCompleted] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmDialogMode, setConfirmDialogMode] = useState("");
  const [pendingPlanSelection, setPendingPlanSelection] = useState(null);
  const [pendingCancelPlan, setPendingCancelPlan] = useState(null);
  const [coverageInfoOpen, setCoverageInfoOpen] = useState(false);
  const [selectedSimulationAmount, setSelectedSimulationAmount] = useState(MEMBERSHIP_SIMULATION_SCENARIOS[0].value);
  const plansSectionRef = useRef(null);
  const showMembershipSimulator = shouldShowMembershipSimulator();

  const fetchPlans = useCallback(async (selectedBranchId) => {
    const safeBranchId = String(selectedBranchId || "").trim();
    if (!safeBranchId) {
      setPlans([]);
      return;
    }
    const plansPayload = await listPublicPlansByBranch(safeBranchId);
    const mappedPlans = (Array.isArray(plansPayload?.plans) ? plansPayload.plans : [])
      .map(normalizePlan)
      .filter(Boolean);
    setPlans(mappedPlans);
  }, []);

  const fetchMembershipState = useCallback(async () => {
    setMembershipLoading(true);
    try {
      const payload = await getClientePlanEstado();
      setMembershipState(payload);
      lastErrorMessageRef.current = "";
    } catch (error) {
      const message = error?.data?.error?.message || error?.message || "No se pudo cargar tu estado de membresia.";
      if (lastErrorMessageRef.current !== message) {
        lastErrorMessageRef.current = message;
        notifyError(message);
      }
    } finally {
      setMembershipLoading(false);
    }
  }, [notifyError]);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const branchPayload = await listPublicCatalogBranches();
      const nextBranches = Array.isArray(branchPayload?.branches) ? branchPayload.branches : [];
      setBranches(nextBranches);
      setBranchId("");
      setPlans([]);
      await fetchMembershipState();
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || "No se pudo cargar el catalogo de planes.");
    } finally {
      setLoading(false);
    }
  }, [fetchMembershipState, notifyError]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  async function handleBranchChange(event) {
    const nextBranchId = String(event.target.value || "").trim();
    setBranchId(nextBranchId);
    setStoredClienteCatalogBranchId(nextBranchId);

    setLoading(true);
    try {
      await fetchPlans(nextBranchId);
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || "No se pudieron cargar los planes para la sucursal.");
    } finally {
      setLoading(false);
    }
  }

  function resetPurchaseFlow() {
    setPurchaseStep("summary");
    setPurchaseOrderSummary(null);
    setMembershipPaymentIntent(null);
    setPurchaseLoading(false);
    setPurchaseErrorMessage("");
    setPurchaseCompleted(false);
    setPurchaseModalOpen(false);
  }

  async function createOrderForPlanOffer(offerId) {
    setLoadingPlanOfferId(offerId);
    try {
      const orderResponse = await createMembershipOrder(offerId);
      const summary = orderResponse?.data || orderResponse;
      setPurchaseOrderSummary(summary);
      setMembershipPaymentIntent(null);
      setPurchaseErrorMessage("");
      setPurchaseStep("summary");
      setPurchaseCompleted(false);
      setPurchaseModalOpen(true);
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || "No se pudo crear la orden del plan.");
    } finally {
      setLoadingPlanOfferId("");
    }
  }

  async function handlePurchasePlan(plan) {
    if (!branchId) {
      notifyWarning("Selecciona una sucursal antes de comprar un plan.");
      return;
    }

    const offerId = resolvePlanOfferId(plan);
    if (!offerId) {
      notifyWarning("Este plan no tiene oferta valida para esta sucursal.");
      return;
    }

    const activePlans = resolveActivePlansFromState(membershipState);
    const hasActivePlanInBranch = activePlans.some((entry) =>
      String(entry?.id_sucursal_contratada || "").trim() === branchId
      && ["activa", "pendiente_renovacion"].includes(String(entry?.estado_visible || entry?.estado_suscripcion_codigo || "").toLowerCase())
    );

    if (hasActivePlanInBranch) {
      setPendingPlanSelection({ plan, offerId });
      setConfirmDialogMode("replace_plan");
      setConfirmDialogOpen(true);
      return;
    }

    await createOrderForPlanOffer(offerId);
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
      setPurchaseErrorMessage(error?.data?.error?.message || "No se pudo crear el intent de pago.");
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
      await Promise.all([
        fetchMembershipState(),
        fetchPlans(branchId),
      ]);
      notifySuccess("Pago confirmado. Tu suscripción ya está activa.");
    } catch (error) {
      setPurchaseErrorMessage(error?.data?.error?.message || "No se pudo confirmar el pago.");
    } finally {
      setPurchaseLoading(false);
    }
  }

  function handleOpenCancelPlanDialog(plan, planBranchName) {
    if (!plan?.id_suscripcion) return;
    setPendingCancelPlan({
      id_suscripcion: String(plan.id_suscripcion),
      nombre_plan: plan?.nombre_plan || "Plan",
      sucursal_nombre: planBranchName || plan?.sucursal_nombre || "Sucursal",
      inicio_at: plan?.inicio_at || null,
    });
    setConfirmDialogMode("cancel_plan");
    setConfirmDialogOpen(true);
  }

  async function handleCancelMembership(plan) {
    const subscriptionId = String(plan?.id_suscripcion || "").trim();
    if (!subscriptionId) return;

    setCancelingSubscriptionId(subscriptionId);
    try {
      await cancelClientePlanBySubscription(subscriptionId);
      notifySuccess("Plan cancelado correctamente.");
      await fetchMembershipState();
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || "No se pudo cancelar el plan.");
    } finally {
      setCancelingSubscriptionId("");
    }
  }

  async function handleConfirmDialogContinue() {
    if (confirmDialogMode === "replace_plan") {
      const selectedOfferId = String(pendingPlanSelection?.offerId || "").trim();
      setConfirmDialogOpen(false);
      setConfirmDialogMode("");
      setPendingPlanSelection(null);
      setPendingCancelPlan(null);
      if (!selectedOfferId) return;
      await createOrderForPlanOffer(selectedOfferId);
      return;
    }

    if (confirmDialogMode === "cancel_plan") {
      setConfirmDialogOpen(false);
      setConfirmDialogMode("");
      setPendingPlanSelection(null);
      const planToCancel = pendingCancelPlan;
      setPendingCancelPlan(null);
      await handleCancelMembership(planToCancel);
    }
  }

  const recommendedPlanKey = useMemo(() => {
    if (!plans.length) return "";
    const topLevel = plans.reduce((maxLevel, plan) => Math.max(maxLevel, normalizePlanCategory(plan?.categoria_nivel, 1)), 1);
    const topPlan = plans.find((plan) => normalizePlanCategory(plan?.categoria_nivel, 1) === topLevel);
    if (!topPlan) return "";
    return `${topPlan.id_plan || ""}:${topPlan.id_sucursal || "public"}`;
  }, [plans]);

  const activePlans = useMemo(
    () => resolveActivePlansFromState(membershipState),
    [membershipState]
  );
  const activePlan = activePlans[0] || null;
  const operationalCoverageActive = isPlanOperationalForCoverage(activePlan);
  const operationalHistory = useMemo(
    () => (Array.isArray(membershipState?.historial_consumos) ? membershipState.historial_consumos : []).filter(isOperationalMembershipConsumption),
    [membershipState?.historial_consumos]
  );
  const activePlanByBranch = useMemo(() => {
    const map = new Map();
    activePlans.forEach((plan) => {
      const planBranchId = String(plan?.id_sucursal_contratada || "").trim();
      if (!planBranchId || map.has(planBranchId)) return;
      map.set(planBranchId, plan);
    });
    return map;
  }, [activePlans]);
  const hasActivePlanInSelectedBranch = Boolean(
    branchId
    && activePlanByBranch.has(branchId)
  );
  const membershipStateCode = String(membershipState?.estado_plan || "").trim().toLowerCase();
  const isExpiredMembership = membershipStateCode === "vencida";
  const lastPlan = membershipState?.ultimo_plan || null;
  const expiredPlanBranchId = String(lastPlan?.id_sucursal_contratada || "").trim();
  const expiredPlanId = String(lastPlan?.id_plan || "").trim();
  const expiredBranchHasPlans = Boolean(branchId && plans.length > 0);
  const expiredOriginalPlanStillAvailable = Boolean(
    expiredPlanId
    && plans.some((plan) => String(plan?.id_plan || "").trim() === expiredPlanId)
  );

  async function focusPlansForExpiredPlan() {
    const targetBranchId = expiredPlanBranchId || branchId;
    if (!targetBranchId) {
      notifyWarning("Selecciona una sucursal para revisar planes disponibles.");
      return;
    }

    if (targetBranchId !== branchId) {
      setBranchId(targetBranchId);
      setStoredClienteCatalogBranchId(targetBranchId);
      setLoading(true);
      try {
        await fetchPlans(targetBranchId);
      } catch (error) {
        notifyError(error?.data?.error?.message || error?.message || "No se pudieron cargar los planes para la sucursal.");
        return;
      } finally {
        setLoading(false);
      }
    }

    plansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-5">
      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Estado de membresía</p>
            <h2 className="mf-font-display mt-2 text-2xl text-[var(--mf-text)]">
              {membershipLoading
                ? "Consultando plan..."
                : activePlan?.nombre_plan || "Sin plan activo"}
            </h2>
            <p className="mt-1 text-sm text-[var(--mf-text-2)]">
              {membershipLoading
                ? "Estamos validando tu estado actual."
                : activePlan
                  ? `Vigente hasta ${new Date(activePlan.fin_at).toLocaleDateString("es-HN", { timeZone: "America/Tegucigalpa" })}.`
                  : "Adquiere un plan para desbloquear coberturas automáticas en tu agendamiento."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs font-semibold text-[var(--mf-accent)]">
              <ShieldCheck size={13} />
              Suscripción: {MEMBERSHIP_STATUS_LABELS[membershipState?.estado_plan] || "Sin plan"}
            </span>
            <span className={[
              "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
              operationalCoverageActive
                ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                : "border-amber-300/30 bg-amber-500/10 text-amber-100",
            ].join(" ")}>
              <Shield size={13} />
              Cobertura: {operationalCoverageActive ? "Operativo" : "No operativo para cobertura"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs font-semibold text-[var(--mf-text-2)]">
              <WalletCards size={13} />
              Titular: {Number(membershipState?.masterpuntos?.titular || 0)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              <Sparkles size={13} />
              Integrantes: {Number(membershipState?.masterpuntos?.integrante || 0)}
            </span>
            <Button type="button" variant="outline" size="sm" className="min-h-[30px] px-3 text-xs" onClick={() => setCoverageInfoOpen(true)}>
              Información
            </Button>
          </div>
        </div>

        {activePlans.length ? (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                Planes activos: {activePlans.length}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {activePlans.map((plan) => {
                const planBranchId = String(plan?.id_sucursal_contratada || "").trim();
                const planBranchName = planBranchId
                  ? (branches.find((branch) => branch.id_sucursal === planBranchId)?.nombre_sucursal || plan?.sucursal_nombre || "Sucursal")
                  : (plan?.sucursal_nombre || "Sucursal");
                const detailedServices = buildDetailedBenefits(plan, "servicio");
                const detailedCourtesies = buildDetailedBenefits(plan, "cortesia");
                const planOperational = isPlanOperationalForCoverage(plan);
                return (
                  <article key={plan.id_suscripcion} className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-[var(--mf-text)]">{plan?.nombre_plan || "Plan activo"}</h3>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                          Suscripción: {MEMBERSHIP_STATUS_LABELS[plan?.estado_visible] || plan?.estado_visible || "Activa"}
                        </span>
                        <span className={[
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                          planOperational
                            ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                            : "border-amber-300/30 bg-amber-500/10 text-amber-100",
                        ].join(" ")}>
                          Cobertura: {planOperational ? "Operativo" : "No operativo para cobertura"}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-[34px] px-3 text-xs"
                          disabled={Boolean(cancelingSubscriptionId && cancelingSubscriptionId !== plan.id_suscripcion)}
                          onClick={() => {
                            handleOpenCancelPlanDialog(plan, planBranchName);
                          }}
                        >
                          {cancelingSubscriptionId === plan.id_suscripcion ? "Cancelando..." : "Cancelar plan"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Sucursal</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{planBranchName}</p>
                      </div>
                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Vigencia</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">
                          {plan?.inicio_at ? new Date(plan.inicio_at).toLocaleDateString("es-HN", { timeZone: "America/Tegucigalpa" }) : "N/D"}
                          {" - "}
                          {plan?.fin_at ? new Date(plan.fin_at).toLocaleDateString("es-HN", { timeZone: "America/Tegucigalpa" }) : "N/D"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Tiempo restante</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">
                          <Clock3 className="mr-1 inline-block" size={14} />
                          {Number(plan?.tiempo_restante?.dias || 0)} d - {Number(plan?.tiempo_restante?.horas || 0)} h
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Servicios restantes</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--mf-text)]">
                          {Number(plan?.remanentes?.totales?.servicios_restantes || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Servicios incluidos</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--mf-text)]">
                          {Number(plan?.remanentes?.totales?.servicios_total || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Cortesías restantes</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--mf-text)]">
                          {Number(plan?.remanentes?.totales?.cortesias_restantes || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Cortesías incluidas</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--mf-text)]">
                          {Number(plan?.remanentes?.totales?.cortesias_total || 0)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Servicios incluidos</p>
                        {detailedServices.length ? (
                          <ul className="mt-2 space-y-2 text-sm">
                            {detailedServices.map((item, idx) => (
                              <li key={`${plan.id_suscripcion}-svc-${idx}`} className="flex items-center justify-between gap-2">
                                <span className="text-[var(--mf-text)]">{item.nombre}</span>
                                <span className="text-[var(--mf-text-2)]">
                                  {item.hasRemainder ? `${item.restante}/${item.total}` : `${item.total} incluidos`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-2 text-sm text-[var(--mf-text-2)]">Sin detalle por servicio disponible.</p>}
                      </div>

                      <div className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Cortesías incluidas</p>
                        {detailedCourtesies.length ? (
                          <ul className="mt-2 space-y-2 text-sm">
                            {detailedCourtesies.map((item, idx) => (
                              <li key={`${plan.id_suscripcion}-cort-${idx}`} className="flex items-center justify-between gap-2">
                                <span className="text-[var(--mf-text)]">{item.nombre}</span>
                                <span className="text-[var(--mf-text-2)]">
                                  {item.hasRemainder ? `${item.restante}/${item.total}` : `${item.total} incluidos`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : <p className="mt-2 text-sm text-[var(--mf-text-2)]">Sin detalle por cortesía disponible.</p>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          !membershipLoading ? (
            <p className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
              No tienes planes activos en este momento.
            </p>
          ) : null
        )}

        {!membershipLoading && operationalHistory.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
              Últimos consumos del plan
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)]">
              {operationalHistory
                .slice(0, 5)
                .map((entry) => (
                <li key={entry.id_consumo} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                  <span className="text-[var(--mf-text)]">
                    {entry?.item_tipo === "cortesia" ? "Cortesía" : "Servicio"} - {entry.item_nombre}
                  </span>
                  <div className="text-right text-xs text-[var(--mf-text-2)]">
                    <p>{formatConsumptionDate(entry.created_at)}</p>
                    <p>{entry.nombre_sucursal || "Sucursal no disponible"}</p>
                    {entry.nombre_usuario_ejecutor ? <p>Por: {entry.nombre_usuario_ejecutor}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!membershipLoading && isExpiredMembership ? (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-semibold">Tu plan anterior ya venció y requiere renovación.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void focusPlansForExpiredPlan()}>
                Renovar este plan
              </Button>
              <Button type="button" size="sm" onClick={() => void focusPlansForExpiredPlan()}>
                Ver otros planes
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section ref={plansSectionRef} className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Colección de membresías</p>
        <h1 className="mf-font-display mt-2 text-2xl text-[var(--mf-text)] sm:text-3xl">Planes por sucursal</h1>
        <p className="mt-1 text-sm text-[var(--mf-text-2)]">
          Debes seleccionar una sucursal para ver y comprar planes disponibles.
        </p>
        {showMembershipSimulator ? (
          <div className="mt-4 w-full max-w-sm">
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

        <div className="mt-4 w-full max-w-sm">
          <label className="mf-label">Sucursal</label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" size={14} />
            <select className="mf-select !pl-11 pr-10" value={branchId} onChange={(event) => void handleBranchChange(event)}>
              <option value="">Selecciona una sucursal</option>
              {branches.map((branch) => (
                <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>
              ))}
            </select>
          </div>
        </div>

        {hasActivePlanInSelectedBranch ? (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="inline-flex items-center gap-2 font-semibold"><AlertTriangle size={15} /> Advertencia de cambio de plan</p>
            <p className="mt-1">{SAME_BRANCH_REPLACE_WARNING}</p>
          </div>
        ) : null}

        {!loading && isExpiredMembership && expiredBranchHasPlans && !expiredOriginalPlanStillAvailable ? (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-semibold">El plan vencido ya no está disponible en esta sucursal.</p>
            <p className="mt-1">Revisa otros planes disponibles para renovar tu cobertura.</p>
          </div>
        ) : null}
      </section>

      {!branchId ? (
        <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
          Selecciona una sucursal para consultar planes.
        </p>
      ) : loading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 3 }).map((_, idx) => <div key={idx} className="mf-skeleton h-64 min-w-[280px] flex-1 rounded-[22px]" />)}
        </div>
      ) : plans.length ? (
        <section className="space-y-3">
          <div className="px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Niveles disponibles</p>
            <p className="text-sm text-[var(--mf-text-2)]">Desliza para explorar cada plan.</p>
          </div>
          <CardsCarousel
            items={plans}
            getItemKey={(plan) => `${plan.id_plan}:${plan.id_plan_sucursal || plan.id_sucursal || "public"}`}
            pageSizeByViewport={{ mobile: 1, tablet: 2, desktop: 3 }}
            gridClassName="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            compactControls
            showHeaderTag={false}
            renderItem={(plan, index, pageIndex) => {
              const planOfferId = resolvePlanOfferId(plan) || "";
              return (
                <PlanCard
                  plan={plan}
                  index={(pageIndex * 3) + index}
                  recommendedKey={recommendedPlanKey}
                  onPurchase={handlePurchasePlan}
                  loading={Boolean(planOfferId) && loadingPlanOfferId === planOfferId}
                  disabled={Boolean(loadingPlanOfferId && planOfferId && loadingPlanOfferId !== planOfferId)}
                />
              );
            }}
          />
        </section>
      ) : (
        <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
          No hay planes publicados para la sucursal seleccionada.
        </p>
      )}

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
        onBackToSummary={() => setPurchaseStep("summary")}
        onContinueToPayment={handleContinueToPayment}
        onConfirmPayment={handleConfirmPayment}
        onFinish={resetPurchaseFlow}
      />

      <Dialog
        open={confirmDialogOpen}
        onOpenChange={(nextOpen) => {
          setConfirmDialogOpen(nextOpen);
          if (!nextOpen) {
            setConfirmDialogMode("");
            setPendingPlanSelection(null);
            setPendingCancelPlan(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialogMode === "replace_plan" ? "Cambiar de plan" : "Cancelar plan"}</DialogTitle>
            <DialogDescription>
              {confirmDialogMode === "replace_plan"
                ? "Al cambiar de plan perderás los servicios y cortesías restantes del plan actual en esta sucursal."
                : `Cancelarás tu plan ${pendingCancelPlan?.nombre_plan || "seleccionado"} en ${pendingCancelPlan?.sucursal_nombre || "esta sucursal"}.`}
            </DialogDescription>
          </DialogHeader>
          {confirmDialogMode === "cancel_plan" ? (
            <div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
              <p>La cancelación es inmediata.</p>
              <p>Perderás servicios, cortesías y remanentes disponibles.</p>
              <p>Tu cita ya confirmada se conservará.</p>
              <p>
                {formatPlanAcquisitionDate(pendingCancelPlan?.inicio_at)
                  ? `No podrás usar este plan adquirido en fecha ${formatPlanAcquisitionDate(pendingCancelPlan?.inicio_at)} para nuevas citas.`
                  : "No podrás usar este plan para nuevas citas."}
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmDialogOpen(false);
                setConfirmDialogMode("");
                setPendingPlanSelection(null);
              }}
            >
              {confirmDialogMode === "cancel_plan" ? "No cancelar" : "Cancelar"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                void handleConfirmDialogContinue();
              }}
            >
              {confirmDialogMode === "cancel_plan" ? "Si, cancelar plan" : "Continuar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={coverageInfoOpen} onOpenChange={setCoverageInfoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Información de cobertura</DialogTitle>
            <DialogDescription>
              La membresía cubre solo al titular. Los acompañantes se cobran como cita normal. Los extras no incluidos se pagan aparte. Si agendas en otra sucursal, el pago se realiza como cita normal. Solo una membresía en estado activa aplica cobertura.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setCoverageInfoOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

