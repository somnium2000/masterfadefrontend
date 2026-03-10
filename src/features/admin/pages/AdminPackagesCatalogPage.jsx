// src/features/admin/pages/AdminPackagesCatalogPage.jsx
// Pantalla CRUD de catálogo de paquetes (Admin).
// Reutiliza patrón de AdminServicesCatalogPage: tabla + dialogs + branchIds logic.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Pencil, Trash2, AlertCircle, Package } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext.jsx';
import {
    listAdminPaquetes,
    createAdminPaquete,
    updateAdminPaquete,
    deleteAdminPaquete,
} from '../lib/adminPackagesApi.js';
import { listAdminServicios } from '../lib/adminCatalogApi.js';
import { Button } from '../../../components/ui/button.jsx';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../../../components/ui/dialog.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { Label } from '../../../components/ui/label.jsx';
import { Separator } from '../../../components/ui/separator.jsx';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../../components/ui/table.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ActionConfirmDialog from '../../../components/feedback/ActionConfirmDialog.jsx';
import { removeItemById, replaceItemById } from '../../../lib/collectionState.js';
import { emitCatalogSync } from '../../../lib/catalogSync.js';

// ── Helpers ──────────────────────────────────────────────────────────────────
function extractMessage(err) {
    return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

// ── Selector de servicios para items del paquete ─────────────────────────────
function PackageItemsEditor({ items, onChange, serviciosList }) {
    function addItem() {
        onChange([...items, { id_servicio: '', cantidad: 1 }]);
    }

    function removeItem(index) {
        onChange(items.filter((_, i) => i !== index));
    }

    function updateItem(index, field, value) {
        const updated = items.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        );
        onChange(updated);
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-[var(--mf-text-2)]">
                    Servicios incluidos
                </Label>
                <button
                    type="button"
                    onClick={addItem}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-2 py-1 text-xs text-[var(--mf-accent)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)] transition-colors"
                >
                    <Plus size={12} /> Agregar
                </button>
            </div>
            {items.length === 0 && (
                <p className="text-xs text-[var(--mf-text-2)]">Sin servicios. Agrega al menos uno.</p>
            )}
            {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                    <select
                        value={item.id_servicio}
                        onChange={(e) => updateItem(idx, 'id_servicio', e.target.value)}
                        className="flex-1 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 py-2 text-sm text-[var(--mf-text)] focus:outline-none focus:ring-2 focus:ring-[var(--mf-accent)]/40"
                    >
                        <option value="">— Seleccionar servicio —</option>
                        {serviciosList.map((s) => (
                            <option key={s.id_servicio} value={s.id_servicio}>
                                {s.nombre_servicio}
                            </option>
                        ))}
                    </select>
                    <Input
                        type="number"
                        min="1"
                        value={item.cantidad}
                        onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                        className="w-16 text-center"
                        placeholder="1"
                    />
                    <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-colors"
                        aria-label="Quitar servicio"
                    >
                        <Trash2 size={13} strokeWidth={2} />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ── Formulario paquete ────────────────────────────────────────────────────────
const FORM_DEFAULTS = {
    nombre_paquete: '',
    descripcion: '',
    precio_hnl: '',
    items: [],
};

function PaqueteForm({ values, onChange, serviciosList }) {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
                <Label htmlFor="fp-nombre">Nombre del paquete *</Label>
                <Input
                    id="fp-nombre"
                    value={values.nombre_paquete}
                    onChange={(e) => onChange('nombre_paquete', e.target.value)}
                    placeholder="Ej. Paquete Premium"
                />
            </div>
            <div className="flex flex-col gap-1">
                <Label htmlFor="fp-desc">Descripción</Label>
                <Input
                    id="fp-desc"
                    value={values.descripcion}
                    onChange={(e) => onChange('descripcion', e.target.value)}
                    placeholder="Descripción opcional"
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
                    onChange={(e) => onChange('precio_hnl', e.target.value)}
                    placeholder="450.00"
                />
            </div>
            <PackageItemsEditor
                items={values.items}
                onChange={(newItems) => onChange('items', newItems)}
                serviciosList={serviciosList}
            />
        </div>
    );
}

function validateForm(values) {
    if (!values.nombre_paquete.trim()) return 'El nombre del paquete es requerido.';
    const precio = parseFloat(values.precio_hnl);
    if (isNaN(precio) || precio < 0) return 'El precio no puede ser negativo.';
    if (!values.items || values.items.length === 0) return 'Agrega al menos un servicio al paquete.';
    for (const item of values.items) {
        if (!item.id_servicio) return 'Selecciona un servicio para cada item del paquete.';
        const cant = parseInt(item.cantidad, 10);
        if (isNaN(cant) || cant < 1) return 'La cantidad de cada item debe ser al menos 1.';
    }
    return null;
}

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function AdminPackagesCatalogPage() {
    const navigate = useNavigate();
    const { branchIds } = useAuth();
    const notifications = useNotifications();

    // Sucursal activa (para cargar servicios disponibles)
    const sucursal = branchIds.length >= 1 ? branchIds[0] : '';

    // Data
    const [paquetes, setPaquetes] = useState([]);
    const [serviciosList, setServiciosList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState('');

    // Dialog crear/editar
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [formValues, setFormValues] = useState(FORM_DEFAULTS);
    const [formError, setFormError] = useState('');
    const [formLoading, setFormLoading] = useState(false);

    // Dialog confirmar inactivar
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // ── Carga datos ─────────────────────────────────────────────────────────────
    const fetchPaquetes = useCallback(async ({ silent = false } = {}) => {
        if (!silent) {
            setLoading(true);
            setListError('');
        }
        try {
            const data = await listAdminPaquetes();
            const payloadData = data?.data ?? data;
            const lista = payloadData?.paquetes ?? [];
            setPaquetes(Array.isArray(lista) ? lista : []);
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

    const fetchServicios = useCallback(async () => {
        if (!sucursal) return;
        try {
            const data = await listAdminServicios({ id_sucursal: sucursal });
            const payloadData = data?.data ?? data;
            const lista = payloadData?.servicios ?? [];
            setServiciosList(Array.isArray(lista) ? lista : []);
        } catch {
            // Silently fail — servicios list is for the dropdown only
        }
    }, [sucursal]);

    useEffect(() => {
        void fetchPaquetes();
        void fetchServicios();
    }, [fetchPaquetes, fetchServicios]);

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

    function openEditar(paquete) {
        setEditTarget(paquete);
        setFormValues({
            nombre_paquete: paquete.nombre_paquete ?? '',
            descripcion: paquete.descripcion ?? '',
            precio_hnl: String(paquete.precio_hnl ?? ''),
            items: Array.isArray(paquete.items)
                ? paquete.items.map((i) => ({
                    id_servicio: i.id_servicio,
                    cantidad: String(i.cantidad ?? 1),
                }))
                : [],
        });
        setFormError('');
        setDialogOpen(true);
    }

    async function handleGuardar() {
        const validationError = validateForm(formValues);
        if (validationError) { setFormError(validationError); return; }

        setFormLoading(true);
        setFormError('');

        const payload = {
            nombre_paquete: formValues.nombre_paquete.trim(),
            descripcion: formValues.descripcion.trim() || undefined,
            precio_hnl: parseFloat(formValues.precio_hnl),
            items: formValues.items.map((i) => ({
                id_servicio: i.id_servicio,
                cantidad: parseInt(i.cantidad, 10),
            })),
        };

        try {
            const response = editTarget
                ? await updateAdminPaquete(editTarget.id_paquete, payload)
                : await createAdminPaquete(payload);
            const result = response?.data ?? response;
            if (editTarget) {
                notifications.success('Paquete actualizado.', { dedupeKey: 'paquetes-save-ok' });
            } else {
                notifications.success('Paquete creado.', { dedupeKey: 'paquetes-save-ok' });
            }
            if (result?.id_paquete) {
                setPaquetes((prev) => sortPaquetes(replaceItemById(prev, result, (entry) => entry?.id_paquete)));
            }
            // AM: Sincroniza de inmediato el catalogo publico al crear/editar paquetes.
            emitCatalogSync(editTarget ? 'paquete-updated' : 'paquete-created');
            setDialogOpen(false);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            const message = extractMessage(err);
            setFormError(message);
            notifications.error(message, { dedupeKey: 'paquetes-save-error' });
        } finally {
            setFormLoading(false);
        }
    }

    // ── Handlers delete ─────────────────────────────────────────────────────────
    function openConfirmDelete(paquete) {
        setDeleteTarget(paquete);
        setConfirmOpen(true);
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return;
        setDeleteLoading(true);
        try {
            await deleteAdminPaquete(deleteTarget.id_paquete);
            setPaquetes((prev) => removeItemById(prev, deleteTarget.id_paquete, (entry) => entry?.id_paquete));
            setConfirmOpen(false);
            notifications.warning('Paquete inactivado.', { dedupeKey: 'paquetes-delete-ok' });
            // AM: Sincroniza catalogo publico al inactivar paquetes.
            emitCatalogSync('paquete-inactivated');
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            notifications.error(extractMessage(err), { dedupeKey: 'paquetes-delete-error' });
        } finally {
            setDeleteLoading(false);
        }
    }

    // ── Render ──────────────────────────────────────────────────────────────────
    return (
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 md:px-8">
            {/* Encabezado */}
            <div className="flex flex-col gap-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--mf-accent)]">
                    Admin · Catálogo
                </p>
                <h1 className="mf-font-display text-[34px] leading-none text-[var(--mf-text)]">
                    Paquetes
                </h1>
            </div>

            <Separator />

            {/* Toolbar */}
            <div className="flex items-center justify-between">
                <p className="text-sm text-[var(--mf-text-2)]">
                    {loading ? 'Cargando…' : `${paquetes.length} paquete(s)`}
                </p>
                <Button onClick={openCrear} className="gap-2">
                    <Plus size={16} strokeWidth={2} />
                    Nuevo paquete
                </Button>
            </div>

            {/* Estado: error de lista */}
            {listError && (
                <div className="flex items-center gap-3 rounded-[16px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400">
                    <AlertCircle size={18} strokeWidth={2} />
                    <span>{listError}</span>
                    <button
                        type="button"
                        onClick={fetchPaquetes}
                        className="ml-auto underline hover:no-underline"
                    >
                        Reintentar
                    </button>
                </div>
            )}

            {/* Estado: cargando */}
            {loading && !listError && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 size={32} strokeWidth={1.5} className="animate-spin text-[var(--mf-accent)]" />
                </div>
            )}

            {/* Estado: vacío */}
            {!loading && !listError && paquetes.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <Package className="text-[var(--mf-text-2)] opacity-40" size={40} strokeWidth={1.2} />
                    <p className="text-sm text-[var(--mf-text-2)]">No hay paquetes registrados.</p>
                    <Button variant="outline" onClick={openCrear} className="gap-2 mt-2">
                        <Plus size={15} /> Agregar primer paquete
                    </Button>
                </div>
            )}

            {/* Tabla */}
            {!loading && !listError && paquetes.length > 0 && (
                <div className="overflow-hidden rounded-[20px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)]">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-[var(--mf-nav-border)]">
                                <TableHead>Nombre</TableHead>
                                <TableHead className="text-right">Precio HNL</TableHead>
                                <TableHead className="text-center">Activo</TableHead>
                                <TableHead className="text-center">Items</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paquetes.map((p) => (
                                <TableRow
                                    key={p.id_paquete}
                                    className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors"
                                >
                                    <TableCell className="font-medium text-[var(--mf-text)]">
                                        <div>{p.nombre_paquete}</div>
                                        {p.descripcion && (
                                            <div className="text-xs text-[var(--mf-text-2)] mt-0.5">{p.descripcion}</div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-[var(--mf-text)]">
                                        {p.precio_hnl != null ? Number(p.precio_hnl).toFixed(2) : '—'}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${p.activo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                            {p.activo ? 'Sí' : 'No'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-center text-[var(--mf-text-2)]">
                                        {Array.isArray(p.items) ? p.items.length : 0}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                aria-label="Editar paquete"
                                                onClick={() => openEditar(p)}
                                                className="rounded-lg border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] p-1.5 text-[var(--mf-text-2)] hover:text-[var(--mf-accent)] transition-colors"
                                            >
                                                <Pencil size={15} strokeWidth={2} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label="Inactivar paquete"
                                                onClick={() => openConfirmDelete(p)}
                                                className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition-colors"
                                            >
                                                <Trash2 size={15} strokeWidth={2} />
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
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editTarget ? 'Editar paquete' : 'Nuevo paquete'}</DialogTitle>
                    </DialogHeader>
                    <PaqueteForm values={formValues} onChange={handleFormChange} serviciosList={serviciosList} />
                    {formError && (
                        <p className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                            <AlertCircle size={15} strokeWidth={2} />{formError}
                        </p>
                    )}
                    <DialogFooter className="mt-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={formLoading}>
                            Cancelar
                        </Button>
                        <Button onClick={handleGuardar} disabled={formLoading} className="gap-2">
                            {formLoading && <Loader2 size={15} className="animate-spin" />}
                            {editTarget ? 'Guardar cambios' : 'Crear paquete'}
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
                title="Inactivar paquete"
                description={
                    deleteTarget
                        ? `Se inactivará ${deleteTarget.nombre_paquete}. Esta acción puede revertirse.`
                        : ''
                }
                confirmLabel="Inactivar"
                cancelLabel="Cancelar"
                loading={deleteLoading}
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
}

function sortPaquetes(list = []) {
    return [...(Array.isArray(list) ? list : [])].sort((a, b) => String(a?.nombre_paquete || '').localeCompare(String(b?.nombre_paquete || ''), 'es'));
}
