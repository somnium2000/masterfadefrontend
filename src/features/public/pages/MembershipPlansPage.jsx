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
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import MasterfadeLogo from "../../../components/branding/MasterfadeLogo.jsx";
import PremiumBottomNav from "../../../components/navigation/PremiumBottomNav.jsx";
import ThemeSwitcher from "../../../components/theme/ThemeSwitcher.jsx";
import { useAuth } from "../../../context/AuthContext.jsx";
import { listPublicCatalogBranches, listPublicCatalogPlans } from "../lib/catalogApi.js";
import { subscribeCatalogSync } from "../../../lib/catalogSync.js";

function PlanCard({ plan, onSelect }) {
  const benefits = Array.isArray(plan?.beneficios) ? plan.beneficios : [];

  return (
    <motion.article
      data-plan-card="true"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mf-glass-surface flex w-[85vw] shrink-0 snap-start flex-col justify-between rounded-[28px] p-5 sm:w-[68vw] lg:w-[calc((100%-2rem)/3)]"
    >
      <div className="flex items-start gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            Membresia VIP
          </p>
          <h3 className="mf-font-display mt-3 text-[28px] leading-[0.95] text-[var(--mf-text)]">
            {plan.nombre_plan}
          </h3>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--mf-text-2)]">
            {plan.periodo_membresia_label || "Mensual"}
          </p>
        </div>
      </div>

      <div className="mt-4 flex-1">
        {plan.descripcion ? <p className="mb-4 text-sm leading-6 text-[var(--mf-text-2)]">{plan.descripcion}</p> : null}
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Incluye</p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--mf-text)]">
          {benefits.map((benefit, index) => (
            <li key={`${plan.id_plan}-${index}`} className="flex items-start gap-3">
              <CheckCircle2 size={14} className="mt-1 shrink-0 text-[var(--mf-accent)]" />
              <span>
                {Number(benefit?.cantidad || 0)}x {benefit?.nombre || benefit?.codigo || "Beneficio"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => onSelect(plan)}
        className="mf-accent-gradient mt-5 inline-flex h-11 items-center justify-center rounded-2xl px-4 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
      >
        Quiero este plan
      </button>
    </motion.article>
  );
}

export default function MembershipPlansPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const isMountedRef = useRef(true);
  const selectedBranchRef = useRef("");

  const [status, setStatus] = useState("loading");
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [plans, setPlans] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  const scrollRef = useRef(null);

  const loadPlans = useCallback(async ({ silent = false, branchId = selectedBranchRef.current } = {}) => {
    if (!silent) setStatus("loading");
    setErrorMessage("");

    try {
      const result = await listPublicCatalogPlans({ id_sucursal: branchId || undefined });
      if (!isMountedRef.current) return;
      setPlans(result.plans);
      setStatus("success");
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorMessage(error?.data?.error?.message || error?.message || "No se pudo cargar el catalogo de planes.");
      setStatus("error");
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

          const nextBranches = Array.isArray(branchResult?.branches) ? branchResult.branches : [];
          setBranches(nextBranches);

          const initialBranchId = nextBranches[0]?.id_sucursal || "";
          selectedBranchRef.current = initialBranchId;
          setSelectedBranchId(initialBranchId);

          await loadPlans({ branchId: initialBranchId });
        } catch (error) {
          if (!isMountedRef.current) return;
          setErrorMessage(error?.data?.error?.message || error?.message || "No se pudo cargar membresias.");
          setStatus("error");
        }
      })();
    });

    const unsubscribe = subscribeCatalogSync(() => {
      if (!isMountedRef.current) return;
      // AM: Refresco silencioso para mantener pantalla VIP alineada con cambios del admin.
      void loadPlans({ silent: true, branchId: selectedBranchRef.current });
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
    };
  }, [loadPlans]);

  function handleBranchChange(nextBranchId) {
    if (!nextBranchId || nextBranchId === selectedBranchRef.current) return;
    selectedBranchRef.current = nextBranchId;
    setSelectedBranchId(nextBranchId);
    void loadPlans({ branchId: nextBranchId, silent: true });
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

  function handlePlanSelect() {
    navigate(isAuthenticated ? "/home" : "/login");
  }
  // AM: Flechas y overlays solo cuando hay mas de 3 planes.
  const showCarouselControls = plans.length > 3;

  const navItems = [
    { id: "inicio", label: "Inicio", icon: House, onClick: () => navigate("/") },
    { id: "servicios", label: "Servicios", icon: Scissors, onClick: () => navigate("/servicios") },
    { id: "login", label: isAuthenticated ? "Mi panel" : "Iniciar sesion", icon: LogIn, onClick: () => navigate(isAuthenticated ? "/home" : "/login") },
    { id: "promociones", label: "Promociones", icon: Tag, disabled: true },
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
            <MasterfadeLogo variant="compact" />
            <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Membresias VIP</p>
            <h1 className="mf-font-display mt-4 text-[42px] leading-[0.92] text-[var(--mf-text)]">Eleva tu estilo cada mes</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--mf-text-2)]">
              Selecciona un plan mensual y asegura tus beneficios premium en tu sucursal favorita.
            </p>
          </div>

          {branches.length > 1 ? (
            <div className="mf-glass-surface mt-6 overflow-hidden rounded-[26px] border border-[var(--mf-btn-border)]/80 p-4 sm:p-5">
              <div className="relative flex flex-col items-center gap-3 text-center">
                <div className="max-w-xl">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-text-2)]">
                    <Building2 size={14} strokeWidth={1.8} />
                    <span>Sucursal de membresias</span>
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
              <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">Estamos consultando membresias disponibles.</p>
            </div>
          ) : null}

          {status === "error" ? (
            <div className="mf-glass-surface mt-8 rounded-[28px] p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Error de membresias</p>
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
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">Coleccion VIP</p>
                      <h2 className="mf-font-display text-[26px] leading-[1.1] text-[var(--mf-text)] sm:text-[30px] sm:leading-none">Planes de membresia</h2>
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
                    {plans.map((plan) => <PlanCard key={`${plan.id_plan}:${plan.id_sucursal || "public"}`} plan={plan} onSelect={handlePlanSelect} />)}
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

      <PremiumBottomNav
        activeId="servicios"
        sideItems={navItems}
        fabItem={{ id: "agendar", label: "Agendar", icon: Plus, onClick: () => navigate(isAuthenticated ? "/home" : "/login") }}
      />
    </div>
  );
}
