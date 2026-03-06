// src/components/data/EmptyState.jsx
// Estado vacío genérico reutilizable.

import { motion } from 'framer-motion';

/**
 * @param {{ icon: React.ElementType, title: string, description?: string, action?: React.ReactNode }} props
 */
export default function EmptyState({ icon: Icon, title, description, action }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center gap-4 py-20 text-center px-4"
        >
            <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_80%,transparent)] shadow-[var(--mf-shadow-soft)]">
                <Icon
                    size={36}
                    strokeWidth={1.2}
                    className="text-[var(--mf-text-2)] opacity-50"
                />
            </div>
            <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold text-[var(--mf-text)]">{title}</p>
                {description && (
                    <p className="text-sm text-[var(--mf-text-2)] max-w-[280px]">{description}</p>
                )}
            </div>
            {action}
        </motion.div>
    );
}
