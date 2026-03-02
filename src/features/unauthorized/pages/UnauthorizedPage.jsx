import { motion } from 'framer-motion';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import MasterfadeLogo from '../../../components/branding/MasterfadeLogo.jsx';
import ThemeSwitcher from '../../../components/theme/ThemeSwitcher.jsx';

export default function UnauthorizedPage() {
  return (
    <div className="mf-page-gradient min-h-screen">
      <div className="mf-mobile-frame mf-screen-pad mf-safe-top flex min-h-screen flex-col pb-12">
        <header className="flex justify-end pt-3">
          <ThemeSwitcher />
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="mf-glass-surface w-full rounded-[30px] p-7 text-center"
          >
            <MasterfadeLogo variant="compact" />

            <div className="mt-7 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-[var(--mf-accent)]">
                <ShieldAlert size={24} strokeWidth={1.9} />
              </div>
            </div>

            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--mf-accent)]">
              Acceso denegado
            </p>
            <h1 className="mf-font-display mt-4 text-[34px] leading-[0.95] text-[var(--mf-text)]">
              No tienes permisos para esta ruta.
            </h1>
            <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">
              Tus claims estan cargados, pero la guarda de roles no permite entrar a este destino.
            </p>

            <div className="mt-8 flex flex-col gap-3">
              <Link
                to="/home"
                className="mf-focus-ring mf-accent-gradient flex h-12 items-center justify-center rounded-[14px] text-sm font-semibold shadow-[var(--mf-shadow-accent)]"
              >
                Ir a /home
              </Link>

              <Link
                to="/"
                className="mf-focus-ring flex h-12 items-center justify-center gap-2 rounded-[14px] border border-[var(--mf-btn-border)] bg-[var(--mf-btn-bg)] text-sm font-medium text-[var(--mf-accent)]"
              >
                <ArrowLeft size={16} strokeWidth={1.9} />
                <span>Volver al inicio</span>
              </Link>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
}
