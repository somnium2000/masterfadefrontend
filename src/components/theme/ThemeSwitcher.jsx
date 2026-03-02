import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext.jsx';

const LABELS = {
  dark: 'Oscuro Premium',
  light: 'Claro Elegante',
};

export default function ThemeSwitcher({ className = '' }) {
  const { variant, setVariant } = useTheme();
  const nextVariant = variant === 'dark' ? 'light' : 'dark';
  const Icon = variant === 'dark' ? Sun : Moon;

  return (
    <div className={`flex items-center justify-end gap-3 ${className}`.trim()}>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--mf-text)]">
        {LABELS[variant]}
      </span>

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        onClick={() => setVariant(nextVariant)}
        className="mf-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[color:var(--mf-btn-bg)] text-[var(--mf-accent)] transition-colors duration-200 ease-out hover:bg-[color:color-mix(in_srgb,var(--mf-btn-bg)_70%,white_12%)]"
        aria-label={`Cambiar a tema ${LABELS[nextVariant].toLowerCase()}`}
      >
        <Icon size={18} strokeWidth={1.9} />
      </motion.button>
    </div>
  );
}
