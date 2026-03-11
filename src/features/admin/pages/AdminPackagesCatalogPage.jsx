// src/features/admin/pages/AdminPackagesCatalogPage.jsx
// AM: Catalogo administrativo de paquetes alineado al patron operativo de SERVICIOS.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Loader2,
    Plus,
    Pencil,
    Package,
    Eye,
    ToggleLeft,
    ToggleRight,
    Tags,
    Building2,
    Search,
    SlidersHorizontal,
    RotateCcw,
    X,
    Scissors,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
    listAdminPaquetes,
    createAdminPaquete,
    updateAdminPaquete,
    setAdminPaqueteEstado,
} from '../lib/adminPackagesApi.js';
import { listAdminServicios } from '../lib/adminCatalogApi.js';
import { listAdminSucursales } from '../lib/adminSucursalesApi.js';
import { Button } from '../../../components/ui/button.jsx';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
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
    return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

const FORM_DEFAULTS = {
    nombre_paquete: '',
    descripcion: '',
    precio_hnl: '',
    items: [],
};

const PACKAGE_FILTER_DEFAULTS = {
    estado: 'all',
    visibilidad: 'all',
    composicion: 'all',
    idSucursal: 'all',
};

const PACKAGE_STATE_FILTER_LABELS = {
    activo: 'Estado: Activo',
    inactivo: 'Estado: Inactivo',
};

const PACKAGE_VISIBILITY_FILTER_LABELS = {
    visible: 'Publico: Visible',
    oculto: 'Publico: Oculto',
};

const PACKAGE_COMPOSITION_FILTER_LABELS = {
    simple: 'Composicion: Simple',
    combo: 'Composicion: Combo',
};

function quickFilterButtonClass(isActive) {
    // AM: Mantiene feedback visual uniforme con filtros de PERSONAS y SERVICIOS.
    return isActive
        ? 'rounded-full border-[var(--mf-accent)] bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
        : 'rounded-full border-[var(--mf-btn-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_54%,transparent)] text-[var(--mf-text)] hover:border-[var(--mf-accent)]/60';
}

function SucursalSelector({ branchIds, allBranches, selected, onChange, loadingBranches }) {
    // AM: Selector reutilizado del patron de SERVICIOS para operar catalogo por sucursal sin bloqueos silenciosos.
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
            <Label htmlFor="pkg-branch" className="text-xs uppercase tracking-widest text-[var(--mf-text-2)] sm:shrink-0">
                Sucursal
            </Label>
            <select
                id="pkg-branch"
                className="mf-select h-10 w-full sm:h-9 sm:min-w-[220px] sm:w-auto"
                value={selected}
                onChange={(event) => {
                    const nextValue = String(event.target.value || '').trim();
                    // AM: Previene enviar placeholders como id_sucursal en consultas del catalogo.
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

function PackageStatusBadge({ activo }) {
    return (
        <span className={`mf-badge ${activo ? 'mf-badge-green' : 'mf-badge-red'}`}>
            {activo ? 'Activo' : 'Inactivo'}
        </span>
    );
}

function PackageVisibilityBadge({ visiblePublico }) {
    return (
        <span className={`mf-badge ${visiblePublico ? 'mf-badge-green' : 'mf-badge-muted'}`}>
            {visiblePublico ? 'Visible' : 'Oculto'}
        </span>
    );
}

function PackageCompositionBadge({ itemsCount }) {
    const isCombo = Number(itemsCount) > 1;
    return (
        <span className={`mf-badge ${isCombo ? 'mf-badge-gold' : 'mf-badge-muted'}`}>
            {isCombo ? 'Combo' : 'Simple'}
        </span>
    );
}

function getItemsCount(paquete) {
    return Array.isArray(paquete?.items) ? paquete.items.length : 0;
}

function getItemsSearchText(paquete) {
    if (!Array.isArray(paquete?.items)) return '';
    return paquete.items
        .map((item) => item?.nombre_servicio)
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function sortPaquetes(list = []) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
        const nameCompare = String(a?.nombre_paquete || '').localeCompare(String(b?.nombre_paquete || ''), 'es');
        if (nameCompare !== 0) return nameCompare;
        const branchCompare = String(a?.id_sucursal || '').localeCompare(String(b?.id_sucursal || ''), 'es');
        if (branchCompare !== 0) return branchCompare;
        return Number(a?.precio_hnl ?? 0) - Number(b?.precio_hnl ?? 0);
    });
}

function upsertScopedPaquete(list = [], nextPaquete) {
    // AM: Mantiene una sola tarjeta/fila por combinacion (paquete, sucursal) en estado local.
    const nextId = String(nextPaquete?.id_paquete || '');
    const nextBranchId = String(nextPaquete?.id_sucursal || '');
    const current = Array.isArray(list) ? list : [];
    const syncedSharedData = current.map((entry) => (
        String(entry?.id_paquete || '') === nextId
            ? {
                ...entry,
                nombre_paquete: nextPaquete?.nombre_paquete ?? entry?.nombre_paquete,
                descripcion: nextPaquete?.descripcion ?? entry?.descripcion,
                items: Array.isArray(nextPaquete?.items) ? nextPaquete.items : entry?.items,
            }
            : entry
    ));
    const withoutTarget = syncedSharedData.filter((entry) => (
        String(entry?.id_paquete || '') !== nextId
        || String(entry?.id_sucursal || '') !== nextBranchId
    ));
    return sortPaquetes([...withoutTarget, nextPaquete]);
}

function normalizeItemsForPayload(items = []) {
    return items.map((item) => ({
        id_servicio: String(item?.id_servicio || '').trim(),
        cantidad: Number(item?.cantidad),
    }));
}

function validateForm(values) {
    if (!values.nombre_paquete.trim()) return 'El nombre del paquete es requerido.';

    const precio = Number(values.precio_hnl);
    if (!Number.isFinite(precio) || precio < 0) return 'El precio debe ser mayor o igual a 0.';

    if (!Array.isArray(values.items) || values.items.length === 0) {
        return 'Agrega al menos un servicio al paquete.';
    }

    const seen = new Set();
    for (const item of values.items) {
        const idServicio = String(item?.id_servicio || '').trim();
        const cantidad = Number(item?.cantidad);

        if (!idServicio) return 'Selecciona un servicio en cada item del paquete.';
        if (!Number.isInteger(cantidad) || cantidad < 1) return 'La cantidad de cada item debe ser un entero mayor o igual a 1.';
        if (seen.has(idServicio)) return 'No repitas el mismo servicio dentro del paquete.';

        seen.add(idServicio);
    }

    return null;
}

function PackageItemsEditor({ items, onChange, serviciosList }) {
    const selectedServiceIds = useMemo(
        () => new Set(items.map((item) => item?.id_servicio).filter(Boolean)),
        [items]
    );

    function addItem() {
        onChange([...(Array.isArray(items) ? items : []), { id_servicio: '', cantidad: 1 }]);
    }

    function removeItem(index) {
        onChange(items.filter((_, currentIndex) => currentIndex !== index));
    }

    function updateItem(index, field, value) {
        onChange(items.map((item, currentIndex) => (
            currentIndex === index ? { ...item, [field]: value } : item
        )));
    }

    return (
        <div className="flex flex-col gap-3 rounded-[16px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-3">
            <div className="flex items-center justify-between gap-3">
                <Label className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Servicios incluidos</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem} className="gap-1.5">
                    <Plus size={13} /> Agregar
                </Button>
            </div>

            {items.length === 0 ? (
                <p className="text-xs text-[var(--mf-text-2)]">Aun no agregas servicios al paquete.</p>
            ) : null}

            {items.map((item, index) => {
                const currentId = String(item?.id_servicio || '').trim();

                return (
                    <div key={`${index}-${currentId || 'new'}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                        <select
                            value={currentId}
                            onChange={(event) => updateItem(index, 'id_servicio', event.target.value)}
                            className="mf-select"
                        >
                            <option value="">Seleccionar servicio</option>
                            {serviciosList.map((servicio) => {
                                const optionId = servicio.id_servicio;
                                const isTaken = selectedServiceIds.has(optionId) && optionId !== currentId;
                                return (
                                    <option key={optionId} value={optionId} disabled={isTaken}>
                                        {servicio.nombre_servicio}
                                    </option>
                                );
                            })}
                        </select>

                        <Input
                            type="number"
                            min="1"
                            value={item.cantidad}
                            onChange={(event) => updateItem(index, 'cantidad', event.target.value)}
                            className="w-[86px] text-center"
                            placeholder="1"
                        />

                        <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            onClick={() => removeItem(index)}
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

function PaqueteForm({ values, onChange, serviciosList }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <Label htmlFor="fp-nombre">Nombre del paquete *</Label>
                <Input
                    id="fp-nombre"
                    value={values.nombre_paquete}
                    onChange={(event) => onChange('nombre_paquete', event.target.value)}
                    placeholder="Ej. Premium Fade + Barba"
                />
            </div>

            <div className="flex flex-col gap-1">
                <Label htmlFor="fp-desc">Descripcion</Label>
                <Input
                    id="fp-desc"
                    value={values.descripcion}
                    onChange={(event) => onChange('descripcion', event.target.value)}
                    placeholder="Descripcion opcional"
                />
            </div>

            <div className="flex flex-col gap-1">
                <Label htmlFor="fp-precio">Precio HNL *</Label>
                <Input
                    id="fp-precio"
                    type="number"
                    min="0"
                    step="0.01"
                    value={values.precio_hnl}
                    onChange={(event) => onChange('precio_hnl', event.target.value)}
                    placeholder="650.00"
                />
            </div>

            <PackageItemsEditor
                items={values.items}
                onChange={(nextItems) => onChange('items', nextItems)}
                serviciosList={serviciosList}
            />
        </div>
    );
}

export default function AdminPackagesCatalogPage() {
    const navigate = useNavigate();
    const { branchIds, roles = [] } = useAuth();
    const notifications = useNotifications();
    const isSuperAdmin = roles.includes('super_admin');

    const [allBranches, setAllBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [sucursal, setSucursal] = useState(branchIds.length === 1 ? branchIds[0] : '');

    const [paquetes, setPaquetes] = useState([]);
    const [serviciosList, setServiciosList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState('');

    const [view, setView] = useState(
        () => {
            try {
                const stored = localStorage.getItem('mf-view-paquetes');
                return stored === 'table' || stored === 'cards' ? stored : 'cards';
            } catch {
                return 'cards';
            }
        }
    );

    const [search, setSearch] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [filters, setFilters] = useState(() => ({ ...PACKAGE_FILTER_DEFAULTS }));

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [formValues, setFormValues] = useState(FORM_DEFAULTS);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailTarget, setDetailTarget] = useState(null);

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
    // AM: Bloquea acciones de cards/tablas hasta seleccionar sucursal en escenarios multi-sucursal.
    const actionsLockedByBranch = !sucursal && availableBranches.length > 1;
    const titleSubtitle = !sucursal && availableBranches.length > 1
        ? 'Selecciona una sucursal para crear, editar o cambiar estado de paquetes.'
        : 'Gestiona paquetes por sucursal y su composicion comercial.';

    const filteredPaquetes = useMemo(() => {
        const searchValue = search.trim().toLowerCase();

        return paquetes.filter((paquete) => {
            if (searchValue) {
                const searchable = [
                    paquete?.nombre_paquete,
                    paquete?.descripcion,
                    getItemsSearchText(paquete),
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                if (!searchable.includes(searchValue)) return false;
            }

            if (filters.estado !== 'all') {
                const expected = filters.estado === 'activo';
                if (Boolean(paquete?.activo) !== expected) return false;
            }

            if (filters.visibilidad !== 'all') {
                const expected = filters.visibilidad === 'visible';
                if (Boolean(paquete?.visible_publico) !== expected) return false;
            }

            if (filters.composicion !== 'all') {
                const itemsCount = getItemsCount(paquete);
                const isCombo = itemsCount > 1;
                const expectedCombo = filters.composicion === 'combo';
                if (isCombo !== expectedCombo) return false;
            }

            if (!sucursal && filters.idSucursal !== 'all' && String(paquete?.id_sucursal || '') !== filters.idSucursal) {
                return false;
            }

            return true;
        });
    }, [filters, paquetes, search, sucursal]);

    const activeFilterCount = useMemo(
        () => Object.values(filters).filter((value) => value !== 'all').length,
        [filters]
    );

    const activeFilterChips = useMemo(() => {
        const chips = [];
        const trimmedSearch = search.trim();

        if (trimmedSearch) chips.push({ key: 'search', label: `Busqueda: ${trimmedSearch}` });
        if (filters.estado !== 'all') chips.push({ key: 'estado', label: PACKAGE_STATE_FILTER_LABELS[filters.estado] || 'Estado' });
        if (filters.visibilidad !== 'all') chips.push({ key: 'visibilidad', label: PACKAGE_VISIBILITY_FILTER_LABELS[filters.visibilidad] || 'Visibilidad' });
        if (filters.composicion !== 'all') chips.push({ key: 'composicion', label: PACKAGE_COMPOSITION_FILTER_LABELS[filters.composicion] || 'Composicion' });
        if (!sucursal && filters.idSucursal !== 'all') chips.push({ key: 'idSucursal', label: `Sucursal: ${branchNameById[filters.idSucursal] || 'Seleccionada'}` });

        return chips;
    }, [branchNameById, filters, search, sucursal]);

    function clearAllFilters() {
        setSearch('');
        setFilters({ ...PACKAGE_FILTER_DEFAULTS });
    }

    function clearFilterChip(key) {
        if (key === 'search') {
            setSearch('');
            return;
        }

        setFilters((prev) => ({ ...prev, [key]: 'all' }));
    }

    const fetchBranches = useCallback(async () => {
        setLoadingBranches(true);
        try {
            const data = await listAdminSucursales();
            const payloadData = data?.data ?? data;
            setAllBranches(Array.isArray(payloadData?.sucursales) ? payloadData.sucursales : []);
        } catch {
            setAllBranches([]);
            notifications.error('No se pudieron cargar las sucursales para operar paquetes.', {
                dedupeKey: 'paquetes-branches-error',
            });
        } finally {
            setLoadingBranches(false);
        }
    }, [notifications]);

    useEffect(() => {
        void fetchBranches();
    }, [fetchBranches]);

    useEffect(() => {
        if (sucursal) return;
        if (branchIds.length === 1) {
            setSucursal(branchIds[0]);
            return;
        }
        if (isSuperAdmin && availableBranches.length === 1) {
            // AM: Super admin con una sola sucursal activa queda operativo sin pasos extra.
            setSucursal(availableBranches[0].id_sucursal);
        }
    }, [sucursal, branchIds, isSuperAdmin, availableBranches]);

    useEffect(() => {
        if (!sucursal) return;
        setFilters((prev) => (prev.idSucursal === 'all' ? prev : { ...prev, idSucursal: 'all' }));
    }, [sucursal]);

    const fetchPaquetes = useCallback(async ({ silent = false } = {}) => {
        if (!silent) {
            setLoading(true);
            setListError('');
        }

        try {
            const data = await listAdminPaquetes(sucursal ? { id_sucursal: sucursal } : {});
            const payloadData = data?.data ?? data;
            const list = Array.isArray(payloadData?.paquetes) ? payloadData.paquetes : [];
            setPaquetes(sortPaquetes(list));
        } catch (err) {
            if (err.status === 401) {
                navigate('/login');
                return;
            }
            if (err.status === 403) {
                navigate('/unauthorized');
                return;
            }

            // AM: Evita mantener paquetes de otra sucursal cuando falla la consulta actual.
            setPaquetes([]);
            if (!silent) setListError(extractMessage(err));
        } finally {
            if (!silent) setLoading(false);
        }
    }, [navigate, sucursal]);

    const fetchServicios = useCallback(async () => {
        if (!sucursal) {
            setServiciosList([]);
            return;
        }

        try {
            const data = await listAdminServicios({ id_sucursal: sucursal });
            const payloadData = data?.data ?? data;
            const list = Array.isArray(payloadData?.servicios) ? payloadData.servicios : [];
            // AM: Solo permite servicios realmente operativos en la sucursal seleccionada para evitar 409 al crear paquetes.
            const activeOnly = list
                .filter((servicio) => (
                    Boolean(servicio?.activo)
                    && String(servicio?.id_sucursal || '') === String(sucursal)
                    && Number.isFinite(Number(servicio?.precio_hnl))
                ))
                .sort((left, right) => String(left?.nombre_servicio || '').localeCompare(String(right?.nombre_servicio || ''), 'es'));
            setServiciosList(activeOnly);
        } catch {
            // AM: Evita bloquear la vista completa si falla solo el catalogo auxiliar de servicios.
            setServiciosList([]);
        }
    }, [sucursal]);

    useEffect(() => {
        if (!isSuperAdmin && !sucursal) return;
        void fetchPaquetes();
    }, [fetchPaquetes, isSuperAdmin, sucursal]);

    useEffect(() => {
        void fetchServicios();
    }, [fetchServicios]);

    function handleFormChange(field, value) {
        setFormValues((prev) => ({ ...prev, [field]: value }));
    }

    function resolveMutationBranchId(paquete = null) {
        return sucursal || paquete?.id_sucursal || '';
    }

    function openCrear() {
        if (!sucursal) {
            notifications.warning('Selecciona una sucursal antes de crear un paquete.', {
                dedupeKey: 'paquetes-create-branch-required',
            });
            return;
        }

        if (!serviciosList.length) {
            notifications.warning('No hay servicios activos disponibles para construir paquetes.', {
                dedupeKey: 'paquetes-create-no-services',
            });
            return;
        }

        setEditTarget(null);
        setFormValues(FORM_DEFAULTS);
        setFormError('');
        setDialogOpen(true);
    }

    function openEditar(paquete) {
        const mutationBranchId = resolveMutationBranchId(paquete);
        if (!mutationBranchId) {
            notifications.error('No se pudo determinar la sucursal del paquete para editarlo.', {
                dedupeKey: 'paquetes-edit-branch-missing',
            });
            return;
        }

        setEditTarget({
            ...(paquete || {}),
            _mutation_branch_id: mutationBranchId,
        });
        setFormValues({
            nombre_paquete: paquete?.nombre_paquete ?? '',
            descripcion: paquete?.descripcion ?? '',
            precio_hnl: String(paquete?.precio_hnl ?? ''),
            items: Array.isArray(paquete?.items)
                ? paquete.items.map((item) => ({
                    id_servicio: String(item?.id_servicio || ''),
                    cantidad: String(item?.cantidad ?? 1),
                }))
                : [],
        });
        setFormError('');
        setDialogOpen(true);
    }

    async function handleGuardar() {
        const validationError = validateForm(formValues);
        if (validationError) {
            setFormError(validationError);
            return;
        }

        setFormLoading(true);
        setFormError('');

        const mutationBranchId = editTarget?._mutation_branch_id || sucursal;
        if (!mutationBranchId) {
            setFormLoading(false);
            setFormError('Selecciona una sucursal antes de guardar el paquete.');
            return;
        }

        const payload = {
            nombre_paquete: formValues.nombre_paquete.trim(),
            descripcion: formValues.descripcion.trim() || undefined,
            precio_hnl: Number(formValues.precio_hnl),
            items: normalizeItemsForPayload(formValues.items),
            id_sucursal: mutationBranchId,
        };

        try {
            const response = editTarget
                ? await updateAdminPaquete(editTarget.id_paquete, payload)
                : await createAdminPaquete(payload);
            const result = response?.data ?? response;

            setPaquetes((prev) => upsertScopedPaquete(prev, result));
            notifications.success(editTarget ? 'Paquete actualizado.' : 'Paquete creado.', {
                dedupeKey: 'paquetes-save-ok',
            });

            emitCatalogSync(editTarget ? 'paquete-updated' : 'paquete-created');
            setDialogOpen(false);
        } catch (err) {
            if (err.status === 401) {
                navigate('/login');
                return;
            }
            if (err.status === 403) {
                navigate('/unauthorized');
                return;
            }

            const message = extractMessage(err);
            setFormError(message);
            notifications.error(message, { dedupeKey: 'paquetes-save-error' });
        } finally {
            setFormLoading(false);
        }
    }

    function openDetail(paquete) {
        setDetailTarget(paquete || null);
        setDetailOpen(true);
    }

    function openConfirmState(paquete) {
        setStateTarget({
            ...paquete,
            _nextActivo: !paquete?.activo,
            _mutation_branch_id: resolveMutationBranchId(paquete),
        });
        setConfirmOpen(true);
    }

    async function handleConfirmState() {
        if (!stateTarget) return;

        setStateLoading(true);
        try {
            const mutationBranchId = stateTarget?._mutation_branch_id || sucursal;
            if (!mutationBranchId) {
                notifications.error('Selecciona una sucursal antes de cambiar el estado.', {
                    dedupeKey: 'paquetes-state-branch-required',
                });
                return;
            }

            const response = await setAdminPaqueteEstado(stateTarget.id_paquete, {
                activo: stateTarget._nextActivo,
                id_sucursal: mutationBranchId,
            });
            const result = response?.data ?? response;

            setPaquetes((prev) => upsertScopedPaquete(prev, result));
            notifications.success(stateTarget._nextActivo ? 'Paquete activado.' : 'Paquete inactivado.', {
                dedupeKey: 'paquetes-state-ok',
            });

            emitCatalogSync(stateTarget._nextActivo ? 'paquete-activated' : 'paquete-inactivated');
            setConfirmOpen(false);
            setStateTarget(null);
        } catch (err) {
            if (err.status === 401) {
                navigate('/login');
                return;
            }
            if (err.status === 403) {
                navigate('/unauthorized');
                return;
            }

            notifications.error(extractMessage(err), { dedupeKey: 'paquetes-state-error' });
        } finally {
            setStateLoading(false);
        }
    }

    function renderActions(paquete) {
        return (
            <div className="flex w-full flex-wrap items-center justify-start gap-2">
                <HoverActionButton
                    icon={<Eye size={16} strokeWidth={2} />}
                    label="Ver detalle"
                    title="Ver detalle de paquete"
                    disabled={actionsLockedByBranch}
                    onClick={() => openDetail(paquete)}
                />
                <HoverActionButton
                    icon={<Pencil size={16} strokeWidth={2} />}
                    label="Editar"
                    title="Editar paquete"
                    disabled={actionsLockedByBranch}
                    onClick={() => openEditar(paquete)}
                />
                <HoverActionButton
                    icon={paquete?.activo ? <ToggleLeft size={16} strokeWidth={2} /> : <ToggleRight size={16} strokeWidth={2} />}
                    label={paquete?.activo ? 'Inactivar' : 'Activar'}
                    title={paquete?.activo ? 'Inactivar paquete' : 'Activar paquete'}
                    tone={paquete?.activo ? 'warning' : 'success'}
                    disabled={actionsLockedByBranch}
                    onClick={() => openConfirmState(paquete)}
                />
            </div>
        );
    }

    function renderItemsAsNode(paquete) {
        if (!Array.isArray(paquete?.items) || paquete.items.length === 0) {
            return 'Sin servicios incluidos';
        }

        return (
            <ul className="space-y-1 text-sm text-[var(--mf-text)]">
                {paquete.items.map((item, index) => (
                    <li key={`${paquete.id_paquete}-${item.id_servicio || 'item'}-${index}`}>
                        {item.nombre_servicio || item.id_servicio}
                        {Number(item.cantidad) > 1 ? ` x${Number(item.cantidad)}` : ''}
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <div className="space-y-4 px-2 pb-4 sm:px-4 sm:pb-6">
            <header className="rounded-2xl border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <p className="text-xs uppercase tracking-[0.3em] text-[var(--mf-accent)]">Catalogo - Paquetes</p>
                            <h1 className="mf-font-display text-3xl text-[var(--mf-text)] sm:text-4xl">Paquetes</h1>
                            <p className="text-sm text-[var(--mf-text-2)]">{titleSubtitle}</p>
                        </div>
                        <SucursalSelector
                            branchIds={branchIds}
                            allBranches={allBranches}
                            selected={sucursal}
                            onChange={setSucursal}
                            loadingBranches={loadingBranches}
                        />
                    </div>

                    <div className="flex w-full flex-col gap-2 xl:w-auto xl:min-w-[560px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm text-[var(--mf-text-2)]">
                                {loading ? 'Cargando...' : `${filteredPaquetes.length} de ${paquetes.length} paquete(s)`}
                            </p>
                            <ViewToggle defaultView={view} onViewChange={setView} storageKey="paquetes" />
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

                            <Button type="button" variant="outline" className="gap-2" onClick={() => setFiltersOpen(true)}>
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

            {listError && <ErrorBanner message={listError} onRetry={fetchPaquetes} />}
            {loading && !listError && <LoadingSpinner />}

            {!loading && !listError && paquetes.length === 0 ? (
                <EmptyState
                    icon={Package}
                    title="Sin paquetes"
                    description="Aun no hay paquetes registrados en el catalogo administrativo."
                    action={<Button size="sm" onClick={openCrear} disabled={actionsLockedByBranch}>Crear primero</Button>}
                />
            ) : null}

            {!loading && !listError && paquetes.length > 0 && filteredPaquetes.length === 0 ? (
                <EmptyState
                    icon={Search}
                    title="Sin resultados"
                    description="No hay coincidencias con la busqueda o filtros actuales."
                />
            ) : null}

            {!loading && !listError && filteredPaquetes.length > 0 && view === 'cards' ? (
                <CardsCarousel
                    items={filteredPaquetes}
                    getItemKey={(paquete) => `${paquete?.id_paquete || 'pkg'}:${paquete?.id_sucursal || 'all'}`}
                    renderItem={(paquete, index, pageIndex) => (
                        <DataCard
                            key={`${paquete.id_paquete || 'pkg'}:${paquete.id_sucursal || 'all'}`}
                            animationDelay={(pageIndex * 0.02) + (index * 0.05)}
                            avatar={<Package size={16} />}
                            title={paquete.nombre_paquete || 'Paquete'}
                            subtitle={paquete.descripcion || 'Sin descripcion'}
                            badge={<PackageStatusBadge activo={Boolean(paquete.activo)} />}
                            fields={[
                                ...(!sucursal ? [{
                                    label: 'Sucursal',
                                    value: branchNameById[paquete.id_sucursal] || 'Sin sucursal',
                                }] : []),
                                {
                                    label: 'Precio',
                                    value: <span className="font-mono font-bold text-[var(--mf-accent)]">L {Number(paquete.precio_hnl ?? 0).toFixed(2)}</span>,
                                },
                                { label: 'Servicios', value: getItemsCount(paquete) },
                                { label: 'Composicion', value: <PackageCompositionBadge itemsCount={getItemsCount(paquete)} /> },
                                { label: 'Publico', value: <PackageVisibilityBadge visiblePublico={Boolean(paquete.visible_publico)} /> },
                            ]}
                            actions={renderActions(paquete)}
                        />
                    )}
                />
            ) : null}

            {!loading && !listError && filteredPaquetes.length > 0 && view === 'table' ? (
                <div className="mf-table-wrap">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-[var(--mf-nav-border)]">
                                {!sucursal ? (
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursal</TableHead>
                                ) : null}
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Precio HNL</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Servicios</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Composicion</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Publico</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Estado</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPaquetes.map((paquete) => (
                                <TableRow key={`${paquete.id_paquete || 'pkg'}:${paquete.id_sucursal || 'all'}`} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">
                                    {!sucursal ? (
                                        <TableCell className="text-[var(--mf-text-2)]">
                                            {branchNameById[paquete.id_sucursal] || 'Sin sucursal'}
                                        </TableCell>
                                    ) : null}
                                    <TableCell className="font-medium text-[var(--mf-text)]">
                                        <div>{paquete.nombre_paquete}</div>
                                        {paquete.descripcion ? (
                                            <div className="text-xs text-[var(--mf-text-2)] mt-0.5">{paquete.descripcion}</div>
                                        ) : null}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold text-[var(--mf-accent)]">
                                        L {Number(paquete.precio_hnl ?? 0).toFixed(2)}
                                    </TableCell>
                                    <TableCell className="text-center text-[var(--mf-text-2)]">
                                        {getItemsCount(paquete)}
                                    </TableCell>
                                    <TableCell className="text-center hidden md:table-cell">
                                        <PackageCompositionBadge itemsCount={getItemsCount(paquete)} />
                                    </TableCell>
                                    <TableCell className="text-center hidden md:table-cell">
                                        <PackageVisibilityBadge visiblePublico={Boolean(paquete.visible_publico)} />
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <PackageStatusBadge activo={Boolean(paquete.activo)} />
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {renderActions(paquete)}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            ) : null}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? 'Editar paquete' : 'Nuevo paquete'}</DialogTitle>
                        <DialogDescription className="sr-only">
                            Configura los datos comerciales y servicios incluidos del paquete.
                        </DialogDescription>
                    </DialogHeader>
                    <PaqueteForm values={formValues} onChange={handleFormChange} serviciosList={serviciosList} />
                    {formError ? <ErrorBanner message={formError} /> : null}
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>
                            Cancelar
                        </Button>
                        <Button onClick={handleGuardar} disabled={formLoading} className="gap-2 min-w-[120px]">
                            {formLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                            {editTarget ? 'Guardar cambios' : 'Crear paquete'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Detalle de paquete</DialogTitle>
                        <DialogDescription className="sr-only">
                            Consulta la composicion, precio y estado operativo del paquete por sucursal.
                        </DialogDescription>
                    </DialogHeader>
                    {detailTarget ? (
                        <DetailInfoModalContent
                            summary={{
                                icon: <Package size={16} />,
                                title: detailTarget.nombre_paquete || '-',
                                subtitle: detailTarget.descripcion || 'Sin descripcion',
                                badge: <PackageStatusBadge activo={Boolean(detailTarget.activo)} />,
                            }}
                            sections={[
                                {
                                    id: 'comercial',
                                    title: 'Datos comerciales',
                                    icon: <Tags size={14} />,
                                    fields: [
                                        {
                                            label: 'Precio HNL',
                                            value: `L ${Number(detailTarget.precio_hnl ?? 0).toFixed(2)}`,
                                        },
                                        {
                                            label: 'Sucursal',
                                            value: detailTarget.id_sucursal
                                                ? (branchNameById[detailTarget.id_sucursal] || detailTarget.id_sucursal)
                                                : 'No definida',
                                        },
                                        { label: 'Estado', value: <PackageStatusBadge activo={Boolean(detailTarget.activo)} /> },
                                        { label: 'Visibilidad publica', value: <PackageVisibilityBadge visiblePublico={Boolean(detailTarget.visible_publico)} /> },
                                        { label: 'Composicion', value: <PackageCompositionBadge itemsCount={getItemsCount(detailTarget)} /> },
                                    ],
                                },
                                {
                                    id: 'servicios',
                                    title: 'Servicios incluidos',
                                    icon: <Scissors size={14} />,
                                    fields: [
                                        { label: 'Total de servicios', value: getItemsCount(detailTarget) },
                                        { label: 'Detalle', value: renderItemsAsNode(detailTarget), span: 'full' },
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
                        <DialogTitle>Filtros de Paquetes</DialogTitle>
                        <DialogDescription className="sr-only">
                            Ajusta criterios para localizar paquetes por estado, visibilidad, composicion y sucursal.
                        </DialogDescription>
                    </DialogHeader>

                    {/* AM: Atajos de filtros para operaciones frecuentes del catalogo comercial. */}
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
                            onClick={() => setFilters((prev) => ({ ...prev, composicion: prev.composicion === 'combo' ? 'all' : 'combo' }))}
                            className={quickFilterButtonClass(filters.composicion === 'combo')}
                        >
                            Solo combos
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

                        <div className="sm:col-span-2">
                            <Label className="mf-label">Composicion</Label>
                            <select
                                className="mf-select mt-1"
                                value={filters.composicion}
                                onChange={(event) => setFilters((prev) => ({ ...prev, composicion: event.target.value }))}
                            >
                                <option value="all">Todas</option>
                                <option value="simple">Simple (1 servicio)</option>
                                <option value="combo">Combo (2+ servicios)</option>
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
                title={stateTarget?._nextActivo ? 'Activar paquete' : 'Inactivar paquete'}
                description={
                    stateTarget
                        ? `Se ${stateTarget._nextActivo ? 'activara' : 'inactivara'} ${stateTarget.nombre_paquete}.`
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
