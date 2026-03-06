import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { getUserDisplayName, useAuth } from '../../../context/AuthContext.jsx';
import { getRoleLabel } from '../lib/roleRouting.js';
import { ROLE_META } from '../../../components/layout/DashboardLayout.jsx';

export function SessionMetaCard({ user, currentRole, currentPath, branchIds, empresaId }) {
  const roles = Array.isArray(user?.roles) && user.roles.length > 0 ? user.roles.join(', ') : 'Sin roles visibles';

  return (
    <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_88%,transparent)] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
        Sesion activa
      </p>
      <p className="mt-4 text-lg font-semibold text-[var(--mf-text)]">{getUserDisplayName(user)}</p>
      <dl className="mt-4 space-y-3 text-sm text-[var(--mf-text-2)]">
        <div className="flex items-center justify-between gap-3">
          <dt>Ruta</dt>
          <dd>{currentPath}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Rol activo</dt>
          <dd className="text-[var(--mf-accent)]">{getRoleLabel(currentRole)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt>Roles</dt>
          <dd className="max-w-[180px] text-right">{roles}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Sucursales</dt>
          <dd>{branchIds?.length || 0}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt>Empresa</dt>
          <dd className="max-w-[180px] truncate text-right">{empresaId || 'N/D'}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function HomePage({ pageRole }) {
  const location = useLocation();
  const { user, branchIds, empresaId } = useAuth();
  const displayName = getUserDisplayName(user);
  const currentRole = pageRole;
  const roleMeta = ROLE_META[currentRole] || ROLE_META.cliente;

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="mf-glass-surface rounded-[32px] p-8"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            Home shell RBAC
          </p>
          <h3 className="mf-font-display mt-4 text-[42px] leading-[0.95] text-[var(--mf-text)]">
            {roleMeta.title}
          </h3>
          <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[var(--mf-text-2)]">{roleMeta.body}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Usuario</p>
              <p className="mt-3 text-xl font-semibold text-[var(--mf-text)]">{displayName}</p>
            </div>

            <div className="rounded-[24px] border border-[var(--mf-nav-border)] bg-[color:color-mix(in_srgb,var(--mf-card)_82%,transparent)] p-5">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--mf-text-2)]">Ruta activa</p>
              <p className="mt-3 text-xl font-semibold text-[var(--mf-accent)]">{location.pathname}</p>
            </div>
          </div>
        </div>

        <SessionMetaCard
          user={user}
          currentRole={currentRole}
          currentPath={location.pathname}
          branchIds={branchIds}
          empresaId={empresaId}
        />
      </div>
    </motion.section>
  );
}
