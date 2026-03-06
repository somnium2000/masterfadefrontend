// src/features/admin/pages/AdminEmpleadosPage.jsx
// Lista de empleados para Admin/SuperAdmin con toggle Tabla ↔ Cards.

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { listAdminEmpleados } from '../lib/adminEmpleadosApi.js';
import ViewToggle from '../../../components/data/ViewToggle.jsx';
import DataCard from '../../../components/data/DataCard.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import {
    Table, TableBody, TableCell, TableHead,
    TableHeader, TableRow,
} from '../../../components/ui/table.jsx';

function extractMessage(err) {
    return err?.data?.error?.message || err?.message || 'Error desconocido.';
}

// ── Avatar de iniciales ───────────────────────────────────────────────────
function Initials({ name }) {
    const parts = (name || '?').trim().split(' ');
    const chars = parts.length >= 2
        ? `${parts[0][0]}${parts[parts.length - 1][0]}`
        : parts[0].slice(0, 2);
    return (
        <span className="text-sm font-semibold uppercase text-[var(--mf-accent)]">
            {chars}
        </span>
    );
}

// ── Badge de estado ──────────────────────────────────────────────────────
function StatusBadge({ active }) {
    return (
        <span className={`mf-badge ${active ? 'mf-badge-green' : 'mf-badge-red'}`}>
            {active ? 'Activo' : 'Inactivo'}
        </span>
    );
}

// ── Vista Cards ──────────────────────────────────────────────────────────
function EmpleadoCards({ empleados }) {
    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {empleados.map((e, i) => (
                <DataCard
                    key={e.id_empleado}
                    animationDelay={i * 0.05}
                    avatar={<Initials name={e.nombre_completo} />}
                    title={e.nombre_completo}
                    subtitle={e.email || '—'}
                    badge={<StatusBadge active={e.activo} />}
                    fields={[
                        { label: 'Sucursal', value: e.nombre_sucursal || '—' },
                        { label: 'Teléfono', value: e.telefono || '—' },
                        {
                            label: 'Roles',
                            value: Array.isArray(e.roles) && e.roles.length
                                ? <span className="mf-badge mf-badge-gold">{e.roles.join(', ')}</span>
                                : '—',
                        },
                    ]}
                />
            ))}
        </div>
    );
}

// ── Vista Tabla ──────────────────────────────────────────────────────────
function EmpleadoTable({ empleados }) {
    return (
        <div className="mf-table-wrap">
            <Table>
                <TableHeader>
                    <TableRow className="border-[var(--mf-nav-border)]">
                        <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Nombre</TableHead>
                        <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em]">Email</TableHead>
                        <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] hidden sm:table-cell">Teléfono</TableHead>
                        <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] hidden md:table-cell">Roles</TableHead>
                        <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] hidden lg:table-cell">Sucursal</TableHead>
                        <TableHead className="text-[var(--mf-accent)] text-[11px] uppercase tracking-[0.1em] text-center">Estado</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {empleados.map((e) => (
                        <TableRow
                            key={e.id_empleado}
                            className="border-[var(--mf-nav-border)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_60%,transparent)] transition-colors"
                        >
                            <TableCell className="font-medium text-[var(--mf-text)] whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                    <div className="h-7 w-7 shrink-0 rounded-[8px] border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] flex items-center justify-center">
                                        <Initials name={e.nombre_completo} />
                                    </div>
                                    {e.nombre_completo}
                                </div>
                            </TableCell>
                            <TableCell className="text-[var(--mf-text-2)] text-sm">{e.email || '—'}</TableCell>
                            <TableCell className="text-[var(--mf-text-2)] text-sm hidden sm:table-cell">{e.telefono || '—'}</TableCell>
                            <TableCell className="text-sm hidden md:table-cell">
                                {Array.isArray(e.roles) && e.roles.length
                                    ? <span className="mf-badge mf-badge-gold">{e.roles.join(', ')}</span>
                                    : <span className="text-[var(--mf-text-2)]">—</span>}
                            </TableCell>
                            <TableCell className="text-[var(--mf-text-2)] text-sm hidden lg:table-cell">{e.nombre_sucursal || '—'}</TableCell>
                            <TableCell className="text-center"><StatusBadge active={e.activo} /></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

// ── Página ───────────────────────────────────────────────────────────────
export default function AdminEmpleadosPage() {
    const navigate = useNavigate();
    const [empleados, setEmpleados] = useState([]);
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState('');
    const [view, setView] = useState(
        () => { try { const v = localStorage.getItem('mf-view-empleados'); return (v === 'table' || v === 'cards') ? v : 'cards'; } catch { return 'cards'; } }
    );

    const fetchEmpleados = useCallback(async () => {
        setLoading(true);
        setListError('');
        try {
            const data = await listAdminEmpleados();
            const payload = data?.data ?? data;
            setEmpleados(Array.isArray(payload?.empleados) ? payload.empleados : []);
        } catch (err) {
            if (err.status === 401) { navigate('/login'); return; }
            if (err.status === 403) { navigate('/unauthorized'); return; }
            setListError(extractMessage(err));
        } finally {
            setLoading(false);
        }
    }, [navigate]);

    useEffect(() => { void fetchEmpleados(); }, [fetchEmpleados]);

    return (
        <div className="mf-page">
            {/* Encabezado */}
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
                        Personas · Gestión
                    </p>
                    <h1 className="mf-font-display mt-1 text-3xl leading-tight text-[var(--mf-text)]">
                        Empleados
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-[var(--mf-text-2)]">
                        {loading ? 'Cargando…' : `${empleados.length} registro(s)`}
                    </span>
                    <ViewToggle defaultView={view} onViewChange={setView} storageKey="empleados" />
                </div>
            </div>

            <div className="mf-divider" />

            {/* Estados */}
            {listError && <ErrorBanner message={listError} onRetry={fetchEmpleados} />}
            {loading && !listError && <LoadingSpinner />}

            {!loading && !listError && empleados.length === 0 && (
                <EmptyState
                    icon={Users}
                    title="Sin empleados"
                    description="No hay empleados registrados aún."
                />
            )}

            {/* Datos */}
            {!loading && !listError && empleados.length > 0 && (
                view === 'cards'
                    ? <EmpleadoCards empleados={empleados} />
                    : <EmpleadoTable empleados={empleados} />
            )}
        </div>
    );
}
