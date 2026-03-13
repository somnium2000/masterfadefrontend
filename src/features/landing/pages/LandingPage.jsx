import { motion } from 'framer-motion';
import { CalendarDays, Crown, House, LogIn, Plus, Scissors, Tag, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';

const ease = [0.25, 0.46, 0.45, 0.94];
const BG_URL = 'https://images.unsplash.com/photo-1770625467989-465591ffac5b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxsdXh1cnklMjBiYXJiZXJzaG9wJTIwZGFyayUyMGludGVyaW9yJTIwcHJlbWl1bXxlbnwxfHx8fDE3NzI3Njc1NDN8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral';

function DecorativeLine({ delay = 0, className = '' }) {
  return (
    <motion.div
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.8, delay, ease }}
      className={`h-px w-10 origin-center bg-[var(--mf-accent)] ${className}`.trim()}
    />
  );
}

function CircleLogo({ desktop = false }) {
  const outer = desktop ? 'h-[150px] w-[150px]' : 'h-[110px] w-[110px]';
  const inner = desktop ? 'h-[126px] w-[126px]' : 'h-[90px] w-[90px]';
  const iconSize = desktop ? 48 : 36;

  return (
    <div className={`relative flex items-center justify-center rounded-full border-2 border-[var(--mf-accent)] p-2.5 ${outer}`}>
      <div className={`flex items-center justify-center rounded-full border border-[var(--mf-accent)] bg-[var(--mf-logo-fill)] ${inner}`}>
        <Scissors size={iconSize} strokeWidth={1.5} className="-rotate-45 text-[var(--mf-accent)]" />
      </div>
    </div>
  );
}

function BrandBlock({ desktop = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease }}
      className="flex flex-col items-center text-center"
    >
      <CircleLogo desktop={desktop} />
      <h1 className={`mf-font-display mt-6 uppercase leading-none tracking-[0.12em] text-[var(--mf-text)] ${desktop ? 'text-[42px]' : 'text-[28px]'}`}>
        MASTERFADE
      </h1>
      <div className={`mt-2 flex items-center ${desktop ? 'gap-4' : 'gap-3'}`}>
        <span className={`h-px bg-[var(--mf-accent)] ${desktop ? 'w-[30px]' : 'w-6'}`} />
        <span className={`uppercase text-[var(--mf-accent)] ${desktop ? 'text-[11px] tracking-[0.3em]' : 'text-[10px] tracking-[0.3em]'}`}>
          BARBER SHOP
        </span>
        <span className={`h-px bg-[var(--mf-accent)] ${desktop ? 'w-[30px]' : 'w-6'}`} />
      </div>
    </motion.div>
  );
}

function PrimaryCta({ icon: Icon, label, onClick, delay }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      whileHover={{ scale: 1.015, y: -1 }}
      whileTap={{ scale: 0.975 }}
      onClick={onClick}
      className="mf-accent-gradient mf-focus-ring flex h-14 w-full items-center justify-center gap-3 rounded-2xl px-5 text-[15px] font-semibold"
    >
      <Icon size={18} strokeWidth={1.9} />
      <span>{label}</span>
    </motion.button>
  );
}

function SecondaryCta({ icon: Icon, label, onClick, delay, disabled = false }) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease }}
      whileHover={disabled ? undefined : { scale: 1.015, y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.975 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`mf-focus-ring flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-[var(--mf-btn-border)] px-5 text-[15px] transition-all ${
        disabled
          ? 'cursor-not-allowed bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] opacity-70'
          : 'bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] text-[var(--mf-text)] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_72%,white_8%)]'
      }`}
    >
      <Icon size={18} strokeWidth={1.9} className="text-[var(--mf-accent)]" />
      <span>{label}</span>
    </motion.button>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  function handleAgendar() {
    navigate('/agendar/barberos');
  }

  const navItems = [
    { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate('/') },
    { id: 'servicios', label: 'Servicios', icon: Scissors, onClick: () => navigate('/servicios') },
    { id: 'login', label: 'Iniciar sesión', icon: LogIn, onClick: () => navigate('/login') },
    { id: 'promociones', label: 'Promociones', icon: Tag, disabled: true },
  ];

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[var(--mf-bg)] font-[var(--font-body)]">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${BG_URL}')`, opacity: 0.15 }} />
        <div className="absolute inset-0 bg-[var(--mf-noise)] opacity-[0.03]" />
        <div className="absolute inset-0 bg-[var(--mf-hero-gradient)]" />
      </div>

      <div className="relative z-10 md:hidden">
        <section className="mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-[430px] flex-col items-center px-6 pt-[calc(env(safe-area-inset-top,0px)+16px)] pb-[120px]">
          <div className="w-full flex justify-end">
            <ThemeSwitcher labelClassName="text-[var(--mf-text-2)]" />
          </div>

          <DecorativeLine delay={0.2} className="mt-2 mb-7" />
          <BrandBlock />

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6, ease }}
            className="mt-5 text-center text-[13px] leading-[1.6] tracking-[0.04em] text-[var(--mf-text-2)]"
          >
            Tu estilo, nuestra pasión.
            <br />
            La experiencia premium en barbería.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 1.2 }}
            className="mt-8 flex items-center gap-3"
          >
            <span className="h-px w-8 bg-[var(--mf-accent)]" />
            <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--mf-accent)]">Honduras</span>
            <span className="h-px w-8 bg-[var(--mf-accent)]" />
          </motion.div>

          <div className="mt-10 w-full max-w-[360px]">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mb-6 text-[11px] uppercase tracking-[0.15em] text-[var(--mf-text-2)]"
            >
              ¿Qué deseas hacer?
            </motion.p>

            <div className="flex flex-col gap-3">
              <PrimaryCta icon={CalendarDays} label="Agendar Cita" onClick={handleAgendar} delay={0.7} />
              <SecondaryCta icon={Users} label="Barberos" onClick={() => navigate('/servicios')} delay={0.82} />
              <SecondaryCta icon={Crown} label="Planes de Membresía VIP" delay={0.94} disabled />
            </div>
          </div>
        </section>
      </div>

      <div className="relative z-10 hidden min-h-[100vh] md:flex items-center justify-center px-12 pt-[60px] pb-[100px]">
        <div className="flex w-full max-w-[1040px] items-center gap-16">
          <div className="flex flex-1 flex-col items-center">
            <DecorativeLine delay={0.2} className="mb-8" />
            <BrandBlock desktop />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6, ease }}
              className="mt-6 text-center text-[14px] leading-[1.7] tracking-[0.04em] text-[var(--mf-text-2)]"
            >
              Tu estilo, nuestra pasión.
              <br />
              La experiencia premium en barbería.
            </motion.p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 1.2 }}
              className="mt-8 flex items-center gap-4"
            >
              <span className="h-px w-8 bg-[var(--mf-accent)]" />
              <span className="text-[11px] uppercase tracking-[0.24em] text-[var(--mf-accent)]">Honduras</span>
              <span className="h-px w-8 bg-[var(--mf-accent)]" />
            </motion.div>
          </div>

          <div className="h-[320px] w-px bg-[linear-gradient(180deg,transparent,var(--mf-accent),transparent)] opacity-30" />

          <div className="flex w-full max-w-[380px] flex-1 flex-col items-center">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mb-7 w-full text-[11px] uppercase tracking-[0.15em] text-[var(--mf-text-2)]"
            >
              ¿Qué deseas hacer?
            </motion.p>

            <div className="w-full space-y-3">
              <PrimaryCta icon={CalendarDays} label="Agendar Cita" onClick={handleAgendar} delay={0.7} />
              <SecondaryCta icon={Users} label="Barberos" onClick={() => navigate('/servicios')} delay={0.82} />
              <SecondaryCta icon={Crown} label="Planes de Membresía VIP" delay={0.94} disabled />
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="mt-9"
            >
              <ThemeSwitcher labelClassName="text-[var(--mf-text-2)]" />
            </motion.div>
          </div>
        </div>
      </div>

      <PremiumBottomNav
        activeId="inicio"
        sideItems={navItems}
        fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, onClick: handleAgendar }}
        isDesktop
      />
    </div>
  );
}
