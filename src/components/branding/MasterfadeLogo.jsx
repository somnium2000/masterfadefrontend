import { Scissors } from 'lucide-react';

const VARIANTS = {
  hero: {
    outer: 'h-[110px] w-[110px]',
    inner: 'h-[90px] w-[90px]',
    icon: 36,
    title: 'text-[18px] tracking-[0.12em]',
    subtitle: 'text-[10px] tracking-[0.3em]',
    lines: 'w-6',
    gap: 'gap-5',
  },
  compact: {
    outer: 'h-[86px] w-[86px]',
    inner: 'h-[70px] w-[70px]',
    icon: 28,
    title: 'text-[16px] tracking-[0.12em]',
    subtitle: 'text-[9px] tracking-[0.28em]',
    lines: 'w-5',
    gap: 'gap-4',
  },
};

export default function MasterfadeLogo({ variant = 'hero', className = '' }) {
  const styles = VARIANTS[variant] || VARIANTS.hero;

  return (
    <div className={`flex flex-col items-center text-center ${styles.gap} ${className}`.trim()}>
      <div
        className={`relative flex items-center justify-center rounded-full border-2 border-[var(--mf-accent)] ${styles.outer}`}
      >
        <div
          className={`flex items-center justify-center rounded-full border-[1.5px] border-[var(--mf-accent)] bg-[image:var(--mf-logo-fill)] shadow-[0_4px_24px_rgba(201,169,110,0.15)] ${styles.inner}`}
          style={{
            boxShadow:
              '0 4px 24px color-mix(in srgb, var(--mf-accent) 18%, transparent), inset 0 1px 0 color-mix(in srgb, white 10%, transparent)',
          }}
        >
          <Scissors
            size={styles.icon}
            strokeWidth={1.9}
            className="text-[var(--mf-accent)]"
            style={{ transform: 'rotate(-45deg)' }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className={`mf-font-display uppercase leading-none text-[var(--mf-text)] ${styles.title}`}>
          MASTERFADE
        </div>

        <div className="flex items-center justify-center gap-3 text-[var(--mf-accent)]">
          <span className={`h-px bg-[var(--mf-accent)]/70 ${styles.lines}`} />
          <span className={`uppercase leading-none ${styles.subtitle}`}>Barber Shop</span>
          <span className={`h-px bg-[var(--mf-accent)]/70 ${styles.lines}`} />
        </div>
      </div>
    </div>
  );
}
