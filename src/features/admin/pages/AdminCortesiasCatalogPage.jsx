import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../../components/ui/table.jsx";
import ErrorBanner from "../../../components/data/ErrorBanner.jsx";
import EmptyState from "../../../components/data/EmptyState.jsx";
import LoadingSpinner from "../../../components/data/LoadingSpinner.jsx";
import HoverActionButton from "../../../components/data/HoverActionButton.jsx";
import DetailInfoModalContent from "../../../components/data/DetailInfoModalContent.jsx";
import ViewToggle from "../../../components/data/ViewToggle.jsx";
import CardsCarousel from "../../../components/data/CardsCarousel.jsx";
import ActionConfirmDialog from "../../../components/feedback/ActionConfirmDialog.jsx";

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
      className="h-8 w-8 rounded-lg px-0 hover:w-8 hover:px-0 hover:gap-0 focus-visible:w-8 focus-visible:px-0 focus-visible:gap-0"
    />
  );
}

function SucursalSelector({ branchIds, allBranches, selected, onChange, loading }) {
  const available = branchIds.length > 0
    ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal))
    : allBranches;
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
        onChange={(event) => onChange(String(event.target.value || "").trim())}
      >
        <option value="">Todas las sucursales</option>
        {available.map((branch) => (
          <option key={branch.id_sucursal} value={branch.id_sucursal}>{branch.nombre_sucursal}</option>
        ))}
      </select>
    </div>
  );
}

function CortesiaForm({ values, onChange, branches, branchIds, lockBranchSelection }) {
  const scopedBranches = branchIds.length > 0
    ? branches.filter((branch) => branchIds.includes(branch.id_sucursal))
    : branches;

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
      <div className="flex flex-col gap-1">
        <Label htmlFor="cortesia-nombre">Nombre *</Label>
        <Input
          id="cortesia-nombre"
          value={values.nombre}
          onChange={(event) => onChange("nombre", event.target.value)}
          placeholder="Ej. Corte de bienvenida"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="cortesia-descripcion">Descripción</Label>
        <Input
          id="cortesia-descripcion"
          value={values.descripcion}
          onChange={(event) => onChange("descripcion", event.target.value)}
          placeholder="Describe la cortesía maestra"
        />
      </div>

      <div className="space-y-2">
        <Label>Sucursales asociadas *</Label>
        <div className="space-y-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
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
      </div>
    </div>
  );
}

function validateForm(values) {
  const nombre = normalizeFormText(values.nombre);
  if (!nombre) return "El nombre es obligatorio.";
  if (nombre.length > 140) return "El nombre no puede exceder 140 caracteres.";

  const descripcion = normalizeFormText(values.descripcion);
  if (descripcion.length > 500) return "La descripción no puede exceder 500 caracteres.";

  if (!Array.isArray(values.sucursales) || values.sucursales.length === 0) {
    return "Debes seleccionar al menos una sucursal.";
  }

  const unique = new Set(values.sucursales.map((item) => item.id_sucursal));
  if (unique.size !== values.sucursales.length) {
    return "No se permiten sucursales duplicadas.";
  }

  return null;
}

export default function AdminCortesiasCatalogPage() {
  const { branchIds, roles = [] } = useAuth();
  const notifications = useNotifications();
  const isSuperAdmin = roles.includes("super_admin");

  const [allBranches, setAllBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchLoadError, setBranchLoadError] = useState("");
  const [sucursal, setSucursal] = useState(branchIds.length === 1 ? branchIds[0] : "");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ ...FILTER_DEFAULTS });

  const [cortesias, setCortesias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [view, setView] = useState("cards");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [formValues, setFormValues] = useState(FORM_DEFAULTS);
  const [formError, setFormError] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [stateTarget, setStateTarget] = useState(null);
  const [stateLoading, setStateLoading] = useState(false);

  const availableBranches = useMemo(() => {
    const scoped = branchIds.length > 0
      ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal))
      : allBranches;
    return scoped.filter((branch) => branch?.id_sucursal);
  }, [allBranches, branchIds]);

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

  const mustSelectBranchForList = !isSuperAdmin && branchIds.length !== 1;
  const actionsLockedByBranch = !sucursal && mustSelectBranchForList;
  const isGlobalView = !sucursal;

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const fetchBranches = useCallback(async () => {
    setLoadingBranches(true);
    setBranchLoadError("");

    try {
      const response = await listAdminSucursales({ soloActivas: true });
      const payload = response?.data ?? response;
      const next = Array.isArray(payload?.sucursales)
        ? payload.sucursales.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
        : [];
      setAllBranches(next);
    } catch (error) {
      setBranchLoadError(extractMessage(error));
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  const fetchCortesias = useCallback(async () => {
    if (actionsLockedByBranch) {
      setCortesias([]);
      setListError("Debes seleccionar una sucursal para consultar cortesías.");
      return;
    }

    setLoading(true);
    setListError("");

    try {
      const response = await listAdminCortesias({
        id_sucursal: sucursal || undefined,
        buscar: search || undefined,
      });
      const payload = response?.data ?? response;
      const next = Array.isArray(payload?.cortesias) ? payload.cortesias : [];
      setCortesias(next);
    } catch (error) {
      setListError(extractMessage(error));
      setCortesias([]);
    } finally {
      setLoading(false);
    }
  }, [actionsLockedByBranch, search, sucursal]);

  useEffect(() => {
    void fetchBranches();
  }, [fetchBranches]);

  useEffect(() => {
    void fetchCortesias();
  }, [fetchCortesias]);

  useEffect(() => {
    if (!sucursal && branchIds.length === 1) {
      setSucursal(branchIds[0]);
    }
  }, [branchIds, sucursal]);

  function clearFilters() {
    setFilters({ ...FILTER_DEFAULTS });
    setSearchInput("");
  }

  function handleFormChange(field, value) {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  }

  function openNuevo() {
    const defaults = sucursal
      ? [{ id_sucursal: sucursal, activa: true }]
      : branchIds.length === 1
      ? [{ id_sucursal: branchIds[0], activa: true }]
      : [];
    setEditTarget(null);
    setFormValues({ ...FORM_DEFAULTS, sucursales: defaults });
    setFormError("");
    setDialogOpen(true);
  }

  function openEditar(row) {
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

  async function handleGuardar() {
    const validationError = validateForm(formValues);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormLoading(true);
    setFormError("");

    try {
      const payload = {
        nombre: normalizeFormText(formValues.nombre),
        descripcion: normalizeFormText(formValues.descripcion) || null,
        sucursales: formValues.sucursales.map((item) => ({
          id_sucursal: item.id_sucursal,
          activa: Boolean(item.activa),
        })),
      };

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

  async function handleConfirmState() {
    if (!stateTarget) return;

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
              branchIds={branchIds}
              allBranches={allBranches}
              selected={sucursal}
              onChange={setSucursal}
              loading={loadingBranches}
            />
            {branchLoadError ? <ErrorBanner message={branchLoadError} /> : null}
          </div>

          <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[var(--mf-text-2)]">{visibleCortesias.length} de {cortesias.length} cortesía(s)</p>
              <ViewToggle defaultView={view} onViewChange={setView} storageKey="cortesias" />
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

      {listError ? <ErrorBanner message={listError} onRetry={fetchCortesias} /> : null}
      {loading ? <LoadingSpinner label="Cargando cortesías..." /> : null}

      {!loading && !listError && cortesias.length === 0 ? (
        <EmptyState icon={Gift} title="Sin cortesías" description="No hay cortesías maestras registradas para el alcance actual." actionLabel="Crear cortesía maestra" onAction={openNuevo} />
      ) : null}

      {!loading && !listError && cortesias.length > 0 && visibleCortesias.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" description="No hay coincidencias con la búsqueda o filtros." />
      ) : null}

      {!loading && !listError && visibleCortesias.length > 0 && view === "cards" ? (
        <CardsCarousel
          items={visibleCortesias}
          getItemKey={(item) => item.id}
          renderItem={(item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-[18px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-3 shadow-[var(--mf-shadow-soft)]"
            >
              <header className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
                    <Gift size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[22px] leading-none font-semibold text-[var(--mf-text)] truncate">{item.nombre || "Cortesía"}</p>
                    <p className="mt-1 text-sm text-[var(--mf-text-2)] line-clamp-1">{item.descripcion || "Sin descripción"}</p>
                  </div>
                </div>
                <span className="mf-badge mf-badge-muted shrink-0">
                  {isGlobalView ? `${(item.sucursales || []).length} sucursal(es)` : "Vista sucursal"}
                </span>
              </header>

              <div className="mt-3 space-y-2 border-t border-[var(--mf-nav-border)] pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-accent)]">
                  {isGlobalView ? "Sucursales asociadas" : "Estado en esta sucursal"}
                </p>
                {(Array.isArray(item.sucursales) ? item.sucursales : []).map((scope) => (
                  <div key={scope.id} className="rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_50%,transparent)] px-2.5 py-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm leading-snug text-[var(--mf-text)]">
                        {scope.nombre_sucursal || branchNameById[scope.id_sucursal] || scope.id_sucursal}
                      </p>
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <StatusBadge active={Boolean(scope.activa)} />
                        {renderScopeActions(item, scope)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <footer className="mt-3 flex items-center justify-end border-t border-[var(--mf-nav-border)] pt-2.5">
                {renderMainActions(item)}
              </footer>
            </article>
          )}
        />
      ) : null}

      {!loading && !listError && visibleCortesias.length > 0 && view === "table" ? (
        <div className="mf-table-wrap">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--mf-nav-border)]">
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Descripción</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">{isGlobalView ? "Sucursales asociadas" : "Estado en sucursal"}</TableHead>
                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleCortesias.map((item) => (
                <TableRow key={item.id} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">
                  <TableCell className="font-medium text-[var(--mf-text)]">{item.nombre}</TableCell>
                  <TableCell className="text-[var(--mf-text-2)]">{item.descripcion || "-"}</TableCell>
                  <TableCell className="space-y-2">
                    {(Array.isArray(item.sucursales) ? item.sucursales : []).map((scope) => (
                      <div key={scope.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--mf-nav-border)] px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--mf-text)]">{scope.nombre_sucursal || branchNameById[scope.id_sucursal] || scope.id_sucursal}</span>
                          <StatusBadge active={Boolean(scope.activa)} />
                        </div>
                        {renderScopeActions(item, scope)}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right"><div className="flex items-center justify-end gap-1.5">{renderMainActions(item)}</div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
            branchIds={branchIds}
            lockBranchSelection={branchIds.length === 1}
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

            {!sucursal ? (
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
              <p className="sm:col-span-2 text-xs text-[var(--mf-text-2)]">La vista operativa ya está fijada por la sucursal superior.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={clearFilters} className="gap-1"><RotateCcw size={13} /> Limpiar filtros</Button>
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

