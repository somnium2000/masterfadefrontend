import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Gift,
  Loader2,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  Eye,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext.jsx";
import { useNotifications } from "../../../context/NotificationsContext.jsx";
import {
  createAdminCortesia,
  listAdminCortesias,
  setAdminCortesiaEstado,
  updateAdminCortesia,
} from "../lib/adminCortesiasApi.js";
import { listAdminSucursales } from "../lib/adminSucursalesApi.js";
import { emitCatalogSync } from "../../../lib/catalogSync.js";
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
import ErrorBanner from "../../../components/data/ErrorBanner.jsx";
import EmptyState from "../../../components/data/EmptyState.jsx";
import LoadingSpinner from "../../../components/data/LoadingSpinner.jsx";
import HoverActionButton from "../../../components/data/HoverActionButton.jsx";
import DetailInfoModalContent from "../../../components/data/DetailInfoModalContent.jsx";
import ActionConfirmDialog from "../../../components/feedback/ActionConfirmDialog.jsx";

const PAGE_SIZE = 10;

const FORM_DEFAULTS = {
  nombre: "",
  descripcion: "",
  sucursales: [],
};

const FILTER_DEFAULTS = {
  estado: "all",
  idSucursal: "all",
};

function extractMessage(error) {
  if (error?.data?.error?.code === "CORTESIA_NAME_DUPLICATE") {
    return "Ya existe una cortesía con ese nombre. Usa la cortesía existente o cambia el nombre.";
  }
  return error?.data?.error?.message || error?.message || "Error desconocido.";
}

function normalizeFormText(value) {
  return String(value ?? "").trim();
}

function StatusBadge({ active }) {
  return <span className={`mf-badge ${active ? "mf-badge-green" : "mf-badge-red"}`}>{active ? "Activo" : "Inactivo"}</span>;
}

function CompactActionButton({
  icon,
  label,
  title,
  tone = "default",
  onClick,
  disabled = false,
}) {
  return (
    <HoverActionButton
      icon={icon}
      label={label}
      title={title}
      tone={tone}
      onClick={onClick}
      disabled={disabled}
      className="h-10 w-10 rounded-lg px-0 hover:w-10 hover:px-0 hover:gap-0 focus-visible:w-10 focus-visible:px-0 focus-visible:gap-0 sm:h-8 sm:w-8 sm:hover:w-8 sm:focus-visible:w-8"
    />
  );
}

function SucursalSelector({ allBranches, selected, onChange, loading, allowAll }) {
  const available = allBranches;
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
      <Label htmlFor="cortesias-branch" className="text-xs uppercase tracking-widest text-[var(--mf-text-2)] sm:shrink-0">Sucursal</Label>
      <select
        id="cortesias-branch"
        className="mf-select h-10 w-full sm:h-9 sm:min-w-[220px] sm:w-auto"
        value={selected}
        onChange={(event) => {
          const next = String(event.target.value || "").trim();
          onChange(available.some((branch) => branch.id_sucursal === next) ? next : "");
        }}
      >
        <option value="">{allowAll ? "Todas las sucursales" : "Selecciona una sucursal"}</option>
        {available.map((branch) => (
          <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>
        ))}
      </select>
    </div>
  );
}

function CortesiaForm({ values, onChange, branches, lockBranchSelection }) {
  const scopedBranches = branches;

  const selectedById = useMemo(() => new Map(values.sucursales.map((item) => [item.id_sucursal, item])), [values.sucursales]);

  function toggleBranch(branchId, checked) {
    if (!checked) {
      onChange("sucursales", values.sucursales.filter((item) => item.id_sucursal !== branchId));
      return;
    }

    onChange("sucursales", [...values.sucursales, { id_sucursal: branchId, activa: true }]);
  }

  function toggleState(branchId, active) {
    onChange(
      "sucursales",
      values.sucursales.map((item) => (item.id_sucursal === branchId ? { ...item, activa: active } : item))
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-[var(--mf-nav-border)] p-3 sm:p-4" aria-labelledby="cortesia-global-fields">
        <div>
          <h3 id="cortesia-global-fields" className="text-sm font-semibold text-[var(--mf-text)]">Información compartida</h3>
          <p className="text-xs text-[var(--mf-text-2)]">Estos datos se muestran en todas las sucursales asociadas.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="cortesia-nombre">Nombre *</Label>
            <Input id="cortesia-nombre" value={values.nombre} onChange={(event) => onChange("nombre", event.target.value)} placeholder="Ej. Corte de bienvenida" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="cortesia-descripcion">Descripción</Label>
            <Input id="cortesia-descripcion" value={values.descripcion} onChange={(event) => onChange("descripcion", event.target.value)} placeholder="Describe la cortesía maestra" />
          </div>
        </div>
      </section>

      <section className="space-y-2 rounded-xl border border-[var(--mf-nav-border)] p-3 sm:p-4" aria-labelledby="cortesia-branches-fields">
        <div>
          <h3 id="cortesia-branches-fields" className="text-sm font-semibold text-[var(--mf-text)]">Asociaciones por sucursal</h3>
          <p className="text-xs text-[var(--mf-text-2)]">Selecciona las sucursales disponibles y define su estado operativo.</p>
        </div>
        <div className="space-y-2 rounded-xl bg-[var(--mf-btn-bg)] p-2 sm:p-3">
          {scopedBranches.map((branch) => {
            const selected = selectedById.get(branch.id_sucursal);
            return (
              <div key={branch.id_sucursal} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--mf-nav-border)] px-3 py-2">
                <label className="flex items-center gap-2 text-sm text-[var(--mf-text)]">
                  <input
                    type="checkbox"
                    checked={Boolean(selected)}
                    disabled={lockBranchSelection}
                    onChange={(event) => toggleBranch(branch.id_sucursal, event.target.checked)}
                  />
                  <span>{branch.nombre_sucursal}</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--mf-text-2)]">Activa</span>
                  <input
                    type="checkbox"
                    checked={Boolean(selected?.activa)}
                    disabled={!selected}
                    onChange={(event) => toggleState(branch.id_sucursal, event.target.checked)}
                    className="h-4 w-4 accent-[var(--mf-accent)]"
                  />
                </div>
              </div>
            );
          })}

          {scopedBranches.length === 0 ? (
            <p className="text-xs text-[var(--mf-text-2)]">No hay sucursales disponibles para asociar.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function validateForm(values, { requireBranch = true } = {}) {
  const nombre = normalizeFormText(values.nombre);
  if (!nombre) return "El nombre es obligatorio.";
  if (nombre.length > 140) return "El nombre no puede exceder 140 caracteres.";

  const descripcion = normalizeFormText(values.descripcion);
  if (descripcion.length > 500) return "La descripción no puede exceder 500 caracteres.";

  if (requireBranch && (!Array.isArray(values.sucursales) || values.sucursales.length === 0)) {
    return "Debes seleccionar al menos una sucursal.";
  }

  const unique = new Set(values.sucursales.map((item) => item.id_sucursal));
  if (unique.size !== values.sucursales.length) {
    return "No se permiten sucursales duplicadas.";
  }

  return null;
}

export default function AdminCortesiasCatalogPage() {
  const { branchIds, roles = [], user } = useAuth();
  const notifications = useNotifications();
  const isSuperAdmin = roles.includes("super_admin");

  const [allBranches, setAllBranches] = useState([]);
  const [branchesContext, setBranchesContext] = useState('');
  const permissionsKey = JSON.stringify([user?.id_usuario ?? null, roles, [...branchIds].sort()]);
  const branchesGenerationRef = useRef(0);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchLoadError, setBranchLoadError] = useState("");
  const [sucursal, setSucursal] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ ...FILTER_DEFAULTS });

  const [cortesias, setCortesias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [view, setView] = useState("list");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [globalEditConfirmOpen, setGlobalEditConfirmOpen] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stateTarget, setStateTarget] = useState(null);
  const [stateLoading, setStateLoading] = useState(false);

  const availableBranches = useMemo(() => {
    const scoped = branchesContext === permissionsKey && (isSuperAdmin || roles.includes('admin')) ? allBranches : [];
    return scoped.filter((branch) => branch?.id_sucursal);
  }, [allBranches, branchesContext, permissionsKey, isSuperAdmin, roles]);

  const branchNameById = useMemo(
    () => allBranches.reduce((acc, branch) => ({ ...acc, [branch.id_sucursal]: branch.nombre_sucursal }), {}),
    [allBranches]
  );

  const cortesiasById = useMemo(
    () => new Map((Array.isArray(cortesias) ? cortesias : []).map((item) => [item.id, item])),
    [cortesias]
  );

  const visibleCortesias = useMemo(() => {
    return (Array.isArray(cortesias) ? cortesias : []).filter((item) => {
      const sucursales = Array.isArray(item.sucursales) ? item.sucursales : [];
      if (filters.estado !== "all") {
        const expected = filters.estado === "activo";
        const hasMatchingState = sucursales.some((scope) => Boolean(scope.activa) === expected);
        if (!hasMatchingState) return false;
      }

      if (!sucursal && filters.idSucursal !== "all" && !sucursales.some((scope) => scope.id_sucursal === filters.idSucursal)) {
        return false;
      }

      return true;
    });
  }, [cortesias, filters, sucursal]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((value) => value !== "all").length + (search ? 1 : 0),
    [filters, search]
  );

  const pageCount = Math.max(1, Math.ceil(visibleCortesias.length / PAGE_SIZE));
  const paginatedCortesias = useMemo(
    () => visibleCortesias.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page, visibleCortesias]
  );

  const actionsLockedByBranch = branchesContext !== permissionsKey || availableBranches.length === 0
    || (!isSuperAdmin && (!roles.includes("admin") || !sucursal
      || !availableBranches.some((branch) => branch.id_sucursal === sucursal)));
  const isGlobalView = isSuperAdmin && !sucursal;
  const scopeContext = JSON.stringify([permissionsKey, sucursal, actionsLockedByBranch]);
  const requestContext = JSON.stringify([scopeContext, searchInput.trim()]);
  const scopeRef = useRef(scopeContext);
  const contextRef = useRef(requestContext);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);

  // AM: Invalida antes del debounce datos de otro alcance o busqueda.
  useLayoutEffect(() => {
    mountedRef.current = true;
    contextRef.current = requestContext;
    generationRef.current += 1;
    setCortesias([]);
    setListError("");
    setLoading(false);
    if (scopeRef.current !== scopeContext) {
      scopeRef.current = scopeContext;
      setDialogOpen(false);
      setEditTarget(null);
      setGlobalEditConfirmOpen(false);
      setDetailOpen(false);
      setDetailTarget(null);
      setConfirmOpen(false);
      setStateTarget(null);
    }
    return () => { mountedRef.current = false; generationRef.current += 1; };
  }, [requestContext, scopeContext]);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const fetchBranches = useCallback(async () => {
    const generation = ++branchesGenerationRef.current;
    const isCurrent = () => mountedRef.current && branchesGenerationRef.current === generation;
    setAllBranches([]);
    setBranchesContext('');
    setLoadingBranches(true);
    setBranchLoadError("");

    try {
      const response = await listAdminSucursales({ soloActivas: true });
      if (!isCurrent()) return;
      const payload = response?.data ?? response;
      const next = Array.isArray(payload?.sucursales)
        ? payload.sucursales.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
        : [];
      setAllBranches(next);
      setBranchesContext(permissionsKey);
    } catch (error) {
      if (!isCurrent()) return;
      setAllBranches([]);
      setBranchLoadError(extractMessage(error));
    } finally {
      if (isCurrent()) setLoadingBranches(false);
    }
  }, [permissionsKey]);

  const fetchCortesias = useCallback(async () => {
    if (!mountedRef.current || contextRef.current !== requestContext
      || actionsLockedByBranch || search !== searchInput.trim()) return;
    const generation = ++generationRef.current;
    const isCurrent = () => mountedRef.current && contextRef.current === requestContext
      && generationRef.current === generation;

    setLoading(true);
    setListError("");

    try {
      const response = await listAdminCortesias({
        id_sucursal: sucursal || undefined,
        buscar: search || undefined,
      });
      if (!isCurrent()) return;
      const payload = response?.data ?? response;
      const next = Array.isArray(payload?.cortesias) ? payload.cortesias : [];
      setCortesias(next);
    } catch (error) {
      if (!isCurrent()) return;
      setListError(extractMessage(error));
      setCortesias([]);
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [actionsLockedByBranch, search, searchInput, sucursal, requestContext]);

  useEffect(() => {
    void fetchBranches();
    return () => { branchesGenerationRef.current += 1; };
  }, [fetchBranches]);

  useEffect(() => {
    void fetchCortesias();
  }, [fetchCortesias]);

  useLayoutEffect(() => {
    // AM: Autoseleccion y revocacion dependen de la respuesta administrativa vigente.
    if (sucursal && availableBranches.some((branch) => branch.id_sucursal === sucursal)) return;
    setSucursal(availableBranches.length === 1 ? availableBranches[0].id_sucursal : '');
  }, [sucursal, availableBranches]);

  useEffect(() => {
    setPage(1);
  }, [filters, search, sucursal]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  function clearFilters() {
    setFilters({ ...FILTER_DEFAULTS });
    setSearchInput("");
  }

  function handleFormChange(field, value) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  function openNuevo() {
    if (actionsLockedByBranch) return;
    const defaults = sucursal
      ? [{ id_sucursal: sucursal, activa: true }]
      : availableBranches.length === 1
      ? [{ id_sucursal: availableBranches[0].id_sucursal, activa: true }]
      : [];
    setEditTarget(null);
    setFormValues({ ...FORM_DEFAULTS, sucursales: defaults });
    setFormError("");
    setDialogOpen(true);
  }

  function openEditar(row) {
    if (actionsLockedByBranch) return;
    const cortesia = cortesiasById.get(row.id);
    if (!cortesia) return;

    const scoped = Array.isArray(cortesia.sucursales)
      ? cortesia.sucursales.map((item) => ({ id_sucursal: item.id_sucursal, activa: Boolean(item.activa) }))
      : [];

    setEditTarget(cortesia);
    setFormValues({
      nombre: cortesia.nombre || "",
      descripcion: cortesia.descripcion || "",
      sucursales: scoped,
    });
    setFormError("");
    setDialogOpen(true);
  }

  function openDetail(row) {
    const cortesia = cortesiasById.get(row.id) || row;
    setDetailTarget(cortesia);
    setDetailOpen(true);
  }

  function openConfirmState(row) {
    setStateTarget({ ...row, _nextActiva: !row.activa });
    setConfirmOpen(true);
  }

  function buildEditBranchChanges() {
    const initial = new Map((editTarget?.sucursales || []).map((item) => [item.id_sucursal, Boolean(item.activa)]));
    const current = new Map(formValues.sucursales.map((item) => [item.id_sucursal, Boolean(item.activa)]));
    const branchIdsToCompare = new Set([...initial.keys(), ...current.keys()]);

    return [...branchIdsToCompare]
      .filter((branchId) => initial.get(branchId) !== current.get(branchId))
      .map((branchId) => ({ id_sucursal: branchId, activa: current.get(branchId) ?? false }));
  }

  function hasGlobalFieldChanges() {
    if (!editTarget) return false;
    return normalizeFormText(formValues.nombre) !== normalizeFormText(editTarget.nombre)
      || normalizeFormText(formValues.descripcion) !== normalizeFormText(editTarget.descripcion);
  }

  async function saveForm() {
    if (actionsLockedByBranch) return;
    const validationError = validateForm(formValues, { requireBranch: !editTarget });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const normalizedNombre = normalizeFormText(formValues.nombre);
    const normalizedDescripcion = normalizeFormText(formValues.descripcion);
    const payload = {};

    if (editTarget) {
      if (normalizedNombre !== normalizeFormText(editTarget.nombre)) payload.nombre = normalizedNombre;
      if (normalizedDescripcion !== normalizeFormText(editTarget.descripcion)) {
        payload.descripcion = normalizedDescripcion || null;
      }
      const branchChanges = buildEditBranchChanges();
      if (branchChanges.length > 0) payload.sucursales = branchChanges;
      if (Object.keys(payload).length === 0) {
        setDialogOpen(false);
        return;
      }
    } else {
      payload.nombre = normalizedNombre;
      payload.descripcion = normalizedDescripcion || null;
      payload.sucursales = formValues.sucursales.map((item) => ({
        id_sucursal: item.id_sucursal,
        activa: Boolean(item.activa),
      }));
    }

    setFormLoading(true);
    setFormError("");

    try {
      if (editTarget) {
        await updateAdminCortesia(editTarget.id, payload);
        notifications.success("Cortesía actualizada");
      } else {
        await createAdminCortesia(payload);
        notifications.success("Cortesía creada");
      }

      setDialogOpen(false);
      emitCatalogSync("admin-cortesias");
      await fetchCortesias();
    } catch (error) {
      setFormError(extractMessage(error));
    } finally {
      setFormLoading(false);
    }
  }

  function handleGuardar() {
    const validationError = validateForm(formValues, { requireBranch: !editTarget });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (hasGlobalFieldChanges()) {
      setGlobalEditConfirmOpen(true);
      return;
    }
    void saveForm();
  }

  function handleConfirmGlobalEdit() {
    setGlobalEditConfirmOpen(false);
    void saveForm();
  }

  async function handleConfirmState() {
    if (!stateTarget || actionsLockedByBranch) return;

    setStateLoading(true);
    try {
      await setAdminCortesiaEstado(stateTarget.id, {
        id_sucursal: stateTarget.id_sucursal,
        activa: stateTarget._nextActiva,
      });

      notifications.success(stateTarget._nextActiva ? "Cortesía activada" : "Cortesía inactivada");
      setConfirmOpen(false);
      setStateTarget(null);
      emitCatalogSync("admin-cortesias");
      await fetchCortesias();
    } catch (error) {
      notifications.error(extractMessage(error));
    } finally {
      setStateLoading(false);
    }
  }

  function renderScopeActions(cortesia, scope) {
    return (
      <div className="flex items-center gap-1.5">
        <CompactActionButton
          icon={scope.activa ? <ToggleLeft size={16} strokeWidth={2} /> : <ToggleRight size={16} strokeWidth={2} />}
          label={scope.activa ? "Inactivar" : "Activar"}
          title={scope.activa ? "Inactivar en esta sucursal" : "Activar en esta sucursal"}
          tone={scope.activa ? "warning" : "success"}
          disabled={actionsLockedByBranch}
          onClick={() => openConfirmState({
            id: cortesia.id,
            nombre: cortesia.nombre,
            id_sucursal: scope.id_sucursal,
            nombre_sucursal: scope.nombre_sucursal,
            activa: Boolean(scope.activa),
          })}
        />
      </div>
    );
  }

  function renderMainActions(cortesia) {
    return (
      <div className="flex items-center gap-1.5">
        <CompactActionButton icon={<Eye size={16} strokeWidth={2} />} label="Detalle" title="Ver detalle de cortesía maestra" onClick={() => openDetail(cortesia)} />
        <CompactActionButton icon={<Pencil size={16} strokeWidth={2} />} label="Editar" title="Editar cortesía maestra" disabled={actionsLockedByBranch} onClick={() => openEditar(cortesia)} />
      </div>
    );
  }

  return (
    <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
      <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Servicios - Cortesías</p>
              <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Cortesías</h1>
              <p className="text-sm text-[var(--mf-text-2)]">Gestiona cortesías maestras y su disponibilidad por sucursal.</p>
            </div>
            <SucursalSelector
              allBranches={availableBranches}
              selected={sucursal}
              onChange={setSucursal}
              loading={loadingBranches}
              allowAll={isSuperAdmin}
            />
            {branchLoadError ? <ErrorBanner message={branchLoadError} /> : null}
          </div>

          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--mf-text-2)]">{visibleCortesias.length} de {cortesias.length} cortesía(s)</p>
              <div className="inline-flex items-center rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-1" role="group" aria-label="Vista del catálogo">
                <button
                  type="button"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors sm:min-h-9 ${view === "list" ? "bg-[var(--mf-accent)] text-[var(--mf-accent-text)]" : "text-[var(--mf-text-2)] hover:text-[var(--mf-text)]"}`}
                >
                  <List size={14} /> Lista
                </button>
                <button
                  type="button"
                  aria-pressed={view === "cards"}
                  onClick={() => setView("cards")}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors sm:min-h-9 ${view === "cards" ? "bg-[var(--mf-accent)] text-[var(--mf-accent-text)]" : "text-[var(--mf-text-2)] hover:text-[var(--mf-text)]"}`}
                >
                  <LayoutGrid size={14} /> Tarjetas
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="relative w-full sm:max-w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" size={15} />
                <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar por nombre o descripción" className="pl-9" />
              </div>

              <Button variant="outline" className="gap-2" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={15} /> Filtros
                {activeFilterCount > 0 ? <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-xs text-[var(--mf-accent-text)]">{activeFilterCount}</span> : null}
              </Button>

              <Button className="gap-2" onClick={openNuevo} disabled={actionsLockedByBranch}>
                <Plus size={15} /> Nueva maestra
              </Button>
            </div>
          </div>
        </div>
      </header>

      {actionsLockedByBranch ? <EmptyState icon={Building2} title="Selecciona una sucursal autorizada" description="Selecciona una sucursal de tu alcance para consultar y gestionar cortesías." /> : null}
      {listError ? <ErrorBanner message={listError} onRetry={fetchCortesias} /> : null}
      {loading ? <LoadingSpinner label="Cargando cortesías..." /> : null}

      {!actionsLockedByBranch && !loading && !listError && cortesias.length === 0 ? (
        <EmptyState icon={Gift} title="Sin cortesías" description="No hay cortesías maestras registradas para el alcance actual." actionLabel="Crear cortesía maestra" onAction={openNuevo} />
      ) : null}

      {!actionsLockedByBranch && !loading && !listError && cortesias.length > 0 && visibleCortesias.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" description="No hay coincidencias con la búsqueda o filtros." />
      ) : null}

      {!actionsLockedByBranch && !loading && !listError && paginatedCortesias.length > 0 && view === "list" ? (
        <section aria-label="Lista de cortesías" className="@container overflow-visible rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)]">
          <div role="row" className="hidden grid-cols-[minmax(180px,1fr)_minmax(220px,1.35fr)_minmax(210px,1fr)_auto] gap-4 border-b border-[var(--mf-nav-border)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)] @[58rem]:grid">
            <span>Nombre</span><span>Descripción</span><span>{isGlobalView ? "Cobertura" : "Estado en sucursal"}</span><span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-[var(--mf-nav-border)]">
            {paginatedCortesias.map((item) => {
              const scopes = Array.isArray(item.sucursales) ? item.sucursales : [];
              const activeCount = scopes.filter((scope) => Boolean(scope.activa)).length;
              return (
                <article key={item.id} role="row" className="grid min-w-0 gap-3 px-3 py-3 transition-colors hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_40%,transparent)] sm:px-4 @[58rem]:grid-cols-[minmax(180px,1fr)_minmax(220px,1.35fr)_minmax(210px,1fr)_auto] @[58rem]:items-center @[58rem]:gap-4">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-[var(--mf-text)]">{item.nombre || "Cortesía"}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--mf-text-2)] @[58rem]:hidden">Cortesía maestra</p>
                  </div>
                  <p className="min-w-0 break-words text-sm leading-5 text-[var(--mf-text-2)] line-clamp-2">{item.descripcion || "Sin descripción"}</p>
                  <div className="min-w-0">
                    {isGlobalView ? (
                      <details className="group">
                        <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--mf-accent)]/40">
                          <span className="mf-badge mf-badge-muted">{scopes.length} asociada(s)</span>
                          <span className="text-xs text-[var(--mf-text-2)]">{activeCount} activa(s)</span>
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          {scopes.map((scope) => (
                            <div key={scope.id || scope.id_sucursal} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2 py-1.5">
                              <span className="min-w-0 truncate text-xs text-[var(--mf-text)]">{scope.nombre_sucursal || branchNameById[scope.id_sucursal] || scope.id_sucursal}</span>
                              <div className="flex shrink-0 items-center gap-1.5"><StatusBadge active={Boolean(scope.activa)} />{renderScopeActions(item, scope)}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : scopes[0] ? (
                      <div className="flex items-center justify-between gap-2">
                        <StatusBadge active={Boolean(scopes[0].activa)} />
                        {renderScopeActions(item, scopes[0])}
                      </div>
                    ) : <span className="text-xs text-[var(--mf-text-2)]">No asociada</span>}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">{renderMainActions(item)}</div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {!actionsLockedByBranch && !loading && !listError && paginatedCortesias.length > 0 && view === "cards" ? (
        <section aria-label="Tarjetas de cortesías" className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
          {paginatedCortesias.map((item) => {
            const scopes = Array.isArray(item.sucursales) ? item.sucursales : [];
            const activeCount = scopes.filter((scope) => Boolean(scope.activa)).length;
            return (
              <article key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4">
                <header className="flex min-w-0 items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]"><Gift size={15} /></div>
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-base font-semibold leading-5 text-[var(--mf-text)]">{item.nombre || "Cortesía"}</h2>
                    <p className="mt-1 break-words text-sm leading-5 text-[var(--mf-text-2)] line-clamp-2">{item.descripcion || "Sin descripción"}</p>
                  </div>
                </header>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--mf-nav-border)] pt-3">
                  {isGlobalView ? <><span className="mf-badge mf-badge-muted">{scopes.length} asociada(s)</span><span className="text-xs text-[var(--mf-text-2)]">{activeCount} activa(s)</span></> : scopes[0] ? <StatusBadge active={Boolean(scopes[0].activa)} /> : <span className="text-xs text-[var(--mf-text-2)]">No asociada</span>}
                </div>
                {isGlobalView && scopes.length > 0 ? (
                  <details className="mt-2">
                    <summary className="min-h-9 cursor-pointer list-none rounded-lg py-2 text-xs font-medium text-[var(--mf-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--mf-accent)]/40">Ver estados por sucursal</summary>
                    <div className="space-y-1.5">
                      {scopes.map((scope) => <div key={scope.id || scope.id_sucursal} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--mf-nav-border)] px-2 py-1.5"><span className="min-w-0 truncate text-xs">{scope.nombre_sucursal || branchNameById[scope.id_sucursal] || scope.id_sucursal}</span><div className="flex shrink-0 items-center gap-1.5"><StatusBadge active={Boolean(scope.activa)} />{renderScopeActions(item, scope)}</div></div>)}
                    </div>
                  </details>
                ) : null}
                <footer className="mt-auto flex items-center justify-between gap-2 pt-3">
                  {!isGlobalView && scopes[0] ? renderScopeActions(item, scopes[0]) : <span />}
                  <div className="flex items-center gap-1.5">{renderMainActions(item)}</div>
                </footer>
              </article>
            );
          })}
        </section>
      ) : null}

      {!actionsLockedByBranch && !loading && !listError && visibleCortesias.length > PAGE_SIZE ? (
        <nav aria-label="Paginación de cortesías" className="flex flex-col items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] px-3 py-2 sm:flex-row">
          <p className="text-xs text-[var(--mf-text-2)]">Página {page} de {pageCount} · {visibleCortesias.length} resultados</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="min-h-9 gap-1" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={14} /> Anterior</Button>
            <Button variant="outline" size="sm" className="min-h-9 gap-1" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Siguiente <ChevronRight size={14} /></Button>
          </div>
        </nav>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!formLoading) setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar cortesía maestra" : "Nueva cortesía maestra"}</DialogTitle>
            <DialogDescription className="sr-only">Configura nombre, descripción y sucursales asociadas de la cortesía maestra.</DialogDescription>
          </DialogHeader>

          <CortesiaForm
            values={formValues}
            onChange={handleFormChange}
            branches={availableBranches}
            lockBranchSelection={availableBranches.length === 1}
          />

          {formError ? <ErrorBanner message={formError} /> : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>Cancelar</Button>
            <Button onClick={handleGuardar} disabled={formLoading} className="gap-2 min-w-[120px]">
              {formLoading ? <Loader2 size={15} className="animate-spin" /> : null}
              {editTarget ? "Guardar cambios" : "Crear cortesía maestra"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Detalle de cortesía</DialogTitle>
            <DialogDescription className="sr-only">Consulta datos maestros y estado por sucursal de la cortesía seleccionada.</DialogDescription>
          </DialogHeader>

          {detailTarget ? (
            <DetailInfoModalContent
              summary={{
                icon: <Gift size={16} />,
                title: detailTarget.nombre || "-",
                subtitle: detailTarget.descripcion || "Sin descripción",
                badge: <span className="mf-badge mf-badge-muted">{(detailTarget.sucursales || []).length} sucursal(es) asociada(s)</span>,
              }}
              sections={[
                {
                  id: "general",
                  title: "Información maestra",
                  icon: <Gift size={14} />,
                  fields: [
                    { label: "Nombre", value: detailTarget.nombre || "-" },
                    { label: "Descripción", value: detailTarget.descripcion || "Sin descripción" },
                  ],
                },
                {
                  id: "sucursales",
                  title: "Sucursales asociadas",
                  icon: <Building2 size={14} />,
                  fields: [
                    {
                      label: "Detalle",
                      span: "full",
                      value: (
                        <div className="flex flex-col gap-2">
                          {(Array.isArray(detailTarget.sucursales) ? detailTarget.sucursales : []).map((scope) => (
                            <div key={scope.id} className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] px-3 py-2 text-sm">
                              <span className="text-[var(--mf-text)]">{scope.nombre_sucursal || branchNameById[scope.id_sucursal] || scope.id_sucursal}</span>
                              <StatusBadge active={Boolean(scope.activa)} />
                            </div>
                          ))}
                        </div>
                      ),
                    },
                  ],
                },
              ]}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Filtros de cortesías</DialogTitle>
            <DialogDescription className="sr-only">Filtra cortesías maestras por estado operativo y sucursal.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev, estado: prev.estado === "activo" ? "all" : "activo" }))}>Solo activas</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setFilters((prev) => ({ ...prev, estado: prev.estado === "inactivo" ? "all" : "inactivo" }))}>Solo inactivas</Button>
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

            {isSuperAdmin && !sucursal ? (
              <div>
                <Label className="mf-label">Sucursal</Label>
                <select className="mf-select mt-1" value={filters.idSucursal} onChange={(event) => setFilters((prev) => ({ ...prev, idSucursal: event.target.value }))}>
                  <option value="all">Todas</option>
                  {availableBranches.map((branch) => (
                    <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="sm:col-span-2 text-xs text-[var(--mf-text-2)]">{sucursal ? "La vista operativa ya está fijada por la sucursal superior." : "Selecciona una sucursal autorizada en el selector superior."}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={clearFilters} className="gap-1"><RotateCcw size={13} /> Limpiar filtros</Button>
            <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ActionConfirmDialog
        open={globalEditConfirmOpen}
        onOpenChange={(open) => { if (!formLoading) setGlobalEditConfirmOpen(open); }}
        tone="warning"
        title="Modificar información global"
        description="Estás modificando el nombre o la descripción de una cortesía compartida. Este cambio se reflejará en todas las sucursales donde esté asociada. ¿Deseas continuar?"
        confirmLabel="Confirmar cambios"
        cancelLabel="Cancelar"
        loading={formLoading}
        onConfirm={handleConfirmGlobalEdit}
      />

      <ActionConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!open && !stateLoading) {
            setConfirmOpen(false);
            setStateTarget(null);
          }
        }}
        tone={stateTarget?._nextActiva ? "warning" : "danger"}
        title={stateTarget?._nextActiva ? "Activar cortesía en sucursal" : "Inactivar cortesía en sucursal"}
        description={stateTarget ? `Se ${stateTarget._nextActiva ? "activará" : "inactivará"} ${stateTarget.nombre} en ${stateTarget.nombre_sucursal || "la sucursal seleccionada"}.` : ""}
        confirmLabel={stateTarget?._nextActiva ? "Activar" : "Inactivar"}
        cancelLabel="Cancelar"
        loading={stateLoading}
        onConfirm={handleConfirmState}
      />
    </div>
  );
}

