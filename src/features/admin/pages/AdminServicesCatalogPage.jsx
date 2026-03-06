// src/features/admin/pages/AdminServicesCatalogPage.jsx
// A3 — Pantalla CRUD de catálogo de servicios (Admin).
// Lógica de branchIds: 1 => auto, 2+ => selector por nombre, 0 => dropdown de todas.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Pencil, Trash2, AlertCircle, Building2, Scissors } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
    listAdminServicios,
    createAdminServicio,
    updateAdminServicio,
    deleteAdminServicio,
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
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractMessage(err) {
    return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

// ── Selector de sucursal (muestra nombre, no UUID) ───────────────────────────
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

    // 1 sucursal asignada → la mostramos solo como nombre, sin input
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

    // 2+ sucursales o super_admin → dropdown con nombre
    if (loadingBranches) {
        return <p className="text-xs text-[var(--mf-text-2)] flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Cargando sucursales…</p>;
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
                <option value="">— Seleccionar sucursal —</option>
                {availableBranches.map((s) => (
                    <option key={s.id_sucursal} value={s.id_sucursal}>
                        {s.nombre_sucursal}
                    </option>
                ))}
            </select>
        </div>
    );
}

// ── Formulario servicio ───────────────────────────────────────────────────────
const FORM_DEFAULTS = {
    nombre_servicio: '',
    descripcion: '',
    duracion_min: '',
    buffer_min: '',
    precio_hnl: '',
};

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
                <Label htmlFor="f-desc">Descripción</Label>
                <Input
                    id="f-desc"
                    value={values.descripcion}
                    onChange={(e) => onChange('descripcion', e.target.value)}
                    placeholder="Descripción opcional"
                />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
    if (isNaN(dur) || dur < 1) return 'La duración debe ser al menos 1 minuto.';
    const buf = parseInt(values.buffer_min, 10);
    if (isNaN(buf) || buf < 0) return 'El buffer no puede ser negativo.';
    const precio = parseFloat(values.precio_hnl);
    if (isNaN(precio) || precio < 0) return 'El precio no puede ser negativo.';
    return null;
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function AdminServicesCatalogPage() {
    const navigate = useNavigate();
    const { branchIds, roles } = useAuth();
    const isSuperAdmin = Array.isArray(roles) && roles.includes('super_admin');

    // Sucursal activa según reglas
    const [sucursal, setSucursal] = useState(branchIds.length === 1 ? branchIds[0] : '');
    const [allBranches, setAllBranches] = useState([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [servicios, setServicios] = useState([]);
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState('');
    const [view, setView] = useState(
        () => { try { const v = localStorage.getItem('mf-view-servicios'); return (v === 'table' || v === 'cards') ? v : 'cards'; } catch { return 'cards'; } }
    );

    // Dialogo crear/editar
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null); // null => crear
    const [formValues, setFormValues] = useState(FORM_DEFAULTS);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    // Dialogo confirmar inactivar
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState('');

    // ── Carga sucursales (para nombres en selector) ─────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setLoadingBranches(true);
        listAdminSucursales()
            .then((data) => {
                if (cancelled) return;
                const payload = data?.data ?? data;
                setAllBranches(Array.isArray(payload?.sucursales) ? payload.sucursales : []);
            })
            .catch(() => { /* silencioso — el selector cae en fallback */ })
            .finally(() => { if (!cancelled) setLoadingBranches(false); });
        return () => { cancelled = true; };
    }, []);

    // ── Carga datos ─────────────────────────────────────────────────────────────
    const fetchServicios = useCallback(async () => {
        if (!isSuperAdmin && !sucursal) return; // No llamar API sin sucursal excepto admin
        setLoading(true);
        setListError('');
        try {
            const data = await listAdminServicios(sucursal ? { id_sucursal: sucursal } : {});
            const payloadData = data?.data ?? data;
            const lista = payloadData?.servicios ?? [];
            setServicios(Array.isArray(lista) ? lista : []);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            setListError(extractMessage(err));
        } finally {
            setLoading(false);
        }
    }, [sucursal, navigate, isSuperAdmin]);

    useEffect(() => {
        void fetchServicios();
    }, [fetchServicios]);

    // ── Handlers form ───────────────────────────────────────────────────────────
    function handleFormChange(field, value) {
        setFormValues((prev) => ({ ...prev, [field]: value }));
    }

    function openCrear() {
        setEditTarget(null);
        setFormValues(FORM_DEFAULTS);
        setFormError('');
        setDialogOpen(true);
    }

    function openEditar(servicio) {
        setEditTarget(servicio);
        setFormValues({
            nombre_servicio: servicio.nombre_servicio ?? '',
            descripcion: servicio.descripcion ?? '',
            duracion_min: String(servicio.duracion_min ?? ''),
            buffer_min: String(servicio.buffer_min ?? ''),
            precio_hnl: String(servicio.precio_hnl ?? ''),
        });
        setFormError('');
        setDialogOpen(true);
    }

    async function handleGuardar() {
        const validationError = validateForm(formValues);
        if (validationError) { setFormError(validationError); return; }

        if (!sucursal) {
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
            id_sucursal: sucursal,
        };

        try {
            if (editTarget) {
                await updateAdminServicio(editTarget.id_servicio ?? editTarget.id, payload);
            } else {
                await createAdminServicio(payload);
            }
            setDialogOpen(false);
            void fetchServicios();
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            setFormError(extractMessage(err));
        } finally {
            setFormLoading(false);
        }
    }

    // ── Handlers delete ─────────────────────────────────────────────────────────
    function openConfirmDelete(servicio) {
        setDeleteTarget(servicio);
        setDeleteError('');
        setConfirmOpen(true);
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;
        if (!sucursal) {
            setDeleteError('No hay sucursal seleccionada.');
            return;
        }
        setDeleteLoading(true);
        setDeleteError('');
        try {
            await deleteAdminServicio(deleteTarget.id_servicio ?? deleteTarget.id, sucursal);
            setConfirmOpen(false);
            void fetchServicios();
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            setDeleteError(extractMessage(err));
        } finally {
            setDeleteLoading(false);
        }
    }

    // ── Render ──────────────────────────────────────────────────────────────────
    const sinSucursal = !isSuperAdmin && !sucursal;

    // ── Vista Cards de servicios ─────────────────────────────────────────────
    function ServicioCards() {
        return (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {servicios.map((s, i) => (
                    <DataCard
                        key={s.id_servicio ?? s.id}
                        animationDelay={i * 0.05}
                        avatar={<Scissors size={18} />}
                        title={s.nombre_servicio}
                        subtitle={s.descripcion}
                        badge={
                            <span className={`mf-badge ${s.activo ? 'mf-badge-green' : 'mf-badge-red'}`}>
                                {s.activo ? 'Activo' : 'Inactivo'}
                            </span>
                        }
                        fields={[
                            { label: 'Precio', value: <span className="font-mono font-bold text-[var(--mf-accent)]">L {Number(s.precio_hnl).toFixed(2)}</span> },
                            { label: 'Duración', value: `${s.duracion_min} min` },
                            { label: 'Buffer', value: `${s.buffer_min} min` },
                            { label: 'Tarifa', value: <span className={`mf-badge ${s.tarifa_activa ? 'mf-badge-gold' : 'mf-badge-muted'}`}>{s.tarifa_activa ? 'Activa' : 'Sin tarifa'}</span> },
                        ]}
                        actions={
                            <>
                                <button type="button" onClick={() => openEditar(s)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] hover:text-[var(--mf-accent)] transition-colors">
                                    <Pencil size={14} strokeWidth={2} />
                                </button>
                                <button type="button" onClick={() => openConfirmDelete(s)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                                    <Trash2 size={14} strokeWidth={2} />
                                </button>
                            </>
                        }
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="mf-page">
            {/* Encabezado */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
                        Catálogo · Servicios
                    </p>
                    <h1 className="mf-font-display mt-1 text-3xl leading-tight text-[var(--mf-text)]">
                        Servicios
                    </h1>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    <p className="text-sm text-[var(--mf-text-2)]">
                        {loading ? 'Cargando…' : `${servicios.length} servicio(s)`}
                    </p>
                    <ViewToggle defaultView={view} onViewChange={setView} storageKey="servicios" />
                    <Button onClick={openCrear} size="sm" className="gap-2" disabled={!sucursal}>
                        <Plus size={15} strokeWidth={2.2} /> Nuevo
                    </Button>
                </div>
            </div>

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
                    <span>⚠️ Selecciona una sucursal para cargar y operar el catálogo.</span>
                </div>
            )}

            {/* Estados */}
            {listError && <ErrorBanner message={listError} onRetry={fetchServicios} />}
            {loading && !listError && <LoadingSpinner />}

            {!loading && !listError && !sinSucursal && servicios.length === 0 && (
                <EmptyState icon={Scissors} title="Sin servicios" description="No hay servicios registrados para esta sucursal." />
            )}

            {/* Datos */}
            {!loading && !listError && servicios.length > 0 && (
                view === 'cards' ? <ServicioCards /> :
                    <div className="mf-table-wrap">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-[var(--mf-nav-border)]">
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                                    {!sucursal && <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Sucursal</TableHead>}
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Dur (min)</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Buffer</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Precio HNL</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Activo</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center hidden sm:table-cell">Tarifa</TableHead>
                                    <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {servicios.map((s) => (
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
                                                {allBranches.find(b => b.id_sucursal === s.id_sucursal)?.nombre_sucursal || <span className="opacity-50">Global</span>}
                                            </TableCell>
                                        )}
                                        <TableCell className="text-center text-[var(--mf-text-2)]">{s.duracion_min}</TableCell>
                                        <TableCell className="text-center text-[var(--mf-text-2)]">{s.buffer_min}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold text-[var(--mf-accent)]">
                                            L {Number(s.precio_hnl).toFixed(2)}
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <span className={`mf-badge ${s.activo ? 'mf-badge-green' : 'mf-badge-red'}`}>
                                                {s.activo ? 'Sí' : 'No'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-center hidden sm:table-cell">
                                            <span className={`mf-badge ${s.tarifa_activa ? 'mf-badge-gold' : 'mf-badge-muted'}`}>
                                                {s.tarifa_activa ? 'Activa' : '—'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <button
                                                    type="button"
                                                    aria-label="Editar servicio"
                                                    onClick={() => openEditar(s)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] hover:text-[var(--mf-accent)] transition-colors"
                                                >
                                                    <Pencil size={14} strokeWidth={2} />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label="Inactivar servicio"
                                                    onClick={() => openConfirmDelete(s)}
                                                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                                                >
                                                    <Trash2 size={14} strokeWidth={2} />
                                                </button>
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
                            {formLoading ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear servicio'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog Confirmar Inactivar */}
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>¿Inactivar servicio?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[var(--mf-text-2)] leading-6">
                        Se inactivará <strong className="text-[var(--mf-text)]">{deleteTarget?.nombre_servicio}</strong>.
                        Esta acción puede revertirse desde el panel de administración.
                    </p>
                    {deleteError && <ErrorBanner message={deleteError} />}
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleteLoading}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleConfirmDelete}
                            disabled={deleteLoading}
                            className="gap-2"
                        >
                            {deleteLoading ? 'Inactivando…' : 'Inactivar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
