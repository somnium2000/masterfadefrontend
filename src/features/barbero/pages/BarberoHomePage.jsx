// src/features/barbero/pages/BarberoHomePage.jsx
// Pantalla Home dedicada para rol Barbero.
// Sin Figma disponible - Placeholder premium con agenda futura.

import { motion } from 'framer-motion';
import { CalendarDays, Clock, House, LogOut, Plus, Scissors, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { getRoleLabel } from '../../home/lib/roleRouting.js';

function PlaceholderCard({ icon: Icon, title, subtitle, disabled = true }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`mf-glass-surface flex items-center gap-4 rounded-[24px] p-5 ${disabled ? 'opacity-60' : ''} transition-all`}
        >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
                <Icon size={22} strokeWidth={1.6} />
            </div>
            <div>
                <h3 className="text-base font-semibold text-[var(--mf-text)]">{title}</h3>
                <p className="mt-0.5 text-xs text-[var(--mf-text-2)]">{subtitle}</p>
            </div>
            {disabled && (
                <span className="ml-auto rounded-full border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--mf-text-2)]">
                    Próximamente
                </span>
            )}
        </motion.div>
    );
}

export default function BarberoHomePage() {
    const navigate = useNavigate();
    const { user, roles, logout } = useAuth();
    const displayName = getUserDisplayName(user);

    const mobileItems = [
        { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate('/home/barbero') },
        { id: 'servicios', label: 'Servicios', icon: Scissors, onClick: () => navigate('/servicios') },
        { id: 'salir', label: 'Salir', icon: LogOut, onClick: () => { logout(); navigate('/'); } },
        { id: 'promociones', label: 'Promociones', icon: Tag, disabled: true },
    ];

    return (
        <div className="mf-page-gradient min-h-screen pb-[100px]">
            <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 pb-10 pt-4 sm:px-8">
                <header className="flex items-center justify-between gap-4">
                    <MasterfadeLogo variant="compact" />
                    <ThemeSwitcher />
                </header>

                <main className="mt-10 flex flex-col gap-6">
                    <div className="text-center">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--mf-accent)]">
                            Panel Barbero
                        </p>
                        <h1 className="mf-font-display mt-3 text-[36px] leading-[0.95] text-[var(--mf-text)]">
                            {displayName}
                        </h1>
                        <p className="mt-3 text-sm text-[var(--mf-text-2)]">
                            {getRoleLabel(roles?.[0])} · MasterFade
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 mt-4">
                        <PlaceholderCard
                            icon={CalendarDays}
                            title="Mi Agenda Hoy"
                            subtitle="Citas confirmadas para el día de hoy"
                        />
                        <PlaceholderCard
                            icon={Clock}
                            title="Historial"
                            subtitle="Citas completadas y estadísticas"
                        />
                        <PlaceholderCard
                            icon={Scissors}
                            title="Mis Servicios"
                            subtitle="Servicios que ofreces actualmente"
                        />
                    </div>
                </main>
            </div>

            <PremiumBottomNav
                activeId="inicio"
                sideItems={mobileItems}
                fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, disabled: true }}
            />
        </div>
    );
}
