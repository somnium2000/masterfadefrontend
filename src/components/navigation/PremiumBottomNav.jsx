import { motion } from 'framer-motion';

const indicatorTransition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

function SideNavItem({ item, activeId, compact = false }) {
  const Icon = item.icon;
  const isActive = item.id === activeId;
  const activeSurfaceLayoutId = compact ? 'mf-bottom-nav-active-compact' : 'mf-bottom-nav-active';

  return (
    <motion.button
      type="button"
      whileTap={item.disabled ? undefined : { scale: 0.9 }}
      onClick={item.onClick}
      disabled={item.disabled}
      className={`relative flex min-w-[56px] flex-1 flex-col items-center justify-center ${
        compact ? 'gap-1.5 rounded-xl px-1.5 py-2' : 'gap-[3px] px-2 py-1.5'
      } transition-colors duration-200 ${
        item.disabled ? 'cursor-default' : 'cursor-pointer'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      {isActive ? (
        <motion.span
          layoutId={activeSurfaceLayoutId}
          transition={indicatorTransition}
          className={`absolute inset-0 rounded-xl border ${
            compact
              ? 'border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)]'
              : 'border-transparent bg-transparent'
          }`}
        />
      ) : null}

      <span className={`absolute left-1/2 flex -translate-x-1/2 ${compact ? 'top-0.5' : 'top-0'}`}>
        {isActive ? (
          <motion.span
            layoutId="mf-bottom-nav-dot"
            transition={indicatorTransition}
            className="h-1 w-1 rounded-full bg-[var(--mf-accent)]"
          />
        ) : null}
      </span>

      <Icon
        size={compact ? 18 : 20}
        strokeWidth={isActive ? 2 : 1.5}
        className={`relative z-10 ${isActive ? 'text-[var(--mf-accent)]' : 'text-[var(--mf-nav-inactive)]'}`}
      />
      <span
        className={`relative z-10 ${compact ? 'text-[9px]' : 'text-[9px]'} tracking-[0.02em] ${
          isActive
            ? 'font-semibold text-[var(--mf-accent)]'
            : 'font-normal text-[var(--mf-nav-inactive)]'
        } max-w-full truncate text-center leading-[1.05]`}
      >
        {item.label}
      </span>
    </motion.button>
  );
}

export default function PremiumBottomNav({
  activeId,
  sideItems,
  fabItem,
  className = '',
  isDesktop = false,
  mobilePreset = 'default',
}) {
  const hasFab = Boolean(fabItem?.icon && typeof fabItem?.onClick === 'function');
  const FabIcon = fabItem?.icon;
  const items = Array.isArray(sideItems) ? sideItems : [];
  const compactBarberPreset = mobilePreset === 'barber';
  const frameClass = isDesktop ? 'mf-mobile-frame px-0 md:mx-auto md:w-full md:max-w-[600px] md:px-0' : 'mf-mobile-frame px-0';
  const navClass = compactBarberPreset
    ? 'mf-glass-nav mf-safe-bottom mx-2 mb-2 flex items-end justify-between rounded-[20px] border border-[var(--mf-nav-border)] px-2 pb-[calc(env(safe-area-inset-bottom,8px)+5px)] pt-1.5 shadow-[0_-8px_28px_rgba(0,0,0,0.16)]'
    : 'mf-glass-nav mf-safe-bottom flex items-end justify-between px-4 pb-[calc(env(safe-area-inset-bottom,8px)+8px)] pt-1 shadow-[0_-8px_28px_rgba(0,0,0,0.12)]';
  const fabClass = compactBarberPreset
    ? 'mf-focus-ring mf-accent-gradient mf-fab-shadow -mt-[20px] inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--mf-nav-bg)]'
    : 'mf-focus-ring mf-accent-gradient mf-fab-shadow -mt-[26px] inline-flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[var(--mf-nav-bg)]';
  const fabIconSize = compactBarberPreset ? 22 : 26;

  if (!items.length) return null;

  return (
    <div className={`fixed inset-x-0 bottom-0 z-50 ${className}`.trim()}>
      <div className={frameClass}>
        <nav className={navClass}>
          {hasFab ? (
            <>
              <div className={`flex flex-1 items-end justify-between ${compactBarberPreset ? 'gap-1' : ''}`}>
                {items.slice(0, 2).map((item) => (
                  <SideNavItem key={item.id} item={item} activeId={activeId} compact={compactBarberPreset} />
                ))}
              </div>

              <div className={`${compactBarberPreset ? 'mx-1.5' : 'mx-2'} flex shrink-0 flex-col items-center`}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.08, y: -2 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={fabItem.onClick}
                  className={fabClass}
                  aria-label={fabItem.label}
                >
                  <FabIcon size={fabIconSize} strokeWidth={2.5} />
                </motion.button>
                <span className={`mt-1 ${compactBarberPreset ? 'text-[10px]' : 'text-[9px]'} font-semibold tracking-[0.04em] text-[var(--mf-accent)]`}>
                  {fabItem.label}
                </span>
              </div>

              <div className={`flex flex-1 items-end justify-between ${compactBarberPreset ? 'gap-1' : ''}`}>
                {items.slice(2).map((item) => (
                  <SideNavItem key={item.id} item={item} activeId={activeId} compact={compactBarberPreset} />
                ))}
              </div>
            </>
          ) : (
            <div className={`flex w-full items-end justify-between ${compactBarberPreset ? 'gap-1.5' : 'gap-1'}`}>
              {items.map((item) => (
                <SideNavItem key={item.id} item={item} activeId={activeId} compact={compactBarberPreset} />
              ))}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
