import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Crown, Home, LogOut, Plus, Sparkles, UserRound } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import ClienteProfileCompletionBanner from '../components/ClienteProfileCompletionBanner.jsx';
import { getClienteMe } from '../lib/clienteApi.js';

const CLIENT_NAV_ITEMS = [
  { id: 'inicio', label: 'Inicio', path: '/home/cliente', icon: Home },
  { id: 'citas', label: 'Historial', path: '/home/cliente/citas', icon: CalendarDays },
  { id: 'catalogo', label: 'Servicios y promociones', path: '/home/cliente/catalogo', icon: Sparkles },
  { id: 'planes', label: 'Planes', path: '/home/cliente/planes', icon: Crown },
  { id: 'perfil', label: 'Perfil', path: '/home/cliente/perfil', icon: UserRound },
];

function isPathActive(pathname, targetPath) {
  if (targetPath === '/home/cliente') {
    return pathname === targetPath;
  }
  return pathname === targetPath || pathname.startsWith(`${targetPath}/`);
}

function resolveActiveTab(pathname) {
  const tab = CLIENT_NAV_ITEMS.find((item) => isPathActive(pathname, item.path));
  return tab?.id || 'inicio';
}

export default function ClienteAppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { error: notifyError } = useNotifications();
  const { user, logout, isAuthenticated, isHydrated, isHydrating, token } = useAuth();

  const [profileCompletion, setProfileCompletion] = useState(null);
  const redirectedUnauthorizedRef = useRef(false);

  const activeTab = useMemo(() => resolveActiveTab(location.pathname), [location.pathname]);
  const displayName = getUserDisplayName(user);
  const canLoadClienteProfile = Boolean(isAuthenticated && isHydrated && !isHydrating && token);

  const refreshClienteProfile = useCallback(async ({ silent = false } = {}) => {
    if (!canLoadClienteProfile) return null;

    try {
      const payload = await getClienteMe();
      setProfileCompletion(payload?.profile_completion || null);
      return payload;
    } catch (error) {
      if (Number(error?.status) === 401) {
        if (!redirectedUnauthorizedRef.current) {
          redirectedUnauthorizedRef.current = true;
          logout();
          navigate('/login', { replace: true });
        }
        return null;
      }
      if (!silent) {
        notifyError(error?.data?.error?.message || error?.message || 'No se pudo cargar tu estado de perfil.');
      }
      return null;
    }
  }, [canLoadClienteProfile, logout, navigate, notifyError]);

  useEffect(() => {
    if (!canLoadClienteProfile) return;
    redirectedUnauthorizedRef.current = false;
    let cancelled = false;
    const timerId = window.setTimeout(() => {
      if (!cancelled) {
        void refreshClienteProfile({ silent: true });
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [canLoadClienteProfile, refreshClienteProfile]);

  const outletContextValue = useMemo(
    () => ({ refreshClienteProfile }),
    [refreshClienteProfile]
  );

  function handleNavigate(path) {
    navigate(path);
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const mobileSideItems = [
    { id: 'inicio', label: 'Inicio', icon: Home, onClick: () => handleNavigate('/home/cliente') },
    { id: 'citas', label: 'Citas', icon: CalendarDays, onClick: () => handleNavigate('/home/cliente/citas') },
    { id: 'catalogo', label: 'Catalogo', icon: Sparkles, onClick: () => handleNavigate('/home/cliente/catalogo') },
    { id: 'planes', label: 'Planes', icon: Crown, onClick: () => handleNavigate('/home/cliente/planes') },
    { id: 'perfil', label: 'Perfil', icon: UserRound, onClick: () => handleNavigate('/home/cliente/perfil') },
  ];

  return (
    <div className="mf-page-gradient min-h-screen pb-[110px] lg:pb-0">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-6 pt-3 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 border-b border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-bg)_84%,transparent)] px-1 py-3 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--mf-accent)]">
                Bienvenido
              </p>
              <p className="mt-1 truncate text-base font-semibold text-[var(--mf-text)] sm:text-lg">
                {displayName}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <ThemeSwitcher />
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] transition-colors hover:text-[var(--mf-accent)]"
                aria-label="Cerrar sesion"
                title="Cerrar sesion"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="mt-4 flex flex-1 gap-4">
          <aside className="hidden lg:flex lg:w-[260px] lg:flex-col">
            <div className="mf-glass-surface flex h-full flex-col rounded-[24px] border border-[var(--mf-nav-border)] p-4">
              <button
                type="button"
                onClick={() => handleNavigate('/home/cliente')}
                className="mb-4 inline-flex items-center gap-2 self-start"
              >
                <MasterfadeLogo variant="compact" />
              </button>

              <nav className="space-y-2">
                {CLIENT_NAV_ITEMS.map((item) => {
                  const active = activeTab === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNavigate(item.path)}
                      className={[
                        'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all',
                        active
                          ? 'border-[var(--mf-accent)] bg-[color:color-mix(in_srgb,var(--mf-accent)_22%,transparent)] text-[var(--mf-text)]'
                          : 'border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-text-2)] hover:border-[var(--mf-btn-border)] hover:text-[var(--mf-text)]',
                      ].join(' ')}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon size={16} className={active ? 'text-[var(--mf-accent)]' : 'text-[var(--mf-text-2)]'} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="mt-auto space-y-3 pt-5">
                <button
                  type="button"
                  onClick={() => handleNavigate('/agendar')}
                  className="mf-accent-gradient inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
                >
                  <Plus size={16} />
                  Nueva cita
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigate('/home/cliente/perfil')}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] text-sm font-semibold text-[var(--mf-text-2)] transition-colors hover:text-[var(--mf-text)]"
                >
                  <Crown size={15} />
                  Mi perfil
                </button>
              </div>
            </div>
          </aside>

          <section className="min-w-0 flex-1 space-y-4">
            <ClienteProfileCompletionBanner
              profileCompletion={profileCompletion}
              compact
              onEditProfile={() => handleNavigate('/home/cliente/perfil')}
            />

            <main className="min-h-[320px]">
              <Outlet context={outletContextValue} />
            </main>
          </section>
        </div>
      </div>

      <PremiumBottomNav
        className="lg:hidden"
        activeId={activeTab}
        sideItems={mobileSideItems}
        fabItem={{
          id: 'nueva-cita',
          label: 'Nueva cita',
          icon: Plus,
          onClick: () => handleNavigate('/agendar'),
        }}
      />
    </div>
  );
}
