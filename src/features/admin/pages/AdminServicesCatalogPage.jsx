// src/features/admin/pages/AdminServicesCatalogPage.jsx
// A3 - Pantalla CRUD de catalogo de servicios (Admin).
// AM: La API administrativa determina las sucursales disponibles y su seleccion.

import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Pencil, Building2, Scissors, ToggleLeft, ToggleRight, Search, SlidersHorizontal, RotateCcw, X, List, LayoutGrid, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
    listAdminServiciosAgrupados,
    createAdminServicio,
    updateAdminServicio,
    updateAdminServicioTarifa,
    createAdminServicioTarifa,
    setAdminServicioEstado,
    deactivateAdminServicioTarifa,
    deactivateAdminServicioGlobal,
    getAdminServicioBarberos,
    saveAdminServicioBarberos,
    SERVICE_BARBER_ASSIGNMENTS_ENABLED,
} from '../lib/adminCatalogApi.js';
import { listAdminSucursales } from '../lib/adminSucursalesApi.js';
import { Button } from '../../../components/ui/button.jsx';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { emitCatalogSync } from '../../../lib/catalogSync.js';

function extractMessage(err) {
    // AM: Mensaje funcional para duplicados normalizados de servicios.
    if (err?.data?.error?.code === 'SERVICE_NAME_DUPLICATE') {
        return 'Ya existe un servicio con ese nombre. Usa el servicio existente o cambia el nombre.';
    }
    if (err?.data?.error?.code === 'SERVICE_TARIFF_DUPLICATE') {
        return 'Ya existe una tarifa activa para este servicio en esa sucursal.';
    }
    if (err?.data?.error?.code === 'SERVICE_BRANCH_REMOVE_BLOCKED') {
        return 'No se puede quitar este servicio de la sucursal porque tiene citas futuras activas asociadas.';
    }
    if (err?.data?.error?.code === 'SERVICE_GLOBAL_DEACTIVATE_BLOCKED') {
        return 'No se puede desactivar globalmente este servicio porque tiene citas futuras activas asociadas.';
    }
    if (err?.data?.error?.code === 'CATALOG_SERVICE_PRICE_REQUIRED') {
        return 'Configura una tarifa para una sucursal antes de reactivar este servicio.';
    }
    const apiMessage = err?.data?.error?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage.trim();
    return 'No se pudo completar la operación de servicios.';
}

/**
 * allBranches = sucursales autorizadas devueltas por la API administrativa
 * selected   = UUID actualmente seleccionado
 * onChange   = cb(uuid)
 */
function SucursalSelector({ allBranches, selected, onChange, loadingBranches, allowAll }) {
    // AM: Replica el selector premium del submodulo Paquetes para consistencia visual total.
    const availableBranches = allBranches;
    const validBranchIds = new Set(availableBranches.map((branch) => branch.id_sucursal));
    const selectedBranch = availableBranches.find((branch) => branch.id_sucursal === selected);

    if (availableBranches.length === 1 && selectedBranch) {
        return (
            <div className="mf-glass-surface flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
                <Building2 size={13} />
                <span>Sucursal activa:</span>
                <span className="font-medium text-[var(--mf-text)]">{selectedBranch.nombre_sucursal}</span>
            </div>
        );
    }

    if (loadingBranches) {
        return (
            <p className="flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
                <Loader2 size={14} className="animate-spin" />
                Cargando sucursales...
            </p>
        );
    }

    return (
        <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-row sm:items-center sm:gap-2">
            <Label htmlFor="sel-sucursal" className="text-xs uppercase tracking-widest text-[var(--mf-text-2)] sm:shrink-0">
                Sucursal
            </Label>
            <select
                id="sel-sucursal"
                className="mf-select h-10 w-full sm:h-9 sm:min-w-[220px] sm:w-auto"
                value={selected}
                onChange={(e) => {
                    const nextValue = String(e.target.value || '').trim();
                    // AM: Previene enviar placeholders como id_sucursal en llamadas al backend.
                    onChange(validBranchIds.has(nextValue) ? nextValue : '');
                }}
            >
                <option value="">{allowAll ? 'Todas las sucursales' : 'Selecciona una sucursal'}</option>
                {availableBranches.map((branch) => (
                    <option key={branch.id_sucursal} value={branch.id_sucursal}>
                        {branch.nombre_sucursal}
                    </option>
                ))}
            </select>
        </div>
    );
}

const FORM_DEFAULTS = {
    nombre_servicio: '',
    descripcion: '',
    duracion_min: '',
    precio_hnl: '',
    visible_publico: true,
    agendable: true,
    servicio_informativo: false,
    orden_visual: '100',
};

const TARIFF_FORM_DEFAULTS = {
    precio_hnl: '',
    duracion_min: '',
    buffer_min: '5',
    activo: true,
    servicio_informativo: false,
};

const SERVICE_BARBER_ASSIGNMENTS_DEFAULTS = {
    loading: false,
    error: '',
    barberos: [],
    selectedIds: [],
};

const SERVICES_FILTER_DEFAULTS = {
    estado: 'all',
    visibilidad: 'all',
    agendable: 'all',
    idSucursal: 'all',
};

const SERVICE_STATE_FILTER_LABELS = {
    activo: 'Estado: Activo',
    inactivo: 'Estado: Inactivo',
};

const SERVICE_VISIBILITY_FILTER_LABELS = {
    visible: 'Publico: Visible',
    oculto: 'Publico: Oculto',
};

const SERVICE_AGENDABLE_FILTER_LABELS = {
    si: 'Agendable: Si',
    no: 'Agendable: No',
};

const SERVICES_PAGE_SIZE = 10;

function quickFilterButtonClass(isActive) {
    // AM: Estilo consistente con PERSONAS para que filtros activos sean evidentes en escritorio y móvil.
    return isActive
        ? 'rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
        : 'rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60';
}

function ServicioForm({ values, onChange, includeTariffFields = true }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <Label htmlFor="f-nombre">Nombre del servicio *</Label>
                <Input
                    id="f-nombre"
                    value={values.nombre_servicio}
                    onChange={(e) => onChange('nombre_servicio', e.target.value)}
                    placeholder="Ej. Corte clásico"
                />
            </div>
            <div className="flex flex-col gap-1">
                <Label htmlFor="f-descripcion">Descripción</Label>
                <Input
                    id="f-descripcion"
                    value={values.descripcion}
                    onChange={(e) => onChange('descripcion', e.target.value)}
                    placeholder="Ej. Incluye lavado, corte y peinado."
                />
            </div>
            {includeTariffFields ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="f-dur">Duración (min) *</Label>
                        <Input
                            id="f-dur"
                            type="number"
                            min="1"
                            value={values.duracion_min}
                            onChange={(e) => onChange('duracion_min', e.target.value)}
                            placeholder="30"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="f-precio">Precio HNL *</Label>
                        <Input
                            id="f-precio"
                            type="number"
                            min="0"
                            step="0.01"
                            value={values.precio_hnl}
                            onChange={(e) => onChange('precio_hnl', e.target.value)}
                            placeholder="250.00"
                        />
                    </div>
                </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                    <Label htmlFor="f-orden">Orden visual *</Label>
                    <Input
                        id="f-orden"
                        type="number"
                        min="0"
                        value={values.orden_visual}
                        onChange={(e) => onChange('orden_visual', e.target.value)}
                        placeholder="100"
                    />
                </div>
            </div>
            <label className="mf-checkbox flex items-start gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_48%,transparent)] px-3 py-2.5">
                <input
                    type="checkbox"
                    checked={Boolean(values.visible_publico)}
                    onChange={(event) => onChange('visible_publico', event.target.checked)}
                />
                <span className="space-y-0.5 text-xs text-[var(--mf-text-2)]">
                    <span className="block font-semibold uppercase tracking-[0.08em] text-[var(--mf-text)]">Visible en catálogo público</span>
                    <span className="block">Controla si el servicio se publica para consulta externa.</span>
                </span>
            </label>
            {!includeTariffFields ? (
                <label className="mf-checkbox flex items-start gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_48%,transparent)] px-3 py-2.5">
                    <input
                        type="checkbox"
                        checked={Boolean(values.agendable)}
                        onChange={(event) => onChange('agendable', event.target.checked)}
                    />
                    <span className="space-y-0.5 text-xs text-[var(--mf-text-2)]">
                        <span className="block font-semibold uppercase tracking-[0.08em] text-[var(--mf-text)]">Agendable</span>
                        <span className="block">Control maestro del servicio; el modo informativo se configura por tarifa/sucursal.</span>
                    </span>
                </label>
            ) : (
                <label className="mf-checkbox flex items-start gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_48%,transparent)] px-3 py-2.5">
                    <input
                        type="checkbox"
                        checked={Boolean(values.servicio_informativo)}
                        onChange={(event) => onChange('servicio_informativo', event.target.checked)}
                    />
                    <span className="space-y-0.5 text-xs text-[var(--mf-text-2)]">
                        <span className="block font-semibold uppercase tracking-[0.08em] text-[var(--mf-text)]">Servicio informativo</span>
                        <span className="block">Visible en catálogo público informativo y excluido de agendamiento.</span>
                    </span>
                </label>
            )}
        </div>
    );
}

function TarifaForm({ values, onChange, serviceName, branchName }) {
    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_42%,transparent)] px-3 py-2 text-sm text-[var(--mf-text-2)]">
                <p><span className="font-semibold text-[var(--mf-text)]">Servicio:</span> {serviceName || '-'}</p>
                <p><span className="font-semibold text-[var(--mf-text)]">Sucursal:</span> {branchName || '-'}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                    <Label htmlFor="tarifa-precio">Precio HNL *</Label>
                    <Input id="tarifa-precio" type="number" min="0" step="0.01" value={values.precio_hnl} onChange={(e) => onChange('precio_hnl', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <Label htmlFor="tarifa-duracion">Duración (min) *</Label>
                    <Input id="tarifa-duracion" type="number" min="1" value={values.duracion_min} onChange={(e) => onChange('duracion_min', e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                    <Label htmlFor="tarifa-buffer">Buffer (min)</Label>
                    <Input id="tarifa-buffer" type="number" min="0" value={values.buffer_min} onChange={(e) => onChange('buffer_min', e.target.value)} />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="mf-checkbox flex items-start gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_48%,transparent)] px-3 py-2.5">
                    <input type="checkbox" checked={Boolean(values.activo)} onChange={(event) => onChange('activo', event.target.checked)} />
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mf-text)]">Tarifa activa</span>
                </label>
                <label className="mf-checkbox flex items-start gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_48%,transparent)] px-3 py-2.5">
                    <input type="checkbox" checked={Boolean(values.servicio_informativo)} onChange={(event) => onChange('servicio_informativo', event.target.checked)} />
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--mf-text)]">Servicio informativo</span>
                </label>
            </div>
        </div>
    );
}

function validateForm(values, { includeTariffFields = true } = {}) {
    if (!values.nombre_servicio.trim()) return 'El nombre del servicio es requerido.';
    if (includeTariffFields) {
        const dur = parseInt(values.duracion_min, 10);
        if (isNaN(dur) || dur < 1) return 'La Duración debe ser al menos 1 minuto.';
        const precio = parseFloat(values.precio_hnl);
        if (isNaN(precio) || precio < 0) return 'El precio no puede ser negativo.';
    }
    const orden = parseInt(values.orden_visual, 10);
    if (isNaN(orden) || orden < 0) return 'El orden visual no puede ser negativo.';
    return null;
}

function validateTariffForm(values) {
    const precio = parseFloat(values.precio_hnl);
    if (isNaN(precio) || precio < 0) return 'El precio no puede ser negativo.';
    const dur = parseInt(values.duracion_min, 10);
    if (isNaN(dur) || dur < 1) return 'La duración debe ser al menos 1 minuto.';
    const buffer = parseInt(values.buffer_min, 10);
    if (isNaN(buffer) || buffer < 0) return 'El buffer no puede ser negativo.';
    return null;
}

function summarizeAssignedBarbers(barberos = [], maxVisible = 2) {
    const safeBarberos = Array.isArray(barberos) ? barberos.filter(Boolean) : [];
    if (safeBarberos.length === 0) return 'Sin barberos asignados';
    const names = safeBarberos
        .map((barbero) => String(barbero?.nombre_completo || '').trim())
        .filter(Boolean);
    if (names.length === 0) return 'Sin barberos asignados';
    if (names.length <= maxVisible) return names.join(', ');
    return `${names.slice(0, maxVisible).join(', ')} +${names.length - maxVisible}`;
}

function ServiceStatusBadge({ activo }) {
    return (
        <span className={`mf-badge ${activo ? 'mf-badge-green' : 'mf-badge-red'}`}>
            {activo ? 'Activo' : 'Inactivo'}
        </span>
    );
}

function ServiceVisibilityBadge({ visiblePublico }) {
    return (
        <span className={`mf-badge ${visiblePublico ? 'mf-badge-green' : 'mf-badge-muted'}`}>
            {visiblePublico ? 'Visible' : 'Oculto'}
        </span>
    );
}

function ServiceAgendableBadge({ agendable }) {
    return (
        <span className={`mf-badge ${agendable ? 'mf-badge-gold' : 'mf-badge-muted'}`}>
            {agendable ? 'Si' : 'No'}
        </span>
    );
}

function ServiceTypeBadge({ informativo }) {
    return (
        <span className={`mf-badge ${informativo ? 'mf-badge-green' : 'mf-badge-gold'}`}>
            {informativo ? 'Informativo' : 'Agendable'}
        </span>
    );
}

function BranchConfigField({ label, value }) {
    return (
        <div className="rounded-lg border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_72%,transparent)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--mf-text-2)]">{label}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{value ?? '-'}</p>
        </div>
    );
}

function buildServicioScopeKey(servicio) {
    const serviceId = String(servicio?.id_servicio ?? servicio?.id ?? '').trim() || 'servicio';
    return serviceId;
}

function formatServicePrice(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 'Sin tarifa';
    return `L ${numeric.toFixed(2)}`;
}

function getTarifaKey(tarifa) {
    return `${tarifa?.id_sucursal || 'sucursal'}:${tarifa?.id_tarifa || 'sin-tarifa'}`;
}

function getActiveTariffs(servicio) {
    return (Array.isArray(servicio?.tarifas) ? servicio.tarifas : []).filter((tarifa) => tarifa?.tarifa_activa);
}

function getBranchShortName(name) {
    const raw = String(name || '').trim();
    return raw.replace(/^MasterFade\s*/i, '').trim() || raw || 'Sucursal';
}

function getSelectedBranchTariff(servicio, branchId) {
    return (Array.isArray(servicio?.tarifas) ? servicio.tarifas : []).find((tarifa) => tarifa?.id_sucursal === branchId) || null;
}

function getFirstServiceTariff(servicio) {
    return (Array.isArray(servicio?.tarifas) ? servicio.tarifas : []).find((tarifa) => tarifa?.id_sucursal) || null;
}

function formatActiveBranchesCount(servicio) {
    const count = getActiveTariffs(servicio).length;
    if (count === 1) return 'Disponible en 1 sucursal';
    return `Disponible en ${count} sucursales`;
}

export default function AdminServicesCatalogPage() {
    const navigate = useNavigate();
    const { branchIds, roles, user } = useAuth();
    const isSuperAdmin = Array.isArray(roles) && roles.includes('super_admin');
    const canManageServiceBarberAssignments = isSuperAdmin && SERVICE_BARBER_ASSIGNMENTS_ENABLED;
    const notifications = useNotifications();

    // Sucursal activa según reglas
    const [sucursal, setSucursal] = useState('');
    const [allBranches, setAllBranches] = useState([]);
    const [branchesContext, setBranchesContext] = useState('');
    const permissionsKey = JSON.stringify([user?.id_usuario ?? null, roles ?? [], [...branchIds].sort()]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [branchLoadError, setBranchLoadError] = useState('');
    const [servicios, setServicios] = useState([]);
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState('');
    const requestGenerationRef = useRef(0);
    const mountedRef = useRef(false);
    const canQueryScope = branchesContext === permissionsKey && allBranches.length > 0
        && (isSuperAdmin || Boolean(roles?.includes('admin') && sucursal
            && allBranches.some((branch) => branch.id_sucursal === sucursal)));
    const requestScope = JSON.stringify([permissionsKey, sucursal, canQueryScope]);
    const currentScopeRef = useRef(requestScope);
    const [search, setSearch] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filters, setFilters] = useState(() => ({ ...SERVICES_FILTER_DEFAULTS }));
    const [viewMode, setViewMode] = useState('list');
    const [currentPage, setCurrentPage] = useState(1);

    // Dialogo crear/editar
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null); // null => crear
    const [formValues, setFormValues] = useState(FORM_DEFAULTS);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);
    const [serviceBarberAssignments, setServiceBarberAssignments] = useState(SERVICE_BARBER_ASSIGNMENTS_DEFAULTS);
    const [createBranchTariffs, setCreateBranchTariffs] = useState([]);
    const [useSameTariffForAll, setUseSameTariffForAll] = useState(true);
    const [commonCreateTariff, setCommonCreateTariff] = useState(TARIFF_FORM_DEFAULTS);
    const [tariffDialogOpen, setTariffDialogOpen] = useState(false);
    const [tariffTarget, setTariffTarget] = useState(null);
    const [tariffFormValues, setTariffFormValues] = useState(TARIFF_FORM_DEFAULTS);
    const [tariffFormError, setTariffFormError] = useState('');
    const [tariffFormLoading, setTariffFormLoading] = useState(false);

    // Dialogos de confirmacion operativa
    const [removeBranchTarget, setRemoveBranchTarget] = useState(null);
    const [removeBranchLoading, setRemoveBranchLoading] = useState(false);
    const [globalDeactivateTarget, setGlobalDeactivateTarget] = useState(null);
    const [globalDeactivateLoading, setGlobalDeactivateLoading] = useState(false);

    const branchNameById = useMemo(
        () => allBranches.reduce((acc, branch) => ({ ...acc, [branch.id_sucursal]: branch.nombre_sucursal }), {}),
        [allBranches]
    );

    const availableBranches = useMemo(() => {
        const scopedBranches = branchesContext === permissionsKey && (isSuperAdmin || roles?.includes('admin')) ? allBranches : [];
        return scopedBranches.filter((branch) => branch?.id_sucursal);
    }, [allBranches, branchesContext, permissionsKey, isSuperAdmin, roles]);

    // AM: Filtro compuesto de servicios para busqueda local sin recargar backend.
    const filteredServicios = useMemo(() => {
        const searchValue = search.trim().toLowerCase();

        return servicios.filter((servicio) => {
            if (searchValue) {
                const searchable = [
                    servicio?.nombre_servicio,
                    servicio?.descripcion,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                if (!searchable.includes(searchValue)) return false;
            }

            if (filters.estado !== 'all') {
                const expected = filters.estado === 'activo';
                if (Boolean(servicio?.activo) !== expected) return false;
            }

            if (filters.visibilidad !== 'all') {
                const expected = filters.visibilidad === 'visible';
                if (Boolean(servicio?.visible_publico) !== expected) return false;
            }

            if (filters.agendable !== 'all') {
                const expected = filters.agendable === 'si';
                if (Boolean(servicio?.agendable) !== expected) return false;
            }

            if (
                !sucursal &&
                filters.idSucursal !== 'all' &&
                !((Array.isArray(servicio?.tarifas) ? servicio.tarifas : []).some((tarifa) => tarifa?.id_sucursal === filters.idSucursal))
            ) {
                return false;
            }

            return true;
        });
    }, [filters, search, servicios, sucursal]);

    const activeFilterCount = useMemo(
        () => Object.values(filters).filter((value) => value !== 'all').length,
        [filters]
    );

    const totalPages = Math.max(1, Math.ceil(filteredServicios.length / SERVICES_PAGE_SIZE));
    const paginatedServicios = useMemo(() => {
        const start = (currentPage - 1) * SERVICES_PAGE_SIZE;
        return filteredServicios.slice(start, start + SERVICES_PAGE_SIZE);
    }, [currentPage, filteredServicios]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters, search, sucursal, viewMode]);

    useEffect(() => {
        setCurrentPage((page) => Math.min(page, totalPages));
    }, [totalPages]);

    const activeFilterChips = useMemo(() => {
        const chips = [];
        const trimmedSearch = search.trim();

        if (trimmedSearch) {
            chips.push({ key: 'search', label: `Busqueda: ${trimmedSearch}` });
        }
        if (filters.estado !== 'all') {
            chips.push({ key: 'estado', label: SERVICE_STATE_FILTER_LABELS[filters.estado] || 'Estado' });
        }
        if (filters.visibilidad !== 'all') {
            chips.push({ key: 'visibilidad', label: SERVICE_VISIBILITY_FILTER_LABELS[filters.visibilidad] || 'Visibilidad' });
        }
        if (filters.agendable !== 'all') {
            chips.push({ key: 'agendable', label: SERVICE_AGENDABLE_FILTER_LABELS[filters.agendable] || 'Agendable' });
        }
        if (!sucursal && filters.idSucursal !== 'all') {
            chips.push({ key: 'idSucursal', label: `Sucursal: ${branchNameById[filters.idSucursal] || 'Seleccionada'}` });
        }

        return chips;
    }, [branchNameById, filters, search, sucursal]);

    function clearAllFilters() {
        setSearch('');
        setFilters({ ...SERVICES_FILTER_DEFAULTS });
    }

    function clearFilterChip(key) {
        if (key === 'search') {
            setSearch('');
            return;
        }
        setFilters((prev) => ({ ...prev, [key]: 'all' }));
    }

    // â”€â”€ Carga sucursales (para nombres en selector) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    useEffect(() => {
        let cancelled = false;
        setAllBranches([]);
        setBranchesContext('');
        setLoadingBranches(true);
        setBranchLoadError('');
        listAdminSucursales({ soloActivas: true })
            .then((data) => {
                if (cancelled) return;
                const payload = data?.data ?? data;
                const nextBranches = Array.isArray(payload?.sucursales)
                    ? payload.sucursales.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
                    : [];
                setAllBranches(nextBranches);
                setBranchesContext(permissionsKey);
            })
            .catch((err) => {
                if (cancelled) return;
                setAllBranches([]);
                // AM: Evita bloqueo silencioso cuando no se pueden cargar sucursales para operar servicios.
                const message = extractMessage(err) || 'No se pudieron cargar las sucursales.';
                setBranchLoadError(message);
                notifications.error(message, { dedupeKey: 'servicios-branches-error' });
            })
            .finally(() => { if (!cancelled) setLoadingBranches(false); });
        return () => { cancelled = true; };
    }, [notifications, permissionsKey]);

    useLayoutEffect(() => {
        // AM: Solo la respuesta administrativa vigente determina opciones y seleccion automatica.
        if (sucursal && availableBranches.some((branch) => branch.id_sucursal === sucursal)) return;
        setSucursal(availableBranches.length === 1 ? availableBranches[0].id_sucursal : '');
    }, [sucursal, availableBranches]);

    useEffect(() => {
        if (!sucursal) return;
        // AM: Evita duplicar filtros por sucursal cuando ya existe sucursal global seleccionada.
        setFilters((prev) => (prev.idSucursal === 'all' ? prev : { ...prev, idSucursal: 'all' }));
    }, [sucursal]);

    // â”€â”€ Carga datos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // AM: Invalida solicitudes y datos del alcance anterior antes de mostrar otra sucursal.
    useLayoutEffect(() => {
        mountedRef.current = true;
        currentScopeRef.current = requestScope;
        requestGenerationRef.current += 1;
        setServicios([]);
        setListError('');
        setLoading(false);
        if (!canQueryScope) {
            setDialogOpen(false);
            setTariffDialogOpen(false);
            setRemoveBranchTarget(null);
            setGlobalDeactivateTarget(null);
        }
        return () => {
            mountedRef.current = false;
            requestGenerationRef.current += 1;
        };
    }, [requestScope, canQueryScope]);

    const fetchServicios = useCallback(async ({ silent = false } = {}) => {
        if (!mountedRef.current || currentScopeRef.current !== requestScope || !canQueryScope) return;
        const generation = ++requestGenerationRef.current;
        const isCurrent = () => mountedRef.current && currentScopeRef.current === requestScope
            && requestGenerationRef.current === generation;
        if (!silent) {
            setLoading(true);
            setListError('');
        }
        try {
            const data = await listAdminServiciosAgrupados(sucursal ? { id_sucursal: sucursal } : {});
            if (!isCurrent()) return;
            const payloadData = data?.data ?? data;
            const lista = payloadData?.servicios ?? [];
            setServicios(Array.isArray(lista) ? lista : []);
        } catch (err) {
            if (!isCurrent()) return;
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            // AM: Evita mantener datos viejos cuando falla el filtro por sucursal.
            setServicios([]);
            if (!silent) {
                setListError(extractMessage(err));
            }
        } finally {
            if (isCurrent() && !silent) {
                setLoading(false);
            }
        }
    }, [sucursal, navigate, canQueryScope, requestScope]);

    useEffect(() => {
        void fetchServicios();
    }, [fetchServicios]);

    // â”€â”€ Handlers form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function handleFormChange(field, value) {
        setFormValues((prev) => ({ ...prev, [field]: value }));
        if (field === 'servicio_informativo' && !value) {
            setServiceBarberAssignments(SERVICE_BARBER_ASSIGNMENTS_DEFAULTS);
        }
    }

    function buildDefaultBranchTariff(branchId = '') {
        return {
            id_sucursal: branchId,
            precio_hnl: '',
            duracion_min: '',
            buffer_min: '5',
            activo: true,
            servicio_informativo: false,
        };
    }

    function toggleCreateBranch(branchId) {
        setCreateBranchTariffs((prev) => {
            const exists = prev.some((item) => item.id_sucursal === branchId);
            if (exists) return prev.filter((item) => item.id_sucursal !== branchId);
            return [...prev, buildDefaultBranchTariff(branchId)];
        });
    }

    function updateCreateBranchTariff(branchId, field, value) {
        setCreateBranchTariffs((prev) => prev.map((item) => (
            item.id_sucursal === branchId ? { ...item, [field]: value } : item
        )));
    }

    function updateCommonCreateTariff(field, value) {
        setCommonCreateTariff((prev) => ({ ...prev, [field]: value }));
    }

    function handleBarberAssignmentToggle(idEmpleado) {
        setServiceBarberAssignments((prev) => {
            const currentIds = Array.isArray(prev.selectedIds) ? prev.selectedIds : [];
            const nextIds = currentIds.includes(idEmpleado)
                ? currentIds.filter((value) => value !== idEmpleado)
                : [...currentIds, idEmpleado];
            return { ...prev, selectedIds: nextIds };
        });
    }

    function resolveMutationBranchId(servicio = null) {
        // AM: Scope tecnico para endpoints legacy; la tarifa se edita en modal separado.
        return sucursal || servicio?.id_sucursal || servicio?.tarifas?.find((tarifa) => tarifa?.id_sucursal)?.id_sucursal || '';
    }

    function openCrear() {
        setEditTarget(null);
        setFormValues(FORM_DEFAULTS);
        setCreateBranchTariffs(sucursal ? [buildDefaultBranchTariff(sucursal)] : []);
        setUseSameTariffForAll(true);
        setCommonCreateTariff(TARIFF_FORM_DEFAULTS);
        setFormError('');
        setServiceBarberAssignments(SERVICE_BARBER_ASSIGNMENTS_DEFAULTS);
        setDialogOpen(true);
    }

    function openEditar(servicio) {
        const mutationBranchId = resolveMutationBranchId(servicio);
        if (!mutationBranchId) {
            notifications.error('No se pudo determinar la sucursal del servicio para editarlo.', {
                dedupeKey: 'servicios-edit-branch-required',
            });
            return;
        }

        setEditTarget({ ...servicio, _mutation_branch_id: mutationBranchId });
        setFormValues({
            nombre_servicio: servicio.nombre_servicio ?? '',
            descripcion: servicio.descripcion ?? '',
            duracion_min: '',
            precio_hnl: '',
            visible_publico: Boolean(servicio.visible_publico),
            agendable: Boolean(servicio.agendable),
            servicio_informativo: false,
            orden_visual: String(servicio.orden_visual ?? 100),
        });
        setFormError('');
        setDialogOpen(true);
    }

    useEffect(() => {
        if (!dialogOpen || !editTarget || !canManageServiceBarberAssignments || !formValues.servicio_informativo) {
            setServiceBarberAssignments(SERVICE_BARBER_ASSIGNMENTS_DEFAULTS);
            return undefined;
        }

        const mutationBranchId = editTarget?._mutation_branch_id || '';
        const serviceId = editTarget?.id_servicio || editTarget?.id || '';
        if (!mutationBranchId || !serviceId) {
            setServiceBarberAssignments({
                loading: false,
                error: 'No se pudo determinar la sucursal o el servicio para cargar barberos.',
                barberos: [],
                selectedIds: [],
            });
            return undefined;
        }

        let cancelled = false;
        setServiceBarberAssignments((prev) => ({ ...prev, loading: true, error: '' }));

        getAdminServicioBarberos(serviceId, { id_sucursal: mutationBranchId })
            .then((response) => {
                if (cancelled) return;
                const payload = response?.data ?? response;
                const barberos = Array.isArray(payload?.barberos) ? payload.barberos : [];
                setServiceBarberAssignments({
                    loading: false,
                    error: '',
                    barberos,
                    selectedIds: barberos.filter((barbero) => barbero?.ofrece_servicio).map((barbero) => barbero.id_empleado),
                });
            })
            .catch((err) => {
                if (cancelled) return;
                setServiceBarberAssignments({
                    loading: false,
                    error: extractMessage(err) || 'No se pudieron cargar los barberos del servicio.',
                    barberos: [],
                    selectedIds: [],
                });
            });

        return () => { cancelled = true; };
    }, [canManageServiceBarberAssignments, dialogOpen, editTarget, formValues.servicio_informativo]);

    async function handleGuardar() {
        const validationError = validateForm(formValues, { includeTariffFields: false });
        if (validationError) { setFormError(validationError); return; }
        if (!editTarget && createBranchTariffs.length === 0) {
            setFormError('Selecciona al menos una sucursal para ofrecer el servicio.');
            return;
        }
        if (!editTarget) {
            const commonError = useSameTariffForAll ? validateTariffForm(commonCreateTariff) : null;
            if (commonError) {
                setFormError(commonError);
                return;
            }
            const invalidTariff = !useSameTariffForAll ? createBranchTariffs.find((tariff) => validateTariffForm(tariff)) : null;
            if (invalidTariff) {
                setFormError(validateTariffForm(invalidTariff));
                return;
            }
        }

        if (canManageServiceBarberAssignments && editTarget && Boolean(formValues.servicio_informativo)) {
            if (serviceBarberAssignments.loading) {
                setFormError('Espera a que termine de cargar la asignacion de barberos.');
                return;
            }
            if (serviceBarberAssignments.error) {
                setFormError('No se pudo validar la asignacion de barberos. Recarga el modal antes de guardar.');
                return;
            }
        }

        const mutationBranchId = editTarget?._mutation_branch_id || sucursal || createBranchTariffs[0]?.id_sucursal;
        if (!mutationBranchId) {
            setFormError('Selecciona o ingresa una sucursal antes de guardar.');
            return;
        }

        setFormLoading(true);
        setFormError('');

        const createPayload = {
            nombre_servicio: formValues.nombre_servicio.trim(),
            descripcion: formValues.descripcion.trim() || null,
            orden_visual: parseInt(formValues.orden_visual, 10),
            visible_publico: Boolean(formValues.visible_publico),
            agendable: Boolean(formValues.agendable),
            activo: true,
            sucursales: createBranchTariffs.map((tariff) => {
                const source = useSameTariffForAll ? commonCreateTariff : tariff;
                return {
                id_sucursal: tariff.id_sucursal,
                precio_hnl: parseFloat(source.precio_hnl),
                duracion_min: parseInt(source.duracion_min, 10),
                buffer_min: parseInt(source.buffer_min, 10),
                activo: Boolean(source.activo),
                servicio_informativo: Boolean(source.servicio_informativo),
            };
            }),
        };
        const editPayload = {
            nombre_servicio: formValues.nombre_servicio.trim(),
            descripcion: formValues.descripcion.trim() || null,
            orden_visual: parseInt(formValues.orden_visual, 10),
            visible_publico: Boolean(formValues.visible_publico),
            agendable: Boolean(formValues.agendable),
            id_sucursal: mutationBranchId,
        };

        try {
            let savedServiceData = null;
            if (editTarget) {
                const response = await updateAdminServicio(editTarget.id_servicio ?? editTarget.id, editPayload);
                savedServiceData = response?.data ?? response;
            } else {
                const response = await createAdminServicio(createPayload);
                savedServiceData = response?.data ?? response;
            }

            if (canManageServiceBarberAssignments && editTarget && Boolean(formValues.servicio_informativo)) {
                const savedServiceId = savedServiceData?.id_servicio || editTarget.id_servicio || editTarget.id;
                await saveAdminServicioBarberos(savedServiceId, {
                    id_sucursal: mutationBranchId,
                    id_empleados: serviceBarberAssignments.selectedIds,
                });
            }
            if (editTarget) {
                notifications.success('Servicio actualizado.', { dedupeKey: 'servicios-save-ok' });
            } else {
                notifications.success('Servicio creado.', { dedupeKey: 'servicios-save-ok' });
                if (canManageServiceBarberAssignments) {
                    notifications.warning('El servicio se creo. Editalo para asignar los barberos que lo ofreceran.', {
                        dedupeKey: 'servicios-assign-after-create',
                    });
                }
            }
            // AM: Publica sincronizacion para que catalogo publico y otras vistas refresquen al instante.
            emitCatalogSync(editTarget ? 'servicio-updated' : 'servicio-created');
            await fetchServicios();
            setDialogOpen(false);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            const message = extractMessage(err);
            setFormError(message);
            notifications.error(message, { dedupeKey: 'servicios-save-error' });
        } finally {
            setFormLoading(false);
        }
    }

    function openTarifa(servicio, tarifa) {
        if (!servicio?.id_servicio || !tarifa?.id_sucursal) {
            notifications.error('No se pudo determinar el servicio o la sucursal de la tarifa.', {
                dedupeKey: 'servicios-tarifa-scope-error',
            });
            return;
        }

        setTariffTarget({ servicio, tarifa });
        setTariffFormValues({
            precio_hnl: tarifa.precio_hnl == null ? '' : String(tarifa.precio_hnl),
            duracion_min: tarifa.duracion_min == null ? '' : String(tarifa.duracion_min),
            buffer_min: tarifa.buffer_min == null ? '5' : String(tarifa.buffer_min),
            activo: Boolean(tarifa.tarifa_activa),
            servicio_informativo: Boolean(tarifa.servicio_informativo),
        });
        setTariffFormError('');
        setTariffDialogOpen(true);
    }

    function openAgregarSucursal(servicio) {
        if (!sucursal) {
            notifications.error('Selecciona una sucursal para agregar este servicio.', {
                dedupeKey: 'servicios-add-branch-no-scope',
            });
            return;
        }

        const fallbackTariff = getFirstServiceTariff(servicio);
        const existingTariff = getSelectedBranchTariff(servicio, sucursal);
        const targetTariff = existingTariff || {
            id_sucursal: sucursal,
            nombre_sucursal: branchNameById[sucursal] || 'Sucursal seleccionada',
            precio_hnl: null,
            duracion_min: fallbackTariff?.duracion_min ?? null,
            buffer_min: fallbackTariff?.buffer_min ?? 5,
            tarifa_activa: true,
            servicio_informativo: fallbackTariff?.servicio_informativo ?? false,
        };

        setTariffTarget({ servicio, tarifa: targetTariff });
        setTariffFormValues({
            precio_hnl: targetTariff.precio_hnl == null ? '' : String(targetTariff.precio_hnl),
            duracion_min: targetTariff.duracion_min == null ? '' : String(targetTariff.duracion_min),
            buffer_min: targetTariff.buffer_min == null ? '5' : String(targetTariff.buffer_min),
            activo: true,
            servicio_informativo: Boolean(targetTariff.servicio_informativo),
        });
        setTariffFormError('');
        setTariffDialogOpen(true);
    }

    function handleTariffFormChange(field, value) {
        setTariffFormValues((prev) => ({ ...prev, [field]: value }));
    }

    async function handleGuardarTarifa() {
        const validationError = validateTariffForm(tariffFormValues);
        if (validationError) {
            setTariffFormError(validationError);
            return;
        }

        const serviceId = tariffTarget?.servicio?.id_servicio;
        const branchId = tariffTarget?.tarifa?.id_sucursal;
        if (!serviceId || !branchId) {
            setTariffFormError('No se pudo determinar el servicio o la sucursal.');
            return;
        }

        setTariffFormLoading(true);
        setTariffFormError('');
        try {
            const payload = {
                precio_hnl: parseFloat(tariffFormValues.precio_hnl),
                duracion_min: parseInt(tariffFormValues.duracion_min, 10),
                buffer_min: parseInt(tariffFormValues.buffer_min, 10),
                activo: Boolean(tariffFormValues.activo),
                servicio_informativo: Boolean(tariffFormValues.servicio_informativo),
            };
            if (tariffTarget?.tarifa?.id_tarifa) {
                await updateAdminServicioTarifa(serviceId, branchId, payload);
            } else {
                await createAdminServicioTarifa(serviceId, { ...payload, id_sucursal: branchId });
            }
            notifications.success('Tarifa actualizada.', { dedupeKey: 'servicios-tarifa-save-ok' });
            // AM: Refresca catalogos que dependen de tarifa por sucursal.
            emitCatalogSync('servicio-tarifa-updated');
            await fetchServicios();
            setTariffDialogOpen(false);
            setTariffTarget(null);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            const message = extractMessage(err);
            setTariffFormError(message);
            notifications.error(message, { dedupeKey: 'servicios-tarifa-save-error' });
        } finally {
            setTariffFormLoading(false);
        }
    }

    function openRemoveBranch(servicio, tarifa) {
        if (!servicio?.id_servicio || !tarifa?.id_sucursal || !tarifa?.tarifa_activa) return;
        setRemoveBranchTarget({ servicio, tarifa });
    }

    async function handleConfirmRemoveBranch() {
        const serviceId = removeBranchTarget?.servicio?.id_servicio;
        const branchId = removeBranchTarget?.tarifa?.id_sucursal;
        if (!serviceId || !branchId) return;

        setRemoveBranchLoading(true);
        try {
            await deactivateAdminServicioTarifa(serviceId, branchId);
            notifications.success('Servicio quitado de la sucursal.', { dedupeKey: 'servicios-branch-remove-ok' });
            emitCatalogSync('servicio-tarifa-deactivated');
            await fetchServicios();
            setRemoveBranchTarget(null);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            notifications.error(extractMessage(err), { dedupeKey: 'servicios-branch-remove-error' });
        } finally {
            setRemoveBranchLoading(false);
        }
    }

    function openGlobalDeactivate(servicio) {
        if (!servicio?.id_servicio) return;
        setGlobalDeactivateTarget(servicio);
    }

    async function handleConfirmGlobalDeactivate() {
        const serviceId = globalDeactivateTarget?.id_servicio;
        if (!serviceId) return;

        setGlobalDeactivateLoading(true);
        try {
            await deactivateAdminServicioGlobal(serviceId);
            notifications.success('Servicio desactivado globalmente.', { dedupeKey: 'servicios-global-deactivate-ok' });
            emitCatalogSync('servicio-global-deactivated');
            await fetchServicios();
            setGlobalDeactivateTarget(null);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            notifications.error(extractMessage(err), { dedupeKey: 'servicios-global-deactivate-error' });
        } finally {
            setGlobalDeactivateLoading(false);
        }
    }

    async function handleReactivateService(servicio) {
        const serviceId = servicio?.id_servicio;
        if (!serviceId) return;

        const branchId = sucursal || getFirstServiceTariff(servicio)?.id_sucursal;
        if (!branchId) {
            notifications.error('Agrega o configura una sucursal antes de reactivar este servicio.', {
                dedupeKey: 'servicios-reactivate-no-branch',
            });
            return;
        }

        try {
            await setAdminServicioEstado(serviceId, {
                activo: true,
                id_sucursal: branchId,
            });
            notifications.success('Servicio reactivado.', { dedupeKey: 'servicios-reactivate-ok' });
            emitCatalogSync('servicio-reactivated');
            await fetchServicios();
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            notifications.error(extractMessage(err), { dedupeKey: 'servicios-reactivate-error' });
        }
    }

    // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sinSucursal = !sucursal;
    // AM: El listado agrupado permite revisar/editar maestro en todas las sucursales; crear sigue requiriendo sucursal.
    const actionsLockedByBranch = !canQueryScope;
    const titleSubtitle = !sucursal && availableBranches.length > 1
        ? 'Gestiona servicios maestro y tarifas por sucursal.'
        : 'Gestiona servicios maestro y tarifas por sucursal.';
    // AM: Requisito de operacion: mostrar siempre servicios agendables e informativos en la misma vista por sucursal.
    const visibleServicios = useMemo(() => filteredServicios, [filteredServicios]);
    const modeLabel = 'servicios';

    function ServiceBadges({ servicio, selectedTariff }) {
        const informative = sucursal
            ? Boolean(selectedTariff?.servicio_informativo)
            : !servicio.agendable;
        return (
            <div className="flex flex-wrap gap-1.5">
                <ServiceStatusBadge activo={Boolean(servicio.activo)} />
                <ServiceVisibilityBadge visiblePublico={Boolean(servicio.visible_publico)} />
                <ServiceAgendableBadge agendable={Boolean(servicio.agendable)} />
                {informative ? <ServiceTypeBadge informativo /> : null}
            </div>
        );
    }

    function BranchSummary({ servicio, selectedTariff }) {
        const activeTariffs = getActiveTariffs(servicio);
        if (sucursal) {
            if (!selectedTariff?.tarifa_activa) {
                return <span className="text-sm text-[var(--mf-text-2)]">Sin tarifa activa en esta sucursal</span>;
            }
            return (
                <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-3">
                    <BranchConfigField label="Precio" value={formatServicePrice(selectedTariff.precio_hnl)} />
                    <BranchConfigField label="Duración" value={`${selectedTariff.duracion_min ?? '-'} min`} />
                    <BranchConfigField label="Buffer" value={`${selectedTariff.buffer_min ?? '-'} min`} />
                </div>
            );
        }

        const visibleBranches = activeTariffs.slice(0, 3);
        return (
            <div className="space-y-1.5">
                <p className="text-xs text-[var(--mf-text-2)]">{formatActiveBranchesCount(servicio)}</p>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                    {visibleBranches.map((tarifa) => (
                        <span key={getTarifaKey(tarifa)} className="max-w-full truncate rounded-full border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2 py-0.5 text-xs text-[var(--mf-text)]">
                            {getBranchShortName(tarifa.nombre_sucursal)}
                        </span>
                    ))}
                    {activeTariffs.length > visibleBranches.length ? (
                        <span className="rounded-full border border-[var(--mf-nav-border)] px-2 py-0.5 text-xs text-[var(--mf-text-2)]">+{activeTariffs.length - visibleBranches.length}</span>
                    ) : null}
                    {activeTariffs.length === 0 ? <span className="text-xs text-[var(--mf-text-2)]">Sin sucursales activas</span> : null}
                </div>
            </div>
        );
    }

    function ServiceActions({ servicio, selectedTariff }) {
        const globalMode = isSuperAdmin && !sucursal;
        return (
            <details className="group relative ml-auto w-fit">
                <summary
                    className="inline-flex h-9 min-w-9 cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-2.5 text-sm font-medium text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mf-accent)] [&::-webkit-details-marker]:hidden"
                    aria-label={`Acciones de ${servicio.nombre_servicio}`}
                >
                    <MoreHorizontal size={17} aria-hidden="true" />
                    <span className="hidden sm:inline">Acciones</span>
                </summary>
                <div className="absolute right-0 z-20 mt-1 grid w-[230px] max-w-[calc(100vw-2rem)] gap-1 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-1.5 shadow-[var(--mf-shadow-soft)]">
                    {globalMode ? (
                        <>
                            <Button type="button" variant="ghost" size="sm" className="justify-start gap-2" disabled={!resolveMutationBranchId(servicio)} onClick={() => openEditar(servicio)}>
                                <Pencil size={15} /> Editar servicio global
                            </Button>
                            {servicio.activo ? (
                                <Button type="button" variant="ghost" size="sm" className="justify-start gap-2" onClick={() => openGlobalDeactivate(servicio)}>
                                    <ToggleLeft size={15} /> Desactivar globalmente
                                </Button>
                            ) : (
                                <Button type="button" variant="ghost" size="sm" className="justify-start gap-2" onClick={() => handleReactivateService(servicio)}>
                                    <ToggleRight size={15} /> Reactivar servicio
                                </Button>
                            )}
                        </>
                    ) : (
                        <>
                            {selectedTariff?.tarifa_activa ? (
                                <Button type="button" variant="ghost" size="sm" className="justify-start gap-2" onClick={() => openTarifa(servicio, selectedTariff)}>
                                    <Pencil size={15} /> Editar tarifa
                                </Button>
                            ) : (
                                <Button type="button" variant="ghost" size="sm" className="justify-start gap-2" onClick={() => openAgregarSucursal(servicio)}>
                                    <Plus size={15} /> Agregar a esta sucursal
                                </Button>
                            )}
                            {selectedTariff?.tarifa_activa ? (
                                <Button type="button" variant="ghost" size="sm" className="justify-start gap-2" onClick={() => openRemoveBranch(servicio, selectedTariff)}>
                                    <ToggleLeft size={15} /> Desactivar en esta sucursal
                                </Button>
                            ) : null}
                        </>
                    )}
                </div>
            </details>
        );
    }

    function ServicioList() {
        return (
            <section aria-label="Lista de servicios" className="@container overflow-visible rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)]">
                <div role="row" className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(220px,1fr)_minmax(260px,1.25fr)_auto] gap-4 border-b border-[var(--mf-nav-border)] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)] @[54rem]:grid">
                    <span>Servicio</span><span>Estado maestro</span><span>{sucursal ? 'Tarifa local' : 'Sucursales'}</span><span className="text-right">Acciones</span>
                </div>
                <div className="divide-y divide-[var(--mf-nav-border)]">
                    {paginatedServicios.map((servicio) => {
                        const selectedTariff = sucursal ? getSelectedBranchTariff(servicio, sucursal) : null;
                        return (
                            <article key={buildServicioScopeKey(servicio)} role="row" className="grid min-w-0 gap-3 px-3 py-3 transition-colors hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_40%,transparent)] sm:px-4 @[54rem]:grid-cols-[minmax(220px,1.5fr)_minmax(220px,1fr)_minmax(260px,1.25fr)_auto] @[54rem]:items-center @[54rem]:gap-4">
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]"><Scissors size={16} /></span>
                                    <div className="min-w-0">
                                        <h2 className="break-words text-sm font-semibold leading-5 text-[var(--mf-text)]">{servicio.nombre_servicio}</h2>
                                        {servicio.descripcion ? <p className="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-[var(--mf-text-2)]">{servicio.descripcion}</p> : null}
                                    </div>
                                </div>
                                <ServiceBadges servicio={servicio} selectedTariff={selectedTariff} />
                                <BranchSummary servicio={servicio} selectedTariff={selectedTariff} />
                                <ServiceActions servicio={servicio} selectedTariff={selectedTariff} />
                            </article>
                        );
                    })}
                </div>
            </section>
        );
    }

    function ServicioCards() {
        return (
            <section aria-label="Tarjetas de servicios" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {paginatedServicios.map((servicio) => {
                    const selectedTariff = sucursal ? getSelectedBranchTariff(servicio, sucursal) : null;
                    return (
                        <article key={buildServicioScopeKey(servicio)} className="flex min-w-0 flex-col rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-4 shadow-[var(--mf-shadow-soft)]">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]"><Scissors size={18} /></span>
                                <div className="min-w-0">
                                    <h2 className="break-words text-sm font-semibold text-[var(--mf-text)]">{servicio.nombre_servicio}</h2>
                                    {servicio.descripcion ? <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[var(--mf-text-2)]">{servicio.descripcion}</p> : null}
                                </div>
                            </div>
                            <div className="mt-3"><ServiceBadges servicio={servicio} selectedTariff={selectedTariff} /></div>
                            <div className="mt-3 border-t border-[var(--mf-nav-border)] pt-3"><BranchSummary servicio={servicio} selectedTariff={selectedTariff} /></div>
                            <div className="mt-auto pt-3"><ServiceActions servicio={servicio} selectedTariff={selectedTariff} /></div>
                        </article>
                    );
                })}
            </section>
        );
    }

    function PaginationControls() {
        if (totalPages <= 1) return null;
        const firstVisible = ((currentPage - 1) * SERVICES_PAGE_SIZE) + 1;
        const lastVisible = Math.min(currentPage * SERVICES_PAGE_SIZE, visibleServicios.length);
        return (
            <nav aria-label="Paginación de servicios" className="flex flex-col items-center justify-between gap-2 rounded-xl border border-[var(--mf-nav-border)] px-3 py-2 sm:flex-row">
                <p className="text-xs text-[var(--mf-text-2)]">Mostrando {firstVisible}-{lastVisible} de {visibleServicios.length}</p>
                <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage === 1} aria-label="Página anterior"><ChevronLeft size={15} /></Button>
                    <span className="min-w-[88px] text-center text-xs text-[var(--mf-text-2)]">Página {currentPage} de {totalPages}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage === totalPages} aria-label="Página siguiente"><ChevronRight size={15} /></Button>
                </div>
            </nav>
        );
    }

    return (
        <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
            <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Catálogo · Servicios</p>
                            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Servicios</h1>
                            <p className="text-sm text-[var(--mf-text-2)]">{titleSubtitle}</p>
                        </div>
                        <SucursalSelector
                            allBranches={availableBranches}
                            selected={sucursal}
                            onChange={setSucursal}
                            loadingBranches={loadingBranches}
                            allowAll={isSuperAdmin}
                        />
                        {branchLoadError && <ErrorBanner message={branchLoadError} />}
                    </div>

                    <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm text-[var(--mf-text-2)]">
                                {loading ? 'Cargando...' : `${visibleServicios.length} ${modeLabel}`}
                            </p>
                            <div className="inline-flex rounded-lg border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] p-0.5" role="group" aria-label="Vista del catálogo">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('list')}
                                    aria-pressed={viewMode === 'list'}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-[var(--mf-accent)] text-[var(--mf-accent-text)]' : 'text-[var(--mf-text-2)] hover:text-[var(--mf-text)]'}`}
                                >
                                    <List size={14} /> Lista
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('cards')}
                                    aria-pressed={viewMode === 'cards'}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${viewMode === 'cards' ? 'bg-[var(--mf-accent)] text-[var(--mf-accent-text)]' : 'text-[var(--mf-text-2)] hover:text-[var(--mf-text)]'}`}
                                >
                                    <LayoutGrid size={14} /> Tarjetas
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                            <div className="relative w-full sm:max-w-[320px]">
                                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Buscar por nombre o descripcion..."
                                    className="pl-9 pr-9"
                                />
                                {search.trim() ? (
                                    <button
                                        type="button"
                                        onClick={() => setSearch('')}
                                        className="absolute right-2 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-[var(--mf-text-2)] transition-colors hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)]"
                                        aria-label="Limpiar busqueda"
                                        title="Limpiar busqueda"
                                    >
                                        <X size={12} />
                                    </button>
                                ) : null}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="gap-2"
                                onClick={() => setFiltersOpen(true)}
                            >
                                <SlidersHorizontal size={15} /> Filtros
                                {activeFilterCount > 0 ? (
                                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-xs text-[var(--mf-accent-text)]">
                                        {activeFilterCount}
                                    </span>
                                ) : null}
                            </Button>
                            {(activeFilterCount > 0 || search.trim()) ? (
                                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={clearAllFilters}>
                                    <RotateCcw size={13} /> Limpiar
                                </Button>
                            ) : null}
                            <Button onClick={openCrear} className="gap-2" disabled={actionsLockedByBranch}>
                                <Plus size={15} /> Nuevo
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {activeFilterChips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_45%,transparent)] px-3 py-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Activos</span>
                    {activeFilterChips.map((chip) => (
                        <button
                            key={chip.key}
                            type="button"
                            onClick={() => clearFilterChip(chip.key)}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-2.5 py-1 text-xs text-[var(--mf-text)] transition-colors hover:border-[var(--mf-accent)]/60"
                        >
                            <span>{chip.label}</span>
                            <X size={11} />
                        </button>
                    ))}
                </div>
            ) : null}

            {/* Estados */}
            {!canQueryScope && (
                <EmptyState icon={Building2} title="Selecciona una sucursal" description="Selecciona una sucursal autorizada para consultar y gestionar sus servicios." />
            )}
            {listError && <ErrorBanner message={listError} onRetry={fetchServicios} />}
            {loading && !listError && <LoadingSpinner />}

            {canQueryScope && !loading && !listError && servicios.length === 0 && (!sinSucursal || isSuperAdmin) && (
                <EmptyState
                    icon={Scissors}
                    title="Sin servicios"
                    description={sinSucursal ? 'No hay servicios registrados aun.' : 'No hay servicios registrados para esta sucursal.'}
                />
            )}
            {canQueryScope && !loading && !listError && servicios.length > 0 && visibleServicios.length === 0 && (
                <EmptyState icon={Search} title="Sin resultados" description="No hay coincidencias con la busqueda o filtros actuales." />
            )}

            {/* Datos */}
            {canQueryScope && !loading && !listError && visibleServicios.length > 0 && (
                <div className="space-y-3">
                    {viewMode === 'list' ? <ServicioList /> : <ServicioCards />}
                    <PaginationControls />
                </div>
            )}

            {/* Dialog Crear / Editar */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className={`w-[calc(100vw-1rem)] max-h-[calc(100vh-1.5rem)] overflow-y-auto ${canManageServiceBarberAssignments && editTarget ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
                    <DialogHeader>
                        <DialogTitle>{editTarget ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
                        <DialogDescription className="sr-only">
                            Configura datos maestros del servicio; las tarifas por sucursal se editan por separado.
                        </DialogDescription>
                    </DialogHeader>
                    <div className={`grid gap-5 ${canManageServiceBarberAssignments && editTarget ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]' : 'grid-cols-1'}`}>
                        <ServicioForm values={formValues} onChange={handleFormChange} includeTariffFields={false} />

                        {!editTarget ? (
                            <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_38%,transparent)] p-4">
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--mf-accent)]">Sucursales donde se ofrecerá</p>
                                    <h3 className="text-base font-semibold text-[var(--mf-text)]">Tarifas por sucursal</h3>
                                    <p className="text-sm text-[var(--mf-text-2)]">Selecciona una o varias sucursales y configura su tarifa base actual.</p>
                                </div>
                                <label className="mf-checkbox mt-4 flex items-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_70%,transparent)] px-3 py-2.5">
                                    <input type="checkbox" checked={useSameTariffForAll} onChange={(event) => setUseSameTariffForAll(event.target.checked)} />
                                    <span className="text-sm font-semibold text-[var(--mf-text)]">Usar misma tarifa para todas las sucursales seleccionadas</span>
                                </label>
                                {useSameTariffForAll ? (
                                    <div className="mt-3 rounded-xl border border-[var(--mf-nav-border)] p-3">
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                            <Input type="number" min="0" step="0.01" placeholder="Precio HNL" value={commonCreateTariff.precio_hnl} onChange={(e) => updateCommonCreateTariff('precio_hnl', e.target.value)} />
                                            <Input type="number" min="1" placeholder="Duración min" value={commonCreateTariff.duracion_min} onChange={(e) => updateCommonCreateTariff('duracion_min', e.target.value)} />
                                            <Input type="number" min="0" placeholder="Buffer min" value={commonCreateTariff.buffer_min} onChange={(e) => updateCommonCreateTariff('buffer_min', e.target.value)} />
                                            <label className="mf-checkbox flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
                                                <input type="checkbox" checked={Boolean(commonCreateTariff.activo)} onChange={(e) => updateCommonCreateTariff('activo', e.target.checked)} />
                                                Activa
                                            </label>
                                            <label className="mf-checkbox flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
                                                <input type="checkbox" checked={Boolean(commonCreateTariff.servicio_informativo)} onChange={(e) => updateCommonCreateTariff('servicio_informativo', e.target.checked)} />
                                                Informativo
                                            </label>
                                        </div>
                                    </div>
                                ) : null}
                                <div className="mt-4 space-y-3">
                                    {availableBranches.map((branch) => {
                                        const selectedTariff = createBranchTariffs.find((item) => item.id_sucursal === branch.id_sucursal);
                                        const checked = Boolean(selectedTariff);
                                        return (
                                            <div key={branch.id_sucursal} className="rounded-xl border border-[var(--mf-nav-border)] p-3">
                                                <label className="mf-checkbox flex items-center gap-2">
                                                    <input type="checkbox" checked={checked} onChange={() => toggleCreateBranch(branch.id_sucursal)} />
                                                    <span className="font-semibold text-[var(--mf-text)]">{branch.nombre_sucursal}</span>
                                                </label>
                                                {checked && !useSameTariffForAll ? (
                                                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                        <Input type="number" min="0" step="0.01" placeholder="Precio HNL" value={selectedTariff.precio_hnl} onChange={(e) => updateCreateBranchTariff(branch.id_sucursal, 'precio_hnl', e.target.value)} />
                                                        <Input type="number" min="1" placeholder="Duración min" value={selectedTariff.duracion_min} onChange={(e) => updateCreateBranchTariff(branch.id_sucursal, 'duracion_min', e.target.value)} />
                                                        <Input type="number" min="0" placeholder="Buffer min" value={selectedTariff.buffer_min} onChange={(e) => updateCreateBranchTariff(branch.id_sucursal, 'buffer_min', e.target.value)} />
                                                        <label className="mf-checkbox flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
                                                            <input type="checkbox" checked={Boolean(selectedTariff.activo)} onChange={(e) => updateCreateBranchTariff(branch.id_sucursal, 'activo', e.target.checked)} />
                                                            Activa
                                                        </label>
                                                        <label className="mf-checkbox flex items-center gap-2 text-xs text-[var(--mf-text-2)]">
                                                            <input type="checkbox" checked={Boolean(selectedTariff.servicio_informativo)} onChange={(e) => updateCreateBranchTariff(branch.id_sucursal, 'servicio_informativo', e.target.checked)} />
                                                            Informativo
                                                        </label>
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        ) : null}

                        {canManageServiceBarberAssignments && Boolean(formValues.servicio_informativo) ? (
                            <section className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_38%,transparent)] p-4">
                                <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-[0.22em] text-[var(--mf-accent)]">Barberos que ofrecen este servicio</p>
                                    <h3 className="text-base font-semibold text-[var(--mf-text)]">Asignación operativa</h3>
                                    <p className="text-sm text-[var(--mf-text-2)]">
                                        {editTarget
                                            ? 'Selecciona los barberos activos de la sucursal que podrán ofrecer este servicio en el agendamiento.'
                                            : 'Guarda primero el servicio para luego asignarle barberos desde esta misma pantalla.'}
                                    </p>
                                </div>

                                {!editTarget ? (
                                    <div className="mt-4 rounded-2xl border border-dashed border-[var(--mf-nav-border)] px-4 py-5 text-sm text-[var(--mf-text-2)]">
                                        La asignación de barberos se habilita después de crear el servicio.
                                    </div>
                                ) : serviceBarberAssignments.loading ? (
                                    <div className="mt-4 flex min-h-[180px] items-center justify-center rounded-2xl border border-[var(--mf-nav-border)]">
                                        <div className="flex items-center gap-2 text-sm text-[var(--mf-text-2)]">
                                            <Loader2 size={16} className="animate-spin" />
                                            Cargando barberos...
                                        </div>
                                    </div>
                                ) : serviceBarberAssignments.error ? (
                                    <div className="mt-4">
                                        <ErrorBanner message={serviceBarberAssignments.error} />
                                    </div>
                                ) : serviceBarberAssignments.barberos.length === 0 ? (
                                    <div className="mt-4 rounded-2xl border border-dashed border-[var(--mf-nav-border)] px-4 py-5 text-sm text-[var(--mf-text-2)]">
                                        No hay barberos activos en esta sucursal para asignar.
                                    </div>
                                ) : (
                                    <div className="mt-4 space-y-3">
                                        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_76%,transparent)] px-3 py-2">
                                            <div>
                                                <p className="text-xs uppercase tracking-[0.12em] text-[var(--mf-text-2)]">Seleccionados</p>
                                                <p className="text-sm font-semibold text-[var(--mf-text)]">
                                                    {serviceBarberAssignments.selectedIds.length} barbero(s)
                                                </p>
                                            </div>
                                            <p className="max-w-[260px] text-right text-xs text-[var(--mf-text-2)]">
                                                {summarizeAssignedBarbers(
                                                    serviceBarberAssignments.barberos.filter((barbero) => serviceBarberAssignments.selectedIds.includes(barbero.id_empleado)),
                                                    2
                                                )}
                                            </p>
                                        </div>

                                        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                                            {serviceBarberAssignments.barberos.map((barbero) => {
                                                const checked = serviceBarberAssignments.selectedIds.includes(barbero.id_empleado);
                                                return (
                                                    <label
                                                        key={barbero.id_empleado}
                                                        className={`mf-checkbox flex items-start gap-3 rounded-2xl border px-3 py-3 transition-colors ${
                                                            checked
                                                                ? 'border-[var(--mf-accent)] bg-[color:color-mix(in_srgb,var(--mf-accent)_14%,var(--mf-card))]'
                                                                : 'border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_30%,transparent)]'
                                                        }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => handleBarberAssignmentToggle(barbero.id_empleado)}
                                                        />
                                                        <span className="flex-1 space-y-1">
                                                            <span className="flex items-center justify-between gap-3">
                                                                <span className="font-medium text-[var(--mf-text)]">{barbero.nombre_completo}</span>
                                                                <span className={`mf-badge ${checked ? 'mf-badge-green' : 'mf-badge-muted'}`}>
                                                                    {checked ? 'Ofrece' : 'Sin asignar'}
                                                                </span>
                                                            </span>
                                                            <span className="block text-xs text-[var(--mf-text-2)]">
                                                                {barbero.telefono_principal || 'Telefono no registrado'}
                                                            </span>
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </section>
                        ) : null}
                    </div>
                    {formError && (
                        <ErrorBanner message={formError} />
                    )}
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleGuardar}
                            disabled={formLoading || (canManageServiceBarberAssignments && editTarget && Boolean(formValues.servicio_informativo) && serviceBarberAssignments.loading)}
                            className="gap-2 min-w-[120px]"
                        >
                            {formLoading ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear servicio'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={tariffDialogOpen} onOpenChange={setTariffDialogOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Editar tarifa</DialogTitle>
                        <DialogDescription className="sr-only">
                            Configura precio, duración, buffer y estado de la tarifa por sucursal.
                        </DialogDescription>
                    </DialogHeader>
                    <TarifaForm
                        values={tariffFormValues}
                        onChange={handleTariffFormChange}
                        serviceName={tariffTarget?.servicio?.nombre_servicio}
                        branchName={tariffTarget?.tarifa?.nombre_sucursal}
                    />
                    {tariffFormError ? <ErrorBanner message={tariffFormError} /> : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTariffDialogOpen(false)} disabled={tariffFormLoading}>
                            Cancelar
                        </Button>
                        <Button onClick={handleGuardarTarifa} disabled={tariffFormLoading} className="gap-2 min-w-[120px]">
                            {tariffFormLoading ? 'Guardando...' : 'Guardar tarifa'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Filtros de Servicios</DialogTitle>
                        <DialogDescription className="sr-only">
                            Ajusta criterios para filtrar servicios por estado, visibilidad, agendable, grupo y sucursal.
                        </DialogDescription>
                    </DialogHeader>
                    {/* AM: Atajos de filtro para acelerar la operacion del super admin en catalogo. */}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFilters((prev) => ({ ...prev, estado: prev.estado === 'activo' ? 'all' : 'activo' }))}
                            className={quickFilterButtonClass(filters.estado === 'activo')}
                        >
                            Solo activos
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFilters((prev) => ({ ...prev, visibilidad: prev.visibilidad === 'visible' ? 'all' : 'visible' }))}
                            className={quickFilterButtonClass(filters.visibilidad === 'visible')}
                        >
                            Publicos
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFilters((prev) => ({ ...prev, agendable: prev.agendable === 'si' ? 'all' : 'si' }))}
                            className={quickFilterButtonClass(filters.agendable === 'si')}
                        >
                            Agendables
                        </Button>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <Label className="mf-label">Estado</Label>
                            <select
                                className="mf-select mt-1"
                                value={filters.estado}
                                onChange={(event) => setFilters((prev) => ({ ...prev, estado: event.target.value }))}
                            >
                                <option value="all">Todos</option>
                                <option value="activo">Activo</option>
                                <option value="inactivo">Inactivo</option>
                            </select>
                        </div>
                        <div>
                            <Label className="mf-label">Visibilidad publica</Label>
                            <select
                                className="mf-select mt-1"
                                value={filters.visibilidad}
                                onChange={(event) => setFilters((prev) => ({ ...prev, visibilidad: event.target.value }))}
                            >
                                <option value="all">Todos</option>
                                <option value="visible">Visible al publico</option>
                                <option value="oculto">Oculto al publico</option>
                            </select>
                        </div>
                        <div>
                            <Label className="mf-label">Agendable</Label>
                            <select
                                className="mf-select mt-1"
                                value={filters.agendable}
                                onChange={(event) => setFilters((prev) => ({ ...prev, agendable: event.target.value }))}
                            >
                                <option value="all">Todos</option>
                                <option value="si">Si</option>
                                <option value="no">No</option>
                            </select>
                        </div>
                        {isSuperAdmin && !sucursal ? (
                            <div className="sm:col-span-2">
                                <Label className="mf-label">Sucursal</Label>
                                <select
                                    className="mf-select mt-1"
                                    value={filters.idSucursal}
                                    onChange={(event) => setFilters((prev) => ({ ...prev, idSucursal: event.target.value }))}
                                >
                                    <option value="all">Todas</option>
                                    {availableBranches.map((branch) => (
                                        <option key={branch.id_sucursal} value={branch.id_sucursal}>
                                            {branch.nombre_sucursal}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <p className="sm:col-span-2 text-xs text-[var(--mf-text-2)]">
                                {sucursal ? 'La sucursal ya esta fijada en el selector superior.' : 'Selecciona una sucursal en el selector superior.'}
                            </p>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={clearAllFilters}>
                            Limpiar filtros
                        </Button>
                        <Button onClick={() => setFiltersOpen(false)}>Cerrar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ActionConfirmDialog
                open={Boolean(globalDeactivateTarget)}
                onOpenChange={(open) => {
                    if (!open && !globalDeactivateLoading) setGlobalDeactivateTarget(null);
                }}
                tone="danger"
                title="Desactivar globalmente"
                description="Este servicio dejará de mostrarse y no podrá reservarse en ninguna sucursal. Las tarifas e historial se conservarán."
                confirmLabel="Desactivar globalmente"
                cancelLabel="Cancelar"
                loading={globalDeactivateLoading}
                onConfirm={handleConfirmGlobalDeactivate}
            />
            <ActionConfirmDialog
                open={Boolean(removeBranchTarget)}
                onOpenChange={(open) => {
                    if (!open && !removeBranchLoading) setRemoveBranchTarget(null);
                }}
                tone="danger"
                title="Quitar de sucursal"
                description={
                    removeBranchTarget
                        ? `Se desactivará ${removeBranchTarget.servicio?.nombre_servicio || 'el servicio'} en ${removeBranchTarget.tarifa?.nombre_sucursal || 'la sucursal'}.`
                        : ''
                }
                confirmLabel="Quitar"
                cancelLabel="Cancelar"
                loading={removeBranchLoading}
                onConfirm={handleConfirmRemoveBranch}
            />
        </div>
    );
}


