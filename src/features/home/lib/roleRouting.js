export const ROLE_PRIORITY = ['super_admin', 'admin', 'security_admin', 'security_auditor', 'barbero', 'cliente'];
export const ACTIVE_SCREEN_ROLES = ['super_admin', 'admin', 'security_admin', 'security_auditor', 'barbero', 'cliente'];

export const ROLE_HOME_PATHS = {
  super_admin: '/home/super',
  admin: '/home/admin',
  security_admin: '/home/security',
  security_auditor: '/home/security',
  barbero: '/home/barbero',
  cliente: '/home/cliente',
};

// AM: Flag de contingencia; por defecto queda desactivado para permitir super_admin/admin/barbero.
export const PHASE0_SUPER_ADMIN_ONLY =
  String(import.meta.env.VITE_PHASE0_SUPER_ADMIN_ONLY ?? 'false').trim().toLowerCase() === 'true';

function getAllowedRolesForPhase(allowedRoles) {
  const activeAllowed = allowedRoles.filter((role) => ACTIVE_SCREEN_ROLES.includes(role));
  if (!PHASE0_SUPER_ADMIN_ONLY) {
    return activeAllowed;
  }

  // AM: En contingencia, cualquier shell protegido opera solo con super_admin.
  return activeAllowed.includes('super_admin') ? ['super_admin'] : [];
}

export const ROLE_ROUTE_ALLOWED_ROLES = {
  super_admin: getAllowedRolesForPhase(['super_admin']),
  admin: getAllowedRolesForPhase(['super_admin', 'admin']),
  security: getAllowedRolesForPhase(['super_admin', 'security_admin', 'security_auditor']),
  barbero: getAllowedRolesForPhase(['super_admin', 'barbero']),
  cliente: getAllowedRolesForPhase(['super_admin', 'cliente']),
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  security_admin: 'Administrador de Seguridad',
  security_auditor: 'Auditor de Seguridad',
  barbero: 'Barbero',
  cliente: 'Cliente',
};

export const LEGACY_ROLE_HOME_ALIASES = {
  '/home/super_admin': '/home/super',
};

export function getPrimaryRole(roles = []) {
  const activeRoles = ROLE_PRIORITY.filter((role) => ACTIVE_SCREEN_ROLES.includes(role));
  return activeRoles.find((role) => roles.includes(role)) || null;
}

export function resolveHomePath(roles = []) {
  // AM: Solo en contingencia se restringe el home a SUPER_ADMIN.
  if (PHASE0_SUPER_ADMIN_ONLY && !roles.includes('super_admin')) {
    return null;
  }

  const primaryRole = getPrimaryRole(roles);
  return primaryRole ? ROLE_HOME_PATHS[primaryRole] : null;
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || 'Usuario';
}
