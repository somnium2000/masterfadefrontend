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
  AlertTriangle,
} from "lucide-react";
import { useNotifications } from "../../../context/NotificationsContext.jsx";
import { useAuth } from "../../../context/AuthContext.jsx";
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
import { getStoredClienteCatalogBranchId, resolveValidClienteBranchId, setStoredClienteCatalogBranchId } from "../lib/clienteCatalogBranch.js";
import { getPlanCategoryTheme, normalizePlanCategory } from "../../plans/lib/planCategoryTheme.js";
import {
  cancelClientePlanBySubscription,
  confirmMembershipPayment,
  createMembershipOrder,
  createMembershipPaymentIntent,
  getClientePlanEstado,
  listClientePlanConsumosPorCita,
  queryMembershipPaymentStatus,
} from "../lib/clienteApi.js";
import PlanPurchaseFlowDialog from "../../plans/components/PlanPurchaseFlowDialog.jsx";
import { isQaVipCommercialVideoModeEnabled } from "../../plans/lib/qaVipCommercialVideoMode.js";
import { isQaVipPurchaseSimulationEnabled } from "../../plans/lib/qaVipPurchaseSimulation.js";
import useMembershipPaymentPolling from "../../plans/hooks/useMembershipPaymentPolling.js";
import { CLIENT_LOCK_MESSAGE } from "../lib/clientFeatureFlags.js";
import usePrivateCommerce from '../../../hooks/usePrivateCommerce.js';
import { getPixelPayCustomerMessage, isPixelPayUncertainError } from "../../payments/pixelPayPresentation.js";

const PIXELPAY_PENDING_MESSAGE = getPixelPayCustomerMessage({ pending_confirmation: true });
const PIXELPAY_DECLINED_MESSAGE = getPixelPayCustomerMessage({ customer_error_code: "PIXELPAY_PAYMENT_DECLINED" });

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
const APPROVED_MEMBERSHIP_SIMULATION_AMOUNT = MEMBERSHIP_SIMULATION_SCENARIOS[0].value;
const CLIENT_PURCHASE_ATTEMPT_STORAGE_KEY = "mf_cliente_vip_purchase_attempt_v1";
const PURCHASE_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readClientPurchaseAttempt() {
  try {
    const record = JSON.parse(window.sessionStorage.getItem(CLIENT_PURCHASE_ATTEMPT_STORAGE_KEY) || "null");
    if (record?.version !== 1 || !record.identity || !record.offerId
      || !PURCHASE_UUID_REGEX.test(String(record.branchId || ""))
      || !PURCHASE_UUID_REGEX.test(String(record.key || ""))
      || !["pending", "resolved"].includes(record.status)) return null;
    return record;
  } catch {
    return null;
  }
}

function storeClientPurchaseAttempt(record) {
  try {
    if (record) window.sessionStorage.setItem(CLIENT_PURCHASE_ATTEMPT_STORAGE_KEY, JSON.stringify(record));
    else window.sessionStorage.removeItem(CLIENT_PURCHASE_ATTEMPT_STORAGE_KEY);
  } catch {
    // AM: La referencia en memoria conserva la clave si sessionStorage no esta disponible.
  }
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
    if (!id || deduped.has(id) || ["cancelada", "vencida", "sin_plan_activo"].includes(String(plan.estado_visible || plan.estado_suscripcion_codigo || "").toLowerCase())) return;
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
  purchaseEnabled = true,
  lockLabel = "Proximamente...",
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
        disabled={disabled || loading || !canPurchase || !purchaseEnabled}
        title={
          !purchaseEnabled
            ? "La adquisicion de planes estara disponible proximamente."
            : missingBranchOffer
              ? "Este plan no tiene oferta valida para esta sucursal"
              : undefined
        }
      >
        {loading ? "Procesando..." : (!purchaseEnabled ? lockLabel : (canPurchase ? "Quiero este plan" : "Oferta pendiente"))}
      </Button>
      {missingBranchOffer ? (
        <p className="mt-2 text-center text-xs text-amber-200">Este plan no tiene oferta valida para esta sucursal.</p>
      ) : null}
    </motion.article>
  );
}

export default function ClientePlanesPage() {
  const { vipPurchase: CLIENT_PLAN_PURCHASE_ENABLED } = usePrivateCommerce();
  const { user, clienteId } = useAuth();
  const notifications = useNotifications();
  const { error: notifyError, success: notifySuccess, warning: notifyWarning } = notifications;

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [plans, setPlans] = useState([]);
  const [membershipSnapshot, setMembershipSnapshot] = useState(null);
  const [membershipError, setMembershipError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const initialRequestRef = useRef(0);
  const membershipRequestRef = useRef(0);
  const catalogRequestRef = useRef(0);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [historyQuery, setHistoryQuery] = useState({ page: 1, subscription: "" });
  const [consumptionSnapshot, setConsumptionPage] = useState(null);
  const [consumptionLoading, setConsumptionLoading] = useState(true);
  const [consumptionError, setConsumptionError] = useState("");
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const consumptionCursorRef = useRef(null);
  const [cancelingSubscriptionId, setCancelingSubscriptionId] = useState("");
  const [loadingPlanOfferId, setLoadingPlanOfferId] = useState("");

  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchaseStep, setPurchaseStep] = useState("summary");
  const [purchaseOrderSummary, setPurchaseOrderSummary] = useState(null);
  const [membershipPaymentIntent, setMembershipPaymentIntent] = useState(null);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseErrorMessage, setPurchaseErrorMessage] = useState("");
  const [purchaseCompleted, setPurchaseCompleted] = useState(false);
  const [purchaseConfirmation, setPurchaseConfirmation] = useState(null);
  const [purchasePendingConfirmation, setPurchasePendingConfirmation] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmDialogMode, setConfirmDialogMode] = useState("");
  const [pendingPlanSelection, setPendingPlanSelection] = useState(null);
  const [pendingCancelPlan, setPendingCancelPlan] = useState(null);
  const [coverageInfoOpen, setCoverageInfoOpen] = useState(false);
  const [selectedSimulationAmount, setSelectedSimulationAmount] = useState(MEMBERSHIP_SIMULATION_SCENARIOS[0].value);
  const plansSectionRef = useRef(null);
  const purchaseAttemptRef = useRef(null);
  const purchaseUserId = String(user?.id_usuario || user?.id || "").trim();
  const purchaseClientId = String(clienteId || user?.cliente_id || "").trim();
  const purchaseIdentity = purchaseUserId && purchaseClientId ? `${purchaseUserId}:${purchaseClientId}` : "";
  const readIdentityRef = useRef(purchaseIdentity);
  readIdentityRef.current = purchaseIdentity;
  const membershipState = membershipSnapshot?.identity === purchaseIdentity ? membershipSnapshot.data : null;
  const consumptionPage = consumptionSnapshot?.identity === purchaseIdentity ? consumptionSnapshot : null;
  const showMembershipSimulator = isQaVipPurchaseSimulationEnabled();
  const showVipCommercialVideo = showMembershipSimulator && isQaVipCommercialVideoModeEnabled();

  const fetchPlans = useCallback(async (selectedBranchId) => {
    const request = ++catalogRequestRef.current;
    const safeBranchId = String(selectedBranchId || "").trim();
    setPlans([]);
    setCatalogError("");
    if (!safeBranchId) { setLoading(false); return; }
    setLoading(true);
    try {
      const payload = await listPublicPlansByBranch(safeBranchId);
      if (request !== catalogRequestRef.current) return;
      setPlans((Array.isArray(payload?.plans) ? payload.plans : []).map(normalizePlan).filter(Boolean));
    } catch {
      if (request === catalogRequestRef.current) setCatalogError("No se pudieron cargar los planes de esta sucursal.");
    } finally {
      if (request === catalogRequestRef.current) setLoading(false);
    }
  }, []);

  const fetchMembershipState = useCallback(async () => {
    const request = ++membershipRequestRef.current;
    const identity = purchaseIdentity;
    setMembershipLoading(true);
    setMembershipError("");
    try {
      const payload = await getClientePlanEstado();
      if (request !== membershipRequestRef.current || readIdentityRef.current !== identity) return;
      setMembershipSnapshot({ identity, data: payload });
      return payload;
    } catch {
      if (request === membershipRequestRef.current && readIdentityRef.current === identity) {
        setMembershipSnapshot(null);
        setMembershipError("No se pudo consultar tu membresía. Intenta nuevamente.");
      }
    } finally {
      if (request === membershipRequestRef.current && readIdentityRef.current === identity) setMembershipLoading(false);
    }
  }, [purchaseIdentity]);

  const loadInitial = useCallback(async () => {
    const request = ++initialRequestRef.current;
    const identity = purchaseIdentity;
    setLoading(true);
    setCatalogError("");
    setConsumptionPage(null);
    try {
      const [branchPayload, state] = await Promise.all([listPublicCatalogBranches(), fetchMembershipState()]);
      if (request !== initialRequestRef.current || readIdentityRef.current !== identity) return;
      const nextBranches = Array.isArray(branchPayload?.branches) ? branchPayload.branches : [];
      setBranches(nextBranches);
      const stored = getStoredClienteCatalogBranchId();
      const candidate = nextBranches.some(branch => branch.id_sucursal === stored) ? stored : resolveActivePlansFromState(state)[0]?.id_sucursal_contratada;
      const nextBranchId = resolveValidClienteBranchId(candidate, nextBranches);
      setBranchId(nextBranchId);
      setStoredClienteCatalogBranchId(nextBranchId);
      await fetchPlans(nextBranchId);
    } catch {
      if (request === initialRequestRef.current && readIdentityRef.current === identity) { setCatalogError("No se pudieron cargar las sucursales. Intenta nuevamente."); setLoading(false); }
    }
  }, [fetchMembershipState, fetchPlans, purchaseIdentity]);

  const invalidateReads = useCallback(() => {
    initialRequestRef.current++;
    membershipRequestRef.current++;
    catalogRequestRef.current++;
  }, []);
  useEffect(() => {
    void loadInitial();
    return invalidateReads;
  }, [loadInitial, invalidateReads]);

  useEffect(() => {
    const stored = readClientPurchaseAttempt();
    if (!purchaseIdentity || stored?.identity !== purchaseIdentity
      || !stored?.orderSummary || !stored?.paymentIntent) return;
    purchaseAttemptRef.current = stored;
    setPurchaseOrderSummary(stored.orderSummary);
    setMembershipPaymentIntent(stored.paymentIntent);
    setPurchasePendingConfirmation(true);
    setPurchaseErrorMessage(PIXELPAY_PENDING_MESSAGE);
    setPurchaseStep("payment");
    setPurchaseModalOpen(true);
  }, [purchaseIdentity, CLIENT_PLAN_PURCHASE_ENABLED]);

  async function handleBranchChange(event) {
    const nextBranchId = String(event.target.value || "").trim();
    setBranchId(nextBranchId);
    setStoredClienteCatalogBranchId(nextBranchId);
    await fetchPlans(nextBranchId);
  }

  function resetPurchaseFlow() {
    setPurchaseConfirmation(null);
    setPurchaseStep("summary");
    setPurchaseOrderSummary(null);
    setMembershipPaymentIntent(null);
    setPurchaseLoading(false);
    setPurchaseErrorMessage("");
    setPurchaseCompleted(false);
    setPurchasePendingConfirmation(false);
    setPurchaseModalOpen(false);
  }

  function discardPurchaseFlow() {
    purchaseAttemptRef.current = null;
    storeClientPurchaseAttempt(null);
    resetPurchaseFlow();
  }

  function getPurchaseAttempt(offerId) {
    const stored = purchaseAttemptRef.current || readClientPurchaseAttempt();
    if (stored?.identity === purchaseIdentity && stored.offerId === offerId
      && stored.branchId === branchId && ["pending", "resolved"].includes(stored.status)) {
      purchaseAttemptRef.current = stored;
      return stored;
    }
    const key = globalThis.crypto?.randomUUID?.();
    if (!purchaseIdentity || !PURCHASE_UUID_REGEX.test(String(key || ""))) {
      throw Object.assign(new Error("No se pudo proteger la compra"), { code: "PURCHASE_KEY_UNAVAILABLE" });
    }
    const attempt = { version: 1, identity: purchaseIdentity, offerId, branchId, key, status: "pending" };
    purchaseAttemptRef.current = attempt;
    storeClientPurchaseAttempt(attempt);
    return attempt;
  }

  function markPurchaseAttemptResolved(attempt, extra = {}) {
    const resolved = { ...attempt, ...extra, status: "resolved" };
    purchaseAttemptRef.current = resolved;
    storeClientPurchaseAttempt(resolved);
  }

  function notifyPlanPurchaseLocked() {
    notifyWarning("La adquisicion de planes estara disponible proximamente.");
  }

  async function createOrderForPlanOffer(offerId) {
    if (!CLIENT_PLAN_PURCHASE_ENABLED) {
      notifyPlanPurchaseLocked();
      return;
    }
    setLoadingPlanOfferId(offerId);
    try {
      const attempt = getPurchaseAttempt(offerId);
      const orderResponse = await createMembershipOrder(offerId, { idempotencyKey: attempt.key });
      const summary = orderResponse?.data || orderResponse;
      setPurchaseOrderSummary(summary);
      const recoveredIntent = summary?.pending_reconciliation && summary?.id_payment_intent
        ? { id_payment_intent: summary.id_payment_intent, estado_intent_codigo: "pendiente_confirmacion" }
        : null;
      setMembershipPaymentIntent(recoveredIntent);
      setPurchasePendingConfirmation(Boolean(recoveredIntent));
      setPurchaseErrorMessage(recoveredIntent
        ? PIXELPAY_PENDING_MESSAGE : "");
      setPurchaseStep(recoveredIntent ? "payment" : "summary");
      setPurchaseCompleted(false);
      setPurchaseModalOpen(true);
      markPurchaseAttemptResolved(attempt, { orderSummary: summary, paymentIntent: recoveredIntent });
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || "No se pudo crear la orden del plan.");
    } finally {
      setLoadingPlanOfferId("");
    }
  }

  async function handlePurchasePlan(plan) {
    if (!CLIENT_PLAN_PURCHASE_ENABLED) {
      notifyPlanPurchaseLocked();
      return;
    }
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
    if (!CLIENT_PLAN_PURCHASE_ENABLED) {
      notifyPlanPurchaseLocked();
      return;
    }
    const orderId = String(purchaseOrderSummary?.id_order || "").trim();
    if (!orderId || purchaseLoading) return;

    setPurchaseLoading(true);
    setPurchaseErrorMessage("");
    try {
      const intentResponse = await createMembershipPaymentIntent(orderId);
      const intentData = intentResponse?.data || intentResponse;
      setMembershipPaymentIntent(intentData);
      if (purchaseAttemptRef.current) {
        markPurchaseAttemptResolved(purchaseAttemptRef.current, {
          orderSummary: purchaseOrderSummary,
          paymentIntent: intentData,
        });
      }
      const isPending = String(intentData?.estado_intent_codigo || "").trim().toLowerCase() === "pendiente_confirmacion";
      setPurchasePendingConfirmation(isPending);
      if (isPending) setPurchaseErrorMessage(PIXELPAY_PENDING_MESSAGE);
      setPurchaseStep("payment");
    } catch (error) {
      setPurchaseErrorMessage(getPixelPayCustomerMessage(error));
    } finally {
      setPurchaseLoading(false);
    }
  }

  async function handleConfirmPayment(paymentDetails = {}) {
    if (!CLIENT_PLAN_PURCHASE_ENABLED) {
      notifyPlanPurchaseLocked();
      return;
    }
    if (purchaseLoading || purchaseCompleted || purchasePendingConfirmation) return;
    const paymentIntentId = String(membershipPaymentIntent?.id_payment_intent || "").trim();
    if (!paymentIntentId) {
      setPurchaseErrorMessage("No hay intent de pago disponible para confirmar.");
      return;
    }

    setPurchaseLoading(true);
    setPurchaseErrorMessage("");
    try {
      const paymentResult = await confirmMembershipPayment(paymentIntentId, {
        ...paymentDetails,
        monto_prueba_hnl: showMembershipSimulator
          ? (showVipCommercialVideo ? APPROVED_MEMBERSHIP_SIMULATION_AMOUNT : selectedSimulationAmount)
          : undefined,
      });
      if (paymentResult?.pending_confirmation) {
        setPurchasePendingConfirmation(true);
        setPurchaseErrorMessage(PIXELPAY_PENDING_MESSAGE);
        return;
      }
      if (paymentResult?.estado_intent_codigo === "fallido") {
        setPurchaseErrorMessage(getPixelPayCustomerMessage(paymentResult));
        return;
      }
      setPurchaseConfirmation(paymentResult);
      setPurchaseCompleted(true);
      setPurchaseStep("success");
      await Promise.all([
        fetchMembershipState(),
        fetchPlans(branchId),
      ]);
    } catch (error) {
      if (isPixelPayUncertainError(error)) {
        setPurchasePendingConfirmation(true);
        setPurchaseErrorMessage(getPixelPayCustomerMessage(error));
        // AM: El polling existente consulta el estado persistido sin solapar otra solicitud.
        return;
      }
      setPurchaseErrorMessage(getPixelPayCustomerMessage(error));
    } finally {
      setPurchaseLoading(false);
    }
  }

  const handleMembershipPollResult = useCallback((result) => {
    const normalized = String(result?.normalized_status || "PENDIENTE").toUpperCase();
    if (normalized === "PAGADO") {
      setPurchasePendingConfirmation(false);
      setPurchaseConfirmation(result);
      setPurchaseCompleted(true);
      setPurchaseStep("success");
      setPurchaseErrorMessage("");
      purchaseAttemptRef.current = null;
      storeClientPurchaseAttempt(null);
      void fetchMembershipState();
      if (branchId) void fetchPlans(branchId);
      return;
    }
    if (normalized === "RECHAZADO") {
      setPurchasePendingConfirmation(false);
      setPurchaseErrorMessage(PIXELPAY_DECLINED_MESSAGE);
      return;
    }
    setPurchaseErrorMessage(PIXELPAY_PENDING_MESSAGE);
  }, [branchId, fetchMembershipState, fetchPlans]);

  useMembershipPaymentPolling({
    active: purchasePendingConfirmation && CLIENT_PLAN_PURCHASE_ENABLED,
    idPaymentIntent: membershipPaymentIntent?.id_payment_intent,
    queryStatus: queryMembershipPaymentStatus,
    onResult: handleMembershipPollResult,
  });

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
      if (!CLIENT_PLAN_PURCHASE_ENABLED) {
        setConfirmDialogOpen(false);
        setConfirmDialogMode("");
        setPendingPlanSelection(null);
        notifyPlanPurchaseLocked();
        return;
      }
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
  useEffect(() => {
    consumptionCursorRef.current = null;
    setHistoryQuery({ page: 1, subscription: "" });
  }, [purchaseIdentity]);

  useEffect(() => {
    if (!membershipState) return undefined;
    const controller = new AbortController();
    let current = true;
    setConsumptionLoading(true);
    setConsumptionError("");
    // AM: Conservar la página ajustada por el servidor sin repetir la consulta.
    const cursor = consumptionCursorRef.current;
    const page = cursor?.query === historyQuery && cursor.identity === purchaseIdentity ? cursor.page : historyQuery.page;
    listClientePlanConsumosPorCita({ page, id_suscripcion: historyQuery.subscription || undefined }, { signal: controller.signal })
      .then(payload => {
        if (!current) return;
        consumptionCursorRef.current = { query: historyQuery, identity: purchaseIdentity, page: payload.pagination.page };
        setConsumptionPage({ ...payload, identity: purchaseIdentity });
      })
      .catch(error => { if (current && error?.name !== "AbortError") setConsumptionError("No se pudieron cargar los consumos. Intenta nuevamente."); })
      .finally(() => { if (current) setConsumptionLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [historyQuery, historyRefresh, membershipState, purchaseIdentity]);

  const allMemberships = useMemo(() => {
    const map = new Map();
    for (const plan of [...(consumptionPage?.membresias || []), ...(membershipState?.historial_membresias || []), ...activePlans, ...(membershipState?.ultimo_plan ? [membershipState.ultimo_plan] : [])]) {
      const id = plan.id_suscripcion || plan.id_plan || "ultimo-plan";
      map.set(id, { ...map.get(id), ...plan });
    }
    return Array.from(map.values());
  }, [consumptionPage?.membresias, membershipState, activePlans]);
  const previousMemberships = membershipState
    ? allMemberships.filter(plan => !activePlans.some(active => active.id_suscripcion && active.id_suscripcion === plan.id_suscripcion))
    : [];
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
  const expiredPlanId = String(lastPlan?.id_plan || "").trim();
  const expiredBranchHasPlans = Boolean(branchId && plans.length > 0);
  const expiredOriginalPlanStillAvailable = Boolean(
    expiredPlanId
    && plans.some((plan) => String(plan?.id_plan || "").trim() === expiredPlanId)
  );

  function explorePlans() {
    const heading = plansSectionRef.current?.querySelector("h2");
    heading?.focus({ preventScroll: true });
    plansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-5 pb-4">
      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Estado de membresía</p>
            <h1 className="mf-font-display mt-2 text-2xl text-[var(--mf-text)]">
              {membershipLoading || (!membershipState && !membershipError) ? "Consultando membresía..." : membershipError ? "Tu membresía" : activePlans.length > 1 ? "Tus membresías" : activePlan?.nombre_plan || "Sin membresía activa"}
            </h1>

          </div>
          <div className="flex flex-wrap gap-2"><Button type="button" className="min-h-11" onClick={explorePlans}>Explorar planes</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => setCoverageInfoOpen(true)}>Información</Button></div>
        </div>

        {membershipError ? <div role="alert" className="mt-4 text-sm text-[var(--mf-text)]"><p>{membershipError}</p><Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => void fetchMembershipState()}>Reintentar membresía</Button></div> : null}
        {!membershipLoading && activePlans.length ? (
          <>
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
                      {activePlans.length > 1 ? <h3 className="text-lg font-semibold text-[var(--mf-text)]">{plan?.nombre_plan || "Plan activo"}</h3> : null}
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-800 dark:text-amber-100">
                          {MEMBERSHIP_STATUS_LABELS[plan?.estado_visible] || plan?.estado_visible || "Activa"}
                        </span>
                        <span className={[
                          "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
                          planOperational
                            ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                            : "border-amber-300/30 bg-amber-500/10 text-amber-800 dark:text-amber-100",
                        ].join(" ")}>
                          {planOperational ? "Beneficios disponibles" : "Beneficios no disponibles"}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-11 px-3 text-xs"
                          disabled={Boolean(cancelingSubscriptionId && cancelingSubscriptionId !== plan.id_suscripcion)}
                          onClick={() => {
                            handleOpenCancelPlanDialog(plan, planBranchName);
                          }}
                        >
                          {cancelingSubscriptionId === plan.id_suscripcion ? "Cancelando..." : "Cancelar plan"}
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
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
                    </div>
                    <p className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--mf-text-2)]"><Clock3 size={14}/>{Number(plan?.tiempo_restante?.dias || 0)} días y {Number(plan?.tiempo_restante?.horas || 0)} horas restantes</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <p className="rounded-xl border border-[var(--mf-nav-border)] p-3 text-sm text-[var(--mf-text)]">Servicios disponibles: <strong>{Number(plan?.remanentes?.totales?.servicios_restantes || 0)} de {Number(plan?.remanentes?.totales?.servicios_total || 0)}</strong></p>
                      <p className="rounded-xl border border-[var(--mf-nav-border)] p-3 text-sm text-[var(--mf-text)]">Cortesías disponibles: <strong>{Number(plan?.remanentes?.totales?.cortesias_restantes || 0)} de {Number(plan?.remanentes?.totales?.cortesias_total || 0)}</strong></p>
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
          !membershipLoading && !membershipError ? (
            <p className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
              No tienes planes activos en este momento.
            </p>
          ) : null
        )}

      </section>

      <section ref={plansSectionRef} aria-labelledby="plans-catalog-title" className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Colección de membresías</p>
        <h2 id="plans-catalog-title" tabIndex={-1} className="mf-font-display mt-2 text-2xl text-[var(--mf-text)] sm:text-3xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mf-accent)]">Planes por sucursal</h2>
        <p className="mt-1 text-sm text-[var(--mf-text-2)]">
          Consulta las membresías disponibles y sus beneficios en la sucursal que prefieras.
        </p>
        {showMembershipSimulator && !showVipCommercialVideo ? (
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
          <label htmlFor="cliente-plan-branch" className="mf-label">Sucursal</label>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" size={14} />
            <select id="cliente-plan-branch" className="mf-select min-h-11 w-full !pl-11 pr-10" value={branchId} onChange={(event) => void handleBranchChange(event)}>
              <option value="">Selecciona una sucursal</option>
              {branches.map((branch) => (
                <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>
              ))}
            </select>
          </div>
        </div>

        {hasActivePlanInSelectedBranch ? (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
            <p className="inline-flex items-center gap-2 font-semibold"><AlertTriangle size={15} /> Advertencia de cambio de plan</p>
            <p className="mt-1">{SAME_BRANCH_REPLACE_WARNING}</p>
          </div>
        ) : null}

        {!loading && isExpiredMembership && expiredBranchHasPlans && !expiredOriginalPlanStillAvailable ? (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-100">
            <p className="font-semibold">El plan vencido ya no está disponible en esta sucursal.</p>
            <p className="mt-1">Revisa otros planes disponibles para renovar tu cobertura.</p>
          </div>
        ) : null}
      </section>

      {catalogError ? <div role="alert" className="rounded-2xl border border-[var(--mf-nav-border)] p-4 text-sm text-[var(--mf-text)]"><p>{catalogError}</p><Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => void (branches.length ? fetchPlans(branchId) : loadInitial())}>Reintentar catálogo</Button></div> : !branchId ? (
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
            enableSwipe
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
                  purchaseEnabled={CLIENT_PLAN_PURCHASE_ENABLED}
                  lockLabel={CLIENT_LOCK_MESSAGE}
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

      <section className="mf-glass-surface min-w-0 rounded-[24px] border border-[var(--mf-nav-border)] p-4 sm:p-5" aria-labelledby="plan-consumptions-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Tu actividad</p><h2 id="plan-consumptions-title" className="mf-font-display mt-1 text-xl text-[var(--mf-text)]">Historial de consumos</h2><p className="mt-1 text-sm text-[var(--mf-text-2)]">Todos los beneficios de cada cita, incluso de membresías anteriores.</p></div>
          <Button type="button" variant="outline" className="min-h-11" disabled={consumptionLoading} onClick={() => setHistoryRefresh(value => value + 1)}>Actualizar consumos</Button>
        </div>
        {allMemberships.filter(plan => plan.id_suscripcion).length > 1 ? <div className="mt-4 max-w-sm"><label htmlFor="consumption-subscription" className="mf-label">Plan consultado</label><select id="consumption-subscription" className="mf-select min-h-11 w-full" value={historyQuery.subscription} onChange={event => setHistoryQuery({ page: 1, subscription: event.target.value })}>
          <option value="">Todas las membresías</option>
          {allMemberships.filter(plan => plan.id_suscripcion).map(plan => <option key={plan.id_suscripcion} value={plan.id_suscripcion}>{plan.nombre_plan} — {MEMBERSHIP_STATUS_LABELS[plan.estado_visible || plan.estado_suscripcion_codigo] || "Membresía"}</option>)}
        </select></div> : null}
        {membershipError ? <p role="status" className="mt-4 text-sm text-[var(--mf-text-2)]">Actualiza el estado de tu membresía para consultar sus consumos.</p> : consumptionLoading || !membershipState ? <p role="status" className="mt-4 text-sm text-[var(--mf-text-2)]">Cargando consumos...</p> : consumptionError ? <div role="alert" className="mt-4 text-sm text-[var(--mf-text)]"><p>{consumptionError}</p><Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => setHistoryRefresh(value => value + 1)}>Reintentar consumos</Button></div> : <>
          {consumptionPage?.citas?.length ? <div className="mt-4 grid min-w-0 gap-3 lg:grid-cols-2">
            {consumptionPage.citas.map(group => <article key={group.key} data-consumption-key={group.key} className="cliente-plans-consumption-card min-w-0 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4 [overflow-wrap:anywhere]" aria-label={group.id_cita ? `Cita del ${formatConsumptionDate(group.inicio_at || group.created_at)}` : "Consumo sin cita asociada"}>
              <header className="border-b border-[var(--mf-nav-border)] pb-3">
                <h3 className="text-sm font-semibold text-[var(--mf-text)]">{group.id_cita ? <time dateTime={group.inicio_at || group.created_at}>{formatConsumptionDate(group.inicio_at || group.created_at)}</time> : "Consumo sin cita asociada"}</h3>
                {!group.id_cita ? <p className="mt-1 text-xs text-[var(--mf-text-2)]">Registro histórico · {formatConsumptionDate(group.created_at)}</p> : null}
                <p className="mt-2 flex items-start gap-2 text-xs text-[var(--mf-text-2)]"><Building2 size={14} className="mt-px shrink-0" aria-hidden="true"/><span>{group.nombre_sucursal || "Sucursal no disponible"}</span></p>
                <p className="mt-1 flex items-start gap-2 text-xs text-[var(--mf-text-2)]"><Crown size={14} className="mt-px shrink-0" aria-hidden="true"/><span>{group.planes?.map(plan => plan.nombre_plan).filter(Boolean).join(" · ") || "Membresía"}</span></p>
              </header>
              <ul className="divide-y divide-[var(--mf-nav-border)]">
                {group.consumos.map(entry => <li key={entry.id_consumo} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0"><p className="text-[var(--mf-text)]">{entry.item_nombre || "Beneficio"}</p><p className="mt-0.5 text-xs text-[var(--mf-text-2)]">{entry.item_tipo === "cortesia" ? "Cortesía" : "Servicio"}{group.planes?.length > 1 ? ` · ${entry.nombre_plan || "Membresía"}` : ""}</p>{entry.nombre_usuario_ejecutor ? <p className="text-xs text-[var(--mf-text-2)]">Por: {entry.nombre_usuario_ejecutor}</p> : null}</div>
                  <span className="shrink-0 text-right font-semibold text-[var(--mf-text)]" aria-label={`Cantidad: ${entry.cantidad}`}>×{entry.cantidad}</span>
                </li>)}
              </ul>
            </article>)}
          </div> : <p className="mt-4 text-sm text-[var(--mf-text-2)]">No hay consumos del plan para mostrar.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--mf-nav-border)] pt-4">
            <p role="status" className="text-sm text-[var(--mf-text-2)]">Página {consumptionPage?.pagination?.page || 1} de {consumptionPage?.pagination?.total_pages || 1} · {consumptionPage?.pagination?.total || 0} citas y registros</p>
            <nav aria-label="Paginación de consumos" className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={(consumptionPage?.pagination?.page || 1) <= 1} onClick={() => setHistoryQuery(prev => ({ ...prev, page: consumptionPage.pagination.page - 1 }))}>Anterior</Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={(consumptionPage?.pagination?.page || 1) >= (consumptionPage?.pagination?.total_pages || 1)} onClick={() => setHistoryQuery(prev => ({ ...prev, page: consumptionPage.pagination.page + 1 }))}>Siguiente</Button>
            </nav>
          </div>
        </>}
      </section>

      {previousMemberships.length ? <details className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-4 sm:p-5">
        <summary className="min-h-11 cursor-pointer text-[var(--mf-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--mf-accent)]"><h2 className="ml-1 inline text-lg font-semibold">Historial de membresías</h2><span className="ml-2 text-sm text-[var(--mf-text-2)]">({previousMemberships.length})</span></summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">{previousMemberships.map((plan,index) => <article key={plan.id_suscripcion || index} className="min-w-0 border-t border-[var(--mf-nav-border)] py-3 [overflow-wrap:anywhere]">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-[var(--mf-text)]">{plan.nombre_plan || "Membresía anterior"}</h3><span className="rounded-full bg-[var(--mf-btn-bg)] px-2.5 py-1 text-xs text-[var(--mf-text-2)]">{MEMBERSHIP_STATUS_LABELS[plan.estado_visible || plan.estado_suscripcion_codigo] || "Anterior"}</span></div>
          <p className="mt-2 text-sm text-[var(--mf-text-2)]">{plan.sucursal_nombre || branches.find(branch => branch.id_sucursal === plan.id_sucursal_contratada)?.nombre_sucursal || "Sucursal no disponible"}</p>
          <p className="mt-1 text-xs text-[var(--mf-text-2)]">{plan.inicio_at ? formatPlanAcquisitionDate(plan.inicio_at) : "Inicio no disponible"} — {plan.fin_at ? formatPlanAcquisitionDate(plan.fin_at) : "Fin no disponible"}</p>
        </article>)}</div>
      </details> : null}

      <PlanPurchaseFlowDialog
        open={purchaseModalOpen && CLIENT_PLAN_PURCHASE_ENABLED}
        onOpenChange={(next) => {
          if (!next) resetPurchaseFlow();
          else setPurchaseModalOpen(true);
        }}
        step={purchaseStep}
        orderSummary={purchaseOrderSummary}
        paymentIntent={membershipPaymentIntent}
        loading={purchaseLoading}
        errorMessage={purchaseErrorMessage}
        disableClose={purchaseLoading || purchasePendingConfirmation}
        pendingConfirmation={purchasePendingConfirmation}
        paymentConfirmation={purchaseConfirmation}
        simulatorMode={showMembershipSimulator}
        videoDemoMode={showVipCommercialVideo}
        onCancel={membershipPaymentIntent ? resetPurchaseFlow : discardPurchaseFlow}
        onBackToSummary={() => setPurchaseStep("summary")}
        onContinueToPayment={handleContinueToPayment}
        onConfirmPayment={handleConfirmPayment}
        onFinish={discardPurchaseFlow}
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
            <div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-100">
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
            <Button type="button" className="min-h-11" onClick={() => setCoverageInfoOpen(false)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

