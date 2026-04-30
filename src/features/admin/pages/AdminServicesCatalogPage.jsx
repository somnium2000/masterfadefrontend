// src/features/admin/pages/AdminServicesCatalogPage.jsx
// A3 - Pantalla CRUD de catalogo de servicios (Admin).
// Logica de branchIds: 1 => auto, 2+ => selector por nombre, 0 => dropdown de todas.

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Pencil, Building2, Scissors, Eye, ToggleLeft, ToggleRight, Tags, Search, SlidersHorizontal, RotateCcw, X } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
    listAdminServicios,
    createAdminServicio,
    updateAdminServicio,
    setAdminServicioEstado,
    getAdminServicioBarberos,
    saveAdminServicioBarberos,
} from '../lib/adminCatalogApi.js';
import { listAdminSucursales } from '../lib/adminSucursalesApi.js';
import { Button } from '../../../components/ui/button.jsx';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
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
import { emitCatalogSync } from '../../../lib/catalogSync.js';

function extractMessage(err) {
    const apiMessage = err?.data?.error?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage.trim();
    return 'No se pudo completar la operación de servicios.';
}

function getPendingAppointmentsWarning(err) {
    const code = err?.data?.error?.code;
    if (code !== 'CATALOG_SERVICE_PENDING_APPOINTMENTS_CONFIRMATION_REQUIRED') return null;
    const total = Number(err?.data?.error?.details?.total_citas_futuras ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
        return 'Este servicio tiene citas futuras asociadas. Confirma nuevamente para inactivarlo.';
    }
    return `Este servicio tiene ${total} cita(s) futura(s) asociada(s). Si continúas, quedará inactivo para agendamiento/catálogo pero se conservará en esas citas ya creadas.`;
}

/**
 * branchIds  = UUIDs del usuario autenticado (de AuthContext)
 * allBranches = [{id_sucursal, nombre_sucursal}] de la API
 * selected   = UUID actualmente seleccionado
 * onChange   = cb(uuid)
 */
function SucursalSelector({ branchIds, allBranches, selected, onChange, loadingBranches }) {
    // AM: Replica el selector premium del submodulo Paquetes para consistencia visual total.
    const availableBranches = branchIds.length > 0
        ? allBranches.filter((branch) => branchIds.includes(branch.id_sucursal))
        : allBranches;
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
                <option value="">- Seleccionar sucursal -</option>
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
    grupo_catalogo: 'barberia',
    visible_publico: true,
    servicio_informativo: false,
    orden_visual: '100',
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
    // AM: Estilo consistente con PERSONAS para que filtros activos sean evidentes en escritorio y móvil.
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
                    <Label htmlFor="f-grupo">Grupo *</Label>
                    <select
                        id="f-grupo"
                        className="mf-select"
                        value={values.grupo_catalogo}
                        onChange={(e) => onChange('grupo_catalogo', e.target.value)}
                    >
                        <option value="barberia">Barberia</option>
                        <option value="otros">Otros</option>
                    </select>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>
    );
}

function validateForm(values) {
    if (!values.nombre_servicio.trim()) return 'El nombre del servicio es requerido.';
    const dur = parseInt(values.duracion_min, 10);
    if (isNaN(dur) || dur < 1) return 'La Duración debe ser al menos 1 minuto.';
    const precio = parseFloat(values.precio_hnl);
    if (isNaN(precio) || precio < 0) return 'El precio no puede ser negativo.';
    const orden = parseInt(values.orden_visual, 10);
    if (isNaN(orden) || orden < 0) return 'El orden visual no puede ser negativo.';
    return null;
}

function resolveGrupoLabel(grupo) {
    return String(grupo || '').trim().toLowerCase() === 'otros' ? 'Otros servicios' : 'Barberia';
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

function ServiceGroupBadge({ grupo }) {
    const normalized = String(grupo || '').trim().toLowerCase() === 'otros' ? 'otros' : 'barberia';
    return (
        <span className={`mf-badge ${normalized === 'otros' ? 'mf-badge-muted' : 'mf-badge-gold'}`}>
            {normalized === 'otros' ? 'Otros' : 'Barberia'}
        </span>
    );
}

function buildServicioScopeKey(servicio) {
    const serviceId = String(servicio?.id_servicio ?? servicio?.id ?? '').trim() || 'servicio';
    const branchId = String(servicio?.id_sucursal ?? '').trim() || 'all';
    return `${serviceId}:${branchId}`;
}

function formatServicePrice(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) return 'Sin tarifa';
    return `L ${numeric.toFixed(2)}`;
}

export default function AdminServicesCatalogPage() {
    const navigate = useNavigate();
    const { branchIds, roles } = useAuth();
    const isSuperAdmin = Array.isArray(roles) && roles.includes('super_admin');
    const notifications = useNotifications();

    // Sucursal activa según reglas
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
    const [serviceBarberAssignments, setServiceBarberAssignments] = useState(SERVICE_BARBER_ASSIGNMENTS_DEFAULTS);

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
        listAdminSucursales({ soloActivas: true })
            .then((data) => {
                if (cancelled) return;
                const payload = data?.data ?? data;
                const nextBranches = Array.isArray(payload?.sucursales)
                    ? payload.sucursales.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
                    : [];
                setAllBranches(nextBranches);
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
            // AM: Evita mantener datos viejos cuando falla el filtro por sucursal.
            setServicios([]);
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
        if (field === 'servicio_informativo' && !value) {
            setServiceBarberAssignments(SERVICE_BARBER_ASSIGNMENTS_DEFAULTS);
        }
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
            duracion_min: String(servicio.duracion_min ?? ''),
            precio_hnl: String(servicio.precio_hnl ?? ''),
            grupo_catalogo: String(servicio.grupo_catalogo || 'barberia').trim().toLowerCase() === 'otros' ? 'otros' : 'barberia',
            visible_publico: Boolean(servicio.visible_publico),
            servicio_informativo: Boolean(servicio.servicio_informativo),
            orden_visual: String(servicio.orden_visual ?? 100),
        });
        setFormError('');
        setDialogOpen(true);
    }

    useEffect(() => {
        if (!dialogOpen || !editTarget || !isSuperAdmin || !formValues.servicio_informativo) {
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
    }, [dialogOpen, editTarget, formValues.servicio_informativo, isSuperAdmin]);

    async function handleGuardar() {
        const validationError = validateForm(formValues);
        if (validationError) { setFormError(validationError); return; }

        if (isSuperAdmin && editTarget && formValues.servicio_informativo) {
            if (serviceBarberAssignments.loading) {
                setFormError('Espera a que termine de cargar la asignacion de barberos.');
                return;
            }
            if (serviceBarberAssignments.error) {
                setFormError('No se pudo validar la asignacion de barberos. Recarga el modal antes de guardar.');
                return;
            }
        }

        const mutationBranchId = editTarget?._mutation_branch_id || sucursal;
        if (!mutationBranchId) {
            setFormError('Selecciona o ingresa una sucursal antes de guardar.');
            return;
        }

        setFormLoading(true);
        setFormError('');

        const createPayload = {
            nombre_servicio: formValues.nombre_servicio.trim(),
            descripcion: formValues.descripcion.trim() || null,
            duracion_min: parseInt(formValues.duracion_min, 10),
            precio_hnl: parseFloat(formValues.precio_hnl),
            grupo_catalogo: String(formValues.grupo_catalogo || 'barberia').trim().toLowerCase() === 'otros' ? 'otros' : 'barberia',
            orden_visual: parseInt(formValues.orden_visual, 10),
            visible_publico: Boolean(formValues.visible_publico),
            servicio_informativo: Boolean(formValues.servicio_informativo),
            id_sucursal: mutationBranchId,
        };
        const editPayload = {
            nombre_servicio: formValues.nombre_servicio.trim(),
            descripcion: formValues.descripcion.trim() || null,
            duracion_min: parseInt(formValues.duracion_min, 10),
            precio_hnl: parseFloat(formValues.precio_hnl),
            grupo_catalogo: String(formValues.grupo_catalogo || 'barberia').trim().toLowerCase() === 'otros' ? 'otros' : 'barberia',
            orden_visual: parseInt(formValues.orden_visual, 10),
            visible_publico: Boolean(formValues.visible_publico),
            servicio_informativo: Boolean(formValues.servicio_informativo),
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

            if (isSuperAdmin && editTarget && formValues.servicio_informativo) {
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
                if (isSuperAdmin) {
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
            _forcePendingAppointmentsConfirm: false,
            _pendingAppointmentsWarning: '',
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
            if (!payload.activo && stateTarget?._forcePendingAppointmentsConfirm) {
                payload.confirmar_citas_pendientes = true;
            }

            if (payload.activo && Number.isFinite(Number(stateTarget.precio_hnl))) {
                payload.precio_hnl = Number(stateTarget.precio_hnl);
            }

            await setAdminServicioEstado(stateTarget.id_servicio ?? stateTarget.id, payload);

            notifications.success(payload.activo ? 'Servicio activado.' : 'Servicio inactivado.', {
                dedupeKey: 'servicios-state-ok',
            });
            // AM: Publica sincronizacion para reflejar activacion/inactivacion en catalogo publico de inmediato.
            emitCatalogSync(payload.activo ? 'servicio-activated' : 'servicio-inactivated');
            await fetchServicios();
            setConfirmOpen(false);
            setStateTarget(null);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            const pendingWarning = getPendingAppointmentsWarning(err);
            if (pendingWarning && !stateTarget?._nextActivo) {
                setStateTarget((prev) => (prev ? ({
                    ...prev,
                    _forcePendingAppointmentsConfirm: true,
                    _pendingAppointmentsWarning: pendingWarning,
                }) : prev));
                notifications.warning(pendingWarning, { dedupeKey: 'servicios-state-pending-appointments' });
                return;
            }
            notifications.error(extractMessage(err), { dedupeKey: 'servicios-state-error' });
        } finally {
            setStateLoading(false);
        }
    }

    // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const sinSucursal = !sucursal;
    // AM: Bloquea acciones hasta seleccionar sucursal cuando hay multiples disponibles.
    const actionsLockedByBranch = !sucursal && availableBranches.length > 1;
    const titleSubtitle = !sucursal && availableBranches.length > 1
        ? 'Selecciona una sucursal para crear, editar o cambiar estado de servicios.'
        : 'Gestiona servicios por sucursal con configuración operativa.';
    // AM: Requisito de operacion: mostrar siempre servicios agendables e informativos en la misma vista por sucursal.
    const visibleServicios = useMemo(() => filteredServicios, [filteredServicios]);
    const modeLabel = 'servicios';

    // â”€â”€ Vista Cards de servicios â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function ServicioCards() {
        return (
            <CardsCarousel
                items={visibleServicios}
                getItemKey={(servicio) => buildServicioScopeKey(servicio)}
                showHeaderTag={false}
                renderItem={(s, i, pageIndex) => (
                    <DataCard
                        key={buildServicioScopeKey(s)}
                        animationDelay={(pageIndex * 0.02) + (i * 0.05)}
                        avatar={<Scissors size={20} />}
                        title={s.nombre_servicio}
                        subtitle={s.descripcion}
                        badge={
                            <div className="flex items-center gap-1.5">
                                <ServiceTypeBadge informativo={Boolean(s.servicio_informativo)} />
                                <ServiceStatusBadge activo={Boolean(s.activo)} />
                            </div>
                        }
                        fields={[
                            { label: 'Tipo', value: s.servicio_informativo ? 'Informativo' : 'Agendable' },
                            { label: 'Precio', value: <span className="font-mono font-bold text-[var(--mf-accent)]">{formatServicePrice(s.precio_hnl)}</span> },
                            { label: 'Duracion', value: `${s.duracion_min} min` },
                            ...(isSuperAdmin ? [{ label: 'Barberos', value: summarizeAssignedBarbers(s.barberos_ofrecen) }] : []),
                            { label: 'Orden visual', value: Number(s.orden_visual ?? 100) },
                        ]}
                        actions={
                            <>
                                <HoverActionButton
                                    icon={<Eye size={16} strokeWidth={2} />}
                                    label="Ver detalle"
                                    title="Ver detalle de servicio"
                                    disabled={actionsLockedByBranch}
                                    onClick={() => openDetail(s)}
                                />
                                <HoverActionButton
                                    icon={<Pencil size={16} strokeWidth={2} />}
                                    label="Editar"
                                    title="Editar servicio"
                                    disabled={actionsLockedByBranch || !resolveMutationBranchId(s)}
                                    onClick={() => openEditar(s)}
                                />
                                <HoverActionButton
                                    icon={s.activo ? <ToggleLeft size={16} strokeWidth={2} /> : <ToggleRight size={16} strokeWidth={2} />}
                                    label={s.activo ? 'Inactivar' : 'Activar'}
                                    title={s.activo ? 'Inactivar servicio' : 'Activar servicio'}
                                    tone={s.activo ? 'warning' : 'success'}
                                    disabled={actionsLockedByBranch || !resolveMutationBranchId(s)}
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
        <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
            <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Catalogo - Servicios</p>
                            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Servicios</h1>
                            <p className="text-sm text-[var(--mf-text-2)]">{titleSubtitle}</p>
                        </div>
                        <SucursalSelector
                            branchIds={branchIds}
                            allBranches={allBranches}
                            selected={sucursal}
                            onChange={setSucursal}
                            loadingBranches={loadingBranches}
                        />
                        {branchLoadError && <ErrorBanner message={branchLoadError} />}
                    </div>

                    <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm text-[var(--mf-text-2)]">
                                    {loading ? 'Cargando...' : `${visibleServicios.length} ${modeLabel}`}
                                </p>
                                <div className="flex items-center gap-3">
                                <ViewToggle defaultView={view} onViewChange={setView} storageKey="servicios" />
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
            {listError && <ErrorBanner message={listError} onRetry={fetchServicios} />}
            {loading && !listError && <LoadingSpinner />}

            {!loading && !listError && servicios.length === 0 && (!sinSucursal || isSuperAdmin) && (
                <EmptyState
                    icon={Scissors}
                    title="Sin servicios"
                    description={sinSucursal ? 'No hay servicios registrados aun.' : 'No hay servicios registrados para esta sucursal.'}
                />
            )}
            {!loading && !listError && servicios.length > 0 && visibleServicios.length === 0 && (
                <EmptyState icon={Search} title="Sin resultados" description="No hay coincidencias con la busqueda o filtros actuales." />
            )}

            {/* Datos */}
            {!loading && !listError && visibleServicios.length > 0 && (
                view === 'cards' ? <ServicioCards /> :
                    <div className="mf-table-wrap">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-[var(--mf-nav-border)]">
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                                    {!sucursal && <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursal</TableHead>}
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Tipo</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Grupo</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden lg:table-cell">Agendable</TableHead>
                                    {isSuperAdmin ? (
                                        <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] hidden xl:table-cell">Barberos</TableHead>
                                    ) : null}
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Dur (min)</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Orden</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Precio HNL</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Publico</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Estado</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden sm:table-cell">Tarifa</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {visibleServicios.map((s) => (
                                    <TableRow
                                        key={buildServicioScopeKey(s)}
                                        className={`border-[var(--mf-nav-border)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] ${
                                            s.servicio_informativo
                                                ? 'bg-[color:color-mix(in_srgb,#2a405f_16%,var(--mf-card))]'
                                                : ''
                                        }`}
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
                                        <TableCell className="text-center">
                                            <ServiceTypeBadge informativo={Boolean(s.servicio_informativo)} />
                                        </TableCell>
                                        <TableCell className="text-[var(--mf-text-2)] text-sm">
                                            {resolveGrupoLabel(s.grupo_catalogo)}
                                        </TableCell>
                                        <TableCell className="text-center hidden lg:table-cell">
                                            <ServiceAgendableBadge agendable={Boolean(s.agendable)} />
                                        </TableCell>
                                        {isSuperAdmin ? (
                                            <TableCell className="hidden xl:table-cell text-sm text-[var(--mf-text-2)]">
                                                <div className="space-y-1">
                                                    <div className="font-medium text-[var(--mf-text)]">
                                                        {Number(s.barberos_ofrecen_total ?? 0)} asignado(s)
                                                    </div>
                                                    <div>{summarizeAssignedBarbers(s.barberos_ofrecen, 1)}</div>
                                                </div>
                                            </TableCell>
                                        ) : null}
                                        <TableCell className="text-center text-[var(--mf-text-2)]">{s.duracion_min}</TableCell>
                                        <TableCell className="text-center text-[var(--mf-text-2)]">{Number(s.orden_visual ?? 100)}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold text-[var(--mf-accent)]">
                                            {formatServicePrice(s.precio_hnl)}
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
                                                    icon={<Eye size={16} strokeWidth={2} />}
                                                    label="Detalle"
                                                    title="Ver detalle de servicio"
                                                    disabled={actionsLockedByBranch}
                                                    onClick={() => openDetail(s)}
                                                />
                                                <HoverActionButton
                                                    icon={<Pencil size={16} strokeWidth={2} />}
                                                    label="Editar"
                                                    title="Editar servicio"
                                                    disabled={actionsLockedByBranch || !resolveMutationBranchId(s)}
                                                    onClick={() => openEditar(s)}
                                                />
                                                <HoverActionButton
                                                    icon={s.activo ? <ToggleLeft size={16} strokeWidth={2} /> : <ToggleRight size={16} strokeWidth={2} />}
                                                    label={s.activo ? 'Inactivar' : 'Activar'}
                                                    title={s.activo ? 'Inactivar servicio' : 'Activar servicio'}
                                                    tone={s.activo ? 'warning' : 'success'}
                                                    disabled={actionsLockedByBranch || !resolveMutationBranchId(s)}
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
                <DialogContent className={`w-[calc(100vw-1rem)] max-h-[calc(100vh-1.5rem)] overflow-y-auto ${isSuperAdmin && editTarget ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}>
                    <DialogHeader>
                        <DialogTitle>{editTarget ? 'Editar servicio' : 'Nuevo servicio'}</DialogTitle>
                        <DialogDescription className="sr-only">
                            Configura nombre, duracion, precio y visibilidad del servicio por sucursal.
                        </DialogDescription>
                    </DialogHeader>
                    <div className={`grid gap-5 ${isSuperAdmin && editTarget ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]' : 'grid-cols-1'}`}>
                        <ServicioForm values={formValues} onChange={handleFormChange} />

                        {isSuperAdmin && Boolean(formValues.servicio_informativo) ? (
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
                            disabled={formLoading || (isSuperAdmin && editTarget && Boolean(formValues.servicio_informativo) && serviceBarberAssignments.loading)}
                            className="gap-2 min-w-[120px]"
                        >
                            {formLoading ? 'Guardando...' : editTarget ? 'Guardar cambios' : 'Crear servicio'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Detalle de servicio</DialogTitle>
                        <DialogDescription className="sr-only">
                            Consulta los datos operativos y comerciales del servicio seleccionado.
                        </DialogDescription>
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
                                    title: 'Configuración operativa',
                                    icon: <Tags size={14} />,
                                    fields: [
                                        { label: 'Tipo', value: detailTarget.servicio_informativo ? 'Informativo' : 'Agendable' },
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
                                        { label: 'Precio HNL', value: formatServicePrice(detailTarget.precio_hnl) },
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
                                        ...(isSuperAdmin ? [{ label: 'Barberos asignados', value: summarizeAssignedBarbers(detailTarget.barberos_ofrecen, 3) }] : []),
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
                title={
                    stateTarget?._nextActivo
                        ? 'Activar servicio'
                        : stateTarget?._forcePendingAppointmentsConfirm
                            ? 'Confirmar inactivación con citas pendientes'
                            : 'Inactivar servicio'
                }
                description={
                    stateTarget
                        ? (
                            stateTarget?._nextActivo
                                ? `Se activara ${stateTarget.nombre_servicio}.`
                                : stateTarget?._pendingAppointmentsWarning
                                    || `Se inactivara ${stateTarget.nombre_servicio}.`
                        )
                        : ''
                }
                confirmLabel={
                    stateTarget?._nextActivo
                        ? 'Activar'
                        : stateTarget?._forcePendingAppointmentsConfirm
                            ? 'Sí, inactivar'
                            : 'Inactivar'
                }
                cancelLabel="Cancelar"
                loading={stateLoading}
                onConfirm={handleConfirmState}
            />
        </div>
    );
}


