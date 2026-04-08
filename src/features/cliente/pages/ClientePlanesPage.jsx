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
} from "lucide-react";
import { useNotifications } from "../../../context/NotificationsContext.jsx";
import CardsCarousel from "../../../components/data/CardsCarousel.jsx";
import { Button } from "../../../components/ui/button.jsx";
import { listPublicCatalogBranches, listPublicCatalogPlans } from "../../public/lib/catalogApi.js";
import {
  getStoredClienteCatalogBranchId,
  resolveValidClienteBranchId,
  setStoredClienteCatalogBranchId,
} from "../lib/clienteCatalogBranch.js";
import { getPlanCategoryTheme, normalizePlanCategory } from "../../plans/lib/planCategoryTheme.js";
import { acquireClientePlan, getClientePlanEstado } from "../lib/clienteApi.js";

const CATEGORY_ICONS = {
  1: Shield,
  2: Sparkles,
  3: Crown,
  4: Gem,
  5: Trophy,
};

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "L 0.00";
  return `L ${amount.toFixed(2)}`;
}

function formatUpgradeBlockedMessage(details = {}) {
  const dias = Number(details?.tiempo_restante?.dias || 0);
  const horas = Number(details?.tiempo_restante?.horas || 0);
  const servicios = Number(details?.remanentes?.servicios || 0);
  return `Aún no puedes actualizar. Restan ${dias} día(s), ${horas} hora(s) y ${servicios} servicio(s).`;
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

function PlanCard({
  plan,
  index,
  recommendedKey,
  ctaLabel = "Adquirir plan",
  onAcquire,
  loading = false,
  disabled = false,
}) {
  const benefits = Array.isArray(plan?.beneficios) ? plan.beneficios : [];
  const categoryLevel = normalizePlanCategory(plan?.categoria_nivel, 1);
  const categoryTheme = getPlanCategoryTheme(categoryLevel);
  const Icon = CATEGORY_ICONS[categoryLevel] || Crown;
  const isRecommended = `${plan?.id_plan || ""}:${plan?.id_sucursal || "public"}` === recommendedKey;

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
        onClick={() => onAcquire?.(plan)}
        disabled={disabled || loading}
      >
        {loading ? "Procesando..." : ctaLabel}
      </Button>
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
  const [acquiringPlanId, setAcquiringPlanId] = useState("");

  const fetchPlans = useCallback(async (selectedBranchId) => {
    const plansPayload = await listPublicCatalogPlans({ id_sucursal: selectedBranchId || undefined });
    setPlans(Array.isArray(plansPayload?.plans) ? plansPayload.plans : []);
  }, []);

  const fetchMembershipState = useCallback(async () => {
    setMembershipLoading(true);
    try {
      const payload = await getClientePlanEstado();
      setMembershipState(payload);
      // AM: Limpia deduplicación al recuperar estado correctamente.
      lastErrorMessageRef.current = "";
    } catch (error) {
      // AM: Evita spam de toasts repetidos con el mismo mensaje.
      const message = error?.data?.error?.message || error?.message || "No se pudo cargar tu estado de membresía.";
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

      const preferredBranchId = getStoredClienteCatalogBranchId();
      const resolvedBranchId = resolveValidClienteBranchId(preferredBranchId, nextBranches);
      setBranchId(resolvedBranchId);
      setStoredClienteCatalogBranchId(resolvedBranchId);

      await Promise.all([
        fetchPlans(resolvedBranchId),
        fetchMembershipState(),
      ]);
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || "No se pudo cargar el catálogo de planes.");
    } finally {
      setLoading(false);
    }
  }, [fetchMembershipState, fetchPlans, notifyError]);

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
      notifyError(error?.data?.error?.message || error?.message || "No se pudo actualizar los planes para la sucursal.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAcquire(plan) {
    const idPlan = String(plan?.id_plan || "").trim();
    const idSucursal = String(branchId || plan?.id_sucursal || "").trim();
    if (!idPlan || !idSucursal) {
      notifyWarning("No se pudo determinar la sucursal para adquirir este plan.");
      return;
    }

    setAcquiringPlanId(idPlan);
    try {
      await acquireClientePlan({
        id_plan: idPlan,
        id_sucursal: idSucursal,
      });
      notifySuccess("Plan adquirido correctamente. Ya puedes usar tus beneficios.");
      await fetchMembershipState();
    } catch (error) {
      if (Number(error?.status) === 409) {
        notifyWarning(formatUpgradeBlockedMessage(error?.data?.error?.details || {}));
      } else {
        notifyError(error?.data?.error?.message || error?.message || "No se pudo procesar la solicitud del plan.");
      }
    } finally {
      setAcquiringPlanId("");
    }
  }

  const recommendedPlanKey = useMemo(() => {
    if (!plans.length) return "";
    const topLevel = plans.reduce((maxLevel, plan) => Math.max(maxLevel, normalizePlanCategory(plan?.categoria_nivel, 1)), 1);
    const topPlan = plans.find((plan) => normalizePlanCategory(plan?.categoria_nivel, 1) === topLevel);
    if (!topPlan) return "";
    return `${topPlan.id_plan || ""}:${topPlan.id_sucursal || "public"}`;
  }, [plans]);
  const ctaLabel = membershipState?.cta_recomendada === "actualizar" ? "Actualizar plan" : "Adquirir plan";
  const activePlan = membershipState?.plan_activo || null;

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
              {membershipState?.estado_plan === "activo" ? "Activo" : "Sin plan"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs font-semibold text-[var(--mf-text-2)]">
              <WalletCards size={13} />
              Titular: {Number(membershipState?.masterpuntos?.titular || 0)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-200">
              <Sparkles size={13} />
              Integrantes: {Number(membershipState?.masterpuntos?.integrante || 0)}
            </span>
          </div>
        </div>

        {activePlan ? (
          <>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Servicios restantes</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">
                {Number(activePlan?.remanentes?.totales?.servicios_restantes || 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Servicios incluidos</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">
                {Number(activePlan?.remanentes?.totales?.servicios_total || 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Tiempo restante</p>
              <p className="mt-2 text-lg font-semibold text-[var(--mf-text)]">
                <Clock3 className="mr-1 inline-block" size={15} />
                {Number(activePlan?.tiempo_restante?.dias || 0)} d · {Number(activePlan?.tiempo_restante?.horas || 0)} h
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
              Servicios del plan
            </p>
            {Array.isArray(activePlan?.remanentes?.servicios) && activePlan.remanentes.servicios.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {activePlan.remanentes.servicios.map((service) => (
                  <li
                    key={service.id_servicio || service.nombre}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] px-3 py-2 text-sm"
                  >
                    <span className="text-[var(--mf-text)]">{service.nombre}</span>
                    <span className="text-[var(--mf-text-2)]">
                      {Number(service.restante || 0)} de {Number(service.total || 0)} disponibles
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                Tu plan no tiene servicios operativos configurados.
              </p>
            )}
          </div>
          </>
        ) : null}

        {!membershipLoading && Array.isArray(membershipState?.historial_consumos) && membershipState.historial_consumos.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
              Últimos consumos del plan
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)]">
              {membershipState.historial_consumos
                .filter((entry) => entry?.item_tipo === "servicio")
                .slice(0, 5)
                .map((entry) => (
                <li key={entry.id_consumo} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                  <span className="text-[var(--mf-text)]">
                    Servicio · {entry.item_nombre}
                  </span>
                  <span className="text-xs text-[var(--mf-text-2)]">
                    {formatConsumptionDate(entry.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Colección de membresías</p>
        <h1 className="mf-font-display mt-2 text-2xl text-[var(--mf-text)] sm:text-3xl">Planes con jerarquía premium</h1>
        <p className="mt-1 text-sm text-[var(--mf-text-2)]">
          Compara por categoría, beneficios y valor mensual para elegir el plan que mejor se adapta a tu estilo.
        </p>

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
      </section>

      {loading ? (
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
            getItemKey={(plan) => `${plan.id_plan}:${plan.id_sucursal || "public"}`}
            pageSizeByViewport={{ mobile: 1, tablet: 2, desktop: 3 }}
            gridClassName="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            compactControls
            showHeaderTag={false}
            renderItem={(plan, index, pageIndex) => (
              <PlanCard
                plan={plan}
                index={(pageIndex * 3) + index}
                recommendedKey={recommendedPlanKey}
                ctaLabel={ctaLabel}
                onAcquire={handleAcquire}
                loading={acquiringPlanId === plan.id_plan}
                disabled={Boolean(acquiringPlanId && acquiringPlanId !== plan.id_plan)}
              />
            )}
          />
        </section>
      ) : (
        <p className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3 text-sm text-[var(--mf-text-2)]">
          No hay planes publicados para la sucursal seleccionada.
        </p>
      )}
    </div>
  );
}
