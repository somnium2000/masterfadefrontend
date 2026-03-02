import { motion } from 'framer-motion';
import {
  CalendarDays,
  Crown,
  House,
  LogIn,
  Plus,
  Scissors,
  Tag,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';

const buttonTransition = { duration: 0.5, ease: 'easeOut' };

function SecondaryActionButton({ icon: Icon, label, delay }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...buttonTransition, delay }}
      whileHover={{ scale: 1.015, y: -1, boxShadow: 'var(--mf-shadow-accent-strong)' }}
      whileTap={{ scale: 0.975 }}
      className="mf-focus-ring flex h-[52px] w-full items-center justify-center gap-3 rounded-[14px] border-[1.5px] border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-5 text-[14px] font-medium text-[var(--mf-accent)] shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-shadow duration-200"
    >
      <Icon size={18} strokeWidth={1.9} />
      <span>{label}</span>
    </motion.button>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  function handleAgendar() {
    navigate(isAuthenticated ? '/home' : '/login');
  }

  const navItems = [
    { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate('/') },
    { id: 'servicios', label: 'Servicios', icon: Scissors, disabled: true },
    { id: 'login', label: 'Iniciar sesión', icon: LogIn, onClick: () => navigate('/login') },
    { id: 'promociones', label: 'Promociones', icon: Tag, disabled: true },
  ];

  return (
    <div className="mf-page-gradient min-h-screen">
      <div className="mf-mobile-frame mf-screen-pad mf-safe-top relative flex min-h-screen flex-col pb-[100px]">
        <header className="flex justify-end pt-3">
          <ThemeSwitcher />
        </header>

        <main className="flex min-h-[calc(100dvh-80px)] flex-1 flex-col items-center justify-center pt-7">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
            className="mb-8 h-px w-10 origin-center bg-[var(--mf-accent)]"
          />

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
          >
            <MasterfadeLogo variant="hero" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6, ease: 'easeOut' }}
            className="mt-8 text-center text-[13px] leading-[1.6] tracking-[0.04em] text-[var(--mf-text-2)]"
          >
            <span className="block">Tu estilo, nuestra pasión.</span>
            <span className="block">La experiencia premium en barbería.</span>
          </motion.div>

          <div className="mt-10 flex w-full flex-col gap-[14px]">
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...buttonTransition, delay: 0.7 }}
              whileHover={{ scale: 1.015, y: -1, boxShadow: 'var(--mf-shadow-accent-strong)' }}
              whileTap={{ scale: 0.975 }}
              onClick={handleAgendar}
              className="mf-focus-ring mf-accent-gradient flex h-14 w-full items-center justify-center gap-3 rounded-[14px] px-5 text-[15px] font-semibold tracking-[0.03em] shadow-[var(--mf-shadow-accent)] transition-shadow duration-200"
            >
              <CalendarDays size={18} strokeWidth={1.9} />
              <span>Agendar Cita</span>
            </motion.button>

            <SecondaryActionButton icon={Users} label="Barberos" delay={0.82} />
            <SecondaryActionButton icon={Crown} label="Planes de Membresía VIP" delay={0.94} />
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.2, ease: 'easeOut' }}
            className="mt-10 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-[var(--mf-text-2)]"
          >
            <span className="h-px w-5 bg-[linear-gradient(90deg,transparent,var(--mf-accent))]" />
            <span>Honduras</span>
            <span className="h-px w-5 bg-[linear-gradient(90deg,var(--mf-accent),transparent)]" />
          </motion.div>
        </main>
      </div>

      <PremiumBottomNav
        activeId="inicio"
        sideItems={navItems}
        fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, onClick: handleAgendar }}
      />
    </div>
  );
}
