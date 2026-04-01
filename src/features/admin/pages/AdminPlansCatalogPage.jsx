import { useCallback, useEffect, useMemo, useState } from "react";
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

const FORM_DEFAULTS = {
  nombre_plan: "",
  descripcion: "",
  precio_hnl: "",
  periodo_membresia_codigo: "mensual",
  visible_publico: true,
  orden_visual: "100",
  beneficios: [],
};

const FILTER_DEFAULTS = {
  estado: "all",
  visibilidad: "all",
  tipo: "all",
  periodo: "all",
  idSucursal: "all",
};

function extractMessage(error) {
  return error?.data?.error?.message || error?.message || "Error desconocido.";
}

function normalizeTipo(value) {
  return String(value || "").trim().toLowerCase() === "servicio" ? "servicio" : "cortesia";
}

function normalizeBenefits(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    tipo: normalizeTipo(item?.tipo),
    id_servicio: item?.id_servicio ? String(item.id_servicio) : "",
    nombre: item?.nombre ? String(item.nombre) : "",
    cantidad: Number(item?.cantidad ?? 1),
  }));
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

function upsertScopedPlan(list = [], nextPlan) {
  const nextId = String(nextPlan?.id_plan || "");
  const nextBranch = String(nextPlan?.id_sucursal || "");
  const current = Array.isArray(list) ? list : [];
  const without = current.filter((entry) => String(entry?.id_plan || "") !== nextId || String(entry?.id_sucursal || "") !== nextBranch);
  return sortPlanes([...without, nextPlan]);
}

function validateForm(values) {
  if (!String(values?.nombre_plan || "").trim()) return "El nombre del plan es requerido.";
  const precio = Number(values?.precio_hnl);
  if (!Number.isFinite(precio) || precio < 0) return "El precio debe ser mayor o igual a 0.";
  const ordenVisual = Number(values?.orden_visual);
  if (!Number.isFinite(ordenVisual) || ordenVisual < 0) return "El orden visual debe ser mayor o igual a 0.";

  const benefits = Array.isArray(values?.beneficios) ? values.beneficios : [];
  if (!benefits.length) return "Debes agregar al menos un beneficio.";

  const seenServices = new Set();
  const seenCourtesies = new Set();

  for (const benefit of benefits) {
    const tipo = normalizeTipo(benefit?.tipo);
    const cantidad = Number(benefit?.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1) return "Cada beneficio debe tener cantidad valida.";

    if (tipo === "servicio") {
      const idServicio = String(benefit?.id_servicio || "").trim();
      if (!idServicio) return "Cada beneficio tipo servicio debe seleccionar servicio.";
      if (seenServices.has(idServicio)) return "No repitas servicios en beneficios.";
      seenServices.add(idServicio);
      continue;
    }

    const nombre = String(benefit?.nombre || "").trim();
    if (!nombre) return "Cada cortesia debe incluir nombre.";
    const key = String(nombre).trim().toLowerCase();
    if (seenCourtesies.has(key)) return "No repitas la misma cortesia.";
    seenCourtesies.add(key);
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

function PlanVisibilityBadge({ visible }) {
  return <span className={`mf-badge ${visible ? "mf-badge-green" : "mf-badge-muted"}`}>{visible ? "Visible" : "Oculto"}</span>;
}

function PlanPeriodBadge({ period }) {
  return <span className="mf-badge mf-badge-gold">{formatPeriod(period)}</span>;
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
        <option value="">- Seleccionar sucursal -</option>
        {available.map((branch) => <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>)}
      </select>
    </div>
  );
}

function PlanBenefitsEditor({ items, onChange, services }) {
  const benefits = Array.isArray(items) ? items : [];
  const selectedServiceIds = new Set(
    benefits
      .filter((item) => normalizeTipo(item?.tipo) === "servicio")
      .map((item) => item?.id_servicio)
      .filter(Boolean)
  );

  function addItem() {
    onChange([...benefits, { tipo: "servicio", id_servicio: "", nombre: "", cantidad: 1 }]);
  }

  function removeItem(index) {
    onChange(benefits.filter((_, currentIndex) => currentIndex !== index));
  }

  function updateItem(index, field, value) {
    onChange(benefits.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      if (field === "tipo") {
        const nextType = normalizeTipo(value);
        return { tipo: nextType, id_servicio: "", nombre: "", cantidad: 1 };
      }
      return { ...item, [field]: value };
    }));
  }

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-3">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Beneficios mensuales</Label>
        <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1.5">
          <Plus size={13} /> Agregar
        </Button>
      </div>

      {!benefits.length ? <p className="text-xs text-[var(--mf-text-2)]">Aun no agregas beneficios.</p> : null}

      {benefits.map((item, index) => {
        const tipo = normalizeTipo(item?.tipo);
        const currentServiceId = String(item?.id_servicio || "").trim();

        return (
          <div key={`${index}-${currentServiceId || item?.codigo || "new"}`} className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--mf-nav-border)] p-2 sm:grid-cols-[130px_1fr_90px_auto] sm:items-center">
            <select value={tipo} onChange={(event) => updateItem(index, "tipo", event.target.value)} className="mf-select">
              <option value="servicio">Servicio</option>
              <option value="cortesia">Cortesia</option>
            </select>

            {tipo === "servicio" ? (
              <select
                value={currentServiceId}
                onChange={(event) => updateItem(index, "id_servicio", event.target.value)}
                className="mf-select"
              >
                <option value="">Seleccionar servicio</option>
                {services.map((service) => {
                  const optionId = service.id_servicio;
                  const isTaken = selectedServiceIds.has(optionId) && optionId !== currentServiceId;
                  return <option key={optionId} value={optionId} disabled={isTaken}>{service.nombre_servicio}</option>;
                })}
              </select>
            ) : (
              <Input
                value={item?.nombre || ""}
                onChange={(event) => updateItem(index, "nombre", event.target.value)}
                placeholder="Nombre cortesia"
              />
            )}

            <Input
              type="number"
              min="1"
              value={item?.cantidad ?? 1}
              onChange={(event) => updateItem(index, "cantidad", event.target.value)}
              className="text-center"
              placeholder="1"
            />

            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => removeItem(index)}
              className="h-9 w-9 rounded-xl border-red-500/35 text-red-400 hover:bg-red-500/15"
              aria-label="Quitar beneficio"
              title="Quitar beneficio"
            >
              <X size={13} />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function PlanForm({ values, onChange, services, branchLabel }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-xs text-[var(--mf-text-2)]">
        Sucursal operativa: <span className="font-medium text-[var(--mf-text)]">{branchLabel || "No definida"}</span>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="plan-name">Nombre del plan *</Label>
        <Input id="plan-name" value={values.nombre_plan} onChange={(event) => onChange("nombre_plan", event.target.value)} placeholder="Ej. Plan VIP" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="plan-description">Descripcion</Label>
        <Input id="plan-description" value={values.descripcion} onChange={(event) => onChange("descripcion", event.target.value)} placeholder="Descripcion comercial opcional" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="plan-price">Precio HNL *</Label>
          <Input id="plan-price" type="number" min="0" step="0.01" value={values.precio_hnl} onChange={(event) => onChange("precio_hnl", event.target.value)} placeholder="2400.00" />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="plan-order">Orden visual *</Label>
          <Input id="plan-order" type="number" min="0" value={values.orden_visual} onChange={(event) => onChange("orden_visual", event.target.value)} placeholder="100" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="plan-period">Periodo</Label>
          <Input id="plan-period" value="Mensual" readOnly />
        </div>

        <label className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm">
          <span className="text-[var(--mf-text)]">Visible en catalogo publico</span>
          <input type="checkbox" checked={Boolean(values.visible_publico)} onChange={(event) => onChange("visible_publico", event.target.checked)} className="h-4 w-4 accent-[var(--mf-accent)]" />
        </label>
      </div>

      <PlanBenefitsEditor items={values.beneficios} onChange={(nextItems) => onChange("beneficios", nextItems)} services={services} />
    </div>
  );
}

export default function AdminPlansCatalogPage() {
  const navigate = useNavigate();
  const { branchIds, roles = [] } = useAuth();
  const notifications = useNotifications();
  const isSuperAdmin = roles.includes("super_admin");

  const [allBranches, setAllBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchLoadError, setBranchLoadError] = useState("");
  const [sucursal, setSucursal] = useState(branchIds.length === 1 ? branchIds[0] : "");

  const [planes, setPlanes] = useState([]);
  const [services, setServices] = useState([]);
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
  const [editTarget, setEditTarget] = useState(null);
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [formBranchId, setFormBranchId] = useState("");
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stateTarget, setStateTarget] = useState(null);
  const [stateLoading, setStateLoading] = useState(false);

  const branchNameById = useMemo(() => allBranches.reduce((acc, branch) => ({ ...acc, [branch.id_sucursal]: branch.nombre_sucursal }), {}), [allBranches]);

  const availableBranches = useMemo(() => {
    const scoped = branchIds.length > 0 ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal)) : allBranches;
    return scoped.filter((branch) => branch?.id_sucursal);
  }, [allBranches, branchIds]);
  // AM: Bloquea acciones de cards/tablas hasta seleccionar sucursal cuando hay multiples sucursales.
  const actionsLockedByBranch = !sucursal && availableBranches.length > 1;

  const filteredPlanes = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return planes.filter((plan) => {
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
        if (Boolean(plan?.activo) !== expected) return false;
      }

      if (filters.visibilidad !== "all") {
        const expected = filters.visibilidad === "visible";
        if (Boolean(plan?.visible_publico) !== expected) return false;
      }

      if (filters.tipo !== "all" && planBenefitKind(plan) !== filters.tipo) return false;
      if (filters.periodo !== "all" && String(plan?.periodo_membresia_codigo || "").toLowerCase() !== filters.periodo) return false;
      if (!sucursal && filters.idSucursal !== "all" && String(plan?.id_sucursal || "") !== filters.idSucursal) return false;

      return true;
    });
  }, [filters, planes, search, sucursal]);

  const activeFilterCount = useMemo(() => Object.values(filters).filter((value) => value !== "all").length, [filters]);

  const activeFilterChips = useMemo(() => {
    const chips = [];
    const trimmedSearch = search.trim();
    if (trimmedSearch) chips.push({ key: "search", label: `Busqueda: ${trimmedSearch}` });
    if (filters.estado !== "all") chips.push({ key: "estado", label: `Estado: ${filters.estado === "activo" ? "Activo" : "Inactivo"}` });
    if (filters.visibilidad !== "all") chips.push({ key: "visibilidad", label: `Publico: ${filters.visibilidad === "visible" ? "Visible" : "Oculto"}` });
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
    if (branchIds.length === 1) return branchIds[0];
    return "";
  }

  const fetchBranches = useCallback(async () => {
    if (!isSuperAdmin) return;

    setLoadingBranches(true);
    setBranchLoadError("");

    try {
      const response = await listAdminSucursales({ soloActivas: true });
      const nextBranches = Array.isArray(response?.data?.sucursales)
        ? response.data.sucursales.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
        : [];
      setAllBranches(nextBranches);

      if (nextBranches.length === 1) {
        setSucursal(nextBranches[0].id_sucursal);
      } else if (sucursal && !nextBranches.some((branch) => branch.id_sucursal === sucursal)) {
        setSucursal("");
      }
    } catch (error) {
      const message = extractMessage(error);
      setBranchLoadError(message);
      notifications.error(message);
    } finally {
      setLoadingBranches(false);
    }
  }, [isSuperAdmin, notifications, sucursal]);

  const fetchPlanes = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setListError("");

    try {
      const response = await listAdminPlanes({ id_sucursal: sucursal || undefined });
      const list = Array.isArray(response?.data?.planes) ? response.data.planes : [];
      setPlanes(sortPlanes(list));
    } catch (error) {
      const message = extractMessage(error);
      setListError(message);
      if (!silent) notifications.error(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [notifications, sucursal]);

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
        .filter((service) => Boolean(service?.activo) && Boolean(service?.tarifa_activa))
        .map((service) => ({ id_servicio: service.id_servicio, nombre_servicio: service.nombre_servicio }))
        .sort((a, b) => String(a.nombre_servicio || "").localeCompare(String(b.nombre_servicio || ""), "es"));

      setServices(scoped);
      return scoped;
    } catch (error) {
      notifications.warning(extractMessage(error));
      setServices([]);
      return [];
    } finally {
      setLoadingServices(false);
    }
  }, [notifications]);

  useEffect(() => {
    try {
      localStorage.setItem("mf-view-planes", view);
    } catch {
      // AM: Evita romper render si localStorage no esta disponible.
    }
  }, [view]);

  useEffect(() => {
    if (!isSuperAdmin) {
      navigate("/unauthorized", { replace: true });
    }
  }, [isSuperAdmin, navigate]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void fetchBranches();
  }, [isSuperAdmin, fetchBranches]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    void fetchPlanes();
    void fetchServicesForBranch(sucursal);
  }, [fetchPlanes, fetchServicesForBranch, isSuperAdmin, sucursal]);

  function handleFormChange(field, value) {
    setFormValues((previous) => ({ ...previous, [field]: value }));
  }

  async function openNuevo() {
    const branchId = resolveMutationBranchId();
    if (!branchId) {
      notifications.warning("Debes seleccionar una sucursal para crear planes.");
      return;
    }

    await fetchServicesForBranch(branchId);
    setFormBranchId(branchId);
    setEditTarget(null);
    setFormValues({ ...FORM_DEFAULTS });
    setFormError("");
    setDialogOpen(true);
  }

  async function openEditar(plan) {
    const branchId = resolveMutationBranchId(plan);
    if (!branchId) {
      notifications.warning("Debes seleccionar una sucursal valida para editar el plan.");
      return;
    }

    await fetchServicesForBranch(branchId);
    setFormBranchId(branchId);
    setEditTarget(plan);
    setFormValues({
      nombre_plan: plan?.nombre_plan || "",
      descripcion: plan?.descripcion || "",
      precio_hnl: Number(plan?.precio_hnl ?? 0).toString(),
      periodo_membresia_codigo: String(plan?.periodo_membresia_codigo || "mensual").toLowerCase(),
      visible_publico: Boolean(plan?.visible_publico),
      orden_visual: String(Number(plan?.orden_visual ?? 100)),
      beneficios: normalizeBenefits(plan?.beneficios),
    });
    setFormError("");
    setDialogOpen(true);
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

    setStateTarget({ ...plan, _nextActivo: !plan?.activo, _branchId: branchId });
    setConfirmOpen(true);
  }

  async function handleGuardar() {
    const validationError = validateForm(formValues);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const branchId = formBranchId || resolveMutationBranchId(editTarget);
    if (!branchId) {
      setFormError("Debes seleccionar una sucursal valida para guardar el plan.");
      return;
    }

    setFormLoading(true);
    setFormError("");

    const payload = {
      nombre_plan: String(formValues.nombre_plan || "").trim(),
      descripcion: String(formValues.descripcion || "").trim() || null,
      precio_hnl: Number(formValues.precio_hnl),
      periodo_membresia_codigo: "mensual",
      beneficios: normalizeBenefits(formValues.beneficios).map((item) => {
        const tipo = normalizeTipo(item?.tipo);
        const payloadItem = { tipo, cantidad: Number(item?.cantidad) };
        if (tipo === "servicio") {
          payloadItem.id_servicio = String(item?.id_servicio || "").trim();
        } else {
          payloadItem.nombre = String(item?.nombre || "").trim();
        }
        return payloadItem;
      }),
      id_sucursal: branchId,
      visible_publico: Boolean(formValues.visible_publico),
      orden_visual: Number(formValues.orden_visual),
    };

    try {
      if (editTarget?.id_plan) {
        const response = await updateAdminPlan(editTarget.id_plan, payload);
        setPlanes((current) => upsertScopedPlan(current, response?.data));
        notifications.success("Plan actualizado correctamente.");
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
      const response = await setAdminPlanEstado(stateTarget.id_plan, {
        activo: Boolean(stateTarget._nextActivo),
        id_sucursal: stateTarget._branchId,
      });

      setPlanes((current) => upsertScopedPlan(current, response?.data));
      notifications.success(stateTarget._nextActivo ? "Plan activado." : "Plan inactivado.");
      emitCatalogSync("plans-updated");
      setConfirmOpen(false);
      setStateTarget(null);
      void fetchPlanes({ silent: true });
    } catch (error) {
      notifications.error(extractMessage(error));
    } finally {
      setStateLoading(false);
    }
  }

  const titleSubtitle = !sucursal && availableBranches.length > 1
    ? "Selecciona una sucursal para crear, editar o cambiar estado de planes."
    : "Gestiona planes VIP mensuales por sucursal con beneficios operativos.";

  function renderActions(plan) {
    return (
      <div className="flex items-center gap-1.5">
        <HoverActionButton icon={<Eye size={16} strokeWidth={2} />} label="Detalle" title="Ver detalle de plan" disabled={actionsLockedByBranch} onClick={() => openDetail(plan)} />
        <HoverActionButton icon={<Pencil size={16} strokeWidth={2} />} label="Editar" title="Editar plan" disabled={actionsLockedByBranch} onClick={() => void openEditar(plan)} />
        <HoverActionButton
          icon={plan?.activo ? <ToggleLeft size={16} strokeWidth={2} /> : <ToggleRight size={16} strokeWidth={2} />}
          label={plan?.activo ? "Inactivar" : "Activar"}
          title={plan?.activo ? "Inactivar plan" : "Activar plan"}
          tone={plan?.activo ? "warning" : "success"}
          disabled={actionsLockedByBranch}
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
              <p className="text-sm text-[var(--mf-text-2)]">{filteredPlanes.length} de {planes.length} plan(es)</p>
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
              <Button className="gap-2" onClick={() => void openNuevo()} disabled={actionsLockedByBranch}>
                <Plus size={15} /> Nuevo
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

      {!loading && !listError && planes.length > 0 && filteredPlanes.length === 0 ? <EmptyState icon={Search} title="Sin resultados" description="No hay coincidencias con la busqueda o filtros actuales." /> : null}

      {!loading && !listError && filteredPlanes.length > 0 && view === "cards" ? (
        <CardsCarousel
          items={filteredPlanes}
          getItemKey={(plan) => `${plan?.id_plan || "plan"}:${plan?.id_sucursal || "all"}`}
          renderItem={(plan, index, pageIndex) => (
            <DataCard
              key={`${plan.id_plan || "plan"}:${plan.id_sucursal || "all"}`}
              animationDelay={(pageIndex * 0.02) + (index * 0.05)}
              avatar={<Crown size={16} />}
              title={plan.nombre_plan || "Plan"}
              subtitle={plan.descripcion || "Sin descripcion"}
              badge={<PlanStatusBadge activo={Boolean(plan.activo)} />}
              fields={[
                ...(!sucursal ? [{ label: "Sucursal", value: branchNameById[plan.id_sucursal] || "Sin sucursal" }] : []),
                { label: "Periodo", value: <PlanPeriodBadge period={plan.periodo_membresia_codigo} /> },
                { label: "Precio", value: <span className="font-mono font-bold text-[var(--mf-accent)]">L {Number(plan.precio_hnl ?? 0).toFixed(2)}</span> },
                { label: "Orden visual", value: Number(plan.orden_visual ?? 100) },
                { label: "Publico", value: <PlanVisibilityBadge visible={Boolean(plan.visible_publico)} /> },
                { label: "Beneficios", value: Array.isArray(plan?.beneficios) ? plan.beneficios.length : 0 },
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
                {!sucursal ? <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursal</TableHead> : null}
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Periodo</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Precio HNL</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Orden</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Beneficios</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Publico</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Estado</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlanes.map((plan) => (
                <TableRow key={`${plan.id_plan || "plan"}:${plan.id_sucursal || "all"}`} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">
                  {!sucursal ? <TableCell className="text-[var(--mf-text-2)]">{branchNameById[plan.id_sucursal] || "Sin sucursal"}</TableCell> : null}
                  <TableCell className="font-medium text-[var(--mf-text)]">
                    <div>{plan.nombre_plan}</div>
                    {plan.descripcion ? <div className="text-xs text-[var(--mf-text-2)] mt-0.5">{plan.descripcion}</div> : null}
                  </TableCell>
                  <TableCell className="text-center"><PlanPeriodBadge period={plan.periodo_membresia_codigo} /></TableCell>
                  <TableCell className="text-right font-mono font-semibold text-[var(--mf-accent)]">L {Number(plan.precio_hnl ?? 0).toFixed(2)}</TableCell>
                  <TableCell className="text-center text-[var(--mf-text-2)]">{Number(plan.orden_visual ?? 100)}</TableCell>
                  <TableCell className="text-center hidden md:table-cell text-[var(--mf-text-2)]">{Array.isArray(plan?.beneficios) ? plan.beneficios.length : 0}</TableCell>
                  <TableCell className="text-center hidden md:table-cell"><PlanVisibilityBadge visible={Boolean(plan.visible_publico)} /></TableCell>
                  <TableCell className="text-center"><PlanStatusBadge activo={Boolean(plan.activo)} /></TableCell>
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
            <DialogTitle>{editTarget ? "Editar plan" : "Nuevo plan"}</DialogTitle>
            <DialogDescription className="sr-only">Configura nombre, precio, visibilidad y beneficios mensuales del plan VIP.</DialogDescription>
          </DialogHeader>
          <PlanForm values={formValues} onChange={handleFormChange} services={services} branchLabel={branchNameById[formBranchId]} />
          {loadingServices ? <p className="text-xs text-[var(--mf-text-2)] flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Cargando servicios operativos para beneficios...</p> : null}
          {formError ? <ErrorBanner message={formError} /> : null}
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>Cancelar</Button>
            <Button onClick={handleGuardar} disabled={formLoading} className="gap-2 min-w-[120px]">{formLoading ? <Loader2 size={15} className="animate-spin" /> : null}{editTarget ? "Guardar cambios" : "Crear plan"}</Button>
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
                    { label: "Periodo", value: <PlanPeriodBadge period={detailTarget.periodo_membresia_codigo} /> },
                    { label: "Visibilidad publica", value: <PlanVisibilityBadge visible={Boolean(detailTarget.visible_publico)} /> },
                    { label: "Sucursal", value: detailTarget.id_sucursal ? (branchNameById[detailTarget.id_sucursal] || detailTarget.id_sucursal) : "Sin sucursal" },
                    { label: "Orden visual", value: Number(detailTarget.orden_visual ?? 100) },
                  ],
                },
                {
                  id: "beneficios",
                  title: "Beneficios del plan",
                  icon: <Scissors size={14} />,
                  fields: [
                    { label: "Total beneficios", value: Array.isArray(detailTarget?.beneficios) ? detailTarget.beneficios.length : 0 },
                    {
                      label: "Detalle",
                      value: (
                        <div className="flex flex-col gap-2">
                          {(Array.isArray(detailTarget?.beneficios) ? detailTarget.beneficios : []).map((benefit, index) => (
                            <div key={`${index}-${benefit?.id_servicio || benefit?.codigo || benefit?.nombre || "benefit"}`} className="rounded-xl border border-[var(--mf-nav-border)] px-3 py-2 text-sm">
                              <span className="font-semibold text-[var(--mf-text)]">{Number(benefit?.cantidad || 0)}x</span>{" "}
                              <span className="text-[var(--mf-text)]">{benefit?.nombre || benefit?.codigo || "Beneficio"}</span>
                              <span className="ml-2 text-xs text-[var(--mf-text-2)]">({normalizeTipo(benefit?.tipo) === "servicio" ? "Servicio" : "Cortesia"})</span>
                            </div>
                          ))}
                        </div>
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

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de Planes</DialogTitle>
            <DialogDescription className="sr-only">Ajusta criterios para filtrar planes por estado, visibilidad, beneficios, periodo y sucursal.</DialogDescription>
          </DialogHeader>

          {/* AM: Atajos de filtro para acelerar trabajo operativo del super admin. */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev, estado: prev.estado === "activo" ? "all" : "activo" }))} className={quickFilterButtonClass(filters.estado === "activo")}>Solo activos</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev, visibilidad: prev.visibilidad === "visible" ? "all" : "visible" }))} className={quickFilterButtonClass(filters.visibilidad === "visible")}>Publicos</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev, tipo: prev.tipo === "servicio" ? "all" : "servicio" }))} className={quickFilterButtonClass(filters.tipo === "servicio")}>Con servicio</Button>
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
              <Label className="mf-label">Visibilidad publica</Label>
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
        title={stateTarget?._nextActivo ? "Activar plan" : "Inactivar plan"}
        description={stateTarget ? `Se ${stateTarget._nextActivo ? "activara" : "inactivara"} ${stateTarget.nombre_plan}.` : ""}
        confirmLabel={stateTarget?._nextActivo ? "Activar" : "Inactivar"}
        cancelLabel="Cancelar"
        loading={stateLoading}
        onConfirm={handleConfirmState}
      />
    </div>
  );
}

