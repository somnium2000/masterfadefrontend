// src/components/layout/DashboardLayout.jsx
// Layout principal con sidebar colapsable + topbar con submenús dinámicos

import { useState, useCallback } from 'react';
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

// ── Definición de módulos del sidebar ────────────────────────────────────────────────────────
function buildNavModules(basePath, role) {
    const isBarbero = role === 'barbero';
    const isCliente = role === 'cliente';

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
            subItems: [
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
        {
            id: 'seguridad',
            label: 'Seguridad',
            icon: Shield,
            path: `${basePath}/seguridad`,
            subItems: [
                { id: 'seg-logs', label: 'Logs del Sistema', path: `${basePath}/seguridad/logs` },
                { id: 'seg-sesiones', label: 'Sesiones Activas', path: `${basePath}/seguridad/sesiones` },
                { id: 'seg-bitacoras', label: 'Bitácoras de Auditoría', path: `${basePath}/seguridad/bitacoras` },
            ],
        },
        {
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
        },
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
        <motion.button
            type="button"
            onClick={() => onClick(module)}
            whileTap={{ scale: 0.97 }}
            title={isCollapsed ? module.label : undefined}
            className={`
                group relative flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm font-medium
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
    );
}

// ── Topbar submenú pills ─────────────────────────────────────────────────────────────────────
function TopbarSubMenu({ subItems, currentPath }) {
    const navigate = useNavigate();
    if (!subItems || subItems.length === 0) return null;
    return (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {subItems.map((item) => {
                const isActive = isPathActive(currentPath, item.path);
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => navigate(item.path)}
                        className={`
                            relative whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide
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
        </div>
    );
}

// ── Main Layout ──────────────────────────────────────────────────────────────────────────────
export const ROLE_META = {
    super_admin: { kicker: 'Panel global', title: 'Visión total' },
    admin: { kicker: 'Operación', title: 'Panel Admin' },
    barbero: { kicker: 'Agenda', title: 'Panel Barbero' },
    cliente: { kicker: 'Cliente', title: 'Mi Espacio' },
};

export default function DashboardLayout({ pageRole }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, roles, logout } = useAuth();

    const displayName = getUserDisplayName(user);
    const resolvedHomePath = resolveHomePath(roles) || '/home';
    const currentRole = pageRole;

    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const basePath = resolvedHomePath;
    const modules = buildNavModules(basePath, currentRole);

    // Módulo activo: el que cuya path coincide más con la ubicación actual
    const activeModule = resolveActiveModule(modules, location.pathname);

    const handleModuleClick = useCallback((mod) => {
        if (mod.subItems && mod.subItems.length > 0) {
            navigate(mod.subItems[0].path);
        } else {
            navigate(mod.path);
        }
        setMobileMenuOpen(false);
    }, [navigate]);

    async function handleLogout() {
        await logout();
        navigate('/login', { replace: true });
    }

    const sidebarWidth = isCollapsed ? 72 : 260;

    // Mobile nav items
    const mobileItems = currentRole === 'barbero'
        ? [
            { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate(basePath) },
            { id: 'citas', label: 'Calendario', icon: CalendarDays, onClick: () => navigate(`${basePath}/citas`) },
            { id: 'perfil-barbero', label: 'Perfil', icon: UserRound, onClick: () => navigate(`${basePath}/perfil`) },
            { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout },
        ]
        : [
            { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate(basePath) },
            { id: 'personas', label: 'Personas', icon: Users, onClick: () => navigate(`${basePath}/empleados`) },
            { id: 'servicios', label: 'Servicios', icon: Scissors, onClick: () => navigate(`${basePath}/catalog/servicios`) },
            { id: 'sucursales', label: 'Sucursales', icon: Building2, onClick: () => navigate(`${basePath}/sucursales`) },
            { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout },
        ];
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
                                        className="absolute left-1/2 -translate-x-1/2"
                                    >
                                        <MasterfadeLogo variant="sidebar" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <button
                                type="button"
                                onClick={() => setIsCollapsed(!isCollapsed)}
                                className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] transition-colors hover:border-[var(--mf-btn-border)] hover:text-[var(--mf-accent)]"
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
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    title="Cerrar sesión"
                                    className="flex h-9 w-full items-center justify-center rounded-xl text-[var(--mf-accent)] transition-colors hover:bg-[var(--mf-btn-bg)]"
                                >
                                    <LogOut size={17} strokeWidth={1.9} />
                                </button>
                            ) : (
                                <>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Sesión activa</p>
                                    <p className="mt-2 text-sm font-semibold text-[var(--mf-text)] truncate">{displayName}</p>
                                    <p className="mt-1 text-xs text-[var(--mf-accent)]">{getRoleLabel(currentRole)}</p>
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-xs font-semibold text-[var(--mf-accent)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)]"
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
                    <header className="sticky top-0 z-30 border-b border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-bg)_82%,transparent)] backdrop-blur-xl">
                        <div className="flex items-center gap-4 px-6 py-3">
                            {/* Módulo activo */}
                            <div className="flex items-center gap-2 shrink-0">
                                {activeModule && (() => {
                                    const Icon = activeModule.icon;
                                    return <Icon size={16} strokeWidth={2} className="text-[var(--mf-accent)]" />;
                                })()}
                                <span className="text-sm font-semibold text-[var(--mf-text)]">
                                    {activeModule?.label}
                                </span>
                            </div>

                            {/* Divisor */}
                            {activeModule?.subItems && (
                                <div className="h-4 w-px bg-[var(--mf-nav-border)] shrink-0" />
                            )}

                            {/* Submenú pills dinámicos */}
                            <div className="flex-1 min-w-0">
                                <TopbarSubMenu
                                    subItems={activeModule?.subItems}
                                    currentPath={location.pathname}
                                />
                            </div>

                            {/* Right actions */}
                            <div className="flex items-center gap-3 shrink-0 ml-auto">
                                <div className="hidden md:block rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1.5 text-xs text-[var(--mf-text-2)]">
                                    {displayName}
                                </div>
                                <ThemeSwitcher />
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 px-6 py-8">
                        <Outlet />
                    </main>
                </div>
            </div>

            {/* ── MOBILE LAYOUT ──────────────────────────────────────────────────────────── */}
            <div className="mf-page-gradient min-h-screen pb-[100px] lg:hidden">
                <div className="mf-mobile-frame mf-screen-pad mf-safe-top">
                    <header className="flex min-w-0 items-start justify-between gap-2 pt-3">
                        <MasterfadeLogo variant="topbar" className="shrink min-w-0" />
                        <div className="flex shrink-0 items-center gap-2">
                            <ThemeSwitcher
                                showLabel
                                labelClassName="w-[70px] whitespace-normal text-right leading-[1.05]"
                                buttonClassName="h-10 w-10 rounded-lg"
                            />
                            <button
                                type="button"
                                onClick={() => setMobileMenuOpen(true)}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)]"
                            >
                                <Menu size={18} />
                            </button>
                        </div>
                    </header>

                    {/* Mobile topbar submenú */}
                    {activeModule?.subItems && (
                        <div className="mt-4 overflow-x-auto scrollbar-hide">
                            <TopbarSubMenu
                                subItems={activeModule.subItems}
                                currentPath={location.pathname}
                            />
                        </div>
                    )}

                    <div className="mt-6">
                        <Outlet />
                    </div>
                </div>

                {/* Mobile drawer menu */}
                <AnimatePresence>
                    {mobileMenuOpen && (
                        <>
                            <motion.div
                                key="overlay"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setMobileMenuOpen(false)}
                                className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                            />
                            <motion.div
                                key="drawer"
                                initial={{ x: '-100%' }}
                                animate={{ x: 0 }}
                                exit={{ x: '-100%' }}
                                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                                className="fixed inset-y-0 left-0 z-50 w-[280px] flex flex-col border-r border-[var(--mf-nav-border)] bg-[var(--mf-bg-2)] px-4 py-6"
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <MasterfadeLogo variant="compact" />
                                    <button
                                        type="button"
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)]"
                                    >
                                        <X size={15} />
                                    </button>
                                </div>

                                <nav className="flex flex-col gap-1 flex-1 overflow-y-auto">
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
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-xs font-semibold text-[var(--mf-accent)]"
                                    >
                                        <LogOut size={14} strokeWidth={1.9} />
                                        Cerrar sesión
                                    </button>
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>

                <PremiumBottomNav
                    className="lg:hidden"
                    activeId={activeModule?.id || 'inicio'}
                    sideItems={mobileSideItems}
                    fabItem={currentRole === 'barbero' ? undefined : { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout }}
                    mobilePreset={currentRole === 'barbero' ? 'barber' : 'default'}
                />
            </div>
        </div>
    );
}
