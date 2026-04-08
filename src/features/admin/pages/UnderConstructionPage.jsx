// src/features/admin/pages/UnderConstructionPage.jsx
import { motion } from 'framer-motion';

export default function UnderConstructionPage({ title = 'Módulo', subtitle }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-24 text-center"
        >
            <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_80%,transparent)] shadow-[var(--mf-shadow-card)]">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--mf-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 22a1 1 0 0 1-1-1v-4a1 1 0 0 1 .445-.832l3-2a1 1 0 0 1 1.11 0l3 2A1 1 0 0 1 22 17v4a1 1 0 0 1-1 1z" />
                    <path d="M18 10a8 8 0 0 0-16 0c0 4.993 5.539 10.193 7.399 11.799a1 1 0 0 0 .601.2" />
                    <path d="M18 22v-3" />
                    {/* JK: Path mínimo válido para evitar warning de SVG path inválido en consola. */}
                    <path d="M10 6h0.01" />
                    <circle cx="10" cy="10" r="2" />
                </svg>
            </div>

            <div className="flex flex-col gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
                    Próximamente
                </p>
                <h1 className="mf-font-display text-[32px] leading-tight text-[var(--mf-text)]">
                    {title}
                </h1>
                {subtitle && (
                    <p className="text-sm leading-6 text-[var(--mf-text-2)]">{subtitle}</p>
                )}
                <p className="mt-2 text-sm leading-6 text-[var(--mf-text-2)]">
                    Este módulo está en construcción y estará disponible muy pronto.
                    El equipo está trabajando para traerte la mejor experiencia.
                </p>
            </div>

            <div className="flex items-center gap-3 rounded-[16px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_60%,transparent)] px-5 py-3">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--mf-accent)]" />
                <span className="text-sm text-[var(--mf-text-2)]">En desarrollo activo</span>
            </div>
        </motion.div>
    );
}
