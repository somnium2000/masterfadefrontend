import { motion } from 'framer-motion';

const indicatorTransition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
};

function SideNavItem({ item, activeId }) {
  const Icon = item.icon;
  const isActive = item.id === activeId;

  return (
    <motion.button
      type="button"
      whileTap={item.disabled ? undefined : { scale: 0.9 }}
      onClick={item.onClick}
      disabled={item.disabled}
      className={`relative flex min-w-[56px] flex-1 flex-col items-center justify-center gap-[3px] px-2 py-1.5 transition-colors duration-200 ${
        item.disabled ? 'cursor-default' : 'cursor-pointer'
      }`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className="absolute top-0 left-1/2 flex -translate-x-1/2">
        {isActive ? (
          <motion.span
            layoutId="mf-bottom-nav-dot"
            transition={indicatorTransition}
            className="h-1 w-1 rounded-full bg-[var(--mf-accent)]"
          />
        ) : null}
      </span>

      <Icon
        size={20}
        strokeWidth={isActive ? 2 : 1.5}
        className={isActive ? 'text-[var(--mf-accent)]' : 'text-[var(--mf-nav-inactive)]'}
      />
      <span
        className={`text-[9px] tracking-[0.02em] ${
          isActive
            ? 'font-semibold text-[var(--mf-accent)]'
            : 'font-normal text-[var(--mf-nav-inactive)]'
        }`}
      >
        {item.label}
      </span>
    </motion.button>
  );
}

export default function PremiumBottomNav({ activeId, sideItems, fabItem, className = '' }) {
  const FabIcon = fabItem.icon;

  return (
    <div className={`fixed inset-x-0 bottom-0 z-50 ${className}`.trim()}>
      <div className="mf-mobile-frame px-0">
        <nav className="mf-glass-nav mf-safe-bottom flex items-end justify-between px-5 pb-[calc(env(safe-area-inset-bottom,8px)+8px)] pt-1 shadow-[0_-8px_28px_rgba(0,0,0,0.12)]">
          <div className="flex flex-1 items-end justify-between">
            {sideItems.slice(0, 2).map((item) => (
              <SideNavItem key={item.id} item={item} activeId={activeId} />
            ))}
          </div>

          <div className="mx-2 flex shrink-0 flex-col items-center">
            <motion.button
              type="button"
              whileHover={{ scale: 1.08, y: -2 }}
              whileTap={{ scale: 0.92 }}
              onClick={fabItem.onClick}
              className="mf-focus-ring mf-accent-gradient mf-fab-shadow -mt-[26px] inline-flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-[var(--mf-nav-bg)]"
              aria-label={fabItem.label}
            >
              <FabIcon size={26} strokeWidth={2.5} />
            </motion.button>
            <span className="mt-1 text-[9px] font-semibold tracking-[0.04em] text-[var(--mf-accent)]">
              {fabItem.label}
            </span>
          </div>

          <div className="flex flex-1 items-end justify-between">
            {sideItems.slice(2).map((item) => (
              <SideNavItem key={item.id} item={item} activeId={activeId} />
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
