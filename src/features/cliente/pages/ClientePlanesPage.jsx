import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Ban,
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
import { cancelClientePlan, getClientePlanEstado } from "../lib/clienteApi.js";

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

const PLAN_PURCHASE_PENDING_MESSAGE = "Adquisición y actualización de planes pendientes de integración con pasarela de pago.";

const MEMBERSHIP_STATUS_LABELS = {
  activa: "Activa",
  pendiente_renovacion: "Pendiente de renovaciÃ³n",
  agotada: "Agotada",
  vencida: "Vencida",
  cancelada: "Cancelada",
  sin_plan_activo: "Sin plan activo",
};

function isOperationalMembershipConsumption(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.invalidado) return false;
  const sourceKind = String(entry.source_kind || "").trim().toLowerCase();
  if (sourceKind && sourceKind !== "appointment_completed") return false;
  return true;
}

function PlanCard({
  plan,
  index,
  recommendedKey,
  ctaLabel = "Próximamente",
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
            Nivel {categoryLevel} Â· {categoryTheme.label}
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
        disabled
        title={PLAN_PURCHASE_PENDING_MESSAGE}
      >
        {ctaLabel}
      </Button>
    </motion.article>
  );
}

export default function ClientePlanesPage() {
  const notifications = useNotifications();
  const { error: notifyError, success: notifySuccess } = notifications;
  const lastErrorMessageRef = useRef("");

  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [plans, setPlans] = useState([]);
  const [membershipState, setMembershipState] = useState(null);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchPlans = useCallback(async (selectedBranchId) => {
    const plansPayload = await listPublicCatalogPlans({ id_sucursal: selectedBranchId || undefined });
    setPlans(Array.isArray(plansPayload?.plans) ? plansPayload.plans : []);
  }, []);

  const fetchMembershipState = useCallback(async () => {
    setMembershipLoading(true);
    try {
      const payload = await getClientePlanEstado();
      setMembershipState(payload);
      // AM: Limpia deduplicaciÃ³n al recuperar estado correctamente.
      lastErrorMessageRef.current = "";
    } catch (error) {
      // AM: Evita spam de toasts repetidos con el mismo mensaje.
      const message = error?.data?.error?.message || error?.message || "No se pudo cargar tu estado de membresÃ­a.";
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
      notifyError(error?.data?.error?.message || error?.message || "No se pudo cargar el catÃ¡logo de planes.");
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

  async function handleCancelMembership() {
    if (!activePlan?.id_suscripcion) return;
    if (!window.confirm("Â¿Deseas cancelar tu membresÃ­a actual? PerderÃ¡s el saldo pendiente.")) return;

    setCancelLoading(true);
    try {
      await cancelClientePlan({ motivo_fin_codigo: "cancelacion" });
      notifySuccess("MembresÃ­a cancelada correctamente.");
      await fetchMembershipState();
    } catch (error) {
      notifyError(error?.data?.error?.message || error?.message || "No se pudo cancelar la membresÃ­a.");
    } finally {
      setCancelLoading(false);
    }
  }

  const recommendedPlanKey = useMemo(() => {
    if (!plans.length) return "";
    const topLevel = plans.reduce((maxLevel, plan) => Math.max(maxLevel, normalizePlanCategory(plan?.categoria_nivel, 1)), 1);
    const topPlan = plans.find((plan) => normalizePlanCategory(plan?.categoria_nivel, 1) === topLevel);
    if (!topPlan) return "";
    return `${topPlan.id_plan || ""}:${topPlan.id_sucursal || "public"}`;
  }, [plans]);
  const activePlan = membershipState?.plan_activo || null;
  const operationalHistory = useMemo(
    () => (Array.isArray(membershipState?.historial_consumos) ? membershipState.historial_consumos : []).filter(isOperationalMembershipConsumption),
    [membershipState?.historial_consumos]
  );

  return (
    <div className="space-y-5">
      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">Estado de membresÃ­a</p>
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
                  : "Adquiere un plan para desbloquear coberturas automÃ¡ticas en tu agendamiento."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-xs font-semibold text-[var(--mf-accent)]">
              <ShieldCheck size={13} />
              {MEMBERSHIP_STATUS_LABELS[membershipState?.estado_plan] || "Sin plan"}
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
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100">
                Estado actual: {MEMBERSHIP_STATUS_LABELS[activePlan?.estado_visible] || activePlan?.estado_visible || "Activa"}
              </span>
              <Button type="button" variant="outline" className="gap-2" disabled={cancelLoading} onClick={() => void handleCancelMembership()}>
                <Ban size={14} /> {cancelLoading ? "Cancelando..." : "Cancelar membresÃ­a"}
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
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
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Cortesias restantes</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">
                  {Number(activePlan?.remanentes?.totales?.cortesias_restantes || 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Cortesias incluidas</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--mf-text)]">
                  {Number(activePlan?.remanentes?.totales?.cortesias_total || 0)}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--mf-text-2)]">Tiempo restante</p>
                <p className="mt-2 text-lg font-semibold text-[var(--mf-text)]">
                  <Clock3 className="mr-1 inline-block" size={15} />
                  {Number(activePlan?.tiempo_restante?.dias || 0)} d - {Number(activePlan?.tiempo_restante?.horas || 0)} h
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

            <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
                Cortesias del plan
              </p>
              {Array.isArray(activePlan?.remanentes?.cortesias) && activePlan.remanentes.cortesias.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {activePlan.remanentes.cortesias.map((courtesy) => (
                    <li
                      key={courtesy.id_cortesia || courtesy.codigo || courtesy.nombre}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] px-3 py-2 text-sm"
                    >
                      <span className="text-[var(--mf-text)]">{courtesy.nombre}</span>
                      <span className="text-[var(--mf-text-2)]">
                        {Number(courtesy.restante || 0)} de {Number(courtesy.total || 0)} disponibles
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                  Tu plan no tiene cortesias configuradas.
                </p>
              )}
            </div>

            {Number(activePlan?.remanentes?.totales?.servicios_restantes || 0) === 1 ? (
              <div className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                Te queda 1 servicio disponible en tu membresia.
              </div>
            ) : null}
          </>
        ) : null}

        {!membershipLoading && operationalHistory.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
              Ultimos consumos del plan
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)]">
              {operationalHistory
                .slice(0, 5)
                .map((entry) => (
                <li key={entry.id_consumo} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                  <span className="text-[var(--mf-text)]">
                    {entry?.item_tipo === "cortesia" ? "Cortesia" : "Servicio"} - {entry.item_nombre}
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

        {!membershipLoading && Array.isArray(membershipState?.historial_membresias) && membershipState.historial_membresias.length > 0 ? (
          <div className="mt-4 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mf-accent)]">
              Historial de membresÃ­as
            </p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--mf-text-2)]">
              {membershipState.historial_membresias.slice(0, 6).map((item) => (
                <li key={item.id_suscripcion} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] px-3 py-2">
                  <div>
                    <p className="text-[var(--mf-text)]">{item.nombre_plan}</p>
                    <p className="text-xs text-[var(--mf-text-2)]">
                      {MEMBERSHIP_STATUS_LABELS[item.estado_visible] || item.estado_visible || item.estado_suscripcion_codigo}
                    </p>
                  </div>
                  <div className="text-right text-xs text-[var(--mf-text-2)]">
                    <p>Inicio: {formatConsumptionDate(item.inicio_at)}</p>
                    <p>Fin: {formatConsumptionDate(item.fin_at)}</p>
                    {item.motivo_fin_codigo ? <p>Motivo: {item.motivo_fin_codigo}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="mf-glass-surface rounded-[24px] border border-[var(--mf-nav-border)] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">ColecciÃ³n de membresÃ­as</p>
        <h1 className="mf-font-display mt-2 text-2xl text-[var(--mf-text)] sm:text-3xl">Planes con jerarquÃ­a premium</h1>
        <p className="mt-1 text-sm text-[var(--mf-text-2)]">
          Compara por categorÃ­a, beneficios y valor mensual para elegir el plan que mejor se adapta a tu estilo.
        </p>
        <p className="mt-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-xs text-[var(--mf-text-2)]">
          {PLAN_PURCHASE_PENDING_MESSAGE}
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


