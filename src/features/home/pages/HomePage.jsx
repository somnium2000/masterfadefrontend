import { motion } from 'framer-motion';
import { CalendarDays, House, LogOut, Plus, Scissors, Tag } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { getRoleLabel, resolveHomePath } from '../lib/roleRouting.js';

const ROLE_META = {
  super_admin: {
    kicker: 'Panel global',
    title: 'Vision total del negocio',
    body: 'Tus claims permiten supervision completa. La shell mantiene el layout premium mientras los modulos internos crecen por rol.',
  },
  admin: {
    kicker: 'Operacion de sucursal',
    title: 'Control administrativo',
    body: 'Tu acceso esta enfocado en gestion y operacion. En esta fase la diferencia por rol vive en rutas y guardas, no en nuevos modulos.',
  },
  barbero: {
    kicker: 'Agenda del equipo',
    title: 'Flujo operativo del barbero',
    body: 'La autenticacion ya distingue tu perfil. El contenedor premium conserva la experiencia mientras llegan vistas operativas especificas.',
  },
  cliente: {
    kicker: 'Experiencia del cliente',
    title: 'Tu acceso esta asegurado',
    body: 'La app ya reconoce tu rol y te dirige a la ruta correcta sin inventar pantallas adicionales en esta fase.',
  },
};

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

function SessionMetaCard({ user, currentRole, currentPath, branchIds, empresaId }) {
  const roles = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles.join(', ') : 'Sin roles visibles';

  return (
    <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
        Sesion activa
      </p>
      <p className="mt-4 text-lg font-semibold text-[var(--mf-text)]">{getUserDisplayName(user)}</p>
      <dl className="mt-4 space-y-3 text-sm text-[var(--mf-text-2)]">
        <div className="flex items-center justify-between gap-3">
          <dt>Ruta</dt>
          <dd>{currentPath}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Rol activo</dt>
          <dd className="text-[var(--mf-accent)]">{getRoleLabel(currentRole)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>Roles</dt>
          <dd className="max-w-[180px] text-right">{roles}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Sucursales</dt>
          <dd>{branchIds.length}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Empresa</dt>
          <dd className="max-w-[180px] truncate text-right">{empresaId || 'N/D'}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function HomePage({ pageRole }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, roles, branchIds, empresaId, logout } = useAuth();

  const displayName = getUserDisplayName(user);
  const resolvedHomePath = resolveHomePath(roles) || '/home';
  const currentRole = pageRole;
  const roleMeta = ROLE_META[currentRole] || ROLE_META.cliente;

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function handleGoHome() {
    navigate(resolvedHomePath);
  }

  const mobileItems = [
    { id: 'inicio', label: 'Inicio', icon: House, onClick: handleGoHome },
    { id: 'servicios', label: 'Servicios', icon: Scissors, disabled: true },
    { id: 'salir', label: 'Salir', icon: LogOut, onClick: handleLogout },
    { id: 'promociones', label: 'Promociones', icon: Tag, disabled: true },
  ];

  return (
    <div className="min-h-screen bg-[var(--mf-bg)] text-[var(--mf-text)]">
      <div className="hidden min-h-screen lg:grid lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border-r border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-bg-2)_84%,transparent)] px-6 py-6">
          <div className="sticky top-6 flex min-h-[calc(100vh-48px)] flex-col">
            <div className="rounded-[28px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-6 shadow-[var(--mf-shadow-card)]">
              <MasterfadeLogo variant="compact" />
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
                {roleMeta.kicker}
              </p>
              <h1 className="mf-font-display mt-3 text-[28px] leading-none tracking-[0.06em] text-[var(--mf-text)]">
                {getRoleLabel(currentRole)}
              </h1>
              <p className="mt-3 text-sm leading-6 text-[var(--mf-text-2)]">{roleMeta.body}</p>
            </div>

            <nav className="mt-6 flex flex-col gap-3">
              <DesktopNavButton icon={House} label="Inicio" active onClick={handleGoHome} />
              <DesktopNavButton icon={Scissors} label="Servicios" disabled />
              <DesktopNavButton icon={CalendarDays} label="Agendar" accent onClick={handleGoHome} />
              <DesktopNavButton icon={Tag} label="Promociones" disabled />
            </nav>

            <div className="mt-auto rounded-[28px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_84%,transparent)] p-5 shadow-[var(--mf-shadow-soft)]">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Usuario actual</p>
              <p className="mt-3 text-lg font-semibold text-[var(--mf-text)]">{displayName}</p>
              <p className="mt-2 text-sm text-[var(--mf-accent)]">{getRoleLabel(currentRole)}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-sm font-semibold text-[var(--mf-accent)] transition-colors duration-200 hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)]"
              >
                <LogOut size={17} strokeWidth={1.9} />
                <span>Cerrar sesion</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 border-b border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-bg)_82%,transparent)] px-8 py-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--mf-accent)]">
                  {roleMeta.kicker}
                </p>
                <h2 className="mf-font-display mt-2 text-[34px] leading-none text-[var(--mf-text)]">
                  {roleMeta.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                  Sesion iniciada como <strong className="text-[var(--mf-text)]">{displayName}</strong> en{' '}
                  <span className="text-[var(--mf-accent)]">{location.pathname}</span>.
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-4 py-2 text-sm text-[var(--mf-text-2)]">
                  {getRoleLabel(currentRole)}
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
                    Home shell RBAC
                  </p>
                  <h3 className="mf-font-display mt-4 text-[42px] leading-[0.95] text-[var(--mf-text)]">
                    {roleMeta.title}
                  </h3>
                  <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[var(--mf-text-2)]">{roleMeta.body}</p>

                  <div className="mt-8 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Usuario</p>
                      <p className="mt-3 text-xl font-semibold text-[var(--mf-text)]">{displayName}</p>
                    </div>

                    <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-5">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Ruta activa</p>
                      <p className="mt-3 text-xl font-semibold text-[var(--mf-accent)]">{location.pathname}</p>
                    </div>
                  </div>
                </div>

                <SessionMetaCard
                  user={user}
                  currentRole={currentRole}
                  currentPath={location.pathname}
                  branchIds={branchIds}
                  empresaId={empresaId}
                />
              </div>
            </motion.section>
          </main>
        </div>
      </div>

      <div className="mf-page-gradient min-h-screen pb-[100px] lg:hidden">
        <div className="mf-mobile-frame mf-screen-pad mf-safe-top">
          <header className="pt-3">
            <div className="flex justify-end">
              <ThemeSwitcher className="shrink-0" />
            </div>

            <div className="mt-6 flex flex-col items-center text-center">
              <MasterfadeLogo variant="compact" />
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                {roleMeta.kicker}
              </p>
              <h1 className="mf-font-display mt-3 text-[32px] leading-[0.95] text-[var(--mf-text)]">
                {getRoleLabel(currentRole)}
              </h1>
              <p className="mt-3 max-w-[280px] text-sm leading-6 text-[var(--mf-text-2)]">
                Sesion iniciada como <strong className="text-[var(--mf-text)]">{displayName}</strong>.
              </p>
            </div>
          </header>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="mf-glass-surface mt-8 rounded-[28px] p-6"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
              Resumen RBAC
            </p>

            <div className="mt-5 space-y-4">
              <div className="rounded-[20px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Ruta</p>
                <p className="mt-2 text-lg font-semibold text-[var(--mf-text)]">{location.pathname}</p>
              </div>

              <div className="rounded-[20px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Rol activo</p>
                <p className="mt-2 text-lg font-semibold text-[var(--mf-accent)]">{getRoleLabel(currentRole)}</p>
              </div>

              <div className="rounded-[20px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_86%,transparent)] p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--mf-text-2)]">Sucursales</p>
                <p className="mt-2 text-lg font-semibold text-[var(--mf-text)]">{branchIds.length}</p>
              </div>
            </div>
          </motion.section>
        </div>

        <PremiumBottomNav
          className="lg:hidden"
          activeId="inicio"
          sideItems={mobileItems}
          fabItem={{ id: 'agendar', label: 'Agendar', icon: Plus, onClick: handleGoHome }}
        />
      </div>
    </div>
  );
}
