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
    if (extractErrorCode(err) === 'CATALOG_PACKAGE_DUPLICATE') {
        return 'Ya existe un paquete con ese nombre. Usa el paquete existente o cambia el nombre.';
    }
    if (extractErrorCode(err) === 'CATALOG_PACKAGE_SERVICE_OUT_OF_SCOPE') {
        return 'Uno o más servicios del paquete no están disponibles en la sucursal seleccionada.';
    }
    return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

function extractErrorCode(err) {
    return String(err?.data?.error?.code || '').trim();
}

const FORM_DEFAULTS = {
    nombre_paquete: '',
    descripcion: '',
    precio_hnl: '',
    orden_visual: '100',
    visible_publico: true,
    ofertas: [],
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
                <option value="">Todas las sucursales</option>
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

function groupPaquetesByMaster(list = []) {
    const grouped = new Map();

    for (const paquete of Array.isArray(list) ? list : []) {
        const packageId = String(paquete?.id_paquete || '');
        if (!packageId) continue;

        const current = grouped.get(packageId);
        const offer = {
            id_sucursal: paquete?.id_sucursal,
            precio_hnl: paquete?.precio_hnl,
            activo: Boolean(paquete?.activo),
            visible_publico: Boolean(paquete?.visible_publico),
            orden_visual: paquete?.orden_visual,
        };

        if (current) {
            current.ofertas = [...current.ofertas, offer];
            continue;
        }

        grouped.set(packageId, {
            ...paquete,
            ofertas: [offer],
            _isMasterSummary: true,
        });
    }

    return sortPaquetes([...grouped.values()]);
}

function getPackageOffers(paquete) {
    return Array.isArray(paquete?.ofertas) && paquete.ofertas.length > 0
        ? paquete.ofertas
        : [{
            id_sucursal: paquete?.id_sucursal,
            precio_hnl: paquete?.precio_hnl,
            activo: Boolean(paquete?.activo),
            visible_publico: Boolean(paquete?.visible_publico),
            orden_visual: paquete?.orden_visual,
        }];
}

function formatPrice(value) {
    return `L ${Number(value ?? 0).toFixed(2)}`;
}

function getPackagePriceSummary(paquete) {
    const prices = getPackageOffers(paquete)
        .map((offer) => Number(offer?.precio_hnl))
        .filter((price) => Number.isFinite(price));

    if (prices.length === 0) return 'Sin precio';
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? formatPrice(min) : `${formatPrice(min)} - ${formatPrice(max)}`;
}

function getPackageBranchSummary(paquete, branchNameById) {
    const names = getPackageOffers(paquete)
        .map((offer) => branchNameById[offer?.id_sucursal] || offer?.id_sucursal)
        .filter(Boolean);
    return names.length > 0 ? names.join(', ') : 'Sin sucursales asociadas';
}

function getPackageOfferStateSummary(paquete) {
    const offers = getPackageOffers(paquete);
    const activeCount = offers.filter((offer) => Boolean(offer?.activo)).length;
    const visibleCount = offers.filter((offer) => Boolean(offer?.visible_publico)).length;
    return `${activeCount}/${offers.length} activas · ${visibleCount}/${offers.length} visibles`;
}

function getUnassociatedBranches(paquete, availableBranches) {
    const associated = new Set(getPackageOffers(paquete).map((offer) => String(offer?.id_sucursal || '')).filter(Boolean));
    return availableBranches.filter((branch) => !associated.has(String(branch?.id_sucursal || '')));
}

function sortPaquetes(list = []) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
        const orderA = Number(a?.orden_visual ?? 100);
        const orderB = Number(b?.orden_visual ?? 100);
        if (orderA !== orderB) return orderA - orderB;
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

function validateForm(values, mode = 'create') {
    const isOfferOnly = mode === 'editOffer' || mode === 'addOffer';
    if (!isOfferOnly && !values.nombre_paquete.trim()) return 'El nombre del paquete es requerido.';

    if (mode === 'create') {
        if (!Array.isArray(values.ofertas) || values.ofertas.length === 0) {
            return 'Debe seleccionar al menos una sucursal para crear el paquete.';
        }
        for (const offer of values.ofertas) {
            if (!offer?.id_sucursal) return 'Debe seleccionar al menos una sucursal para crear el paquete.';
            const offerPrice = Number(offer.precio_hnl);
            if (!Number.isFinite(offerPrice) || offerPrice <= 0) return 'El precio debe ser mayor a 0.';
            const offerOrder = Number(offer.orden_visual);
            if (!Number.isFinite(offerOrder) || offerOrder < 0) return 'El orden visual debe ser mayor o igual a 0.';
        }
    } else if (mode !== 'editMaster') {
        const precio = Number(values.precio_hnl);
        if (!Number.isFinite(precio) || precio <= 0) return 'El precio debe ser mayor a 0.';
        const orden = Number(values.orden_visual);
        if (!Number.isFinite(orden) || orden < 0) return 'El orden visual debe ser mayor o igual a 0.';
    }

    if (!isOfferOnly && (!Array.isArray(values.items) || values.items.length < 2)) {
        return 'Agrega al menos 2 servicios al paquete.';
    }

    const seen = new Set();
    for (const item of isOfferOnly ? [] : values.items) {
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

function PaqueteForm({
    values,
    onChange,
    serviciosList,
    branchName,
    mode,
    initialBranchId,
    availableBranches,
    onInitialBranchChange,
    onCreateOfferToggle,
    onCreateOfferChange,
}) {
    const isCreate = mode === 'create';
    const isEditMaster = mode === 'editMaster';
    const isEditOffer = mode === 'editOffer';
    const isAddOffer = mode === 'addOffer';
    const isOfferOnly = isEditOffer || isAddOffer;

    return (
        <div className="flex flex-col gap-4">
            <div className="rounded-[14px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_46%,transparent)] px-3 py-2 text-xs text-[var(--mf-text-2)]">
                {isCreate
                    ? 'El paquete maestro sera unico. Cada sucursal tendra su propia oferta operativa.'
                    : isEditMaster
                        ? 'Estos cambios afectan el paquete maestro y se reflejan en todas las sucursales donde este ofertado.'
                        : isAddOffer
                            ? 'Esta accion no crea otro paquete maestro. Solo agrega una oferta operativa para la sucursal seleccionada.'
                            : `Oferta en: ${branchName || 'Sucursal seleccionada'}`}
            </div>
            {isCreate ? (
                <div className="flex flex-col gap-3 rounded-[14px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_72%,transparent)] p-3">
                    <div>
                        <Label className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">Ofertas iniciales por sucursal</Label>
                        <p className="mt-1 text-xs text-[var(--mf-text-2)]">
                            Selecciona las sucursales donde se ofrecera inicialmente este paquete.
                        </p>
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
                                                onChange={(event) => onCreateOfferChange(branch.id_sucursal, 'precio_hnl', event.target.value)}
                                                placeholder="800.00"
                                            />
                                        </div>
                                        <label className="flex items-center gap-2 pb-2 text-sm text-[var(--mf-text)]">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(offer.visible_publico)}
                                                onChange={(event) => onCreateOfferChange(branch.id_sucursal, 'visible_publico', event.target.checked)}
                                            />
                                            Visible publico
                                        </label>
                                        <div className="flex flex-col gap-1">
                                            <Label>Orden visual</Label>
                                            <Input
                                                type="number"
                                                min="0"
                                                value={offer.orden_visual}
                                                onChange={(event) => onCreateOfferChange(branch.id_sucursal, 'orden_visual', event.target.value)}
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
                    <Label htmlFor="fp-initial-branch">{isAddOffer ? 'Sucursal *' : 'Sucursal inicial de la oferta *'}</Label>
                    <select
                        id="fp-initial-branch"
                        className="mf-select"
                        value={initialBranchId}
                        onChange={(event) => onInitialBranchChange(event.target.value)}
                    >
                        <option value="">Seleccionar sucursal</option>
                        {availableBranches.map((branch) => (
                            <option key={branch.id_sucursal} value={branch.id_sucursal}>
                                {branch.nombre_sucursal}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            {isOfferOnly ? null : (
                <>
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="fp-nombre">Nombre del paquete maestro *</Label>
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
                </>
            )}

            {isEditMaster || isCreate ? null : (
                <>
                    <div className="flex flex-col gap-1">
                        <Label htmlFor="fp-precio">Precio HNL de la oferta *</Label>
                        <Input
                            id="fp-precio"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={values.precio_hnl}
                            onChange={(event) => onChange('precio_hnl', event.target.value)}
                            placeholder="650.00"
                        />
                    </div>

                    {isEditOffer ? (
                        <label className="flex items-center gap-2 text-sm text-[var(--mf-text)]">
                            <input
                                type="checkbox"
                                checked={Boolean(values.visible_publico)}
                                onChange={(event) => onChange('visible_publico', event.target.checked)}
                            />
                            Visible publico
                        </label>
                    ) : null}

                    <div className="flex flex-col gap-1">
                        <Label htmlFor="fp-orden">Orden visual de la oferta *</Label>
                        <Input
                            id="fp-orden"
                            type="number"
                            min="0"
                            value={values.orden_visual}
                            onChange={(event) => onChange('orden_visual', event.target.value)}
                            placeholder="100"
                        />
                    </div>
                </>
            )}

            {isOfferOnly ? null : (
                <PackageItemsEditor
                    items={values.items}
                    onChange={(nextItems) => onChange('items', nextItems)}
                    serviciosList={serviciosList}
                />
            )}
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
    const [serviciosByBranch, setServiciosByBranch] = useState({});
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
    const [dialogMode, setDialogMode] = useState('create');
    const [initialOfferBranchId, setInitialOfferBranchId] = useState('');
    const [editTarget, setEditTarget] = useState(null);
    const [formValues, setFormValues] = useState(FORM_DEFAULTS);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailTarget, setDetailTarget] = useState(null);
    const [offersOpen, setOffersOpen] = useState(false);
    const [offersTarget, setOffersTarget] = useState(null);

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
    const titleSubtitle = !sucursal && availableBranches.length > 1
        ? 'Vista de paquetes maestros globales y sus ofertas por sucursal.'
        : 'Gestiona paquetes maestros y la oferta operativa de la sucursal seleccionada.';

    const displayPaquetes = useMemo(
        () => (sucursal ? paquetes : groupPaquetesByMaster(paquetes)),
        [paquetes, sucursal]
    );

    const filteredPaquetes = useMemo(() => {
        const searchValue = search.trim().toLowerCase();

        return displayPaquetes.filter((paquete) => {
            if (searchValue) {
                const searchable = [
                    paquete?.nombre_paquete,
                    paquete?.descripcion,
                    getItemsSearchText(paquete),
                    getPackageBranchSummary(paquete, branchNameById),
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                if (!searchable.includes(searchValue)) return false;
            }

            if (filters.estado !== 'all') {
                const expected = filters.estado === 'activo';
                if (!getPackageOffers(paquete).some((offer) => Boolean(offer?.activo) === expected)) return false;
            }

            if (filters.visibilidad !== 'all') {
                const expected = filters.visibilidad === 'visible';
                if (!getPackageOffers(paquete).some((offer) => Boolean(offer?.visible_publico) === expected)) return false;
            }

            if (filters.composicion !== 'all') {
                const itemsCount = getItemsCount(paquete);
                const isCombo = itemsCount > 1;
                const expectedCombo = filters.composicion === 'combo';
                if (isCombo !== expectedCombo) return false;
            }

            if (!sucursal && filters.idSucursal !== 'all' && !getPackageOffers(paquete).some((offer) => String(offer?.id_sucursal || '') === filters.idSucursal)) {
                return false;
            }

            return true;
        });
    }, [branchNameById, displayPaquetes, filters, search, sucursal]);

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
            const data = await listAdminSucursales({ soloActivas: true });
            const payloadData = data?.data ?? data;
            const nextBranches = Array.isArray(payloadData?.sucursales)
                ? payloadData.sucursales.filter((branch) => branch?.id_sucursal && branch?.estado !== false)
                : [];
            setAllBranches(nextBranches);
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

    const loadServiciosForBranch = useCallback(async (branchId) => {
        if (!branchId) return [];
        const data = await listAdminServicios({ id_sucursal: branchId });
        const payloadData = data?.data ?? data;
        const list = Array.isArray(payloadData?.servicios) ? payloadData.servicios : [];
        // AM: Solo permite servicios realmente operativos en la sucursal seleccionada para evitar 409 al crear paquetes.
        return list
            .filter((servicio) => (
                Boolean(servicio?.activo)
                && String(servicio?.id_sucursal || '') === String(branchId)
                && Number.isFinite(Number(servicio?.precio_hnl))
            ))
            .sort((left, right) => String(left?.nombre_servicio || '').localeCompare(String(right?.nombre_servicio || ''), 'es'));
    }, []);

    const fetchServicios = useCallback(async (branchId = sucursal) => {
        if (!branchId) {
            setServiciosList([]);
            return;
        }

        try {
            setServiciosList(await loadServiciosForBranch(branchId));
        } catch {
            // AM: Evita bloquear la vista completa si falla solo el catalogo auxiliar de servicios.
            setServiciosList([]);
        }
    }, [loadServiciosForBranch, sucursal]);

    const refreshCommonServicios = useCallback((branchIdsToUse, cache) => {
        if (!Array.isArray(branchIdsToUse) || branchIdsToUse.length === 0) {
            setServiciosList([]);
            return;
        }

        const lists = branchIdsToUse.map((branchId) => cache[branchId] || []);
        if (lists.some((list) => list.length === 0)) {
            setServiciosList([]);
            return;
        }

        const commonIds = lists.slice(1).reduce((acc, list) => {
            const currentIds = new Set(list.map((servicio) => servicio.id_servicio));
            return new Set([...acc].filter((id) => currentIds.has(id)));
        }, new Set(lists[0].map((servicio) => servicio.id_servicio)));

        setServiciosList(lists[0].filter((servicio) => commonIds.has(servicio.id_servicio)));
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

    function handleInitialBranchChange(value) {
        setInitialOfferBranchId(value);
        setFormValues((prev) => ({ ...prev, items: [] }));
        void fetchServicios(value);
    }

    async function handleCreateOfferToggle(branchId, checked) {
        const nextOffers = checked
            ? [
                ...formValues.ofertas,
                {
                    id_sucursal: branchId,
                    precio_hnl: '',
                    visible_publico: true,
                    orden_visual: '100',
                },
            ]
            : formValues.ofertas.filter((offer) => offer.id_sucursal !== branchId);
        const nextBranchIds = nextOffers.map((offer) => offer.id_sucursal);
        let nextCache = serviciosByBranch;

        if (checked && !serviciosByBranch[branchId]) {
            try {
                const loaded = await loadServiciosForBranch(branchId);
                nextCache = { ...serviciosByBranch, [branchId]: loaded };
                setServiciosByBranch(nextCache);
            } catch {
                nextCache = { ...serviciosByBranch, [branchId]: [] };
                setServiciosByBranch(nextCache);
            }
        }

        refreshCommonServicios(nextBranchIds, nextCache);
        const commonIds = new Set(
            nextBranchIds.length > 0
                ? nextBranchIds
                    .map((id) => nextCache[id] || [])
                    .reduce((acc, list, index) => {
                        const ids = new Set(list.map((servicio) => servicio.id_servicio));
                        if (index === 0) return ids;
                        return new Set([...acc].filter((id) => ids.has(id)));
                    }, new Set())
                : []
        );

        setFormValues((prev) => ({
            ...prev,
            ofertas: nextOffers,
            items: prev.items.filter((item) => commonIds.has(item.id_servicio)),
        }));
    }

    function handleCreateOfferChange(branchId, field, value) {
        setFormValues((prev) => ({
            ...prev,
            ofertas: prev.ofertas.map((offer) => (
                offer.id_sucursal === branchId ? { ...offer, [field]: value } : offer
            )),
        }));
    }

    function resolveMutationBranchId(paquete = null) {
        return sucursal || paquete?.id_sucursal || getPackageOffers(paquete)[0]?.id_sucursal || '';
    }

    function openCrear() {
        setDialogMode('create');
        setInitialOfferBranchId(sucursal || '');
        setEditTarget(null);
        setFormValues({
            ...FORM_DEFAULTS,
            ofertas: sucursal
                ? [{
                    id_sucursal: sucursal,
                    precio_hnl: '',
                    visible_publico: true,
                    orden_visual: '100',
                }]
                : [],
        });
        setFormError('');
        setDialogOpen(true);
        if (sucursal) {
            void loadServiciosForBranch(sucursal)
                .then((loaded) => {
                    const nextCache = { ...serviciosByBranch, [sucursal]: loaded };
                    setServiciosByBranch(nextCache);
                    refreshCommonServicios([sucursal], nextCache);
                })
                .catch(() => {
                    setServiciosList([]);
                });
        } else {
            setServiciosList([]);
        }
    }

    function openEditarMaestro(paquete) {
        const mutationBranchId = resolveMutationBranchId(paquete);
        if (!mutationBranchId) {
            notifications.error('No se pudo determinar la sucursal del paquete para editarlo.', {
                dedupeKey: 'paquetes-edit-branch-missing',
            });
            return;
        }

        setDialogMode('editMaster');
        setEditTarget({
            ...(paquete || {}),
            _mutation_branch_id: mutationBranchId,
        });
        void fetchServicios(mutationBranchId);
        setFormValues({
            nombre_paquete: paquete?.nombre_paquete ?? '',
            descripcion: paquete?.descripcion ?? '',
            precio_hnl: '',
            orden_visual: '100',
            visible_publico: true,
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

    function openEditarOferta(paquete, offer = null) {
        const offerData = offer || paquete;
        const mutationBranchId = String(offerData?.id_sucursal || sucursal || '').trim();
        if (!mutationBranchId) {
            notifications.error('No se pudo determinar la sucursal de la oferta para editarla.', {
                dedupeKey: 'paquetes-offer-branch-missing',
            });
            return;
        }

        setDialogMode('editOffer');
        setEditTarget({
            ...(paquete || {}),
            _mutation_branch_id: mutationBranchId,
        });
        setFormValues({
            ...FORM_DEFAULTS,
            precio_hnl: String(offerData?.precio_hnl ?? ''),
            orden_visual: String(Number(offerData?.orden_visual ?? 100)),
            visible_publico: Boolean(offerData?.visible_publico),
        });
        setFormError('');
        setDialogOpen(true);
    }

    function openAgregarOferta(paquete) {
        const nextBranches = getUnassociatedBranches(paquete, availableBranches);
        if (nextBranches.length === 0) {
            notifications.warning('Todas las sucursales disponibles ya tienen oferta para este paquete.', {
                dedupeKey: 'paquetes-offer-no-branches',
            });
            return;
        }

        setDialogMode('addOffer');
        setInitialOfferBranchId('');
        setEditTarget(paquete || null);
        setFormValues({
            ...FORM_DEFAULTS,
            precio_hnl: '',
            orden_visual: '100',
            visible_publico: true,
        });
        setFormError('');
        setOffersOpen(false);
        setDialogOpen(true);
    }

    async function handleGuardar() {
        const validationError = validateForm(formValues, dialogMode);
        if (validationError) {
            setFormError(validationError);
            return;
        }

        setFormLoading(true);
        setFormError('');

        const mutationBranchId = editTarget?._mutation_branch_id || sucursal || initialOfferBranchId;
        if (dialogMode !== 'create' && !mutationBranchId) {
            setFormLoading(false);
            setFormError('Selecciona una sucursal inicial de la oferta.');
            return;
        }

        if (dialogMode === 'create' && !serviciosList.length) {
            setFormLoading(false);
            setFormError('No hay servicios activos comunes en las sucursales seleccionadas para construir este paquete.');
            return;
        }

        if (dialogMode !== 'create' && dialogMode !== 'editOffer' && dialogMode !== 'addOffer' && !serviciosList.length) {
            setFormLoading(false);
            setFormError('No hay servicios activos disponibles en esta sucursal para construir paquetes.');
            return;
        }

        const payload = dialogMode === 'editOffer' || dialogMode === 'addOffer'
            ? {
                id_sucursal: mutationBranchId,
                precio_hnl: Number(formValues.precio_hnl),
                visible_publico: Boolean(formValues.visible_publico),
                orden_visual: Number(formValues.orden_visual),
            }
            : dialogMode === 'editMaster'
                ? {
                    nombre_paquete: formValues.nombre_paquete.trim(),
                    descripcion: formValues.descripcion.trim() || undefined,
                    items: normalizeItemsForPayload(formValues.items),
                    id_sucursal: mutationBranchId,
                }
                : {
                    nombre_paquete: formValues.nombre_paquete.trim(),
                    descripcion: formValues.descripcion.trim() || undefined,
                    items: normalizeItemsForPayload(formValues.items),
                    ofertas: formValues.ofertas.map((offer) => ({
                        id_sucursal: offer.id_sucursal,
                        precio_hnl: Number(offer.precio_hnl),
                        visible_publico: Boolean(offer.visible_publico),
                        orden_visual: Number(offer.orden_visual),
                    })),
                };

        try {
            const response = editTarget
                ? await updateAdminPaquete(editTarget.id_paquete, payload)
                : await createAdminPaquete(payload);
            const result = response?.data ?? response;

            setPaquetes((prev) => upsertScopedPaquete(prev, result));
            if (dialogMode === 'addOffer' || dialogMode === 'create') {
                void fetchPaquetes({ silent: true });
            }
            notifications.success(
                dialogMode === 'addOffer'
                    ? 'Oferta agregada.'
                    : editTarget
                        ? 'Paquete actualizado.'
                        : 'Paquete creado.',
                {
                    dedupeKey: 'paquetes-save-ok',
                }
            );

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

    function openGestionarOfertas(paquete) {
        setOffersTarget(paquete || null);
        setOffersOpen(true);
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
                confirmar_citas_pendientes: stateTarget._confirmPendingAppointments === true,
            });
            const result = response?.data ?? response;

            setPaquetes((prev) => upsertScopedPaquete(prev, result));
            notifications.success(stateTarget._nextActivo ? 'Oferta activada.' : 'Oferta inactivada.', {
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

            const errorCode = extractErrorCode(err);
            if (
                errorCode === 'CATALOG_PACKAGE_PENDING_APPOINTMENTS_CONFIRMATION_REQUIRED'
                && stateTarget
                && !stateTarget._nextActivo
            ) {
                const totalFutureAppointments = Number(err?.data?.error?.details?.total_citas_futuras || 0);
                setStateTarget((prev) => (prev ? ({
                    ...prev,
                    _confirmPendingAppointments: true,
                    _totalFutureAppointments: totalFutureAppointments,
                }) : prev));
                notifications.warning(extractMessage(err), { dedupeKey: 'paquetes-state-pending-warning' });
                return;
            }

            notifications.error(extractMessage(err), { dedupeKey: 'paquetes-state-error' });
        } finally {
            setStateLoading(false);
        }
    }

    function renderActions(paquete) {
        if (!sucursal) {
            return (
                <div className="flex w-full flex-wrap items-center justify-start gap-2">
                    <HoverActionButton
                        icon={<Eye size={16} strokeWidth={2} />}
                        label="Ver detalle"
                        title="Ver detalle de paquete"
                        onClick={() => openDetail(paquete)}
                    />
                    <HoverActionButton
                        icon={<Pencil size={16} strokeWidth={2} />}
                        label="Editar maestro"
                        title="Editar paquete maestro"
                        onClick={() => openEditarMaestro(paquete)}
                    />
                    <HoverActionButton
                        icon={<Tags size={16} strokeWidth={2} />}
                        label="Gestionar ofertas"
                        title="Gestionar ofertas por sucursal"
                        onClick={() => openGestionarOfertas(paquete)}
                    />
                </div>
            );
        }

        return (
            <div className="flex w-full flex-wrap items-center justify-start gap-2">
                <HoverActionButton
                    icon={<Eye size={16} strokeWidth={2} />}
                    label="Ver detalle"
                    title="Ver detalle de paquete"
                    onClick={() => openDetail(paquete)}
                />
                <HoverActionButton
                    icon={<Pencil size={16} strokeWidth={2} />}
                    label="Editar maestro"
                    title="Editar paquete maestro"
                    onClick={() => openEditarMaestro(paquete)}
                />
                <HoverActionButton
                    icon={<Tags size={16} strokeWidth={2} />}
                    label="Editar oferta"
                    title="Editar oferta de sucursal"
                    onClick={() => openEditarOferta(paquete)}
                />
                <HoverActionButton
                    icon={paquete?.activo ? <ToggleLeft size={16} strokeWidth={2} /> : <ToggleRight size={16} strokeWidth={2} />}
                    label={paquete?.activo ? 'Inactivar oferta' : 'Activar oferta'}
                    title={paquete?.activo ? 'Inactivar oferta de sucursal' : 'Activar oferta de sucursal'}
                    tone={paquete?.activo ? 'warning' : 'success'}
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
                                {loading ? 'Cargando...' : `${filteredPaquetes.length} de ${displayPaquetes.length} paquete(s)`}
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

                            <Button onClick={openCrear} className="gap-2">
                                <Plus size={15} /> Nuevo maestro
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
                    action={<Button size="sm" onClick={openCrear}>Crear paquete maestro</Button>}
                />
            ) : null}

            {!loading && !listError && displayPaquetes.length > 0 && filteredPaquetes.length === 0 ? (
                <EmptyState
                    icon={Search}
                    title="Sin resultados"
                    description="No hay coincidencias con la busqueda o filtros actuales."
                />
            ) : null}

            {!loading && !listError && filteredPaquetes.length > 0 && view === 'cards' ? (
                <CardsCarousel
                    items={filteredPaquetes}
                    getItemKey={(paquete) => `${paquete?.id_paquete || 'pkg'}:${sucursal ? paquete?.id_sucursal || 'all' : 'master'}`}
                    renderItem={(paquete, index, pageIndex) => (
                        <DataCard
                            key={`${paquete.id_paquete || 'pkg'}:${sucursal ? paquete.id_sucursal || 'all' : 'master'}`}
                            animationDelay={(pageIndex * 0.02) + (index * 0.05)}
                            avatar={<Package size={16} />}
                            title={paquete.nombre_paquete || 'Paquete'}
                            subtitle={paquete.descripcion || 'Sin descripcion'}
                            badge={sucursal ? <PackageStatusBadge activo={Boolean(paquete.activo)} /> : <span className="mf-badge mf-badge-gold">Maestro</span>}
                            fields={[
                                ...(!sucursal ? [{
                                    label: 'Sucursales asociadas',
                                    value: getPackageBranchSummary(paquete, branchNameById),
                                }] : []),
                                {
                                    label: sucursal ? 'Precio en esta sucursal' : 'Precio por sucursal',
                                    value: <span className="font-mono font-bold text-[var(--mf-accent)]">{sucursal ? formatPrice(paquete.precio_hnl) : getPackagePriceSummary(paquete)}</span>,
                                },
                                ...(sucursal ? [{ label: 'Orden visual en esta sucursal', value: Number(paquete.orden_visual ?? 100) }] : []),
                                { label: 'Servicios', value: getItemsCount(paquete) },
                                { label: 'Composicion', value: <PackageCompositionBadge itemsCount={getItemsCount(paquete)} /> },
                                ...(sucursal
                                    ? [{ label: 'Publico en esta sucursal', value: <PackageVisibilityBadge visiblePublico={Boolean(paquete.visible_publico)} /> }]
                                    : [{ label: 'Resumen de ofertas', value: getPackageOfferStateSummary(paquete) }]),
                                ...(sucursal ? [{ label: 'Estado en esta sucursal', value: <PackageStatusBadge activo={Boolean(paquete.activo)} /> }] : []),
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
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursales asociadas</TableHead>
                                ) : null}
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Paquete maestro</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">{sucursal ? 'Precio sucursal' : 'Precio por sucursal'}</TableHead>
                                {sucursal ? (
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Orden</TableHead>
                                ) : null}
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Servicios</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Composicion</TableHead>
                                {sucursal ? (
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden md:table-cell">Publico</TableHead>
                                ) : null}
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">{sucursal ? 'Estado en esta sucursal' : 'Ofertas'}</TableHead>
                                <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredPaquetes.map((paquete) => (
                                <TableRow key={`${paquete.id_paquete || 'pkg'}:${sucursal ? paquete.id_sucursal || 'all' : 'master'}`} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">
                                    {!sucursal ? (
                                        <TableCell className="text-[var(--mf-text-2)]">
                                            {getPackageBranchSummary(paquete, branchNameById)}
                                        </TableCell>
                                    ) : null}
                                    <TableCell className="font-medium text-[var(--mf-text)]">
                                        <div>{paquete.nombre_paquete}</div>
                                        {paquete.descripcion ? (
                                            <div className="text-xs text-[var(--mf-text-2)] mt-0.5">{paquete.descripcion}</div>
                                        ) : null}
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-semibold text-[var(--mf-accent)]">
                                        {sucursal ? formatPrice(paquete.precio_hnl) : getPackagePriceSummary(paquete)}
                                    </TableCell>
                                    {sucursal ? (
                                        <TableCell className="text-center text-[var(--mf-text-2)]">
                                            {Number(paquete.orden_visual ?? 100)}
                                        </TableCell>
                                    ) : null}
                                    <TableCell className="text-center text-[var(--mf-text-2)]">
                                        {getItemsCount(paquete)}
                                    </TableCell>
                                    <TableCell className="text-center hidden md:table-cell">
                                        <PackageCompositionBadge itemsCount={getItemsCount(paquete)} />
                                    </TableCell>
                                    {sucursal ? (
                                        <TableCell className="text-center hidden md:table-cell">
                                            <PackageVisibilityBadge visiblePublico={Boolean(paquete.visible_publico)} />
                                        </TableCell>
                                    ) : null}
                                    <TableCell className="text-center">
                                        {sucursal ? <PackageStatusBadge activo={Boolean(paquete.activo)} /> : getPackageOfferStateSummary(paquete)}
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
                        <DialogTitle>
                            {dialogMode === 'editOffer'
                                ? 'Editar oferta de sucursal'
                                : dialogMode === 'addOffer'
                                    ? 'Agregar oferta a otra sucursal'
                                    : dialogMode === 'editMaster'
                                        ? 'Editar paquete maestro'
                                        : 'Nuevo paquete maestro'}
                        </DialogTitle>
                        <DialogDescription>
                            {dialogMode === 'editOffer'
                                ? 'Estos cambios solo aplican a la oferta del paquete en esta sucursal.'
                                : dialogMode === 'addOffer'
                                    ? 'Esta accion no crea otro paquete maestro. Solo agrega una oferta operativa para la sucursal seleccionada.'
                                    : dialogMode === 'editMaster'
                                        ? 'Estos cambios afectan el paquete maestro y se reflejan en todas las sucursales donde este ofertado.'
                                        : 'Crea el paquete maestro global y su primera oferta operativa.'}
                        </DialogDescription>
                    </DialogHeader>
                    <PaqueteForm
                        values={formValues}
                        onChange={handleFormChange}
                        serviciosList={serviciosList}
                        branchName={branchNameById[editTarget?._mutation_branch_id || sucursal || initialOfferBranchId]}
                        mode={dialogMode}
                        initialBranchId={initialOfferBranchId}
                        availableBranches={dialogMode === 'addOffer' ? getUnassociatedBranches(editTarget, availableBranches) : availableBranches}
                        onInitialBranchChange={handleInitialBranchChange}
                        onCreateOfferToggle={handleCreateOfferToggle}
                        onCreateOfferChange={handleCreateOfferChange}
                    />
                    {dialogMode === 'create' && formValues.ofertas.length > 0 && serviciosList.length === 0 ? (
                        <ErrorBanner message="No hay servicios activos comunes en las sucursales seleccionadas para construir este paquete." />
                    ) : null}
                    {formError ? <ErrorBanner message={formError} /> : null}
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>
                            Cancelar
                        </Button>
                        <Button onClick={handleGuardar} disabled={formLoading} className="gap-2 min-w-[120px]">
                            {formLoading ? <Loader2 size={15} className="animate-spin" /> : null}
                            {editTarget ? 'Guardar cambios' : 'Crear paquete maestro'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Detalle de paquete maestro</DialogTitle>
                        <DialogDescription className="sr-only">
                            Consulta la composicion del paquete maestro y su oferta por sucursal.
                        </DialogDescription>
                    </DialogHeader>
                    {detailTarget ? (
                        <DetailInfoModalContent
                            summary={{
                                icon: <Package size={16} />,
                                title: detailTarget.nombre_paquete || '-',
                                subtitle: detailTarget.descripcion || 'Sin descripcion',
                                badge: sucursal ? <PackageStatusBadge activo={Boolean(detailTarget.activo)} /> : <span className="mf-badge mf-badge-gold">Maestro</span>,
                            }}
                            sections={[
                                {
                                    id: 'comercial',
                                    title: sucursal ? 'Oferta en esta sucursal' : 'Oferta por sucursal',
                                    icon: <Tags size={14} />,
                                    fields: [
                                        {
                                            label: sucursal ? 'Precio HNL' : 'Precio por sucursal',
                                            value: sucursal ? formatPrice(detailTarget.precio_hnl) : getPackagePriceSummary(detailTarget),
                                        },
                                        ...(sucursal ? [{ label: 'Orden visual', value: Number(detailTarget.orden_visual ?? 100) }] : []),
                                        { label: 'Sucursales asociadas', value: getPackageBranchSummary(detailTarget, branchNameById) },
                                        ...(sucursal
                                            ? [
                                                { label: 'Estado en esta sucursal', value: <PackageStatusBadge activo={Boolean(detailTarget.activo)} /> },
                                                { label: 'Visibilidad publica en esta sucursal', value: <PackageVisibilityBadge visiblePublico={Boolean(detailTarget.visible_publico)} /> },
                                            ]
                                            : [{ label: 'Resumen de ofertas', value: getPackageOfferStateSummary(detailTarget) }]),
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

            <Dialog open={offersOpen} onOpenChange={setOffersOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Gestionar ofertas</DialogTitle>
                        <DialogDescription>
                            Ofertas existentes por sucursal para {offersTarget?.nombre_paquete || 'este paquete'}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        {getPackageOffers(offersTarget).map((offer) => (
                            <div
                                key={`${offersTarget?.id_paquete || 'pkg'}-${offer?.id_sucursal || 'branch'}`}
                                className="rounded-[14px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_42%,transparent)] p-3"
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="space-y-1 text-sm">
                                        <div className="font-medium text-[var(--mf-text)]">
                                            {branchNameById[offer?.id_sucursal] || offer?.id_sucursal || 'Sucursal no identificada'}
                                        </div>
                                        <div className="flex flex-wrap gap-2 text-xs text-[var(--mf-text-2)]">
                                            <span>Precio: <strong className="font-mono text-[var(--mf-accent)]">{formatPrice(offer?.precio_hnl)}</strong></span>
                                            <span>Orden: {Number(offer?.orden_visual ?? 100)}</span>
                                            <PackageStatusBadge activo={Boolean(offer?.activo)} />
                                            <PackageVisibilityBadge visiblePublico={Boolean(offer?.visible_publico)} />
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
                                    Esta accion no crea otro paquete maestro. Solo agrega una oferta operativa para la sucursal seleccionada.
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
                title={stateTarget?._nextActivo ? 'Activar oferta' : 'Inactivar oferta'}
                description={
                    stateTarget
                        ? stateTarget._nextActivo
                            ? `Se activara la oferta de ${stateTarget.nombre_paquete} en la sucursal seleccionada.`
                            : stateTarget._confirmPendingAppointments
                                ? `Esta oferta tiene ${Number(stateTarget?._totalFutureAppointments || 0)} cita(s) futura(s). Al confirmar, se inactivara para nuevos usos y se conservara solo en citas ya creadas.`
                                : `Se inactivara la oferta de ${stateTarget.nombre_paquete} en la sucursal seleccionada.`
                        : ''
                }
                confirmLabel={stateTarget?._nextActivo ? 'Activar oferta' : 'Inactivar oferta'}
                cancelLabel="Cancelar"
                loading={stateLoading}
                onConfirm={handleConfirmState}
            />
        </div>
    );
}
