// src/components/data/ErrorBanner.jsx
// Banner de error genérico con botón de reintentar.

import { AlertCircle } from 'lucide-react';

/**
 * @param {{ message: string, onRetry?: () => void }} props
 */
export default function ErrorBanner({ message, onRetry }) {
    return (
        <div
            role="alert"
            className="flex items-start gap-3 rounded-[16px] border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400"
        >
            <AlertCircle size={18} strokeWidth={2} className="shrink-0 mt-0.5" />
            <span className="flex-1 leading-6">{message}</span>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="ml-auto shrink-0 underline underline-offset-2 hover:no-underline transition-all duration-150"
                >
                    Reintentar
                </button>
            )}
        </div>
    );
}
