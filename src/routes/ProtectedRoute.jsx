import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function ProtectedRouteLoader() {
  return (
    <div className="mf-page-gradient flex min-h-screen items-center justify-center px-6">
      <div className="mf-glass-surface w-full max-w-sm rounded-[28px] p-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--mf-accent)]">
          Sesion segura
        </p>
        <div className="mf-hairline mx-auto my-5 w-16" />
        <h1 className="mf-font-display text-[30px] leading-none text-[var(--mf-text)]">Verificando acceso</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--mf-text-2)]">
          Estamos hidratando tus claims para aplicar las guardas por rol.
        </p>
      </div>
    </div>
  );
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, isHydrating, roles, hydrateSession } = useAuth();
  const [rehydrationChecked, setRehydrationChecked] = useState(false);
  const rehydrationStartedRef = useRef(false);

  const needsRouteRehydration =
    isAuthenticated &&
    !isHydrating &&
    roles.length === 0 &&
    !rehydrationChecked;

  useEffect(() => {
    let cancelled = false;

    if (!needsRouteRehydration || rehydrationStartedRef.current) {
      return undefined;
    }

    rehydrationStartedRef.current = true;

    void hydrateSession()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setRehydrationChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateSession, needsRouteRehydration]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isHydrating || needsRouteRehydration) {
    return <ProtectedRouteLoader />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasRole = allowedRoles.some((role) => roles.includes(role));

    if (!hasRole) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return children;
}
