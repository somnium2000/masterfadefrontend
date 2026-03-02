import { motion } from 'framer-motion';
import { CalendarDays, House, LogOut, Plus, Scissors, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';

function DesktopNavButton({ icon: Icon, label, active = false, onClick, disabled = false, accent = false }) {
  const baseClassName = accent
    ? 'mf-accent-gradient shadow-[var(--mf-shadow-accent)]'
    : active
      ? 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]'
      : 'border-transparent bg-transparent text-[var(--mf-text-2)] hover:border-[var(--mf-btn-border)] hover:bg-[var(--mf-btn-bg)] hover:text-[var(--mf-text)]';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex h-12 items-center gap-3 rounded-2xl border px-4 text-left text-sm font-medium transition-all duration-200 ${
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer'
      } ${baseClassName}`}
    >
      <Icon size={18} strokeWidth={active || accent ? 2 : 1.7} />
      <span>{label}</span>
    </button>
  );
}

function SessionMetaCard({ user }) {
  const roles = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles.join(', ') : 'Sin roles visibles';

  return (
    <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
        Sesión activa
      </p>
      <p className="mt-4 text-lg font-semibold text-[var(--mf-text)]">{user?.nombre_usuario || 'Usuario'}</p>
      <dl className="mt-4 space-y-3 text-sm text-[var(--mf-text-2)]">
        <div className="flex items-center justify-between gap-3">
          <dt>Ruta</dt>
          <dd>/home</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Estado</dt>
          <dd className="text-[var(--mf-accent)]">Autenticado</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>Roles</dt>
          <dd className="max-w-[180px] text-right">{roles}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const displayName = user?.nombre_usuario || 'Usuario';

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function handleAgendar() {
    navigate('/home');
  }

  const mobileItems = [
    { id: 'inicio', label: 'Inicio', icon: House, onClick: () => navigate('/home') },
    { id: 'servicios', label: 'Servicios', icon: Scissors, disabled: true },
    { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout },
    { id: 'promociones', label: 'Promociones', icon: Tag, disabled: true },
  ];

  return (
    <div className="min-h-screen bg-[var(--mf-bg)] text-[var(--mf-text)]">
      <div className="hidden min-h-screen lg:grid lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-r border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-bg-2)_84%,transparent)] px-6 py-6">
          <div className="sticky top-6 flex min-h-[calc(100vh-48px)] flex-col">
            <div className="rounded-[28px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-6 shadow-[var(--mf-shadow-card)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
                MASTERFADE
              </p>
              <h1 className="mf-font-display mt-3 text-[30px] leading-none tracking-[0.08em] text-[var(--mf-text)]">
                Inicio
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">
                Shell premium listo para seguir conectando módulos sin romper autenticación ni rutas protegidas.
              </p>
            </div>

            <nav className="mt-6 flex flex-col gap-3">
              <DesktopNavButton icon={House} label="Inicio" active onClick={() => navigate('/home')} />
              <DesktopNavButton icon={Scissors} label="Servicios" disabled />
              <DesktopNavButton icon={CalendarDays} label="Agendar" accent onClick={handleAgendar} />
              <DesktopNavButton icon={Tag} label="Promociones" disabled />
            </nav>

            <div className="mt-auto rounded-[28px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-5 shadow-[var(--mf-shadow-soft)]">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Usuario actual</p>
              <p className="mt-3 text-lg font-semibold text-[var(--mf-text)]">{displayName}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-sm font-semibold text-[var(--mf-accent)] transition-colors duration-200 hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)]"
              >
                <LogOut size={17} strokeWidth={1.9} />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 border-b border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-bg)_82%,transparent)] px-8 py-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--mf-accent)]">
                  Panel principal
                </p>
                <h2 className="mf-font-display mt-2 text-[34px] leading-none text-[var(--mf-text)]">
                  Bienvenido, {displayName}
                </h2>
                <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                  ProtectedRoute sigue activo y la navegación premium ya envuelve el home.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 py-2 text-sm text-[var(--mf-text-2)]">
                  Sesión iniciada
                </div>
                <ThemeSwitcher />
              </div>
            </div>
          </header>

          <main className="flex-1 px-8 py-8">
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
              className="mf-glass-surface rounded-[32px] p-8"
            >
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                    Home shell
                  </p>
                  <h3 className="mf-font-display mt-4 text-[42px] leading-[0.95] text-[var(--mf-text)]">
                    La lógica existente sigue intacta.
                  </h3>
                  <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[var(--mf-text-2)]">
                    El home conserva autenticación, lectura de usuario y logout. En esta fase solo se vistió el
                    contenedor para escritorio y móvil, dejando servicios y promociones como placeholders visuales.
                  </p>

                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Usuario</p>
                      <p className="mt-3 text-xl font-semibold text-[var(--mf-text)]">{displayName}</p>
                    </div>

                    <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Estado</p>
                      <p className="mt-3 text-xl font-semibold text-[var(--mf-accent)]">Sesión activa</p>
                    </div>
                  </div>
                </div>

                <SessionMetaCard user={user} />
              </div>
            </motion.section>
          </main>
        </div>
      </div>

      <div className="mf-page-gradient min-h-screen pb-[100px] lg:hidden">
        <div className="mf-mobile-frame mf-screen-pad mf-safe-top">
          <header className="pt-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                  Inicio
                </p>
                <h1 className="mf-font-display mt-3 text-[34px] leading-[0.95] text-[var(--mf-text)]">
                  Bienvenido
                </h1>
                <p className="mt-3 max-w-[240px] text-sm leading-6 text-[var(--mf-text-2)]">
                  Sesión iniciada como <strong className="text-[var(--mf-text)]">{displayName}</strong>.
                </p>
              </div>
              <ThemeSwitcher className="shrink-0" />
            </div>
          </header>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="mf-glass-surface mt-8 rounded-[28px] p-6"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
              Resumen de sesión
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-[20px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Usuario</p>
                <p className="mt-2 text-lg font-semibold text-[var(--mf-text)]">{displayName}</p>
              </div>

              <div className="rounded-[20px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Estado</p>
                <p className="mt-2 text-lg font-semibold text-[var(--mf-accent)]">Autenticado</p>
              </div>
            </div>
          </motion.section>
        </div>

        <PremiumBottomNav
          className="lg:hidden"
          activeId="inicio"
          sideItems={mobileItems}
          fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, onClick: handleAgendar }}
        />
      </div>
    </div>
  );
}
