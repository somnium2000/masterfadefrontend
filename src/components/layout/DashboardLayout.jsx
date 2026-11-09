// src/components/layout/DashboardLayout.jsx
// Layout principal con sidebar colapsable + topbar con submenús dinámicos

import { useState, useCallback, useEffect } from 'react';
import * as Drawer from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
    House, Users, Scissors, Building2, CalendarDays, Shield, BarChart3,
    Settings, Star, LogOut, ChevronLeft, ChevronRight, Menu, X, ChevronDown, UserRound
} from 'lucide-react';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';
import MasterfadeLogo from '../branding/MasterfadeLogo.jsx';
import ThemeSwitcher from '../theme/ThemeSwitcher.jsx';
import { getUserDisplayName, useAuth } from '../../context/AuthContext.jsx';
import { getRoleLabel, resolveHomePath } from '../../features/home/lib/roleRouting.js';
import PremiumBottomNav from '../navigation/PremiumBottomNav.jsx';
import './NavigationHeader.css';

// ── Definición de módulos del sidebar ────────────────────────────────────────────────────────
export function buildNavModules(basePath, role, roles = []) {
    const isBarbero = role === 'barbero';
    const isCliente = role === 'cliente';
    const isSecurityRole = role === 'security_admin' || role === 'security_auditor';
    const canSeeSecurityModule = role === 'super_admin';
    const canSeeSecurityAudit = roles.includes('root');
    const hasCombinedBarberRole = !roles.includes('root') && roles.includes('barbero')
        && (roles.includes('super_admin') || roles.includes('admin'));
    const administrationPath = roles.includes('super_admin') ? '/home/super' : '/home/admin';

    if (isBarbero) {
        return [
            {
                id: 'inicio',
                label: 'Inicio',
                icon: House,
                path: basePath,
                subItems: null,
            },
            {
                id: 'citas',
                label: 'Calendario',
                icon: CalendarDays,
                path: `${basePath}/citas`,
                subItems: null,
            },
            {
                id: 'perfil-barbero',
                label: 'Perfil Barbero',
                icon: UserRound,
                path: `${basePath}/perfil`,
                subItems: null,
            },
            ...(hasCombinedBarberRole ? [{
                id: 'volver-administracion',
                label: 'Volver a Administración',
                icon: Building2,
                path: administrationPath,
                subItems: null,
            }] : []),
        ];
    }

    if (isSecurityRole) {
        return [
            {
                id: 'seguridad',
                label: 'Seguridad',
                icon: Shield,
                path: `${basePath}/seguridad/login-logs`,
                subItems: [
                    { id: 'seg-login-logs', label: 'Login Logs', path: `${basePath}/seguridad/login-logs` },
                    { id: 'seg-sesiones', label: 'Sesiones', path: `${basePath}/seguridad/sesiones` },
                    { id: 'seg-usuarios', label: 'Usuarios', path: `${basePath}/seguridad/usuarios` },
                    ...(canSeeSecurityAudit
                        ? [{ id: 'seg-alertas', label: 'Auditoria', path: `${basePath}/seguridad/alertas` }]
                        : []),
                ],
            },
        ];
    }

    // Sub-items de agendamiento basados en el rol (provenientes de dev)
    const agendamientoSubItems = isBarbero
        ? [
            { id: 'agendamiento-citas', label: 'Citas', path: `${basePath}/citas` },
            { id: 'agendamiento-historial', label: 'Historial', path: `${basePath}/citas/historial` },
        ]
        : [
            { id: 'agendamiento-citas', label: 'Citas', path: `${basePath}/citas` },
            { id: 'agendamiento-historial', label: 'Historial', path: `${basePath}/citas/historial` },
            { id: 'agendamiento-preview', label: 'Vista previa', path: `${basePath}/citas/preview` },
            { id: 'agendamiento-config', label: 'Configuración', path: `${basePath}/citas/config` },
        ];

    // Sub-items de configuración basados en el rol (provenientes de PersonasF)
    const configSubItems = role === 'super_admin'
        ? [
            { id: 'conf-comunicacion', label: 'Correos informativos', path: `${basePath}/configuracion/comunicacion` },
            { id: 'conf-promociones', label: 'Promociones', path: `${basePath}/configuracion/promociones` },
        ]
        : [
            { id: 'conf-comunicacion', label: 'Correos informativos', path: `${basePath}/configuracion/comunicacion` },
            { id: 'conf-promociones', label: 'Promociones', path: `${basePath}/configuracion/promociones` },
        ];

    const modules = [
        {
            id: 'inicio',
            label: 'Inicio',
            icon: House,
            path: basePath,
            subItems: role === 'super_admin'
                ? [{ id: 'dashboard', label: 'Dashboard', path: basePath }]
                : [
                    { id: 'dashboard', label: 'Dashboard', path: basePath },
                    { id: 'kpis', label: 'KPIs', path: `${basePath}/kpis` },
                ],
        },
        {
            id: 'personas',
            label: 'Personas',
            icon: Users,
            path: `${basePath}/empleados`,
            subItems: [
                { id: 'empleados', label: 'Empleados', path: `${basePath}/empleados` },
                { id: 'clientes', label: 'Clientes', path: `${basePath}/clientes` },
                { id: 'usuarios', label: 'Usuarios', path: `${basePath}/usuarios` },
                { id: 'eliminacion-cuentas', label: 'Eliminacion de cuentas', path: `${basePath}/eliminacion-cuentas` },
            ],
        },
        {
            id: 'servicios',
            label: 'Servicios',
            icon: Scissors,
            path: `${basePath}/catalog/servicios`,
            subItems: [
                { id: 'cat-servicios', label: 'Servicios', path: `${basePath}/catalog/servicios` },
                { id: 'cortesias', label: 'Cortesías', path: `${basePath}/catalog/cortesias` },
                { id: 'paquetes', label: 'Paquetes', path: `${basePath}/catalog/paquetes` },
                { id: 'planes', label: 'Planes', path: `${basePath}/catalog/planes` },
                { id: 'cat-publico', label: 'Catálogo público', path: `${basePath}/catalog/servicios/publico` },
            ],
        },
        {
            id: 'sucursales',
            label: 'Sucursales',
            icon: Building2,
            path: `${basePath}/sucursales`,
            subItems: null,
        },
        {
            id: 'citas',
            label: 'Agendamiento',
            icon: CalendarDays,
            path: `${basePath}/citas`,
            subItems: agendamientoSubItems,
        },
        ...(canSeeSecurityModule
            ? [{
                id: 'seguridad',
                label: 'Seguridad',
                icon: Shield,
                path: `${basePath}/seguridad`,
                subItems: [
                    { id: 'seg-login-logs', label: 'Login Logs', path: `${basePath}/seguridad/login-logs` },
                    { id: 'seg-sesiones', label: 'Sesiones', path: `${basePath}/seguridad/sesiones` },
                    { id: 'seg-usuarios', label: 'Usuarios', path: `${basePath}/seguridad/usuarios` },
                    ...(canSeeSecurityAudit
                        ? [{ id: 'seg-alertas', label: 'Auditoria', path: `${basePath}/seguridad/alertas` }]
                        : []),
                ],
            }]
            : []),
        ...(role === 'super_admin' ? [{
            id: 'reportes',
            label: 'Reportes',
            icon: BarChart3,
            path: `${basePath}/reportes`,
            // JK: Oculta el indicador de submenu en sidebar para que se vea como modulo directo.
            showSidebarDropdown: false,
            subItems: [
                // JK: Tabs unificadas de reportes (sin vista intermedia por cards).
                { id: 'rep-ingresos', label: 'Ingresos', path: `${basePath}/reportes/ingresos` },
                { id: 'rep-membresias', label: 'Membresias', path: `${basePath}/reportes/membresias` },
                { id: 'rep-barberos', label: 'Barberos', path: `${basePath}/reportes/barberos` },
                { id: 'rep-concurrencia', label: 'Concurrencia', path: `${basePath}/reportes/concurrencia` },
            ],
        }] : []),
        {
            id: 'superpuntos',
            label: 'Masterpuntos',
            icon: Star,
            path: `${basePath}/superpuntos`,
            subItems: null,
        },
        {
            id: 'configuracion',
            label: 'Configuración',
            icon: Settings,
            path: configSubItems[0].path,
            subItems: configSubItems,
        },
    ];

    if (isCliente) {
        return modules.filter((module) => ['inicio'].includes(module.id));
    }

    if (hasCombinedBarberRole && ['admin', 'super_admin'].includes(role) && roles.includes(role)) {
        modules.push({
            id: 'mi-espacio-barbero',
            label: 'Mi espacio Barbero',
            icon: Scissors,
            path: '/home/barbero',
            subItems: [
                { id: 'mi-inicio-barbero', label: 'Inicio Barbero', path: '/home/barbero', exact: true },
                { id: 'mi-calendario-barbero', label: 'Mi Calendario', path: '/home/barbero/citas' },
                { id: 'mi-perfil-barbero', label: 'Mi Perfil Barbero', path: '/home/barbero/perfil' },
            ],
        });
    }

    return modules;
}

function normalizePath(path) {
    if (!path) return '/';
    if (path.length > 1 && path.endsWith('/')) {
        return path.replace(/\/+$/, '');
    }
    return path;
}

function isPathActive(currentPath, targetPath) {
    const normalizedCurrent = normalizePath(currentPath);
    const normalizedTarget = normalizePath(targetPath);

    return (
        normalizedCurrent === normalizedTarget ||
        normalizedCurrent.startsWith(`${normalizedTarget}/`)
    );
}

function resolveActiveModule(modules, pathname) {
    let bestModule = null;
    let bestMatchLength = -1;

    for (const mod of modules) {
        const candidatePaths = [mod.path, ...(mod.subItems?.map((item) => item.path) ?? [])];
        for (const candidatePath of candidatePaths) {
            if (isPathActive(pathname, candidatePath) && candidatePath.length > bestMatchLength) {
                bestModule = mod;
                bestMatchLength = candidatePath.length;
            }
        }
    }

    return bestModule || modules[0] || null;
}

// ── Sidebar Item ─────────────────────────────────────────────────────────────────────────────
function SidebarItem({ module, isActive, isCollapsed, onClick }) {
    const Icon = module.icon;
    return (
        <>
        <motion.button
            type="button"
            aria-label={module.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onClick(module)}
            whileTap={{ scale: 0.97 }}
            title={isCollapsed ? module.label : undefined}
            className={`
                mf-focus-ring group relative flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium
                transition-all duration-200 overflow-hidden
                ${isActive
                    ? 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]'
                    : 'border-transparent bg-transparent text-[var(--mf-text-2)] hover:border-[var(--mf-nav-border)] hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)]'
                }
            `}
        >
            {isActive && (
                <motion.span
                    layoutId="sidebar-active-bg"
                    className="absolute inset-0 rounded-2xl bg-[var(--mf-accent)]/5"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
            )}
            <Icon
                size={18}
                strokeWidth={isActive ? 2.1 : 1.7}
                className="relative z-10 shrink-0 transition-transform duration-200 group-hover:scale-110"
            />
            <AnimatePresence initial={false}>
                {!isCollapsed && (
                    <motion.span
                        key="label"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.18 }}
                        className="relative z-10 flex-1 whitespace-nowrap overflow-hidden"
                    >
                        {module.label}
                    </motion.span>
                )}
            </AnimatePresence>
            {!isCollapsed && module.subItems && module.showSidebarDropdown !== false && (
                <ChevronDown size={13} className={`relative z-10 shrink-0 transition-transform duration-200 opacity-50 ${isActive ? 'rotate-180' : ''}`} />
            )}
        </motion.button>
        {module.id === 'mi-espacio-barbero' && !isCollapsed && module.subItems.map((item) => (
            <button
                key={item.id}
                type="button"
                onClick={() => onClick(item)}
                className="mf-focus-ring ml-4 min-h-11 rounded-xl border border-transparent px-3 py-2 text-left text-xs text-[var(--mf-text-2)] transition-colors hover:border-[var(--mf-nav-border)] hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-accent)]"
            >
                {item.label}
            </button>
        ))}
        </>
    );
}

// ── Topbar submenú pills ─────────────────────────────────────────────────────────────────────
function TopbarSubMenu({ subItems, currentPath }) {
    const navigate = useNavigate();
    if (!subItems || subItems.length === 0) return null;
    return (
        <nav aria-label="Opciones del módulo" className="mf-header-submenu flex items-center gap-1.5 overflow-x-auto p-1">
            {subItems.map((item) => {
                const isActive = item.exact
                    ? normalizePath(currentPath) === normalizePath(item.path)
                    : isPathActive(currentPath, item.path);
                return (
                    <button
                        key={item.id}
                        type="button"
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => navigate(item.path)}
                        className={`
                            mf-focus-ring relative min-h-11 min-w-11 whitespace-nowrap rounded-xl px-3 text-xs font-semibold tracking-wide
                            transition-all duration-200 shrink-0
                            ${isActive
                                ? 'bg-[var(--mf-accent)] text-[var(--mf-accent-text)] shadow-[var(--mf-shadow-accent)]'
                                : 'border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] hover:border-[var(--mf-btn-border)] hover:text-[var(--mf-text)]'
                            }
                        `}
                    >
                        {item.label}
                    </button>
                );
            })}
        </nav>
    );
}

// ── Main Layout ──────────────────────────────────────────────────────────────────────────────
export const ROLE_META = {
    super_admin: { kicker: 'Panel global', title: 'Visión total' },
    admin: { kicker: 'Operacion', title: 'Panel Admin' },
    security_admin: { kicker: 'Seguridad', title: 'Panel Seguridad' },
    security_auditor: { kicker: 'Auditoria', title: 'Panel Seguridad' },
    barbero: { kicker: 'Agenda', title: 'Panel Barbero' },
    cliente: { kicker: 'Cliente', title: 'Mi Espacio' },
};

export default function DashboardLayout({ pageRole, basePathOverride = '' }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, roles, logout } = useAuth();

    const displayName = getUserDisplayName(user);
    const resolvedHomePath = resolveHomePath(roles) || '/home';
    const currentRole = pageRole;

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (!mobileMenuOpen || !window.matchMedia) return undefined;

        const desktop = window.matchMedia('(min-width: 64rem)');
        const closeOnDesktop = () => {
            if (desktop.matches) setMobileMenuOpen(false);
        };

        desktop.addEventListener('change', closeOnDesktop);
        return () => desktop.removeEventListener('change', closeOnDesktop);
    }, [mobileMenuOpen]);

    const basePath = String(basePathOverride || '').trim()
        || (currentRole === 'barbero' ? '/home/barbero' : resolvedHomePath);
    const modules = buildNavModules(basePath, currentRole, roles);
    const canAccessInternalAccountDeletion = currentRole !== 'cliente';

    // Módulo activo: el que cuya path coincide más con la ubicación actual
    const activeModule = resolveActiveModule(modules, location.pathname);

    const handleModuleClick = useCallback((mod) => {
        if (mod.subItems && mod.subItems.length > 0) {
            navigate(mod.subItems[0].path);
        } else {
            navigate(mod.path);
        }
        setMobileMenuOpen(false);
    }, [navigate, setMobileMenuOpen]);

    async function handleLogout() {
        await logout();
        navigate('/login', { replace: true });
    }

    function handleAccountDeletionRequest() {
        navigate('/mi-cuenta/eliminacion');
        setMobileMenuOpen(false);
    }

    const sidebarWidth = isCollapsed ? 72 : 260;
    const isSecurityRole = currentRole === 'security_admin' || currentRole === 'security_auditor';
    const canSeeSecurityAudit = roles.includes('root');

    // Mobile nav items
    const mobileItems = currentRole === 'barbero'
        ? [
            { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate(basePath) },
            { id: 'citas', label: 'Calendario', icon: CalendarDays, onClick: () => navigate(`${basePath}/citas`) },
            { id: 'perfil-barbero', label: 'Perfil', icon: UserRound, onClick: () => navigate(`${basePath}/perfil`) },
            { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout },
        ]
        : isSecurityRole
            ? [
                { id: 'seg-login-logs', label: 'Login Logs', icon: Shield, onClick: () => navigate(`${basePath}/seguridad/login-logs`) },
                { id: 'seg-sesiones', label: 'Sesiones', icon: CalendarDays, onClick: () => navigate(`${basePath}/seguridad/sesiones`) },
                { id: 'seg-usuarios', label: 'Usuarios', icon: Users, onClick: () => navigate(`${basePath}/seguridad/usuarios`) },
                ...(canSeeSecurityAudit
                    ? [{ id: 'seg-alertas', label: 'Auditoria', icon: BarChart3, onClick: () => navigate(`${basePath}/seguridad/alertas`) }]
                    : []),
                { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout },
            ]
            : [
                { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate(basePath) },
                { id: 'personas', label: 'Personas', icon: Users, onClick: () => navigate(`${basePath}/empleados`) },
                { id: 'servicios', label: 'Servicios', icon: Scissors, onClick: () => navigate(`${basePath}/catalog/servicios`) },
                { id: 'sucursales', label: 'Sucursales', icon: Building2, onClick: () => navigate(`${basePath}/sucursales`) },
                { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout },
            ];
    const ActiveModuleIcon = activeModule?.icon;
    const mobileSideItems = currentRole === 'barbero' ? mobileItems : mobileItems.slice(0, 4);

    return (
        <div className="min-h-screen bg-[var(--mf-bg)] text-[var(--mf-text)]">
            {/* ── DESKTOP LAYOUT ── */}
            <div className="hidden lg:flex min-h-screen">

                {/* ── Sidebar ────────────────────────────────────────────────────────────── */}
                <motion.aside
                    animate={{ width: sidebarWidth }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="relative flex shrink-0 flex-col border-r border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-bg-2)_90%,transparent)]"
                    style={{ minHeight: '100vh' }}
                >
                    <div className="sticky top-0 flex h-screen flex-col px-3 py-5 overflow-hidden">

                        {/* Logo + collapse button */}
                        <div className="relative flex items-center justify-end gap-2 mb-5">
                            <AnimatePresence initial={false}>
                                {!isCollapsed && (
                                    <motion.div
                                        key="logo"
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="absolute inset-y-0 left-0 right-13 flex items-center justify-center"
                                    >
                                        <MasterfadeLogo variant="sidebar" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <button
                                type="button"
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="mf-header-control mf-focus-ring ml-auto px-0"
                                title={isCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
                            >
                                {isCollapsed
                                    ? <ChevronRight size={15} strokeWidth={2} />
                                    : <ChevronLeft size={15} strokeWidth={2} />
                                }
                            </button>
                        </div>

                        {/* Nav modules */}
                        <nav className="flex flex-col gap-1 flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
                            {modules.map((mod) => (
                                <SidebarItem
                                    key={mod.id}
                                    module={mod}
                                    isActive={activeModule?.id === mod.id}
                                    isCollapsed={isCollapsed}
                                    onClick={handleModuleClick}
                                />
                            ))}
                        </nav>

                        {/* User card + logout */}
                        <div className={`
                            mt-4 rounded-[20px] border border-[var(--mf-nav-border)]
                            bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)]
                            shadow-[var(--mf-shadow-soft)]
                            transition-all duration-300
                            ${isCollapsed ? 'p-2' : 'p-4'}
                        `}>
                            {isCollapsed ? (
                                <div className="flex flex-col gap-1">
                                    {canAccessInternalAccountDeletion ? (
                                        <button
                                            type="button"
                                            onClick={handleAccountDeletionRequest}
                                            title="Solicitar eliminacion de cuenta"
                                            className="mf-focus-ring flex min-h-11 w-full items-center justify-center rounded-xl text-[var(--mf-text-2)] transition-colors hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-accent)]"
                                        >
                                            <UserRound size={17} strokeWidth={1.9} />
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        title="Cerrar sesión"
                                        className="mf-focus-ring flex min-h-11 w-full items-center justify-center rounded-xl text-[var(--mf-accent)] transition-colors hover:bg-[var(--mf-btn-bg)]"
                                    >
                                        <LogOut size={17} strokeWidth={1.9} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Sesión activa</p>
                                    <p className="mt-2 text-sm font-semibold text-[var(--mf-text)] truncate">{displayName}</p>
                                    <p className="mt-1 text-xs text-[var(--mf-accent)]">{getRoleLabel(currentRole)}</p>
                                    {canAccessInternalAccountDeletion ? (
                                        <button
                                            type="button"
                                            onClick={handleAccountDeletionRequest}
                                            className="mf-focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] text-xs font-semibold text-[var(--mf-text)] transition-colors hover:border-[var(--mf-btn-border)] hover:bg-[var(--mf-btn-bg)]"
                                        >
                                            <UserRound size={14} strokeWidth={1.9} />
                                            Solicitar eliminacion de cuenta
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="mf-focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-xs font-semibold text-[var(--mf-accent)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)]"
                                    >
                                        <LogOut size={14} strokeWidth={1.9} />
                                        Cerrar sesión
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </motion.aside>

                {/* ── Content Area ─────────────────────────────────────────────────────────── */}
                <div className="flex min-h-screen flex-1 flex-col min-w-0">

                    {/* ── Topbar ─────────────────────────────────────────────────────────────── */}
                    <header className="sticky top-0 z-30 border-b border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_96%,transparent)] px-6 py-3 shadow-[var(--mf-shadow-soft)] backdrop-blur-xl">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="flex shrink-0 items-center gap-2 text-sm font-semibold">
                                {ActiveModuleIcon && <ActiveModuleIcon size={17} aria-hidden="true" className="text-[var(--mf-accent)]" />}
                                {activeModule?.label}
                            </div>

                            <div className="min-w-0 flex-1">
                                <TopbarSubMenu subItems={activeModule?.subItems} currentPath={location.pathname} />
                            </div>

                            <div className="flex shrink-0 items-center gap-3">
                                <p title={displayName} className="max-w-[12rem] truncate border-l border-[var(--mf-nav-border)] pl-3 text-xs text-[var(--mf-text-2)]">
                                    {displayName}
                                </p>
                                <ThemeSwitcher labelClassName="sr-only xl:not-sr-only" />
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 px-6 py-8">
                        <Outlet />
                    </main>
                </div>
            </div>

            {/* ── MOBILE LAYOUT ──────────────────────────────────────────────────────────── */}
            <Drawer.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <div className="mf-page-gradient min-h-screen pb-[100px] lg:hidden">
                    <div className="mf-mobile-frame mf-screen-pad mf-safe-top">
                        <header className="mf-header-surface mt-3 p-3">
                            <MasterfadeLogo variant="navigation" className="border-b border-[var(--mf-nav-border)] pb-2.5" />
                            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-[1_1_80px] items-center gap-2 text-sm font-semibold [overflow-wrap:anywhere]">
                                    {ActiveModuleIcon && <ActiveModuleIcon size={17} aria-hidden="true" className="shrink-0 text-[var(--mf-accent)]" />}
                                    {activeModule?.label}
                                </div>
                                <div className="mf-header-controls ml-auto">
                                    <ThemeSwitcher labelClassName="sr-only sm:not-sr-only" />
                                    <Drawer.Trigger type="button" aria-label="Abrir menú" className="mf-header-control mf-focus-ring">
                                        <Menu size={18} aria-hidden="true" />
                                        <span>Menú</span>
                                    </Drawer.Trigger>
                                </div>
                            </div>
                            {activeModule?.subItems && (
                                <div className="mt-2 border-t border-[var(--mf-nav-border)] pt-1.5">
                                    <TopbarSubMenu subItems={activeModule.subItems} currentPath={location.pathname} />
                                </div>
                            )}
                        </header>

                        <div className="mt-6">
                            <Outlet />
                        </div>
                    </div>

                    <Drawer.Portal>
                        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
                        <Drawer.Content
                            aria-describedby={undefined}
                            className="fixed inset-y-0 left-0 z-50 flex w-[min(300px,100%)] flex-col overflow-y-auto border-r border-[var(--mf-nav-border)] bg-[var(--mf-bg-2)] px-4 py-5 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-left"
                        >
                            <Drawer.Title className="sr-only">Menú de navegación</Drawer.Title>
                            <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--mf-nav-border)] pb-3">
                                <MasterfadeLogo variant="sidebar" className="min-w-0" />
                                <Drawer.Close type="button" aria-label="Cerrar menú" className="mf-header-control mf-focus-ring">
                                    <X size={18} aria-hidden="true" />
                                </Drawer.Close>
                            </div>

                            <nav aria-label="Módulos" className="flex flex-1 flex-col gap-1 p-1">
                                {modules.map((mod) => (
                                    <SidebarItem
                                        key={mod.id}
                                        module={mod}
                                        isActive={activeModule?.id === mod.id}
                                        isCollapsed={false}
                                        onClick={handleModuleClick}
                                    />
                                ))}
                            </nav>

                            <div className="mt-4 rounded-[20px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-4">
                                <p className="text-xs text-[var(--mf-text-2)] truncate">{displayName}</p>
                                <p className="mt-1 text-xs text-[var(--mf-accent)]">{getRoleLabel(currentRole)}</p>
                                {canAccessInternalAccountDeletion ? (
                                    <button
                                        type="button"
                                        onClick={handleAccountDeletionRequest}
                                        className="mf-focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] text-xs font-semibold text-[var(--mf-text)]"
                                    >
                                        <UserRound size={14} strokeWidth={1.9} />
                                        Solicitar eliminacion de cuenta
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    className="mf-focus-ring mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-xs font-semibold text-[var(--mf-accent)]"
                                >
                                    <LogOut size={14} strokeWidth={1.9} />
                                    Cerrar sesión
                                </button>
                            </div>
                        </Drawer.Content>
                    </Drawer.Portal>

                    <PremiumBottomNav
                        className="lg:hidden"
                        activeId={activeModule?.id || 'inicio'}
                        sideItems={mobileSideItems}
                        fabItem={currentRole === 'barbero' ? undefined : { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout }}
                        mobilePreset={currentRole === 'barbero' ? 'barber' : 'default'}
                    />
                </div>
            </Drawer.Root>
        </div>
    );
}

