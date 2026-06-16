import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Plus,
  Pencil,
  Crown,
  Eye,
  ToggleLeft,
  ToggleRight,
  Building2,
  Search,
  SlidersHorizontal,
  RotateCcw,
  X,
  Gift,
  Scissors,
  CalendarClock,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import {
  listAdminPlanes,
  createAdminPlan,
  updateAdminPlan,
  setAdminPlanEstado,
} from "../lib/adminPlansApi.js";
import { listAdminSucursales } from "../lib/adminSucursalesApi.js";
import { listAdminServicios } from "../lib/adminCatalogApi.js";
import { listAdminCortesias } from "../lib/adminCortesiasApi.js";
import { Button } from "../../../components/ui/button.jsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";
import { Input } from "../../../components/ui/input.jsx";
import { Label } from "../../../components/ui/label.jsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table.jsx";
import ViewToggle from "../../../components/data/ViewToggle.jsx";
import DataCard from "../../../components/data/DataCard.jsx";
import CardsCarousel from "../../../components/data/CardsCarousel.jsx";
import HoverActionButton from "../../../components/data/HoverActionButton.jsx";
import DetailInfoModalContent from "../../../components/data/DetailInfoModalContent.jsx";
import EmptyState from "../../../components/data/EmptyState.jsx";
import ErrorBanner from "../../../components/data/ErrorBanner.jsx";
import LoadingSpinner from "../../../components/data/LoadingSpinner.jsx";
import ActionConfirmDialog from "../../../components/feedback/ActionConfirmDialog.jsx";
import { useNotifications } from "../../../context/NotificationsContext.jsx";
import { emitCatalogSync } from "../../../lib/catalogSync.js";
import {
  DEFAULT_PLAN_CATEGORY,
  getPlanCategoryTheme,
  PLAN_CATEGORY_OPTIONS,
  normalizePlanCategory,
} from "../../plans/lib/planCategoryTheme.js";

const FORM_DEFAULTS = {
  nombre_plan: "",
  descripcion: "",
  precio_hnl: "",
  periodo_membresia_codigo: "mensual",
  categoria_nivel: DEFAULT_PLAN_CATEGORY,
  visible_publico: true,
  orden_visual: "100",
  ofertas: [],
  beneficios: [],
};

const FILTER_DEFAULTS = {
  estado: "all",
  visibilidad: "all",
  tipo: "all",
  periodo: "all",
  idSucursal: "all",
};
const PLAN_BENEFIT_MAX_CANTIDAD = 999;

function extractMessage(error) {
  const code = String(error?.data?.error?.code || error?.response?.data?.error?.code || "").trim();
  if (code === "CATALOG_PLAN_DUPLICATE") {
    return "Ya existe un plan con ese nombre. Usa el plan existente o cambia el nombre.";
  }
  if (code === "CATALOG_PLAN_SERVICE_OUT_OF_SCOPE") {
    return "Uno o más servicios del plan no están disponibles en la sucursal seleccionada.";
  }
  if (code === "CATALOG_PLAN_COURTESY_OUT_OF_SCOPE") {
    return "Una o más cortesías del plan no están disponibles en la sucursal seleccionada.";
  }
  return error?.data?.error?.message || error?.message || "Error desconocido.";
}

function extractActiveSubscribersCount(error) {
  const firstCandidate = Number(error?.data?.error?.details?.total_clientes_activos);
  if (Number.isInteger(firstCandidate) && firstCandidate > 0) return firstCandidate;
  const secondCandidate = Number(error?.response?.data?.error?.details?.total_clientes_activos);
  if (Number.isInteger(secondCandidate) && secondCandidate > 0) return secondCandidate;
  return 0;
}

function normalizeTipo(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "cortesia") return "cortesia";
  return "servicio";
}

function normalizeBenefits(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const normalizedServiceId = String(item?.id_servicio || "").trim();
      const normalizedCourtesyId = String(item?.id_cortesia || "").trim();
      const normalizedTipo = normalizeTipo(item?.tipo);
      // AM: Compatibilidad con beneficios legacy sin tipo cuando existe id_servicio.
      const tipo = normalizedTipo === "cortesia" && normalizedServiceId ? "servicio" : normalizedTipo;
      const codigo = item?.codigo ? String(item.codigo) : "";
      const nombre = item?.nombre ? String(item.nombre) : "";
      return {
        tipo,
        id_servicio: normalizedServiceId,
        id_cortesia: normalizedCourtesyId,
        codigo,
        nombre,
        cantidad: Number(item?.cantidad ?? 1),
      };
    });
}

function sanitizeBenefitsByScope(items = [], services = [], courtesies = [], keepCourtesyIds = []) {
  const validServiceIds = new Set((Array.isArray(services) ? services : []).map((service) => String(service?.id_servicio || "")));
  const validCourtesyIds = new Set((Array.isArray(courtesies) ? courtesies : []).map((courtesy) => String(courtesy?.id_cortesia || "")));
  const keepCourtesySet = new Set((Array.isArray(keepCourtesyIds) ? keepCourtesyIds : []).map((id) => String(id || "")));

  return (Array.isArray(items) ? items : [])
    .filter((item) => {
      const tipo = normalizeTipo(item?.tipo);
      if (tipo === "servicio") {
        return validServiceIds.has(String(item?.id_servicio || ""));
      }

      const courtesyId = String(item?.id_cortesia || "");
      if (!courtesyId) return false;
      return validCourtesyIds.has(courtesyId) || keepCourtesySet.has(courtesyId);
    });
}

function splitBenefitsByType(items = []) {
  const benefits = Array.isArray(items) ? items : [];
  return {
    servicios: benefits.filter((item) => normalizeTipo(item?.tipo) === "servicio"),
    cortesias: benefits.filter((item) => normalizeTipo(item?.tipo) === "cortesia"),
  };
}

function formatPeriod(value) {
  const normalized = String(value || "mensual").toLowerCase();
  if (normalized === "mensual") return "Mensual";
  if (normalized === "trimestral") return "Trimestral";
  if (normalized === "semestral") return "Semestral";
  if (normalized === "anual") return "Anual";
  return normalized;
}

function quickFilterButtonClass(isActive) {
  return isActive
    ? "rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]"
    : "rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60";
}

function sortPlanes(list = []) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const orderA = Number(a?.orden_visual ?? 100);
    const orderB = Number(b?.orden_visual ?? 100);
    if (orderA !== orderB) return orderA - orderB;
    const byName = String(a?.nombre_plan || "").localeCompare(String(b?.nombre_plan || ""), "es");
    if (byName !== 0) return byName;
    return String(a?.id_sucursal || "").localeCompare(String(b?.id_sucursal || ""), "es");
  });
}

function getPlanOffers(plan) {
  return Array.isArray(plan?.ofertas) && plan.ofertas.length > 0
    ? plan.ofertas
    : [{
      id_sucursal: plan?.id_sucursal,
      precio_hnl: plan?.precio_hnl,
      activo: Boolean(plan?.activo),
      visible_publico: Boolean(plan?.visible_publico),
      orden_visual: plan?.orden_visual,
    }];
}

function groupPlanesByMaster(list = []) {
  const grouped = new Map();
  for (const plan of Array.isArray(list) ? list : []) {
    const planId = String(plan?.id_plan || "");
    if (!planId) continue;
    const offer = {
      id_sucursal: plan?.id_sucursal,
      precio_hnl: plan?.precio_hnl,
      activo: Boolean(plan?.activo),
      visible_publico: Boolean(plan?.visible_publico),
      orden_visual: plan?.orden_visual,
    };
    const current = grouped.get(planId);
    if (current) {
      current.ofertas = [...current.ofertas, offer];
      continue;
    }
    grouped.set(planId, { ...plan, ofertas: [offer], _isMasterSummary: true });
  }
  return sortPlanes([...grouped.values()]);
}

function formatPlanPrice(value) {
  return `L ${Number(value ?? 0).toFixed(2)}`;
}

function getPlanPriceSummary(plan) {
  const prices = getPlanOffers(plan).map((offer) => Number(offer?.precio_hnl)).filter((value) => Number.isFinite(value));
  if (!prices.length) return "Sin precio";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? formatPlanPrice(min) : `${formatPlanPrice(min)} - ${formatPlanPrice(max)}`;
}

function getPlanBranchSummary(plan, branchNameById) {
  const names = getPlanOffers(plan).map((offer) => branchNameById[offer?.id_sucursal] || offer?.id_sucursal).filter(Boolean);
  return names.length ? names.join(", ") : "Sin sucursales asociadas";
}

function getPlanOfferStateSummary(plan) {
  const offers = getPlanOffers(plan);
  const activeCount = offers.filter((offer) => Boolean(offer?.activo)).length;
  const visibleCount = offers.filter((offer) => Boolean(offer?.visible_publico)).length;
  return `${activeCount}/${offers.length} activas · ${visibleCount}/${offers.length} visibles`;
}

function getUnassociatedBranches(plan, availableBranches) {
  const associated = new Set(getPlanOffers(plan).map((offer) => String(offer?.id_sucursal || "")).filter(Boolean));
  return availableBranches.filter((branch) => !associated.has(String(branch?.id_sucursal || "")));
}

function upsertScopedPlan(list = [], nextPlan) {
  const nextId = String(nextPlan?.id_plan || "");
  const nextBranch = String(nextPlan?.id_sucursal || "");
  const current = Array.isArray(list) ? list : [];
  const without = current.filter((entry) => String(entry?.id_plan || "") !== nextId || String(entry?.id_sucursal || "") !== nextBranch);
  return sortPlanes([...without, nextPlan]);
}

function validateForm(values, mode = "create") {
  const isOfferOnly = mode === "editOffer" || mode === "addOffer";
  if (!isOfferOnly && !String(values?.nombre_plan || "").trim()) return "El nombre del plan es requerido.";

  if (mode === "create") {
    if (!Array.isArray(values.ofertas) || values.ofertas.length === 0) {
      return "Debe seleccionar al menos una sucursal para crear el plan.";
    }
    for (const offer of values.ofertas) {
      if (!offer?.id_sucursal) return "Debe seleccionar al menos una sucursal para crear el plan.";
      const offerPrice = Number(offer.precio_hnl);
      if (!Number.isFinite(offerPrice) || offerPrice <= 0) return "El precio debe ser mayor a 0.";
      const offerOrder = Number(offer.orden_visual);
      if (!Number.isFinite(offerOrder) || offerOrder < 0) return "El orden visual debe ser mayor o igual a 0.";
    }
  } else if (mode !== "editMaster") {
    const precio = Number(values?.precio_hnl);
    if (!Number.isFinite(precio) || precio <= 0) return "El precio debe ser mayor a 0.";
    const ordenVisual = Number(values?.orden_visual);
    if (!Number.isFinite(ordenVisual) || ordenVisual < 0) return "El orden visual debe ser mayor o igual a 0.";
  }

  if (!isOfferOnly) {
    const categoriaNivel = normalizePlanCategory(values?.categoria_nivel, NaN);
    if (!Number.isInteger(categoriaNivel)) return "La categoria debe estar entre 1 y 5.";
  }

  const benefits = Array.isArray(values?.beneficios) ? values.beneficios : [];
  if (!isOfferOnly && !benefits.length) return "Debes agregar al menos un beneficio.";

  const seenServices = new Set();
  const seenCourtesies = new Set();
  for (const benefit of isOfferOnly ? [] : benefits) {
    const tipo = normalizeTipo(benefit?.tipo);
    const cantidad = Number(benefit?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > PLAN_BENEFIT_MAX_CANTIDAD) {
      return `Cada beneficio debe tener cantidad entre 1 y ${PLAN_BENEFIT_MAX_CANTIDAD}.`;
    }

    if (tipo === "servicio") {
      const idServicio = String(benefit?.id_servicio || "").trim();
      if (!idServicio) return "Cada beneficio tipo servicio debe seleccionar servicio.";
      if (seenServices.has(idServicio)) return "No repitas servicios en beneficios.";
      seenServices.add(idServicio);
    } else {
      const idCortesia = String(benefit?.id_cortesia || "").trim();
      if (!idCortesia) return "Cada cortesia debe seleccionar una cortesia valida.";
      if (seenCourtesies.has(idCortesia)) return "No repitas cortesias en beneficios.";
      seenCourtesies.add(idCortesia);
    }
  }

  if (!isOfferOnly && !benefits.some((benefit) => normalizeTipo(benefit?.tipo) === "servicio")) {
    return "El plan debe incluir al menos un servicio.";
  }

  return null;
}
function planBenefitKind(plan) {
  const benefits = Array.isArray(plan?.beneficios) ? plan.beneficios : [];
  const hasService = benefits.some((item) => normalizeTipo(item?.tipo) === "servicio");
  const hasCourtesy = benefits.some((item) => normalizeTipo(item?.tipo) === "cortesia");
  if (hasService && hasCourtesy) return "mixto";
  if (hasService) return "servicio";
  if (hasCourtesy) return "cortesia";
  return "none";
}

function PlanStatusBadge({ activo }) {
  return <span className={`mf-badge ${activo ? "mf-badge-green" : "mf-badge-red"}`}>{activo ? "Activo" : "Inactivo"}</span>;
}

function PlanVisibilityBadge({ visible, activo = true }) {
  if (!activo) return <span className="mf-badge mf-badge-red">Inactivo</span>;
  return <span className={`mf-badge ${visible ? "mf-badge-green" : "mf-badge-muted"}`}>{visible ? "Visible" : "Oculto"}</span>;
}

function PlanPeriodBadge({ period }) {
  return <span className="mf-badge mf-badge-gold">{formatPeriod(period)}</span>;
}

function PlanCategoryBadge({ level }) {
  const normalizedLevel = normalizePlanCategory(level, DEFAULT_PLAN_CATEGORY);
  const categoryTheme = getPlanCategoryTheme(normalizedLevel);
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
      style={{
        background: categoryTheme.badgeTone,
        borderColor: categoryTheme.badgeBorder,
        color: categoryTheme.badgeColor,
      }}
    >
      Nivel {normalizedLevel} - {categoryTheme.label}
    </span>
  );
}

function SucursalSelector({ branchIds, allBranches, selected, onChange, loading }) {
  const available = branchIds.length > 0 ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal)) : allBranches;
  const validIds = new Set(available.map((branch) => branch.id_sucursal));
  const selectedBranch = available.find((branch) => branch.id_sucursal === selected);

  if (available.length === 1 && selectedBranch) {
    return (
      <div className="mf-glass-surface flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
        <Building2 size={13} />
        <span>Sucursal activa:</span>
        <span className="font-medium text-[var(--mf-text)]">{selectedBranch.nombre_sucursal}</span>
      </div>
    );
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
        <Loader2 size={14} className="animate-spin" />
        Cargando sucursales...
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
      <Label htmlFor="plans-branch" className="text-xs uppercase tracking-widest text-[var(--mf-text-2)] sm:shrink-0">Sucursal</Label>
      <select
        id="plans-branch"
        className="mf-select h-10 w-full sm:h-9 sm:min-w-[220px] sm:w-auto"
        value={selected}
        onChange={(event) => {
          const nextValue = String(event.target.value || "").trim();
          // AM: Sanitiza valor para evitar placeholders como id_sucursal.
          onChange(validIds.has(nextValue) ? nextValue : "");
        }}
      >
        <option value="">Todas las sucursales</option>
        {available.map((branch) => <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}
      </select>
    </div>
  );
}

function PlanServicesEditor({ items, onChange, services }) {
  const selectedServiceIds = new Set((Array.isArray(items) ? items : []).map((item) => item?.id_servicio).filter(Boolean));

  function addService() {
    onChange([...(Array.isArray(items) ? items : []), { tipo: "servicio", id_servicio: "", id_cortesia: "", nombre: "", cantidad: 1 }]);
  }

  function removeService(index) {
    onChange((Array.isArray(items) ? items : []).filter((_, currentIndex) => currentIndex !== index));
  }

  function updateService(index, field, value) {
    onChange((Array.isArray(items) ? items : []).map((item, currentIndex) => (
      currentIndex === index ? { ...item, [field]: value } : item
    )));
  }

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Servicios</Label>
        <Button type="button" size="sm" variant="outline" onClick={addService} className="gap-1.5">
          <Plus size={13} /> Agregar servicio
        </Button>
      </div>

      {!items?.length ? <p className="text-xs text-[var(--mf-text-2)]">Aun no agregas servicios.</p> : null}

      {(Array.isArray(items) ? items : []).map((item, index) => {
        const currentServiceId = String(item?.id_servicio || "").trim();
        return (
          <div key={`${index}-${currentServiceId || "new-service"}`} className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--mf-nav-border)] p-2 sm:grid-cols-[1fr_90px_auto] sm:items-center">
            <select
              value={currentServiceId}
              onChange={(event) => updateService(index, "id_servicio", event.target.value)}
              className="mf-select"
            >
              <option value="">Seleccionar servicio</option>
              {services.map((service) => {
                const optionId = String(service.id_servicio || "");
                const isTaken = selectedServiceIds.has(optionId) && optionId !== currentServiceId;
                return <option key={optionId} value={optionId} disabled={isTaken}>{service.nombre_servicio}</option>;
              })}
            </select>
            <Input
              type="number"
              min="1"
              max={String(PLAN_BENEFIT_MAX_CANTIDAD)}
              value={item?.cantidad ?? 1}
              onChange={(event) => updateService(index, "cantidad", event.target.value)}
              className="text-center"
              placeholder="1"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => removeService(index)}
              className="h-9 w-9 rounded-xl border-red-500/35 text-red-400 hover:bg-red-500/15"
              aria-label="Quitar servicio"
              title="Quitar servicio"
            >
              <X size={13} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function PlanCourtesiesEditor({ items, onChange, courtesias, existingCourtesyIds }) {
  const selectedCourtesyIds = new Set((Array.isArray(items) ? items : []).map((item) => item?.id_cortesia).filter(Boolean));
  const courtesyById = new Map((Array.isArray(courtesias) ? courtesias : []).map((item) => [String(item.id_cortesia || ""), item]));
  const existingSet = new Set((Array.isArray(existingCourtesyIds) ? existingCourtesyIds : []).map((id) => String(id || "")));

  function addCourtesy() {
    onChange([...(Array.isArray(items) ? items : []), { tipo: "cortesia", id_servicio: "", id_cortesia: "", nombre: "", cantidad: 1 }]);
  }

  function removeCourtesy(index) {
    onChange((Array.isArray(items) ? items : []).filter((_, currentIndex) => currentIndex !== index));
  }

  function updateCourtesy(index, field, value) {
    onChange((Array.isArray(items) ? items : []).map((item, currentIndex) => (
      currentIndex === index ? { ...item, [field]: value } : item
    )));
  }

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Cortesias</Label>
        <Button type="button" size="sm" variant="outline" onClick={addCourtesy} className="gap-1.5">
          <Plus size={13} /> Agregar cortesia
        </Button>
      </div>

      {!items?.length ? <p className="text-xs text-[var(--mf-text-2)]">Aun no agregas cortesias.</p> : null}

      {(Array.isArray(items) ? items : []).map((item, index) => {
        const currentCourtesyId = String(item?.id_cortesia || "").trim();
        const currentCourtesy = courtesyById.get(currentCourtesyId) || null;
        const scopedOptions = (Array.isArray(courtesias) ? courtesias : []).filter((option) => (
          Boolean(option?.activa) || String(option?.id_cortesia || "") === currentCourtesyId
        ));
        const isCurrentInactive = Boolean(currentCourtesyId) && currentCourtesy?.activa === false;
        const isCurrentFromLegacy = Boolean(currentCourtesyId) && !currentCourtesy && existingSet.has(currentCourtesyId);
        return (
          <div key={`${index}-${currentCourtesyId || "new-courtesy"}`} className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--mf-nav-border)] p-2 sm:grid-cols-[1fr_90px_auto] sm:items-center">
            <select
              value={currentCourtesyId}
              onChange={(event) => updateCourtesy(index, "id_cortesia", event.target.value)}
              className="mf-select"
            >
              <option value="">Seleccionar cortesia</option>
              {isCurrentFromLegacy ? <option value={currentCourtesyId}>Cortesia heredada</option> : null}
              {scopedOptions.map((courtesy) => {
                const optionId = String(courtesy.id_cortesia || "");
                const isTaken = selectedCourtesyIds.has(optionId) && optionId !== currentCourtesyId;
                const suffix = courtesy.activa ? "" : " (Inactiva)";
                return <option key={optionId} value={optionId} disabled={isTaken}>{`${courtesy.nombre}${suffix}`}</option>;
              })}
            </select>
            <Input
              type="number"
              min="1"
              max={String(PLAN_BENEFIT_MAX_CANTIDAD)}
              value={item?.cantidad ?? 1}
              onChange={(event) => updateCourtesy(index, "cantidad", event.target.value)}
              className="text-center"
              placeholder="1"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => removeCourtesy(index)}
              className="h-9 w-9 rounded-xl border-red-500/35 text-red-400 hover:bg-red-500/15"
              aria-label="Quitar cortesia"
              title="Quitar cortesia"
            >
              <X size={13} />
            </Button>
            {isCurrentInactive ? (
              <p className="sm:col-span-3 text-xs text-[var(--mf-text-2)]">
                Esta cortesia esta inactiva, pero puedes conservarla porque ya estaba asociada al plan.
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PlanBenefitsEditor({ items, onChange, services, courtesias, existingCourtesyIds }) {
  const { servicios, cortesias: cortesiasPlan } = splitBenefitsByType(items);

  function updateServicios(nextServicios) {
    onChange([...(Array.isArray(nextServicios) ? nextServicios : []), ...(Array.isArray(cortesiasPlan) ? cortesiasPlan : [])]);
  }

  function updateCortesias(nextCortesias) {
    onChange([...(Array.isArray(servicios) ? servicios : []), ...(Array.isArray(nextCortesias) ? nextCortesias : [])]);
  }

  return (
    <div className="flex flex-col gap-3">
      <PlanServicesEditor items={servicios} onChange={updateServicios} services={services} />
      <PlanCourtesiesEditor
        items={cortesiasPlan}
        onChange={updateCortesias}
        courtesias={courtesias}
        existingCourtesyIds={existingCourtesyIds}
      />
    </div>
  );
}

function PlanForm({
  values,
  onChange,
  services,
  courtesias,
  existingCourtesyIds,
  branchLabel,
  mode,
  availableBranches,
  formBranchId,
  onBranchChange,
  onCreateOfferToggle,
  onCreateOfferChange,
}) {
  const isCreate = mode === "create";
  const isEditMaster = mode === "editMaster";
  const isEditOffer = mode === "editOffer";
  const isAddOffer = mode === "addOffer";
  const isOfferOnly = isEditOffer || isAddOffer;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-xs text-[var(--mf-text-2)]">
        {isCreate
          ? "El plan maestro sera unico. Cada sucursal tendra su propia oferta operativa."
          : isEditMaster
            ? "Estos cambios afectan el plan maestro y se reflejan en todas las sucursales donde este ofertado."
            : isAddOffer
              ? "Esta accion no crea otro plan maestro. Solo agrega una oferta operativa para la sucursal seleccionada."
              : `Oferta en: ${branchLabel || "Sucursal seleccionada"}`}
      </div>

      {isCreate ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_72%,transparent)] p-3">
          <div>
            <Label className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Ofertas iniciales por sucursal</Label>
            <p className="mt-1 text-xs text-[var(--mf-text-2)]">Selecciona las sucursales donde se ofrecera inicialmente este plan.</p>
          </div>
          {availableBranches.map((branch) => {
            const offer = values.ofertas.find((item) => item.id_sucursal === branch.id_sucursal);
            const checked = Boolean(offer);

            return (
              <div key={branch.id_sucursal} className="rounded-[12px] border border-[var(--mf-nav-border)] p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-[var(--mf-text)]">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => onCreateOfferToggle(branch.id_sucursal, event.target.checked)}
                  />
                  {branch.nombre_sucursal}
                </label>
                {checked ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
                    <div className="flex flex-col gap-1">
                      <Label>Precio HNL</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={offer.precio_hnl}
                        onChange={(event) => onCreateOfferChange(branch.id_sucursal, "precio_hnl", event.target.value)}
                        placeholder="1800.00"
                      />
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-sm text-[var(--mf-text)]">
                      <input
                        type="checkbox"
                        checked={Boolean(offer.visible_publico)}
                        onChange={(event) => onCreateOfferChange(branch.id_sucursal, "visible_publico", event.target.checked)}
                      />
                      Visible publico
                    </label>
                    <div className="flex flex-col gap-1">
                      <Label>Orden visual</Label>
                      <Input
                        type="number"
                        min="0"
                        value={offer.orden_visual}
                        onChange={(event) => onCreateOfferChange(branch.id_sucursal, "orden_visual", event.target.value)}
                        placeholder="100"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!isCreate && isAddOffer ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="plan-branch">{isAddOffer ? "Sucursal *" : "Sucursal inicial de la oferta *"}</Label>
          <select id="plan-branch" className="mf-select" value={formBranchId} onChange={(event) => onBranchChange(event.target.value)}>
            <option value="">Seleccionar sucursal</option>
            {availableBranches.map((branch) => <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}
          </select>
        </div>
      ) : null}

      {isOfferOnly ? null : (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="plan-name">Nombre del plan *</Label>
            <Input id="plan-name" value={values.nombre_plan} onChange={(event) => onChange("nombre_plan", event.target.value)} placeholder="Ej. Plan VIP" />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="plan-description">Descripcion</Label>
            <Input id="plan-description" value={values.descripcion} onChange={(event) => onChange("descripcion", event.target.value)} placeholder="Descripcion comercial opcional" />
          </div>
        </>
      )}

      {isEditMaster || isCreate ? null : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="plan-price">Precio HNL *</Label>
            <Input id="plan-price" type="number" min="0.01" step="0.01" value={values.precio_hnl} onChange={(event) => onChange("precio_hnl", event.target.value)} placeholder="2400.00" />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="plan-order">Orden visual *</Label>
            <Input id="plan-order" type="number" min="0" value={values.orden_visual} onChange={(event) => onChange("orden_visual", event.target.value)} placeholder="100" />
          </div>
        </div>
      )}

      {isOfferOnly ? null : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="plan-period">Periodo</Label>
            <Input id="plan-period" value="Mensual" readOnly />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="plan-category">Categoria visual</Label>
            <select
              id="plan-category"
              className="mf-select"
              value={String(normalizePlanCategory(values.categoria_nivel, DEFAULT_PLAN_CATEGORY))}
              onChange={(event) => onChange("categoria_nivel", Number(event.target.value))}
            >
              {PLAN_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Nivel {option.value} - {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-[var(--mf-text-2)]">
              {PLAN_CATEGORY_OPTIONS.find((option) => option.value === normalizePlanCategory(values.categoria_nivel, DEFAULT_PLAN_CATEGORY))?.helper}
            </p>
          </div>
        </div>
      )}

      {isEditMaster || isCreate ? null : (
        <label className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm">
          <span className="text-[var(--mf-text)]">Visible en catalogo publico</span>
          <input type="checkbox" checked={Boolean(values.visible_publico)} onChange={(event) => onChange("visible_publico", event.target.checked)} className="h-4 w-4 accent-[var(--mf-accent)]" />
        </label>
      )}

      {isOfferOnly ? null : (
        <PlanBenefitsEditor
          items={values.beneficios}
          onChange={(nextItems) => onChange("beneficios", nextItems)}
          services={services}
          courtesias={courtesias}
          existingCourtesyIds={existingCourtesyIds}
        />
      )}
    </div>
  );
}
export default function AdminPlansCatalogPage() {
  const navigate = useNavigate();
  const { branchIds, roles = [] } = useAuth();
  const notifications = useNotifications();
  const canManagePlans = roles.includes("super_admin") || roles.includes("admin");

  const [allBranches, setAllBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchLoadError, setBranchLoadError] = useState("");
  const [sucursal, setSucursal] = useState(branchIds.length === 1 ? branchIds[0] : "");

  const [planes, setPlanes] = useState([]);
  const [services, setServices] = useState([]);
  const [courtesies, setCourtesies] = useState([]);
  const [servicesByBranch, setServicesByBranch] = useState({});
  const [courtesiesByBranch, setCourtesiesByBranch] = useState({});
  const [loadingServices, setLoadingServices] = useState(false);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");

  const [view, setView] = useState(() => {
    try {
      const stored = localStorage.getItem("mf-view-planes");
      return stored === "table" || stored === "cards" ? stored : "cards";
    } catch {
      return "cards";
    }
  });

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState(() => ({ ...FILTER_DEFAULTS }));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create");
  const [editTarget, setEditTarget] = useState(null);
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [formBranchId, setFormBranchId] = useState("");
  const [formOriginalCourtesyIds, setFormOriginalCourtesyIds] = useState([]);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [offersOpen, setOffersOpen] = useState(false);
  const [offersTarget, setOffersTarget] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stateTarget, setStateTarget] = useState(null);
  const [stateLoading, setStateLoading] = useState(false);
  const lastErrorToastRef = useRef({ planes: "", sucursales: "" });

  const notifyErrorOnce = useCallback((scope, message) => {
    const normalized = String(message || "").trim();
    if (!normalized) return;
    if (lastErrorToastRef.current[scope] === normalized) return;
    lastErrorToastRef.current[scope] = normalized;
    notifications.error(normalized);
  }, [notifications]);

  const branchNameById = useMemo(() => allBranches.reduce((acc, branch) => ({ ...acc, [branch.id_sucursal]: branch.nombre_sucursal }), {}), [allBranches]);

  const availableBranches = useMemo(() => {
    const scoped = branchIds.length > 0 ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal)) : allBranches;
    return scoped.filter((branch) => branch?.id_sucursal);
  }, [allBranches, branchIds]);
  const displayPlanes = useMemo(() => (sucursal ? planes : groupPlanesByMaster(planes)), [planes, sucursal]);

  const filteredPlanes = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return displayPlanes.filter((plan) => {
      if (searchValue) {
        const benefitsText = (Array.isArray(plan?.beneficios) ? plan.beneficios : [])
          .map((item) => item?.nombre || item?.codigo)
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        const searchable = [plan?.nombre_plan, plan?.descripcion, benefitsText].filter(Boolean).join(" ").toLowerCase();
        if (!searchable.includes(searchValue)) return false;
      }

      if (filters.estado !== "all") {
        const expected = filters.estado === "activo";
        if (!getPlanOffers(plan).some((offer) => Boolean(offer?.activo) === expected)) return false;
      }

      if (filters.visibilidad !== "all") {
        const expected = filters.visibilidad === "visible";
        if (!getPlanOffers(plan).some((offer) => Boolean(offer?.visible_publico) === expected)) return false;
      }

      if (filters.tipo !== "all" && planBenefitKind(plan) !== filters.tipo) return false;
      if (filters.periodo !== "all" && String(plan?.periodo_membresia_codigo || "").toLowerCase() !== filters.periodo) return false;
      if (!sucursal && filters.idSucursal !== "all" && !getPlanOffers(plan).some((offer) => String(offer?.id_sucursal || "") === filters.idSucursal)) return false;

      return true;
    });
  }, [displayPlanes, filters, search, sucursal]);

  const activeFilterCount = useMemo(() => Object.values(filters).filter((value) => value !== "all").length, [filters]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch) chips.push({ key: "search", label: `Busqueda: ${trimmedSearch}` });
    if (filters.estado !== "all") chips.push({ key: "estado", label: `Estado: ${filters.estado === "activo" ? "Activo" : "Inactivo"}` });
    if (filters.visibilidad !== "all") chips.push({ key: "visibilidad", label: `Público: ${filters.visibilidad === "visible" ? "Visible" : "Oculto"}` });
    if (filters.tipo !== "all") chips.push({ key: "tipo", label: `Beneficios: ${filters.tipo}` });
    if (filters.periodo !== "all") chips.push({ key: "periodo", label: `Periodo: ${formatPeriod(filters.periodo)}` });
    if (!sucursal && filters.idSucursal !== "all") chips.push({ key: "idSucursal", label: `Sucursal: ${branchNameById[filters.idSucursal] || "Seleccionada"}` });
    return chips;
  }, [branchNameById, filters, search, sucursal]);

  function clearAllFilters() {
    setSearch("");
    setFilters({ ...FILTER_DEFAULTS });
  }

  function resolveMutationBranchId(item = null) {
    if (sucursal) return sucursal;
    if (item?.id_sucursal) return item.id_sucursal;
    const firstOffer = getPlanOffers(item)[0];
    if (firstOffer?.id_sucursal) return firstOffer.id_sucursal;
    if (branchIds.length === 1) return branchIds[0];
    return "";
  }

  const fetchBranches = useCallback(async () => {
    setLoadingBranches(true);
    setBranchLoadError("");

    try {
      const response = await listAdminSucursales({ soloActivas: true });
      const nextBranches = Array.isArray(response?.data?.sucursales)
        ? response.data.sucursales.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
        : [];
      const scopedBranches = branchIds.length > 0
        ? nextBranches.filter((branch) => branchIds.includes(branch.id_sucursal))
        : nextBranches;
      setAllBranches(scopedBranches);
      lastErrorToastRef.current.sucursales = "";

      if (scopedBranches.length === 1) {
        setSucursal(scopedBranches[0].id_sucursal);
      } else if (sucursal && !scopedBranches.some((branch) => branch.id_sucursal === sucursal)) {
        setSucursal("");
      }
    } catch (error) {
      const message = extractMessage(error);
      setBranchLoadError(message);
      notifyErrorOnce("sucursales", message);
    } finally {
      setLoadingBranches(false);
    }
  }, [branchIds, notifyErrorOnce, sucursal]);

  const fetchPlanes = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setListError("");

    try {
      const response = await listAdminPlanes({ id_sucursal: sucursal || undefined });
      const list = Array.isArray(response?.data?.planes) ? response.data.planes : [];
      setPlanes(sortPlanes(list));
      lastErrorToastRef.current.planes = "";
    } catch (error) {
      const message = extractMessage(error);
      setListError(message);
      if (!silent) notifyErrorOnce("planes", message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [notifyErrorOnce, sucursal]);

  const fetchServicesForBranch = useCallback(async (branchId) => {
    if (!branchId) {
      setServices([]);
      return [];
    }

    setLoadingServices(true);
    try {
      const response = await listAdminServicios({ id_sucursal: branchId });
      const list = Array.isArray(response?.data?.servicios) ? response.data.servicios : [];
      const scoped = list
        // AM: Solo servicios operativos por sucursal para beneficios de planes.
        .filter((service) =>
          Boolean(service?.activo)
          && Boolean(service?.tarifa_activa)
          && service?.servicio_informativo !== true
          && String(service?.id_sucursal || "") === String(branchId)
        )
        .map((service) => ({ id_servicio: service.id_servicio, nombre_servicio: service.nombre_servicio }))
        .sort((a, b) => String(a.nombre_servicio || "").localeCompare(String(b.nombre_servicio || ""), "es"));

      setServices(scoped);
      setServicesByBranch((previous) => ({ ...previous, [branchId]: scoped }));
      return scoped;
    } catch (error) {
      notifications.warning(extractMessage(error));
      setServices([]);
      return [];
    } finally {
      setLoadingServices(false);
    }
  }, [notifications]);

  const fetchCourtesiesForBranch = useCallback(async (branchId) => {
    if (!branchId) {
      setCourtesies([]);
      return [];
    }

    try {
      const response = await listAdminCortesias({ id_sucursal: branchId });
      const list = Array.isArray(response?.data?.cortesias) ? response.data.cortesias : [];
      const scoped = list
        .map((courtesy) => {
          const scope = Array.isArray(courtesy?.sucursales)
            ? courtesy.sucursales.find((entry) => String(entry?.id_sucursal || "") === String(branchId))
            : null;
          if (!scope) return null;
          return {
            id_cortesia: courtesy.id,
            nombre: courtesy.nombre,
            activa: Boolean(scope.activa),
          };
        })
        .filter(Boolean)
        .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
      setCourtesies(scoped);
      setCourtesiesByBranch((previous) => ({ ...previous, [branchId]: scoped }));
      return scoped;
    } catch (error) {
      notifications.warning(extractMessage(error));
      setCourtesies([]);
      return [];
    }
  }, [notifications]);

  const fetchCatalogOptionsForBranch = useCallback(async (branchId) => {
    const [scopedServices, scopedCourtesies] = await Promise.all([
      fetchServicesForBranch(branchId),
      fetchCourtesiesForBranch(branchId),
    ]);
    return { scopedServices, scopedCourtesies };
  }, [fetchCourtesiesForBranch, fetchServicesForBranch]);

  function refreshCommonBenefitOptions(branchIdsToUse, servicesCache, courtesiesCache) {
    if (!Array.isArray(branchIdsToUse) || branchIdsToUse.length === 0) {
      setServices([]);
      setCourtesies([]);
      return { commonServices: [], commonCourtesies: [] };
    }

    const serviceLists = branchIdsToUse.map((branchId) => servicesCache[branchId] || []);
    const courtesyLists = branchIdsToUse.map((branchId) => courtesiesCache[branchId] || []);

    const commonServiceIds = serviceLists.slice(1).reduce((acc, list) => {
      const ids = new Set(list.map((item) => String(item?.id_servicio || "")));
      return new Set([...acc].filter((id) => ids.has(id)));
    }, new Set((serviceLists[0] || []).map((item) => String(item?.id_servicio || ""))));

    const commonCourtesyIds = courtesyLists.slice(1).reduce((acc, list) => {
      const ids = new Set(list.filter((item) => Boolean(item?.activa)).map((item) => String(item?.id_cortesia || "")));
      return new Set([...acc].filter((id) => ids.has(id)));
    }, new Set((courtesyLists[0] || []).filter((item) => Boolean(item?.activa)).map((item) => String(item?.id_cortesia || ""))));

    const commonServices = (serviceLists[0] || []).filter((item) => commonServiceIds.has(String(item?.id_servicio || "")));
    const commonCourtesies = (courtesyLists[0] || []).filter((item) => commonCourtesyIds.has(String(item?.id_cortesia || "")));

    setServices(commonServices);
    setCourtesies(commonCourtesies);
    return { commonServices, commonCourtesies };
  }

  useEffect(() => {
    try {
      localStorage.setItem("mf-view-planes", view);
    } catch {
      // AM: Evita romper render si localStorage no esta disponible.
    }
  }, [view]);

  useEffect(() => {
    if (!canManagePlans) {
      navigate("/unauthorized", { replace: true });
    }
  }, [canManagePlans, navigate]);

  useEffect(() => {
    if (!canManagePlans) return;
    void fetchBranches();
  }, [canManagePlans, fetchBranches]);

  useEffect(() => {
    if (!canManagePlans) return;
    void fetchPlanes();
    void fetchCatalogOptionsForBranch(sucursal);
  }, [canManagePlans, fetchCatalogOptionsForBranch, fetchPlanes, sucursal]);

  useEffect(() => {
    if (!dialogOpen) return;
    setFormValues((previous) => {
      const nextBenefits = sanitizeBenefitsByScope(previous?.beneficios, services, courtesies, formOriginalCourtesyIds);
      if (nextBenefits.length === (Array.isArray(previous?.beneficios) ? previous.beneficios.length : 0)) {
        return previous;
      }
      // AM: Limpia beneficios inválidos si cambia la sucursal o el set de servicios operativos.
      return { ...previous, beneficios: nextBenefits };
    });
  }, [courtesies, dialogOpen, formOriginalCourtesyIds, services]);

  function handleFormChange(field, value) {
    setFormValues((previous) => ({ ...previous, [field]: value }));
  }

  async function handleFormBranchChange(branchId) {
    setFormBranchId(branchId);
    setFormValues((previous) => ({ ...previous, beneficios: [] }));
    if (branchId) {
      await fetchCatalogOptionsForBranch(branchId);
    } else {
      setServices([]);
      setCourtesies([]);
    }
  }

  async function handleCreateOfferToggle(branchId, checked) {
    const nextOffers = checked
      ? [
        ...formValues.ofertas,
        {
          id_sucursal: branchId,
          precio_hnl: "",
          visible_publico: true,
          orden_visual: "100",
        },
      ]
      : formValues.ofertas.filter((offer) => offer.id_sucursal !== branchId);
    const nextBranchIds = nextOffers.map((offer) => offer.id_sucursal);
    let nextServicesCache = servicesByBranch;
    let nextCourtesiesCache = courtesiesByBranch;

    if (checked && (!servicesByBranch[branchId] || !courtesiesByBranch[branchId])) {
      const { scopedServices, scopedCourtesies } = await fetchCatalogOptionsForBranch(branchId);
      nextServicesCache = { ...servicesByBranch, [branchId]: scopedServices };
      nextCourtesiesCache = { ...courtesiesByBranch, [branchId]: scopedCourtesies };
      setServicesByBranch(nextServicesCache);
      setCourtesiesByBranch(nextCourtesiesCache);
    }

    const { commonServices, commonCourtesies } = refreshCommonBenefitOptions(nextBranchIds, nextServicesCache, nextCourtesiesCache);
    const nextBenefits = sanitizeBenefitsByScope(formValues.beneficios, commonServices, commonCourtesies, []);

    setFormValues((previous) => ({
      ...previous,
      ofertas: nextOffers,
      beneficios: nextBenefits,
    }));
  }

  function handleCreateOfferChange(branchId, field, value) {
    setFormValues((previous) => ({
      ...previous,
      ofertas: previous.ofertas.map((offer) => (
        offer.id_sucursal === branchId ? { ...offer, [field]: value } : offer
      )),
    }));
  }

  async function openNuevo() {
    const branchId = sucursal || "";
    if (branchId) {
      const { scopedServices, scopedCourtesies } = await fetchCatalogOptionsForBranch(branchId);
      refreshCommonBenefitOptions([branchId], { ...servicesByBranch, [branchId]: scopedServices }, { ...courtesiesByBranch, [branchId]: scopedCourtesies });
    }
    else {
      setServices([]);
      setCourtesies([]);
    }
    setDialogMode("create");
    setFormBranchId(branchId);
    setFormOriginalCourtesyIds([]);
    setEditTarget(null);
    setFormValues({
      ...FORM_DEFAULTS,
      ofertas: branchId
        ? [{
          id_sucursal: branchId,
          precio_hnl: "",
          visible_publico: true,
          orden_visual: "100",
        }]
        : [],
    });
    setFormError("");
    setDialogOpen(true);
  }

  async function openEditarMaestro(plan) {
    const branchId = resolveMutationBranchId(plan);
    if (!branchId) {
      notifications.warning("Debes seleccionar una sucursal valida para editar el plan.");
      return;
    }

    const { scopedServices, scopedCourtesies } = await fetchCatalogOptionsForBranch(branchId);
    setDialogMode("editMaster");
    setFormBranchId(branchId);
    setEditTarget(plan);
    const existingCourtesyIds = normalizeBenefits(plan?.beneficios)
      .filter((item) => normalizeTipo(item?.tipo) === "cortesia")
      .map((item) => String(item?.id_cortesia || "").trim())
      .filter(Boolean);
    setFormOriginalCourtesyIds(existingCourtesyIds);
    const nextBenefits = sanitizeBenefitsByScope(normalizeBenefits(plan?.beneficios), scopedServices, scopedCourtesies, existingCourtesyIds);
    setFormValues({
      nombre_plan: plan?.nombre_plan || "",
      descripcion: plan?.descripcion || "",
      precio_hnl: "",
      periodo_membresia_codigo: String(plan?.periodo_membresia_codigo || "mensual").toLowerCase(),
      categoria_nivel: normalizePlanCategory(plan?.categoria_nivel, DEFAULT_PLAN_CATEGORY),
      visible_publico: true,
      orden_visual: "100",
      beneficios: nextBenefits,
    });
    setFormError("");
    setDialogOpen(true);
  }

  function openEditarOferta(plan, offer = null) {
    const offerData = offer || plan;
    const branchId = String(offerData?.id_sucursal || sucursal || "").trim();
    if (!branchId) {
      notifications.warning("Debes seleccionar una sucursal valida para editar la oferta.");
      return;
    }

    setDialogMode("editOffer");
    setFormBranchId(branchId);
    setEditTarget({ ...(plan || {}), _mutation_branch_id: branchId });
    setFormOriginalCourtesyIds([]);
    setFormValues({
      ...FORM_DEFAULTS,
      precio_hnl: Number(offerData?.precio_hnl ?? 0).toString(),
      visible_publico: Boolean(offerData?.visible_publico),
      orden_visual: String(Number(offerData?.orden_visual ?? 100)),
    });
    setFormError("");
    setDialogOpen(true);
  }

  function openAgregarOferta(plan) {
    const nextBranches = getUnassociatedBranches(plan, availableBranches);
    if (nextBranches.length === 0) {
      notifications.warning("Este plan ya tiene oferta en todas las sucursales disponibles.");
      return;
    }

    setDialogMode("addOffer");
    setFormBranchId("");
    setEditTarget(plan || null);
    setFormOriginalCourtesyIds([]);
    setFormValues({
      ...FORM_DEFAULTS,
      precio_hnl: "",
      visible_publico: true,
      orden_visual: "100",
    });
    setFormError("");
    setOffersOpen(false);
    setDialogOpen(true);
  }

  function openGestionarOfertas(plan) {
    setOffersTarget(plan || null);
    setOffersOpen(true);
  }

  function openDetail(plan) {
    setDetailTarget(plan);
    setDetailOpen(true);
  }

  function openConfirmState(plan) {
    const branchId = resolveMutationBranchId(plan);
    if (!branchId) {
      notifications.warning("Debes seleccionar una sucursal valida para cambiar estado.");
      return;
    }

    setStateTarget({ ...plan, _nextActivo: !plan?.activo, _branchId: branchId, _forceConfirm: false, _activeSubscribersCount: 0 });
    setConfirmOpen(true);
  }

  async function handleGuardar() {
    const validationError = validateForm(formValues, dialogMode);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const branchId = formBranchId || resolveMutationBranchId(editTarget);
    if (dialogMode !== "create" && !branchId) {
      setFormError("Selecciona una sucursal inicial de la oferta.");
      return;
    }

    const normalizedFormBenefits = normalizeBenefits(formValues?.beneficios);
    const validServiceIds = new Set((Array.isArray(services) ? services : []).map((service) => String(service?.id_servicio || "")));
    const invalidServiceBenefit = normalizedFormBenefits.find((item) => {
      if (normalizeTipo(item?.tipo) !== "servicio") return false;
      return !validServiceIds.has(String(item?.id_servicio || ""));
    });
    if (dialogMode !== "editOffer" && dialogMode !== "addOffer" && invalidServiceBenefit) {
      // AM: Defensa en UI ante manipulación de payload o cambios de sucursal durante edición.
      setFormError("Uno o más servicios seleccionados no son operativos en la sucursal actual.");
      return;
    }

    const courtesyById = new Map((Array.isArray(courtesies) ? courtesies : []).map((courtesy) => [String(courtesy?.id_cortesia || ""), courtesy]));
    const existingCourtesySet = new Set((Array.isArray(formOriginalCourtesyIds) ? formOriginalCourtesyIds : []).map((id) => String(id || "")));
    const invalidCourtesyBenefit = normalizedFormBenefits.find((item) => {
      if (normalizeTipo(item?.tipo) !== "cortesia") return false;
      const courtesyId = String(item?.id_cortesia || "");
      const courtesy = courtesyById.get(courtesyId);
      if (!courtesy) return true;
      if (courtesy.activa) return false;
      return !existingCourtesySet.has(courtesyId);
    });
    if (dialogMode !== "editOffer" && dialogMode !== "addOffer" && invalidCourtesyBenefit) {
      setFormError("Una o mas cortesias no son validas para la sucursal actual.");
      return;
    }

    const serviceNameById = new Map((Array.isArray(services) ? services : []).map((service) => [
      String(service?.id_servicio || ""),
      String(service?.nombre_servicio || "").trim(),
    ]));
    const courtesyNameById = new Map((Array.isArray(courtesies) ? courtesies : []).map((courtesy) => [
      String(courtesy?.id_cortesia || ""),
      String(courtesy?.nombre || "").trim(),
    ]));
    const canonicalItems = normalizedFormBenefits
      .map((item) => {
        const tipo = normalizeTipo(item?.tipo);
        const cantidad = Number(item?.cantidad);
        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > PLAN_BENEFIT_MAX_CANTIDAD) return null;
        if (tipo === "servicio") {
          const idServicio = String(item?.id_servicio || "").trim();
          if (!idServicio) return null;
          const serviceName = serviceNameById.get(idServicio) || String(item?.nombre || "").trim();
          return {
            tipo: "servicio",
            id_servicio: idServicio,
            id_cortesia: null,
            nombre: serviceName || "Servicio del catalogo",
            cantidad,
          };
        }
        const idCortesia = String(item?.id_cortesia || "").trim();
        if (!idCortesia) return null;
        const courtesyName = courtesyNameById.get(idCortesia) || String(item?.nombre || "").trim();
        return {
          tipo: "cortesia",
          id_servicio: null,
          id_cortesia: idCortesia,
          nombre: courtesyName || "Cortesia del catalogo",
          cantidad,
        };
      })
      .filter(Boolean);
    const beneficiosPayload = {
      version: 1,
      items: canonicalItems,
      servicios: canonicalItems.filter((item) => item.tipo === "servicio"),
      cortesias: canonicalItems.filter((item) => item.tipo === "cortesia"),
    };
    if (dialogMode !== "editOffer" && dialogMode !== "addOffer" && !beneficiosPayload.servicios.length) {
      setFormError("El plan debe incluir al menos un servicio valido.");
      return;
    }

    if (dialogMode === "create" && services.length === 0) {
      setFormError("No hay servicios activos comunes en las sucursales seleccionadas para construir este plan.");
      return;
    }

    setFormLoading(true);
    setFormError("");

    const payload = dialogMode === "editOffer" || dialogMode === "addOffer"
      ? {
        id_sucursal: branchId,
        precio_hnl: Number(formValues.precio_hnl),
        visible_publico: Boolean(formValues.visible_publico),
        orden_visual: Number(formValues.orden_visual),
      }
      : dialogMode === "editMaster"
        ? {
          nombre_plan: String(formValues.nombre_plan || "").trim(),
          descripcion: String(formValues.descripcion || "").trim() || null,
          periodo_membresia_codigo: "mensual",
          categoria_nivel: normalizePlanCategory(formValues.categoria_nivel, DEFAULT_PLAN_CATEGORY),
          beneficios: beneficiosPayload,
          id_sucursal: branchId,
        }
        : dialogMode === "create"
          ? {
            nombre_plan: String(formValues.nombre_plan || "").trim(),
            descripcion: String(formValues.descripcion || "").trim() || null,
            periodo_membresia_codigo: "mensual",
            categoria_nivel: normalizePlanCategory(formValues.categoria_nivel, DEFAULT_PLAN_CATEGORY),
            beneficios: beneficiosPayload,
            ofertas: formValues.ofertas.map((offer) => ({
              id_sucursal: offer.id_sucursal,
              precio_hnl: Number(offer.precio_hnl),
              visible_publico: Boolean(offer.visible_publico),
              orden_visual: Number(offer.orden_visual),
            })),
          }
          : {
          nombre_plan: String(formValues.nombre_plan || "").trim(),
          descripcion: String(formValues.descripcion || "").trim() || null,
          precio_hnl: Number(formValues.precio_hnl),
          periodo_membresia_codigo: "mensual",
          categoria_nivel: normalizePlanCategory(formValues.categoria_nivel, DEFAULT_PLAN_CATEGORY),
          beneficios: beneficiosPayload,
          id_sucursal: branchId,
          visible_publico: Boolean(formValues.visible_publico),
          orden_visual: Number(formValues.orden_visual),
        };

    try {
      if (editTarget?.id_plan) {
        const response = await updateAdminPlan(editTarget.id_plan, payload);
        setPlanes((current) => upsertScopedPlan(current, response?.data));
        notifications.success(dialogMode === "addOffer" ? "Oferta agregada correctamente." : "Plan actualizado correctamente.");
      } else {
        const response = await createAdminPlan(payload);
        setPlanes((current) => upsertScopedPlan(current, response?.data));
        notifications.success("Plan creado correctamente.");
      }

      emitCatalogSync("plans-updated");
      setDialogOpen(false);
      setEditTarget(null);
      setFormValues({ ...FORM_DEFAULTS });
      setFormBranchId(branchId);
      setFormOriginalCourtesyIds([]);
      void fetchPlanes({ silent: true });
    } catch (error) {
      setFormError(extractMessage(error));
      notifications.error(extractMessage(error));
    } finally {
      setFormLoading(false);
    }
  }

  async function handleConfirmState() {
    if (!stateTarget?.id_plan) return;

    setStateLoading(true);
    try {
      const payload = {
        activo: Boolean(stateTarget._nextActivo),
        id_sucursal: stateTarget._branchId,
      };
      if (!stateTarget._nextActivo && stateTarget._forceConfirm) {
        payload.confirmar_clientes_activos = true;
      }

      const response = await setAdminPlanEstado(stateTarget.id_plan, payload);

      setPlanes((current) => upsertScopedPlan(current, response?.data));
      notifications.success(stateTarget._nextActivo ? "Oferta activada." : "Oferta inactivada.");
      emitCatalogSync("plans-updated");
      setConfirmOpen(false);
      setStateTarget(null);
      void fetchPlanes({ silent: true });
    } catch (error) {
      const backendCode = String(error?.data?.error?.code || error?.response?.data?.error?.code || "");
      if (backendCode === "CATALOG_PLAN_ACTIVE_SUBSCRIPTIONS_CONFIRM_REQUIRED") {
        const totalClientesActivos = extractActiveSubscribersCount(error);
        setStateTarget((current) => current
          ? { ...current, _forceConfirm: true, _activeSubscribersCount: totalClientesActivos }
          : current);
        notifications.warning(
          totalClientesActivos > 0
            ? `Este plan tiene ${totalClientesActivos} cliente(s) con suscripcion vigente. Confirma de nuevo para continuar.`
            : "Este plan tiene suscripciones activas. Confirma de nuevo para continuar."
        );
        return;
      }
      notifications.error(extractMessage(error));
    } finally {
      setStateLoading(false);
    }
  }

  const titleSubtitle = !sucursal && availableBranches.length > 1
    ? "Vista de planes maestros globales y sus ofertas por sucursal."
    : "Gestiona planes VIP mensuales y la oferta operativa de la sucursal seleccionada.";

  function renderActions(plan) {
    if (!sucursal) {
      return (
        <div className="flex items-center gap-1.5">
          <HoverActionButton icon={<Eye size={16} strokeWidth={2} />} label="Ver detalle" title="Ver detalle de plan" onClick={() => openDetail(plan)} />
          <HoverActionButton icon={<Pencil size={16} strokeWidth={2} />} label="Editar maestro" title="Editar plan maestro" onClick={() => void openEditarMaestro(plan)} />
          <HoverActionButton icon={<Gift size={16} strokeWidth={2} />} label="Gestionar ofertas" title="Gestionar ofertas por sucursal" onClick={() => openGestionarOfertas(plan)} />
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5">
        <HoverActionButton icon={<Eye size={16} strokeWidth={2} />} label="Ver detalle" title="Ver detalle de plan" onClick={() => openDetail(plan)} />
        <HoverActionButton icon={<Pencil size={16} strokeWidth={2} />} label="Editar maestro" title="Editar plan maestro" onClick={() => void openEditarMaestro(plan)} />
        <HoverActionButton icon={<Gift size={16} strokeWidth={2} />} label="Editar oferta" title="Editar oferta de sucursal" onClick={() => openEditarOferta(plan)} />
        <HoverActionButton
          icon={plan?.activo ? <ToggleLeft size={16} strokeWidth={2} /> : <ToggleRight size={16} strokeWidth={2} />}
          label={plan?.activo ? "Inactivar oferta" : "Activar oferta"}
          title={plan?.activo ? "Inactivar oferta" : "Activar oferta"}
          tone={plan?.activo ? "warning" : "success"}
          onClick={() => openConfirmState(plan)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Catalogo - Planes</p>
              <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Planes VIP</h1>
              <p className="text-sm text-[var(--mf-text-2)]">{titleSubtitle}</p>
            </div>
            <SucursalSelector branchIds={branchIds} allBranches={allBranches} selected={sucursal} onChange={setSucursal} loading={loadingBranches} />
            {branchLoadError ? <ErrorBanner message={branchLoadError} /> : null}
          </div>

          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--mf-text-2)]">{filteredPlanes.length} de {displayPlanes.length} plan(es)</p>
              <ViewToggle value={view} onChange={setView} storageKey="mf-view-planes" />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" size={15} />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o beneficio" className="pl-9" />
              </div>
              <Button variant="outline" className="gap-2" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={15} /> Filtros
                {activeFilterCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-xs text-[var(--mf-accent-text)]">{activeFilterCount}</span> : null}
              </Button>
              <Button className="gap-2" onClick={() => void openNuevo()}>
                <Plus size={15} /> Nuevo plan maestro
              </Button>
            </div>
          </div>
        </div>
      </header>

      {activeFilterChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_78%,transparent)] p-3">
          {activeFilterChips.map((chip) => <span key={chip.key} className="mf-badge mf-badge-muted">{chip.label}</span>)}
          <Button variant="ghost" size="sm" className="ml-auto gap-1 text-xs" onClick={clearAllFilters}><RotateCcw size={13} /> Limpiar</Button>
        </div>
      ) : null}

      {loading ? <LoadingSpinner label="Cargando planes..." /> : null}
      {!loading && listError ? <ErrorBanner message={listError} /> : null}

      {!loading && !listError && planes.length === 0 ? (
        <EmptyState icon={Crown} title="Sin planes registrados" description="Crea el primer plan VIP para empezar a vender membresias por sucursal." actionLabel="Crear plan" onAction={() => void openNuevo()} />
      ) : null}

      {!loading && !listError && displayPlanes.length > 0 && filteredPlanes.length === 0 ? <EmptyState icon={Search} title="Sin resultados" description="No hay coincidencias con la busqueda o filtros actuales." /> : null}

      {!loading && !listError && filteredPlanes.length > 0 && view === "cards" ? (
        <CardsCarousel
          items={filteredPlanes}
          getItemKey={(plan) => `${plan?.id_plan || "plan"}:${sucursal ? plan?.id_sucursal || "all" : "master"}`}
          renderItem={(plan, index, pageIndex) => (
            <DataCard
              key={`${plan.id_plan || "plan"}:${sucursal ? plan.id_sucursal || "all" : "master"}`}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<Crown size={16} />}
              title={plan.nombre_plan || "Plan"}
              subtitle={plan.descripcion || "Sin descripcion"}
              badge={sucursal ? <PlanStatusBadge activo={Boolean(plan.activo)} /> : <span className="mf-badge mf-badge-gold">Maestro</span>}
              fields={[
                ...(!sucursal ? [{ label: "Sucursales asociadas", value: getPlanBranchSummary(plan, branchNameById) }] : []),
                { label: "Categoria", value: <PlanCategoryBadge level={plan.categoria_nivel} /> },
                { label: "Periodo", value: <PlanPeriodBadge period={plan.periodo_membresia_codigo} /> },
                { label: sucursal ? "Precio en esta sucursal" : "Precio por sucursal", value: <span className="font-mono font-bold text-[var(--mf-accent)]">{sucursal ? formatPlanPrice(plan.precio_hnl) : getPlanPriceSummary(plan)}</span> },
                ...(sucursal ? [{ label: "Orden visual en esta sucursal", value: Number(plan.orden_visual ?? 100) }] : []),
                ...(sucursal ? [{ label: "Publico en esta sucursal", value: <PlanVisibilityBadge visible={Boolean(plan.visible_publico)} activo={Boolean(plan.activo)} /> }] : [{ label: "Resumen de ofertas", value: getPlanOfferStateSummary(plan) }]),
                { label: "Servicios / Cortesias", value: (() => {
                  const split = splitBenefitsByType(plan?.beneficios);
                  return `${split.servicios.length} / ${split.cortesias.length}`;
                })() },
              ]}
              actions={renderActions(plan)}
            />
          )}
        />
      ) : null}

      {!loading && !listError && filteredPlanes.length > 0 && view === "table" ? (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                {!sucursal ? <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursales asociadas</TableHead> : null}
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Categoría</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Periodo</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">{sucursal ? "Precio sucursal" : "Precio por sucursal"}</TableHead>
                {sucursal ? <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Orden</TableHead> : null}
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Beneficios</TableHead>
                {sucursal ? <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Publico</TableHead> : null}
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">{sucursal ? "Estado en esta sucursal" : "Ofertas"}</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlanes.map((plan) => (
                <TableRow key={`${plan.id_plan || "plan"}:${sucursal ? plan.id_sucursal || "all" : "master"}`} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">
                  {!sucursal ? <TableCell className="text-[var(--mf-text-2)]">{getPlanBranchSummary(plan, branchNameById)}</TableCell> : null}
                  <TableCell className="font-medium text-[var(--mf-text)]">
                    <div>{plan.nombre_plan}</div>
                    {plan.descripcion ? <div className="text-xs text-[var(--mf-text-2)] mt-0.5">{plan.descripcion}</div> : null}
                  </TableCell>
                  <TableCell className="text-center"><PlanCategoryBadge level={plan.categoria_nivel} /></TableCell>
                  <TableCell className="text-center"><PlanPeriodBadge period={plan.periodo_membresia_codigo} /></TableCell>
                  <TableCell className="text-right font-mono font-semibold text-[var(--mf-accent)]">{sucursal ? formatPlanPrice(plan.precio_hnl) : getPlanPriceSummary(plan)}</TableCell>
                  {sucursal ? <TableCell className="text-center text-[var(--mf-text-2)]">{Number(plan.orden_visual ?? 100)}</TableCell> : null}
                  <TableCell className="text-center hidden md:table-cell text-[var(--mf-text-2)]">
                    {(() => {
                      const split = splitBenefitsByType(plan?.beneficios);
                      return `${split.servicios.length} / ${split.cortesias.length}`;
                    })()}
                  </TableCell>
                  {sucursal ? <TableCell className="text-center hidden md:table-cell"><PlanVisibilityBadge visible={Boolean(plan.visible_publico)} activo={Boolean(plan.activo)} /></TableCell> : null}
                  <TableCell className="text-center">{sucursal ? <PlanStatusBadge activo={Boolean(plan.activo)} /> : getPlanOfferStateSummary(plan)}</TableCell>
                  <TableCell className="text-right"><div className="flex items-center justify-end gap-1.5">{renderActions(plan)}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!formLoading) setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "editOffer"
                ? "Editar oferta de sucursal"
                : dialogMode === "addOffer"
                  ? "Agregar oferta a otra sucursal"
                  : dialogMode === "editMaster"
                    ? "Editar plan maestro"
                    : "Nuevo plan maestro"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "editOffer"
                ? "Estos cambios solo aplican a la oferta del plan en esta sucursal."
                : dialogMode === "addOffer"
                  ? "Esta accion no crea otro plan maestro. Solo agrega una oferta operativa para la sucursal seleccionada."
                  : dialogMode === "editMaster"
                    ? "Estos cambios afectan el plan maestro y se reflejan en todas las sucursales donde este ofertado."
                    : "Crea el plan maestro global y su primera oferta operativa."}
            </DialogDescription>
          </DialogHeader>
          <PlanForm
            values={formValues}
            onChange={handleFormChange}
            services={services}
            courtesias={courtesies}
            existingCourtesyIds={formOriginalCourtesyIds}
            branchLabel={branchNameById[formBranchId]}
            mode={dialogMode}
            availableBranches={dialogMode === "addOffer" ? getUnassociatedBranches(editTarget, availableBranches) : availableBranches}
            formBranchId={formBranchId}
            onBranchChange={(branchId) => void handleFormBranchChange(branchId)}
            onCreateOfferToggle={(branchId, checked) => void handleCreateOfferToggle(branchId, checked)}
            onCreateOfferChange={handleCreateOfferChange}
          />
          {dialogMode === "create" && formValues.ofertas.length > 0 && services.length === 0 ? <ErrorBanner message="No hay servicios activos comunes en las sucursales seleccionadas para construir este plan." /> : null}
          {loadingServices ? <p className="text-xs text-[var(--mf-text-2)] flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Cargando opciones de servicios y cortesias...</p> : null}
          {formError ? <ErrorBanner message={formError} /> : null}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>Cancelar</Button>
            <Button onClick={handleGuardar} disabled={formLoading} className="gap-2 min-w-[120px]">{formLoading ? <Loader2 size={15} className="animate-spin" /> : null}{editTarget ? "Guardar cambios" : "Crear plan maestro"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle de plan</DialogTitle>
            <DialogDescription className="sr-only">Consulta datos comerciales y beneficios del plan VIP seleccionado.</DialogDescription>
          </DialogHeader>
          {detailTarget ? (
            <DetailInfoModalContent
              summary={{ icon: <Crown size={16} />, title: detailTarget.nombre_plan || "-", subtitle: detailTarget.descripcion || "Sin descripcion", badge: <PlanStatusBadge activo={Boolean(detailTarget.activo)} /> }}
              sections={[
                {
                  id: "comercial",
                  title: "Datos comerciales",
                  icon: <Gift size={14} />,
                  fields: [
                    { label: "Precio HNL", value: `L ${Number(detailTarget.precio_hnl ?? 0).toFixed(2)}` },
                    { label: "Categoría", value: <PlanCategoryBadge level={detailTarget.categoria_nivel} /> },
                    { label: "Periodo", value: <PlanPeriodBadge period={detailTarget.periodo_membresia_codigo} /> },
                    { label: "Visibilidad pública", value: <PlanVisibilityBadge visible={Boolean(detailTarget.visible_publico)} activo={Boolean(detailTarget.activo)} /> },
                    { label: "Sucursal", value: detailTarget.id_sucursal ? (branchNameById[detailTarget.id_sucursal] || detailTarget.id_sucursal) : "Sin sucursal" },
                    { label: "Orden visual", value: Number(detailTarget.orden_visual ?? 100) },
                  ],
                },
                {
                  id: "beneficios",
                  title: "Beneficios del plan",
                  icon: <Scissors size={14} />,
                  fields: [
                    {
                      label: "Total beneficios",
                      value: Array.isArray(detailTarget?.beneficios) ? detailTarget.beneficios.length : 0,
                    },
                    {
                      label: "Servicios incluidos",
                      value: (() => {
                        const split = splitBenefitsByType(detailTarget?.beneficios);
                        if (!split.servicios.length) return "Ninguno";
                        return (
                          <div className="flex flex-col gap-2">
                            {split.servicios.map((benefit, index) => (
                              <div key={`serv-${index}-${benefit?.id_servicio || benefit?.nombre || "benefit"}`} className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2 text-sm">
                                <span className="font-semibold text-[var(--mf-text)]">{Number(benefit?.cantidad || 0)}x</span>{" "}
                                <span className="text-[var(--mf-text)]">{benefit?.nombre || "Servicio"}</span>
                              </div>
                            ))}
                          </div>
                        );
                      })(),
                      span: "full",
                    },
                    {
                      label: "Cortesias incluidas",
                      value: (
                        (() => {
                          const split = splitBenefitsByType(detailTarget?.beneficios);
                          if (!split.cortesias.length) return "Ninguna";
                          return (
                            <div className="flex flex-col gap-2">
                              {split.cortesias.map((benefit, index) => (
                                <div key={`cor-${index}-${benefit?.id_cortesia || benefit?.nombre || "benefit"}`} className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2 text-sm">
                                  <span className="font-semibold text-[var(--mf-text)]">{Number(benefit?.cantidad || 0)}x</span>{" "}
                                  <span className="text-[var(--mf-text)]">{benefit?.nombre || "Cortesia"}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()
                      ),
                      span: "full",
                    },
                  ],
                },
                {
                  id: "meta",
                  title: "Trazabilidad",
                  icon: <CalendarClock size={14} />,
                  fields: [{ label: "ID plan", value: detailTarget.id_plan || "-", span: "full" }],
                },
              ]}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={offersOpen} onOpenChange={setOffersOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gestionar ofertas</DialogTitle>
            <DialogDescription>Ofertas existentes por sucursal para {offersTarget?.nombre_plan || "este plan"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {getPlanOffers(offersTarget).map((offer) => (
              <div key={`${offersTarget?.id_plan || "plan"}-${offer?.id_sucursal || "branch"}`} className="rounded-[14px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_42%,transparent)] p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 text-sm">
                    <div className="font-medium text-[var(--mf-text)]">{branchNameById[offer?.id_sucursal] || offer?.id_sucursal || "Sucursal no identificada"}</div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--mf-text-2)]">
                      <span>Precio: <strong className="font-mono text-[var(--mf-accent)]">{formatPlanPrice(offer?.precio_hnl)}</strong></span>
                      <span>Orden: {Number(offer?.orden_visual ?? 100)}</span>
                      <PlanStatusBadge activo={Boolean(offer?.activo)} />
                      <PlanVisibilityBadge visible={Boolean(offer?.visible_publico)} activo={Boolean(offer?.activo)} />
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setOffersOpen(false);
                      openEditarOferta(offersTarget, offer);
                    }}
                  >
                    <Pencil size={14} /> Editar oferta
                  </Button>
                </div>
              </div>
            ))}
            <div className="rounded-[14px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_75%,transparent)] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-[var(--mf-text-2)]">
                  Esta accion no crea otro plan maestro. Solo agrega una oferta operativa para la sucursal seleccionada.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="gap-2"
                  disabled={getUnassociatedBranches(offersTarget, availableBranches).length === 0}
                  onClick={() => openAgregarOferta(offersTarget)}
                >
                  <Plus size={14} /> Agregar oferta a otra sucursal
                </Button>
              </div>
              {getUnassociatedBranches(offersTarget, availableBranches).length === 0 ? (
                <p className="mt-2 text-xs text-[var(--mf-text-2)]">Este plan ya tiene oferta en todas las sucursales disponibles.</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOffersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Planes</DialogTitle>
            <DialogDescription className="sr-only">Ajusta criterios para filtrar planes por estado, visibilidad, beneficios, periodo y sucursal.</DialogDescription>
          </DialogHeader>

          {/* AM: Atajos de filtro para acelerar trabajo operativo del super admin. */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev, estado: prev.estado === "activo" ? "all" : "activo" }))} className={quickFilterButtonClass(filters.estado === "activo")}>Solo activos</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev, visibilidad: prev.visibilidad === "visible" ? "all" : "visible" }))} className={quickFilterButtonClass(filters.visibilidad === "visible")}>Públicos</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev, tipo: prev.tipo === "servicio" ? "all" : "servicio" }))} className={quickFilterButtonClass(filters.tipo === "servicio")}>Con servicios</Button>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mf-label">Estado</Label>
              <select className="mf-select mt-1" value={filters.estado} onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value }))}>
                <option value="all">Todos</option>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div>
              <Label className="mf-label">Visibilidad pública</Label>
              <select className="mf-select mt-1" value={filters.visibilidad} onChange={(event) => setFilters((prev) => ({ ...prev, visibilidad: event.target.value }))}>
                <option value="all">Todos</option>
                <option value="visible">Visible al publico</option>
                <option value="oculto">Oculto al publico</option>
              </select>
            </div>
            <div>
              <Label className="mf-label">Tipo de beneficio</Label>
              <select className="mf-select mt-1" value={filters.tipo} onChange={(event) => setFilters((prev) => ({ ...prev, tipo: event.target.value }))}>
                <option value="all">Todos</option>
                <option value="servicio">Solo servicio</option>
                <option value="cortesia">Solo cortesia</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            <div>
              <Label className="mf-label">Periodo</Label>
              <select className="mf-select mt-1" value={filters.periodo} onChange={(event) => setFilters((prev) => ({ ...prev, periodo: event.target.value }))}>
                <option value="all">Todos</option>
                <option value="mensual">Mensual</option>
              </select>
            </div>

            {!sucursal ? (
              <div className="sm:col-span-2">
                <Label className="mf-label">Sucursal</Label>
                <select className="mf-select mt-1" value={filters.idSucursal} onChange={(event) => setFilters((prev) => ({ ...prev, idSucursal: event.target.value }))}>
                  <option value="all">Todas</option>
                  {availableBranches.map((branch) => <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}
                </select>
              </div>
            ) : (
              <p className="sm:col-span-2 text-xs text-[var(--mf-text-2)]">La sucursal ya esta fijada en el selector superior.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={clearAllFilters}>Limpiar filtros</Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !stateLoading) {
            setConfirmOpen(false);
            setStateTarget(null);
          }
        }}
        tone={stateTarget?._nextActivo ? "warning" : "danger"}
        title={stateTarget?._nextActivo ? "Activar oferta" : "Inactivar oferta"}
        description={stateTarget
          ? (
            !stateTarget?._nextActivo && stateTarget?._forceConfirm
              ? `Este plan tiene ${Number(stateTarget?._activeSubscribersCount || 0)} cliente(s) con suscripcion vigente en esta sucursal. Se ocultara para nuevas ventas, pero las suscripciones actuales seguiran operativas hasta vencer.`
              : `Se ${stateTarget._nextActivo ? "activara" : "inactivara"} la oferta de ${stateTarget.nombre_plan} en esta sucursal.`
          )
          : ""}
        confirmLabel={stateTarget?._nextActivo ? "Activar oferta" : "Inactivar oferta"}
        cancelLabel="Cancelar"
        loading={stateLoading}
        onConfirm={handleConfirmState}
      />
    </div>
  );
}



