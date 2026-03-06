export const ROLE_PRIORITY = ['super_admin', 'admin', 'barbero', 'cliente'];

export const ROLE_HOME_PATHS = {
  super_admin: '/home/super',
  admin: '/home/admin',
  barbero: '/home/barbero',
  cliente: '/home/cliente',
};

export const ROLE_ROUTE_ALLOWED_ROLES = {
  super_admin: ['super_admin'],
  admin: ['super_admin', 'admin'],
  barbero: ['super_admin', 'barbero'],
  cliente: ['super_admin', 'cliente'],
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  barbero: 'Barbero',
  cliente: 'Cliente',
};

export const LEGACY_ROLE_HOME_ALIASES = {
  '/home/super_admin': '/home/super',
};

export function getPrimaryRole(roles = []) {
  return ROLE_PRIORITY.find((role) => roles.includes(role)) || null;
}

export function resolveHomePath(roles = []) {
  const primaryRole = getPrimaryRole(roles);
  return primaryRole ? ROLE_HOME_PATHS[primaryRole] : null;
}

export function getRoleLabel(role) {
  return ROLE_LABELS[role] || 'Usuario';
}
