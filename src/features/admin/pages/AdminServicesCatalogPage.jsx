// src/features/admin/pages/AdminServicesCatalogPage.jsx
// A3 â€” Pantalla CRUD de catÃ¡logo de servicios (Admin).
// LÃ³gica de branchIds: 1 => auto, 2+ => selector por nombre, 0 => dropdown de todas.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Pencil, Building2, Scissors, Eye, ToggleLeft, ToggleRight, Tags, Search, SlidersHorizontal, RotateCcw, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
    listAdminServicios,
    createAdminServicio,
    updateAdminServicio,
    setAdminServicioEstado,
} from '../lib/adminCatalogApi.js';
import { listAdminSucursales } from '../lib/adminSucursalesApi.js';
import { Button } from '../../../components/ui/button.jsx';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../components/ui/table.jsx';
import ViewToggle from '../../../components/data/ViewToggle.jsx';
import DataCard from '../../../components/data/DataCard.jsx';
import CardsCarousel from '../../../components/data/CardsCarousel.jsx';
import HoverActionButton from '../../../components/data/HoverActionButton.jsx';
import DetailInfoModalContent from '../../../components/data/DetailInfoModalContent.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { replaceItemById } from '../../../lib/collectionState.js';
import { emitCatalogSync } from '../../../lib/catalogSync.js';

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function extractMessage(err) {
    return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

// â”€â”€ Selector de sucursal (muestra nombre, no UUID) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/**
 * branchIds  = UUIDs del usuario autenticado (de AuthContext)
 * allBranches = [{id_sucursal, nombre_sucursal}] de la API
 * selected   = UUID actualmente seleccionado
 * onChange   = cb(uuid)
 */
function SucursalSelector({ branchIds, allBranches, selected, onChange, loadingBranches }) {
    // Filtrar solo las sucursales permitidas para este usuario
    const availableBranches = branchIds.length > 0
        ? allBranches.filter((s) => branchIds.includes(s.id_sucursal))
        : allBranches; // super_admin ve todas

    const selectedBranch = availableBranches.find((s) => s.id_sucursal === selected);

    // 1 sucursal asignada â†’ la mostramos solo como nombre, sin input
    if (branchIds.length === 1 && selectedBranch) {
        return (
            <div className="flex items-center gap-2">
                <Building2 size={15} className="text-[var(--mf-accent)] shrink-0" />
                <p className="text-sm text-[var(--mf-text-2)]">
                    Sucursal activa:{' '}
                    <span className="font-medium text-[var(--mf-text)]">{selectedBranch.nombre_sucursal}</span>
                </p>
            </div>
        );
    }

    // 2+ sucursales o super_admin â†’ dropdown con nombre
    if (loadingBranches) {
        return <p className="text-xs text-[var(--mf-text-2)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando sucursalesâ€¦</p>;
    }

    return (
        <div className="flex flex-col gap-1">
            <Label htmlFor="sel-sucursal" className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">
                Sucursal
            </Label>
            <select
                id="sel-sucursal"
                value={selected}
                onChange={(e) => onChange(e.target.value)}
                className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm text-[var(--mf-text)] focus:outline-none focus:ring-2 focus:ring-[var(--mf-accent)]/40"
            >
                <option value="">â€” Seleccionar sucursal â€”</option>
                {availableBranches.map((s) => (
                    <option key={s.id_sucursal} value={s.id_sucursal}>
                        {s.nombre_sucursal}
                    </option>
                ))}
            </select>
        </div>
    );
}

// â”€â”€ Formulario servicio â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FORM_DEFAULTS = {
    nombre_servicio: '',
    descripcion: '',
    duracion_min: '',
    buffer_min: '',
    precio_hnl: '',
    grupo_catalogo: 'barberia',
    visible_publico: true,
    agendable: true,
    orden_visual: '100',
};

const GROUP_OPTIONS = [
    { value: 'barberia', label: 'Barberia' },
    { value: 'otros', label: 'Otros servicios' },
];

const SERVICES_FILTER_DEFAULTS = {
    estado: 'all',
    visibilidad: 'all',
    agendable: 'all',
    grupo: 'all',
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

const SERVICE_GROUP_FILTER_LABELS = {
    barberia: 'Grupo: Barberia',
    otros: 'Grupo: Otros',
};

function quickFilterButtonClass(isActive) {
    // AM: Estilo consistente con PERSONAS para que filtros activos sean evidentes en escritorio y mÃ³vil.
    return isActive
        ? 'rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
        : 'rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60';
}

function ServicioForm({ values, onChange }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <Label htmlFor="f-nombre">Nombre del servicio *</Label>
                <Input
                    id="f-nombre"
                    value={values.nombre_servicio}
                    onChange={(e) => onChange('nombre_servicio', e.target.value)}
                    placeholder="Ej. Corte clÃ¡sico"
                />
            </div>
            <div className="flex flex-col gap-1">
                <Label htmlFor="f-desc">DescripciÃ³n</Label>
                <Input
                    id="f-desc"
                    value={values.descripcion}
                    onChange={(e) => onChange('descripcion', e.target.value)}
                    placeholder="DescripciÃ³n opcional"
                />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                    <Label htmlFor="f-grupo">Grupo de catalogo *</Label>
                    <select
                        id="f-grupo"
                        value={values.grupo_catalogo}
                        onChange={(e) => onChange('grupo_catalogo', e.target.value)}
                        className="mf-select"
                    >
                        {GROUP_OPTIONS.map((groupOption) => (
                            <option key={groupOption.value} value={groupOption.value}>
                                {groupOption.label}
                            </option>
                        ))}
                    </select>
                </div>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                    <Label htmlFor="f-dur">DuraciÃ³n (min) *</Label>
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
                    <Label htmlFor="f-buf">Buffer (min) *</Label>
                    <Input
                        id="f-buf"
                        type="number"
                        min="0"
                        value={values.buffer_min}
                        onChange={(e) => onChange('buffer_min', e.target.value)}
                        placeholder="10"
                    />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* AM: Campos operativos explicitos para evitar reglas hardcodeadas por nombre de servicio. */}
                <label className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm">
                    <span className="text-[var(--mf-text)]">Visible en catalogo publico</span>
                    <input
                        type="checkbox"
                        checked={Boolean(values.visible_publico)}
                        onChange={(e) => onChange('visible_publico', e.target.checked)}
                        className="h-4 w-4 accent-[var(--mf-accent)]"
                    />
                </label>
                <label className="flex items-center justify-between rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2.5 text-sm">
                    <span className="text-[var(--mf-text)]">Agendable</span>
                    <input
                        type="checkbox"
                        checked={Boolean(values.agendable)}
                        onChange={(e) => onChange('agendable', e.target.checked)}
                        className="h-4 w-4 accent-[var(--mf-accent)]"
                    />
                </label>
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
    );
}

function validateForm(values) {
    if (!values.nombre_servicio.trim()) return 'El nombre del servicio es requerido.';
    const dur = parseInt(values.duracion_min, 10);
    if (isNaN(dur) || dur < 1) return 'La duraciÃ³n debe ser al menos 1 minuto.';
    const buf = parseInt(values.buffer_min, 10);
    if (isNaN(buf) || buf < 0) return 'El buffer no puede ser negativo.';
    const precio = parseFloat(values.precio_hnl);
    if (isNaN(precio) || precio < 0) return 'El precio no puede ser negativo.';
    const orden = parseInt(values.orden_visual, 10);
    if (isNaN(orden) || orden < 0) return 'El orden visual no puede ser negativo.';
    return null;
}

function resolveGrupoLabel(grupo) {
    return String(grupo || '').trim().toLowerCase() === 'otros' ? 'Otros servicios' : 'Barberia';
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

function ServiceGroupBadge({ grupo }) {
    const normalized = String(grupo || '').trim().toLowerCase() === 'otros' ? 'otros' : 'barberia';
    return (
        <span className={`mf-badge ${normalized === 'otros' ? 'mf-badge-muted' : 'mf-badge-gold'}`}>
            {normalized === 'otros' ? 'Otros' : 'Barberia'}
        </span>
    );
}

function sortServicios(list = []) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
        const orderA = Number(a?.orden_visual ?? 100);
        const orderB = Number(b?.orden_visual ?? 100);
        if (orderA !== orderB) return orderA - orderB;
        return String(a?.nombre_servicio || '').localeCompare(String(b?.nombre_servicio || ''), 'es');
    });
}

// â”€â”€ Pantalla principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AdminServicesCatalogPage() {
    const navigate = useNavigate();
    const { branchIds, roles } = useAuth();
    const isSuperAdmin = Array.isArray(roles) && roles.includes('super_admin');
    const notifications = useNotifications();

    // Sucursal activa segÃºn reglas
    const [sucursal, setSucursal] = useState(branchIds.length === 1 ? branchIds[0] : '');
    const [allBranches, setAllBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [branchLoadError, setBranchLoadError] = useState('');
    const [servicios, setServicios] = useState([]);
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState('');
    const [view, setView] = useState(
        () => { try { const v = localStorage.getItem('mf-view-servicios'); return (v === 'table' || v === 'cards') ? v : 'cards'; } catch { return 'cards'; } }
    );
    const [search, setSearch] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filters, setFilters] = useState(() => ({ ...SERVICES_FILTER_DEFAULTS }));

    // Dialogo crear/editar
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null); // null => crear
    const [formValues, setFormValues] = useState(FORM_DEFAULTS);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    // Dialogo detalle
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailTarget, setDetailTarget] = useState(null);

    // Dialogo confirmar activar/inactivar
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [stateTarget, setStateTarget] = useState(null);
    const [stateLoading, setStateLoading] = useState(false);

    const branchNameById = useMemo(
        () => allBranches.reduce((acc, branch) => ({ ...acc, [branch.id_sucursal]: branch.nombre_sucursal }), {}),
        [allBranches]
    );

    const availableBranches = useMemo(() => {
        const scopedBranches = branchIds.length > 0
            ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal))
            : allBranches;
        return scopedBranches.filter((branch) => branch?.id_sucursal);
    }, [allBranches, branchIds]);

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

            if (filters.grupo !== 'all') {
                const normalizedGroup = String(servicio?.grupo_catalogo || '').trim().toLowerCase() === 'otros' ? 'otros' : 'barberia';
                if (normalizedGroup !== filters.grupo) return false;
            }

            if (!sucursal && filters.idSucursal !== 'all' && String(servicio?.id_sucursal || '') !== filters.idSucursal) {
                return false;
            }

            return true;
        });
    }, [filters, search, servicios, sucursal]);

    const activeFilterCount = useMemo(
        () => Object.values(filters).filter((value) => value !== 'all').length,
        [filters]
    );

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
        if (filters.grupo !== 'all') {
            chips.push({ key: 'grupo', label: SERVICE_GROUP_FILTER_LABELS[filters.grupo] || 'Grupo' });
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
        setLoadingBranches(true);
        setBranchLoadError('');
        listAdminSucursales()
            .then((data) => {
                if (cancelled) return;
                const payload = data?.data ?? data;
                setAllBranches(Array.isArray(payload?.sucursales) ? payload.sucursales : []);
            })
            .catch((err) => {
                if (cancelled) return;
                // AM: Evita bloqueo silencioso cuando no se pueden cargar sucursales para operar servicios.
                const message = extractMessage(err) || 'No se pudieron cargar las sucursales.';
                setBranchLoadError(message);
                notifications.error(message, { dedupeKey: 'servicios-branches-error' });
            })
            .finally(() => { if (!cancelled) setLoadingBranches(false); });
        return () => { cancelled = true; };
    }, [notifications]);

    useEffect(() => {
        // AM: Si el usuario solo puede operar una sucursal, se autoselecciona para evitar botones bloqueados.
        if (sucursal) return;

        if (branchIds.length === 1) {
            setSucursal(branchIds[0]);
            return;
        }

        // AM: Super admin con una sola sucursal activa queda operativo sin pasos extra.
        if (isSuperAdmin && allBranches.length === 1) {
            setSucursal(allBranches[0].id_sucursal);
        }
    }, [sucursal, branchIds, isSuperAdmin, allBranches]);

    useEffect(() => {
        if (!sucursal) return;
        // AM: Evita duplicar filtros por sucursal cuando ya existe sucursal global seleccionada.
        setFilters((prev) => (prev.idSucursal === 'all' ? prev : { ...prev, idSucursal: 'all' }));
    }, [sucursal]);

    // â”€â”€ Carga datos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const fetchServicios = useCallback(async ({ silent = false } = {}) => {
        if (!isSuperAdmin && !sucursal) return; // No llamar API sin sucursal excepto admin
        if (!silent) {
            setLoading(true);
            setListError('');
        }
        try {
            const data = await listAdminServicios(sucursal ? { id_sucursal: sucursal } : {});
            const payloadData = data?.data ?? data;
            const lista = payloadData?.servicios ?? [];
            setServicios(Array.isArray(lista) ? lista : []);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            if (!silent) {
                setListError(extractMessage(err));
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, [sucursal, navigate, isSuperAdmin]);

    useEffect(() => {
        void fetchServicios();
    }, [fetchServicios]);

    // â”€â”€ Handlers form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function handleFormChange(field, value) {
        setFormValues((prev) => ({ ...prev, [field]: value }));
    }

    function resolveMutationBranchId(servicio = null) {
        // AM: Para super admin sin filtro global, permite operar tomando la sucursal del registro.
        return sucursal || servicio?.id_sucursal || '';
    }

    function openCrear() {
        if (!sucursal) {
            notifications.warning('Selecciona una sucursal antes de crear un servicio.', {
                dedupeKey: 'servicios-create-branch-required',
            });
            return;
        }
        setEditTarget(null);
        setFormValues(FORM_DEFAULTS);
        setFormError('');
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
            duracion_min: String(servicio.duracion_min ?? ''),
            buffer_min: String(servicio.buffer_min ?? ''),
            precio_hnl: String(servicio.precio_hnl ?? ''),
            grupo_catalogo: String(servicio.grupo_catalogo || 'barberia').trim().toLowerCase() === 'otros' ? 'otros' : 'barberia',
            visible_publico: Boolean(servicio.visible_publico),
            agendable: Boolean(servicio.agendable),
            orden_visual: String(servicio.orden_visual ?? 100),
        });
        setFormError('');
        setDialogOpen(true);
    }

    async function handleGuardar() {
        const validationError = validateForm(formValues);
        if (validationError) { setFormError(validationError); return; }

        const mutationBranchId = editTarget?._mutation_branch_id || sucursal;
        if (!mutationBranchId) {
            setFormError('Selecciona o ingresa una sucursal antes de guardar.');
            return;
        }

        setFormLoading(true);
        setFormError('');

        const payload = {
            nombre_servicio: formValues.nombre_servicio.trim(),
            descripcion: formValues.descripcion.trim() || undefined,
            duracion_min: parseInt(formValues.duracion_min, 10),
            buffer_min: parseInt(formValues.buffer_min, 10),
            precio_hnl: parseFloat(formValues.precio_hnl),
            grupo_catalogo: formValues.grupo_catalogo,
            visible_publico: Boolean(formValues.visible_publico),
            agendable: Boolean(formValues.agendable),
            orden_visual: parseInt(formValues.orden_visual, 10),
            id_sucursal: mutationBranchId,
        };

        try {
            const response = editTarget
                ? await updateAdminServicio(editTarget.id_servicio ?? editTarget.id, payload)
                : await createAdminServicio(payload);
            const result = response?.data ?? response;
            if (editTarget) {
                notifications.success('Servicio actualizado.', { dedupeKey: 'servicios-save-ok' });
            } else {
                notifications.success('Servicio creado.', { dedupeKey: 'servicios-save-ok' });
            }
            if (result?.id_servicio) {
                setServicios((prev) => sortServicios(replaceItemById(prev, result, (entry) => entry?.id_servicio ?? entry?.id)));
            }
            // AM: Publica sincronizacion para que catalogo publico y otras vistas refresquen al instante.
            emitCatalogSync(editTarget ? 'servicio-updated' : 'servicio-created');
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

    function openDetail(servicio) {
        setDetailTarget(servicio || null);
        setDetailOpen(true);
    }

    function openConfirmState(servicio) {
        const mutationBranchId = resolveMutationBranchId(servicio);
        if (!mutationBranchId) {
            notifications.error('No se pudo determinar la sucursal del servicio para cambiar estado.', {
                dedupeKey: 'servicios-state-branch-required',
            });
            return;
        }

        setStateTarget({
            ...servicio,
            _nextActivo: !servicio?.activo,
            _mutation_branch_id: mutationBranchId,
        });
        setConfirmOpen(true);
    }

    async function handleConfirmState() {
        if (!stateTarget) return;
        const mutationBranchId = stateTarget?._mutation_branch_id || sucursal;
        if (!mutationBranchId) {
            notifications.error('No hay sucursal seleccionada.', { dedupeKey: 'servicios-state-no-branch' });
            return;
        }

        setStateLoading(true);
        try {
            const payload = {
                activo: Boolean(stateTarget._nextActivo),
                id_sucursal: mutationBranchId,
            };

            if (payload.activo && Number.isFinite(Number(stateTarget.precio_hnl))) {
                payload.precio_hnl = Number(stateTarget.precio_hnl);
            }

            const response = await setAdminServicioEstado(stateTarget.id_servicio ?? stateTarget.id, payload);
            const result = response?.data ?? response;

            if (result?.id_servicio) {
                setServicios((prev) => sortServicios(replaceItemById(prev, result, (entry) => entry?.id_servicio ?? entry?.id)));
            }

            notifications.success(payload.activo ? 'Servicio activado.' : 'Servicio inactivado.', {
                dedupeKey: 'servicios-state-ok',
            });
            // AM: Publica sincronizacion para reflejar activacion/inactivacion en catalogo publico de inmediato.
            emitCatalogSync(payload.activo ? 'servicio-activated' : 'servicio-inactivated');
            setConfirmOpen(false);
            setStateTarget(null);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            notifications.error(extractMessage(err), { dedupeKey: 'servicios-state-error' });
        } finally {
            setStateLoading(false);
        }
    }

    // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sinSucursal = !sucursal;

    // â”€â”€ Vista Cards de servicios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function ServicioCards() {
        return (
            <CardsCarousel
                items={filteredServicios}
                getItemKey={(servicio) => servicio?.id_servicio ?? servicio?.id}
                renderItem={(s, i, pageIndex) => (
                    <DataCard
                        key={s.id_servicio ?? s.id}
                        animationDelay={(pageIndex * 0.02) + (i * 0.05)}
                        avatar={<Scissors size={18} />}
                        title={s.nombre_servicio}
                        subtitle={s.descripcion}
                        badge={
                            <ServiceStatusBadge activo={Boolean(s.activo)} />
                        }
                        fields={[
                            { label: 'Precio', value: <span className="font-mono font-bold text-[var(--mf-accent)]">L {Number(s.precio_hnl).toFixed(2)}</span> },
                            { label: 'Duracion', value: `${s.duracion_min} min` },
                            { label: 'Buffer', value: `${s.buffer_min} min` },
                            { label: 'Grupo', value: <ServiceGroupBadge grupo={s.grupo_catalogo} /> },
                            { label: 'Agendable', value: <ServiceAgendableBadge agendable={Boolean(s.agendable)} /> },
                            { label: 'Tarifa', value: <span className={`mf-badge ${s.tarifa_activa ? 'mf-badge-gold' : 'mf-badge-muted'}`}>{s.tarifa_activa ? 'Activa' : 'Sin tarifa'}</span> },
                            { label: 'Publico', value: <ServiceVisibilityBadge visiblePublico={Boolean(s.visible_publico)} /> },
                        ]}
                        actions={
                            <>
                                <HoverActionButton
                                    icon={<Eye size={14} strokeWidth={2} />}
                                    label="Ver detalle"
                                    title="Ver detalle de servicio"
                                    onClick={() => openDetail(s)}
                                />
                                <HoverActionButton
                                    icon={<Pencil size={14} strokeWidth={2} />}
                                    label="Editar"
                                    title="Editar servicio"
                                    disabled={!resolveMutationBranchId(s)}
                                    onClick={() => openEditar(s)}
                                />
                                <HoverActionButton
                                    icon={s.activo ? <ToggleLeft size={14} strokeWidth={2} /> : <ToggleRight size={14} strokeWidth={2} />}
                                    label={s.activo ? 'Inactivar' : 'Activar'}
                                    title={s.activo ? 'Inactivar servicio' : 'Activar servicio'}
                                    tone={s.activo ? 'warning' : 'success'}
                                    disabled={!resolveMutationBranchId(s)}
                                    onClick={() => openConfirmState(s)}
                                />
                            </>
                        }
                    />
                )}
            />
        );
    }

    return (
        <div className="mf-page">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
                        Catalogo - Servicios
                    </p>
                    <h1 className="mf-font-display mt-1 text-3xl leading-tight text-[var(--mf-text)]">
                        Servicios
                    </h1>
                </div>
                {/* AM: Header compacto alineado al patron de PERSONAS para mantener consistencia visual y operativa. */}
                <div className="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
                    <span className="text-sm text-[var(--mf-text-2)]">
                        {loading ? 'Cargando...' : `${filteredServicios.length} de ${servicios.length} servicio(s)`}
                    </span>
                    <ViewToggle defaultView={view} onViewChange={setView} storageKey="servicios" />
                    <div className="relative min-w-[190px] flex-1 sm:flex-none sm:w-[260px]">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mf-text-2)]" />
                        <Input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar por nombre o descripcion..."
                            className="h-9 rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_72%,transparent)] pl-9 pr-9 text-sm"
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
                        size="sm"
                        onClick={() => setFiltersOpen(true)}
                        className="group gap-2 rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_76%,transparent)] transition-all duration-200 hover:-translate-y-0.5"
                    >
                        <SlidersHorizontal size={14} />
                        Filtros
                        {activeFilterCount > 0 ? (
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--mf-accent)] px-1.5 text-[10px] font-semibold text-[var(--mf-bg)]">
                                {activeFilterCount}
                            </span>
                        ) : null}
                    </Button>
                    {(activeFilterCount > 0 || search.trim()) ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            className="gap-1.5 rounded-full border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_52%,transparent)] text-[var(--mf-text-2)] hover:text-[var(--mf-text)]"
                        >
                            <RotateCcw size={13} />
                            Limpiar
                        </Button>
                    ) : null}
                    <Button onClick={openCrear} size="sm" className="gap-2">
                        <Plus size={15} strokeWidth={2.2} /> Nuevo
                    </Button>
                </div>
            </div>

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

            <div className="mf-divider" />

            {/* Selector de sucursal (por nombre) */}
            <div className="rounded-[20px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-5">
                <SucursalSelector
                    branchIds={branchIds}
                    allBranches={allBranches}
                    selected={sucursal}
                    onChange={setSucursal}
                    loadingBranches={loadingBranches}
                />
            </div>

            {/* Aviso sin sucursal */}
            {sinSucursal && (
                <div className="flex items-center gap-3 rounded-[16px] border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-400">
                    <span>Selecciona una sucursal para crear, editar o cambiar estado de servicios.</span>
                </div>
            )}
            {branchLoadError && <ErrorBanner message={branchLoadError} />}

            {/* Estados */}
            {listError && <ErrorBanner message={listError} onRetry={fetchServicios} />}
            {loading && !listError && <LoadingSpinner />}

            {!loading && !listError && servicios.length === 0 && (!sinSucursal || isSuperAdmin) && (
                <EmptyState
                    icon={Scissors}
                    title="Sin servicios"
                    description={sinSucursal ? 'No hay servicios registrados aun.' : 'No hay servicios registrados para esta sucursal.'}
                />
            )}
            {!loading && !listError && servicios.length > 0 && filteredServicios.length === 0 && (
                <EmptyState icon={Search} title="Sin resultados" description="No hay coincidencias con la busqueda o filtros actuales." />
            )}

            {/* Datos */}
            {!loading && !listError && filteredServicios.length > 0 && (
                view === 'cards' ? <ServicioCards /> :
                    <div className="mf-table-wrap">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-[var(--mf-nav-border)]">
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                                    {!sucursal && <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursal</TableHead>}
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Grupo</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden lg:table-cell">Agendable</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Dur (min)</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Buffer</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Precio HNL</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Publico</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Estado</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden sm:table-cell">Tarifa</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredServicios.map((s) => (
                                    <TableRow
                                        key={s.id_servicio ?? s.id}
                                        className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors"
                                    >
                                        <TableCell className="font-medium text-[var(--mf-text)]">
                                            <div>{s.nombre_servicio}</div>
                                            {s.descripcion && (
                                                <div className="text-xs text-[var(--mf-text-2)] mt-0.5">{s.descripcion}</div>
                                            )}
                                        </TableCell>
                                        {!sucursal && (
                                            <TableCell className="text-[var(--mf-text-2)] text-sm whitespace-nowrap">
                                                {branchNameById[s.id_sucursal] || <span className="opacity-50">Global</span>}
                                            </TableCell>
                                        )}
                                        <TableCell className="text-[var(--mf-text-2)] text-sm">
                                            {resolveGrupoLabel(s.grupo_catalogo)}
                                        </TableCell>
                                        <TableCell className="text-center hidden lg:table-cell">
                                            <ServiceAgendableBadge agendable={Boolean(s.agendable)} />
                                        </TableCell>
                                        <TableCell className="text-center text-[var(--mf-text-2)]">{s.duracion_min}</TableCell>
                                        <TableCell className="text-center text-[var(--mf-text-2)]">{s.buffer_min}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold text-[var(--mf-accent)]">
                                            L {Number(s.precio_hnl).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <ServiceVisibilityBadge visiblePublico={Boolean(s.visible_publico)} />
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <ServiceStatusBadge activo={Boolean(s.activo)} />
                                        </TableCell>
                                        <TableCell className="text-center hidden sm:table-cell">
                                            <span className={`mf-badge ${s.tarifa_activa ? 'mf-badge-gold' : 'mf-badge-muted'}`}>
                                                {s.tarifa_activa ? 'Activa' : '-'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <HoverActionButton
                                                    icon={<Eye size={14} strokeWidth={2} />}
                                                    label="Detalle"
                                                    title="Ver detalle de servicio"
                                                    onClick={() => openDetail(s)}
                                                />
                                                <HoverActionButton
                                                    icon={<Pencil size={14} strokeWidth={2} />}
                                                    label="Editar"
                                                    title="Editar servicio"
                                                    disabled={!resolveMutationBranchId(s)}
                                                    onClick={() => openEditar(s)}
                                                />
                                                <HoverActionButton
                                                    icon={s.activo ? <ToggleLeft size={14} strokeWidth={2} /> : <ToggleRight size={14} strokeWidth={2} />}
                                                    label={s.activo ? 'Inactivar' : 'Activar'}
                                                    title={s.activo ? 'Inactivar servicio' : 'Activar servicio'}
                                                    tone={s.activo ? 'warning' : 'success'}
                                                    disabled={!resolveMutationBranchId(s)}
                                                    onClick={() => openConfirmState(s)}
                                                />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
            )}

            {/* Dialog Crear / Editar */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
                    </DialogHeader>
                    <ServicioForm values={formValues} onChange={handleFormChange} />
                    {formError && (
                        <ErrorBanner message={formError} />
                    )}
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>
                            Cancelar
                        </Button>
                        <Button onClick={handleGuardar} disabled={formLoading} className="gap-2 min-w-[120px]">
                            {formLoading ? 'Guardandoâ€¦' : editTarget ? 'Guardar cambios' : 'Crear servicio'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Detalle de servicio</DialogTitle>
                    </DialogHeader>
                    {detailTarget && (
                        <DetailInfoModalContent
                            summary={{
                                icon: <Scissors size={16} />,
                                title: detailTarget.nombre_servicio || '-',
                                subtitle: detailTarget.descripcion || 'Sin descripcion',
                                badge: <ServiceStatusBadge activo={Boolean(detailTarget.activo)} />,
                            }}
                            sections={[
                                {
                                    id: 'operativo',
                                    title: 'Configuracion operativa',
                                    icon: <Tags size={14} />,
                                    fields: [
                                        { label: 'Grupo', value: resolveGrupoLabel(detailTarget.grupo_catalogo) },
                                        { label: 'Agendable', value: detailTarget.agendable ? 'Si' : 'No' },
                                        { label: 'Visible publico', value: detailTarget.visible_publico ? 'Si' : 'No' },
                                        { label: 'Orden visual', value: detailTarget.orden_visual ?? 100 },
                                    ],
                                },
                                {
                                    id: 'tiempo',
                                    title: 'Tiempo y tarifa',
                                    icon: <ToggleRight size={14} />,
                                    fields: [
                                        { label: 'Duracion', value: `${detailTarget.duracion_min ?? 0} min` },
                                        { label: 'Buffer', value: `${detailTarget.buffer_min ?? 0} min` },
                                        { label: 'Precio HNL', value: `L ${Number(detailTarget.precio_hnl ?? 0).toFixed(2)}` },
                                        { label: 'Tarifa activa', value: detailTarget.tarifa_activa ? 'Si' : 'No' },
                                    ],
                                },
                                {
                                    id: 'sucursal',
                                    title: 'Sucursal',
                                    icon: <Building2 size={14} />,
                                    fields: [
                                        { label: 'Sucursal', value: detailTarget.id_sucursal ? (branchNameById[detailTarget.id_sucursal] || detailTarget.id_sucursal) : 'No definida' },
                                        { label: 'ID servicio', value: detailTarget.id_servicio || '-' },
                                    ],
                                },
                            ]}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Filtros de Servicios</DialogTitle>
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
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setFilters((prev) => ({ ...prev, grupo: prev.grupo === 'barberia' ? 'all' : 'barberia' }))}
                            className={quickFilterButtonClass(filters.grupo === 'barberia')}
                        >
                            Grupo barberia
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
                        <div>
                            <Label className="mf-label">Grupo</Label>
                            <select
                                className="mf-select mt-1"
                                value={filters.grupo}
                                onChange={(event) => setFilters((prev) => ({ ...prev, grupo: event.target.value }))}
                            >
                                <option value="all">Todos</option>
                                <option value="barberia">Barberia</option>
                                <option value="otros">Otros</option>
                            </select>
                        </div>
                        {!sucursal ? (
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
                                La sucursal ya esta fijada en el selector superior.
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
                open={confirmOpen}
                onOpenChange={(open) => {
                    if (!open && !stateLoading) {
                        setConfirmOpen(false);
                        setStateTarget(null);
                    }
                }}
                tone={stateTarget?._nextActivo ? 'warning' : 'danger'}
                title={stateTarget?._nextActivo ? 'Activar servicio' : 'Inactivar servicio'}
                description={
                    stateTarget
                        ? `Se ${stateTarget._nextActivo ? 'activara' : 'inactivara'} ${stateTarget.nombre_servicio}.`
                        : ''
                }
                confirmLabel={stateTarget?._nextActivo ? 'Activar' : 'Inactivar'}
                cancelLabel="Cancelar"
                loading={stateLoading}
                onConfirm={handleConfirmState}
            />
        </div>
    );
}

