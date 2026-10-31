import { motion } from 'framer-motion';
import { CalendarDays, Crown, House, LogIn, Plus, Scissors, Tag, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';

const ease = [0.25, 0.46, 0.45, 0.94];
const BG_URL = 'https://images.pexels.com/photos/5152514/pexels-photo-5152514.jpeg?auto=compress&cs=tinysrgb&w=1920';

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

function BrandBlock({ desktop = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3, ease }}
      className="flex flex-col items-center text-center"
    >
      <MasterfadeLogo
        variant="publicPromotions"
        className={desktop ? '-my-8 md:-my-10 scale-[1.16] md:scale-[1.22]' : '-my-6 sm:-my-8 scale-[1.12]'}
      />
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

function PrimaryCta({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mf-accent-gradient mf-focus-ring flex h-14 w-full items-center justify-center gap-3 rounded-2xl px-5 text-[15px] font-semibold transition-transform duration-200 hover:-translate-y-px hover:scale-[1.015] active:scale-[0.975] motion-reduce:transform-none motion-reduce:transition-none"
    >
      <Icon size={18} strokeWidth={1.9} />
      <span>{label}</span>
    </button>
  );
}

function SecondaryCta({ icon: Icon, label, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`mf-focus-ring flex h-14 w-full items-center justify-center gap-3 rounded-2xl border border-[var(--mf-btn-border)] px-5 text-[15px] transition-all duration-200 motion-reduce:transform-none motion-reduce:transition-none ${
        disabled
          ? 'cursor-not-allowed bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] opacity-70'
          : 'bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] text-[var(--mf-text)] hover:-translate-y-px hover:scale-[1.015] hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_72%,white_8%)] active:scale-[0.975]'
      }`}
    >
      <Icon size={18} strokeWidth={1.9} className="text-[var(--mf-accent)]" />
      <span>{label}</span>
    </button>
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
    { id: 'promociones', label: 'Promociones', icon: Tag, onClick: () => navigate('/promociones') },
  ];

  return (
    <div className="mf-landing relative min-h-[100dvh] overflow-hidden bg-[var(--mf-bg)] font-[var(--font-body)]">
      <main aria-labelledby="landing-title">
      <h1 id="landing-title" className="sr-only">MASTERFADE — Barbería premium en Honduras</h1>
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${BG_URL}')`, opacity: 0.15 }} />
        <div className="absolute inset-0 bg-[var(--mf-noise)] opacity-[0.03]" />
        <div className="absolute inset-0 bg-[var(--mf-hero-gradient)]" />
      </div>

      <div className="relative z-10 md:hidden">
        <section className="mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-[430px] flex-col items-center px-6 pt-[calc(env(safe-area-inset-top,0px)+16px)] pb-[120px]">
          <div className="w-full flex justify-end">
            <ThemeSwitcher labelClassName="mf-landing-muted" />
          </div>

          <div className="flex w-full flex-1 items-center justify-center">
            <div className="w-full max-w-[360px]">
              <div className="flex flex-col items-center text-center">
                <DecorativeLine delay={0.2} className="mb-7" />
                <BrandBlock />

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6, delay: 0.6, ease }}
                  className="mt-5 text-center text-[13px] leading-[1.6] tracking-[0.04em] text-[var(--mf-landing-muted)]"
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
              </div>

              <div className="mt-10 w-full">
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  className="mb-6 text-[11px] uppercase tracking-[0.15em] text-[var(--mf-landing-muted)]"
                >
                  ¿Qué deseas hacer?
                </motion.p>

                <div className="flex flex-col gap-3">
                  <PrimaryCta icon={CalendarDays} label="Agendar Cita" onClick={handleAgendar} />
                  <SecondaryCta icon={Users} label="Barberos" onClick={() => navigate('/barberos')} />
                  <SecondaryCta icon={Crown} label="Planes de Membresía VIP" onClick={() => navigate('/membresias-vip')} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <div className="relative z-10 hidden min-h-[100vh] md:flex items-center justify-center px-12 pt-[60px] pb-[100px]">
        <div className="flex w-full max-w-[1080px] items-center justify-center gap-10 xl:gap-14">
          <div className="flex min-w-0 basis-0 flex-1 flex-col items-center px-2">
            <DecorativeLine delay={0.2} className="mb-8" />
            <BrandBlock desktop />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6, ease }}
              className="mt-6 text-center text-[14px] leading-[1.7] tracking-[0.04em] text-[var(--mf-landing-muted)]"
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

          <div className="flex min-w-0 basis-0 flex-1 flex-col items-center px-2">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="mb-7 w-full max-w-[380px] text-center text-[11px] uppercase tracking-[0.15em] text-[var(--mf-landing-muted)]"
            >
              ¿Qué deseas hacer?
            </motion.p>

            <div className="w-full max-w-[380px] space-y-3">
              <PrimaryCta icon={CalendarDays} label="Agendar Cita" onClick={handleAgendar} />
              <SecondaryCta icon={Users} label="Barberos" onClick={() => navigate('/barberos')} />
              <SecondaryCta icon={Crown} label="Planes de Membresía VIP" onClick={() => navigate('/membresias-vip')} />
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 1 }}
              className="mt-9"
            >
              <ThemeSwitcher labelClassName="mf-landing-muted" />
            </motion.div>
          </div>
        </div>
      </div>

      </main>
      <PremiumBottomNav
        activeId="inicio"
        sideItems={navItems}
        fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, onClick: handleAgendar }}
        isDesktop
      />
    </div>
  );
}
