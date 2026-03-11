// src/features/admin/pages/AdminSucursalesPage.jsx
// CRUD completo de sucursales con toggle Tabla ↔ Cards.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, MapPin, Phone, Plus, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
    listAdminSucursales, createAdminSucursal,
    updateAdminSucursal, deleteAdminSucursal, listAdminEmpresas,
} from '../lib/adminSucursalesApi.js';
import { Button } from '../../../components/ui/button.jsx';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import ViewToggle from '../../../components/data/ViewToggle.jsx';
import DataCard from '../../../components/data/DataCard.jsx';
import CardsCarousel from '../../../components/data/CardsCarousel.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '../../../components/ui/table.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { removeItemById, replaceItemById } from '../../../lib/collectionState.js';

function extractMessage(err) {
    return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

const FORM_DEFAULTS = { id_empresa: '', nombre_sucursal: '', direccion: '', telefono: '' };

function validateForm(v) {
    if (!v.id_empresa) return 'Selecciona una empresa.';
    if (!v.nombre_sucursal.trim()) return 'El nombre es requerido.';
    return null;
}

// ── Formulario ───────────────────────────────────────────────────────────
function SucursalForm({ values, onChange, empresas }) {
    return (
        <div className="flex flex-col gap-4 mt-2">
            {/* Empresa */}
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-empresa" className="mf-label">Empresa *</Label>
                <select
                    id="f-empresa"
                    value={values.id_empresa}
                    onChange={(e) => onChange('id_empresa', e.target.value)}
                    className="mf-select"
                >
                    <option value="">— Seleccionar empresa —</option>
                    {empresas.map((e) => (
                        <option key={e.id_empresa} value={e.id_empresa}>{e.nombre_empresa}</option>
                    ))}
                </select>
            </div>

            {/* Nombre */}
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-nombre" className="mf-label">Nombre de sucursal *</Label>
                <Input
                    id="f-nombre"
                    className="mf-input"
                    value={values.nombre_sucursal}
                    onChange={(e) => onChange('nombre_sucursal', e.target.value)}
                    placeholder="Ej. Sucursal Centro"
                    maxLength={140}
                />
            </div>

            {/* Dirección */}
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-dir" className="mf-label flex items-center gap-1.5">
                    <MapPin size={12} /> Dirección
                </Label>
                <Input
                    id="f-dir"
                    className="mf-input"
                    value={values.direccion}
                    onChange={(e) => onChange('direccion', e.target.value)}
                    placeholder="Ej. Col. Palmira, Tegucigalpa"
                    maxLength={300}
                />
            </div>

            {/* Teléfono */}
            <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-tel" className="mf-label flex items-center gap-1.5">
                    <Phone size={12} /> Teléfono
                </Label>
                <Input
                    id="f-tel"
                    className="mf-input"
                    value={values.telefono}
                    onChange={(e) => onChange('telefono', e.target.value)}
                    placeholder="Ej. +504 2222-3333"
                    maxLength={30}
                />
            </div>
        </div>
    );
}

// ── Vista Cards ──────────────────────────────────────────────────────────
function SucursalCards({ sucursales, isSuperAdmin, onEditar, onDelete }) {
    return (
        <CardsCarousel
            items={sucursales}
            getItemKey={(sucursal) => sucursal?.id_sucursal}
            renderItem={(s, i, pageIndex) => (
                <DataCard
                    key={s.id_sucursal}
                    animationDelay={(pageIndex * 0.02) + (i * 0.05)}
                    avatar={<Building2 size={18} />}
                    title={s.nombre_sucursal}
                    subtitle={s.direccion || undefined}
                    badge={
                        <span className={`mf-badge ${s.estado ? 'mf-badge-green' : 'mf-badge-red'}`}>
                            {s.estado ? 'Activa' : 'Inactiva'}
                        </span>
                    }
                    fields={[
                        { label: 'Telefono', value: s.telefono || '—' },
                    ]}
                    actions={isSuperAdmin && (
                        <>
                            <button
                                type="button"
                                onClick={() => onEditar(s)}
                                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] hover:text-[var(--mf-accent)] transition-colors"
                            >
                                <Pencil size={14} strokeWidth={2} />
                            </button>
                            <button
                                type="button"
                                onClick={() => onDelete(s)}
                                className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                            >
                                <Trash2 size={14} strokeWidth={2} />
                            </button>
                        </>
                    )}
                />
            )}
        />
    );
}

// ── Vista Tabla ──────────────────────────────────────────────────────────
function SucursalTable({ sucursales, isSuperAdmin, onEditar, onDelete }) {
    return (
        <div className="mf-table-wrap">
            <Table>
                <TableHeader>
                    <TableRow className="border-[var(--mf-nav-border)]">
                        {['Nombre', 'Dirección', 'Teléfono', 'Estado'].map((h) => (
                            <TableHead key={h} className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">{h}</TableHead>
                        ))}
                        {isSuperAdmin && <TableHead className="text-right text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Acciones</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {sucursales.map((s) => (
                        <TableRow key={s.id_sucursal} className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors">
                            <TableCell className="font-medium text-[var(--mf-text)] whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                    <Building2 size={15} className="text-[var(--mf-accent)] shrink-0" />
                                    {s.nombre_sucursal}
                                </div>
                            </TableCell>
                            <TableCell className="text-[var(--mf-text-2)] text-sm max-w-[180px] truncate">{s.direccion || '—'}</TableCell>
                            <TableCell className="text-[var(--mf-text-2)] text-sm whitespace-nowrap">{s.telefono || '—'}</TableCell>
                            <TableCell>
                                <span className={`mf-badge ${s.estado ? 'mf-badge-green' : 'mf-badge-red'}`}>
                                    {s.estado ? 'Activa' : 'Inactiva'}
                                </span>
                            </TableCell>
                            {isSuperAdmin && (
                                <TableCell className="text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                        <button type="button" onClick={() => onEditar(s)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] hover:text-[var(--mf-accent)] transition-colors">
                                            <Pencil size={14} strokeWidth={2} />
                                        </button>
                                        <button type="button" onClick={() => onDelete(s)} className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                                            <Trash2 size={14} strokeWidth={2} />
                                        </button>
                                    </div>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

// ── Página ───────────────────────────────────────────────────────────────
export default function AdminSucursalesPage() {
    const navigate = useNavigate();
    const { roles } = useAuth();
    const isSuperAdmin = Array.isArray(roles) && roles.includes('super_admin');
    const notifications = useNotifications();

    const [sucursales, setSucursales] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState('');
    const [view, setView] = useState(
        () => { try { const v = localStorage.getItem('mf-view-sucursales'); return (v === 'table' || v === 'cards') ? v : 'cards'; } catch { return 'cards'; } }
    );

    // Dialog crear/editar
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [formValues, setFormValues] = useState(FORM_DEFAULTS);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    // Dialog confirmar eliminar
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const fetchSucursales = useCallback(async ({ silent = false } = {}) => {
        if (!silent) {
            setLoading(true);
            setListError('');
        }
        try {
            const data = await listAdminSucursales();
            const p = data?.data ?? data;
            setSucursales(Array.isArray(p?.sucursales) ? p.sucursales : []);
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
    }, [navigate]);

    const fetchEmpresas = useCallback(async () => {
        try {
            const data = await listAdminEmpresas();
            const p = data?.data ?? data;
            setEmpresas(p?.empresas ?? []);
        } catch { /* silencioso */ }
    }, []);

    useEffect(() => {
        void fetchSucursales();
        if (isSuperAdmin) void fetchEmpresas();
    }, [fetchSucursales, fetchEmpresas, isSuperAdmin]);

    function handleFormChange(field, value) {
        setFormValues((prev) => ({ ...prev, [field]: value }));
    }

    function openCrear() {
        setEditTarget(null); setFormValues(FORM_DEFAULTS); setFormError(''); setDialogOpen(true);
    }

    function openEditar(s) {
        setEditTarget(s);
        setFormValues({ id_empresa: s.id_empresa ?? '', nombre_sucursal: s.nombre_sucursal ?? '', direccion: s.direccion ?? '', telefono: s.telefono ?? '' });
        setFormError(''); setDialogOpen(true);
    }

    async function handleGuardar() {
        const err = validateForm(formValues);
        if (err) { setFormError(err); return; }
        setFormLoading(true); setFormError('');
        const payload = {
            id_empresa: formValues.id_empresa,
            nombre_sucursal: formValues.nombre_sucursal.trim(),
            direccion: formValues.direccion.trim() || null,
            telefono: formValues.telefono.trim() || null,
        };
        try {
            const response = editTarget
                ? await updateAdminSucursal(editTarget.id_sucursal, payload)
                : await createAdminSucursal({ ...payload, estado: true });
            const result = response?.data ?? response;
            const nextSucursal = result?.sucursal;
            if (nextSucursal?.id_sucursal) {
                setSucursales((prev) => replaceItemById(prev, nextSucursal, (entry) => entry?.id_sucursal));
            }
            notifications.success(editTarget ? 'Sucursal actualizada.' : 'Sucursal creada.', { dedupeKey: 'sucursales-save-ok' });
            setDialogOpen(false);
            // AM: Refresco silencioso para evitar recarga visible del listado.
            void fetchSucursales({ silent: true });
        } catch (e) {
            if (e.status === 401) { navigate('/login'); return; }
            const message = extractMessage(e);
            setFormError(message);
            notifications.error(message, { dedupeKey: 'sucursales-save-error' });
        } finally { setFormLoading(false); }
    }

    function openDelete(s) {
        setDeleteTarget(s); setConfirmOpen(true);
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;
        setDeleteLoading(true);
        try {
            await deleteAdminSucursal(deleteTarget.id_sucursal);
            setSucursales((prev) => removeItemById(prev, deleteTarget.id_sucursal, (entry) => entry?.id_sucursal));
            setConfirmOpen(false);
            notifications.warning('Sucursal eliminada.', { dedupeKey: 'sucursales-delete-ok' });
            void fetchSucursales({ silent: true });
        } catch (e) {
            if (e.status === 401) { navigate('/login'); return; }
            notifications.error(extractMessage(e), { dedupeKey: 'sucursales-delete-error' });
        } finally { setDeleteLoading(false); }
    }

    return (
        <div className="mf-page">
            {/* Encabezado */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
                        Gestión · Sucursales
                    </p>
                    <h1 className="mf-font-display mt-1 text-3xl leading-tight text-[var(--mf-text)]">
                        Sucursales
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--mf-text-2)]">
                        {loading ? 'Cargando…' : `${sucursales.length} registro(s)`}
                    </span>
                    <ViewToggle defaultView={view} onViewChange={setView} storageKey="sucursales" />
                    {isSuperAdmin && (
                        <Button onClick={openCrear} size="sm" className="gap-2">
                            <Plus size={15} strokeWidth={2.2} /> Nueva
                        </Button>
                    )}
                </div>
            </div>

            <div className="mf-divider" />

            {/* Estados */}
            {listError && <ErrorBanner message={listError} onRetry={fetchSucursales} />}
            {loading && !listError && <LoadingSpinner />}

            {!loading && !listError && sucursales.length === 0 && (
                <EmptyState
                    icon={Building2}
                    title="Sin sucursales"
                    description="No hay sucursales registradas aún."
                    action={isSuperAdmin && (
                        <Button onClick={openCrear} size="sm" className="gap-2">
                            <Plus size={14} /> Agregar primera
                        </Button>
                    )}
                />
            )}

            {/* Datos */}
            {!loading && !listError && sucursales.length > 0 && (
                view === 'cards'
                    ? <SucursalCards sucursales={sucursales} isSuperAdmin={isSuperAdmin} onEditar={openEditar} onDelete={openDelete} />
                    : <SucursalTable sucursales={sucursales} isSuperAdmin={isSuperAdmin} onEditar={openEditar} onDelete={openDelete} />
            )}

            {/* Dialog Crear/Editar */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editTarget ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
                    </DialogHeader>
                    <SucursalForm values={formValues} onChange={handleFormChange} empresas={empresas} />
                    {formError && (
                        <p className="mt-2 flex items-center gap-2 rounded-[12px] bg-red-500/10 px-3 py-2 text-sm text-red-400">
                            {formError}
                        </p>
                    )}
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>Cancelar</Button>
                        <Button onClick={handleGuardar} disabled={formLoading} className="gap-2 min-w-[100px]">
                            {formLoading ? 'Guardando…' : 'Guardar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ActionConfirmDialog
                open={confirmOpen}
                onOpenChange={(open) => {
                    if (!open && !deleteLoading) {
                        setConfirmOpen(false);
                        setDeleteTarget(null);
                    }
                }}
                tone="danger"
                title="Eliminar sucursal"
                description={
                    deleteTarget
                        ? `Vas a eliminar ${deleteTarget.nombre_sucursal}. Esta accion no se puede deshacer facilmente.`
                        : ''
                }
                confirmLabel="Eliminar"
                cancelLabel="Cancelar"
                loading={deleteLoading}
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
}


