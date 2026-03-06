// src/components/data/ViewToggle.jsx
// Switch reutilizable para alternar entre vista Tabla y vista Cards.
// No usa useEffect para evitar loops infinitos: lee localStorage al inicio
// y notifica al padre directamente en el click.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { LayoutGrid, Table2 } from 'lucide-react';

const VIEWS = [
    { id: 'table', icon: Table2, label: 'Tabla' },
    { id: 'cards', icon: LayoutGrid, label: 'Cards' },
];

function readStorage(key, defaultVal) {
    if (!key) return defaultVal;
    try {
        const v = localStorage.getItem(`mf-view-${key}`);
        if (v === 'table' || v === 'cards') return v;
    } catch { /* sin acceso a localStorage */ }
    return defaultVal;
}

/**
 * @param {{ defaultView?: 'table'|'cards', onViewChange?: (v:'table'|'cards')=>void, storageKey?: string }} props
 *
 * NOTA: este componente es COMPLETAMENTE no controlado desde el exterior.
 * No acepta un prop `view` controlado para evitar loops React.
 * El padre puede obtener el valor actual via `onViewChange`.
 */
export default function ViewToggle({ defaultView = 'cards', onViewChange, storageKey }) {
    const [current, setCurrent] = useState(
        () => readStorage(storageKey, defaultView)
    );

    function handleClick(id) {
        if (id === current) return;
        setCurrent(id);
        if (storageKey) {
            try { localStorage.setItem(`mf-view-${storageKey}`, id); } catch { /* */ }
        }
        onViewChange?.(id);
    }

    return (
        <div
            role="radiogroup"
            aria-label="Modo de visualización"
            className="inline-flex items-center gap-1 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-1"
        >
            {VIEWS.map(({ id, icon: Icon, label }) => {
                const isActive = current === id;
                return (
                    <motion.button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        aria-label={label}
                        title={label}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleClick(id)}
                        className={`
                            relative flex h-8 w-8 items-center justify-center rounded-xl
                            transition-colors duration-200 outline-none
                            focus-visible:ring-2 focus-visible:ring-[var(--mf-accent)]/50
                            ${isActive
                                ? 'text-[var(--mf-accent-text)]'
                                : 'text-[var(--mf-text-2)] hover:text-[var(--mf-text)]'
                            }
                        `}
                    >
                        {isActive && (
                            <motion.span
                                layoutId="view-toggle-active"
                                className="absolute inset-0 rounded-xl bg-[var(--mf-accent)]"
                                transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                            />
                        )}
                        <Icon size={15} strokeWidth={2} className="relative z-10" />
                    </motion.button>
                );
            })}
        </div>
    );
}
