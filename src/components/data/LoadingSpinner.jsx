// src/components/data/LoadingSpinner.jsx
// Spinner centralizado reutilizable.

import { Loader2 } from 'lucide-react';

/**
 * @param {{ size?: number, className?: string }} props
 */
export default function LoadingSpinner({ size = 32, className = '' }) {
    return (
        <div className={`flex items-center justify-center py-16 ${className}`}>
            <Loader2
                size={size}
                strokeWidth={1.5}
                className="animate-spin text-[var(--mf-accent)]"
            />
        </div>
    );
}
