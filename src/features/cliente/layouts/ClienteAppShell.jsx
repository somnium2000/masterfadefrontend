import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CalendarDays, Crown, Home, LogOut, Plus, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import PremiumBottomNav from '../../../components/navigation/PremiumBottomNav.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { useNotifications } from '../../../context/NotificationsContext.jsx';
import { getClienteMe } from '../lib/clienteApi.js';

const CLIENT_NAV_ITEMS = [
  { id: 'inicio', label: 'Inicio', path: '/home/cliente', icon: Home },
  { id: 'citas', label: 'Citas', path: '/home/cliente/citas', icon: CalendarDays },
  { id: 'catalogo', label: 'Catálogo', path: '/home/cliente/catalogo', icon: Sparkles },
  { id: 'planes', label: 'Planes', path: '/home/cliente/planes', icon: Crown },
  { id: 'perfil', label: 'Perfil', path: '/home/cliente/perfil', icon: UserRound },
];

function isPathActive(pathname, targetPath) {
  const normalizedTargetPath = String(targetPath || '').split('#')[0];
  if (targetPath === '/home/cliente') {
    return pathname === normalizedTargetPath;
  }
  return pathname === normalizedTargetPath || pathname.startsWith(`${normalizedTargetPath}/`);
}

function resolveActiveTab(pathname) {
  const tab = CLIENT_NAV_ITEMS.find((item) => isPathActive(pathname, item.path));
  return tab?.id || 'inicio';
}

function resolveSectionTitle(pathname) {
  if (pathname === '/home/cliente' || pathname.startsWith('/home/cliente/')) {
    if (pathname.startsWith('/home/cliente/citas')) return 'Citas MasterFade';
    if (pathname.startsWith('/home/cliente/catalogo')) return 'Catálogos MasterFade';
    if (pathname.startsWith('/home/cliente/planes')) return 'Planes MasterFade';
    if (pathname.startsWith('/home/cliente/perfil')) return 'Perfil MasterFade';
    return 'Inicio MasterFade';
  }
  return 'MasterFade';
}

export default function ClienteAppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { error: notifyError } = useNotifications();
  const { user, logout, isAuthenticated, isHydrated, isHydrating } = useAuth();

  const redirectedUnauthorizedRef = useRef(false);

  const activeTab = useMemo(() => resolveActiveTab(location.pathname), [location.pathname]);
  const sectionTitle = useMemo(() => resolveSectionTitle(location.pathname), [location.pathname]);
  const displayName = getUserDisplayName(user);
  const canLoadClienteProfile = Boolean(isAuthenticated && isHydrated && !isHydrating  );

  const refreshClienteProfile = useCallback(async ({ silent = false } = {}) => {
    if (!canLoadClienteProfile) return null;

    try {
      const payload = await getClienteMe();
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
    { id: 'catalogo', label: 'Catálogo', icon: Sparkles, onClick: () => handleNavigate('/home/cliente/catalogo') },
    { id: 'planes', label: 'Planes', icon: Crown, onClick: () => handleNavigate('/home/cliente/planes') },
    { id: 'perfil', label: 'Perfil', icon: UserRound, onClick: () => handleNavigate('/home/cliente/perfil') },
  ];

  return (
    <div className="mf-page-gradient min-h-screen pb-[110px] lg:pb-0">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-6 pt-3 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 py-2 backdrop-blur-xl">
          <div className="mf-glass-surface rounded-[28px] border border-[var(--mf-btn-border)]/80 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
                  {sectionTitle}
                </p>
                <p className="mf-font-display mt-1 truncate text-[26px] leading-none text-[var(--mf-text)] sm:text-[30px]">
                  {displayName}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] px-3 py-1 text-[11px] font-medium text-[var(--mf-text-2)]">
                    <ShieldCheck size={12} className="text-[var(--mf-accent)]" />
                    Sesión segura activa
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ThemeSwitcher showLabel={false} />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] px-3 text-sm font-semibold text-[var(--mf-text-2)] transition-colors hover:border-[var(--mf-btn-border)] hover:text-[var(--mf-text)]"
                  aria-label="Cerrar sesión"
                  title="Cerrar sesión"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Salir</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-4 flex flex-1 gap-4">
          <aside className="hidden lg:flex lg:w-[260px] lg:flex-col">
            <div className="mf-glass-surface flex h-full flex-col rounded-[24px] border border-[var(--mf-nav-border)] p-4">
              <button
                type="button"
                onClick={() => handleNavigate('/home/cliente')}
                className="mb-4 inline-flex w-full items-center justify-center rounded-xl border border-transparent py-1"
              >
                <MasterfadeLogo variant="sidebar" className="mx-auto" />
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
      />
    </div>
  );
}

