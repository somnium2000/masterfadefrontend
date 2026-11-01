import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { ROLE_ROUTE_ALLOWED_ROLES } from '../features/home/lib/roleRouting.js';

const appSource = readFileSync(fileURLToPath(new URL('../App.jsx', import.meta.url)), 'utf8').replaceAll('\r\n', '\n');
const superRoutes = appSource.match(/\{\/\* Super Admin \*\/\}([\s\S]*?)\{\/\* Admin \*\/\}/)?.[1] ?? '';
const adminRoutes = appSource.match(/\{\/\* Admin \*\/\}([\s\S]*?)\{\/\* Seguridad \*\/\}\n {6}<Route\n {8}path="\/home\/security"/)?.[1] ?? '';
const promotionsElement = '<Route path="configuracion/promociones" element={<RouteErrorBoundary><AdminConfiguracionPromocionesPage /></RouteErrorBoundary>} />';

describe('rutas administrativas de Promociones', () => {
  test('Admin y Super Admin abren el componente existente con aislamiento de errores', () => {
    expect(adminRoutes).toContain(promotionsElement);
    expect(superRoutes).toContain(promotionsElement);
    expect(adminRoutes).not.toContain('<UnderConstructionPage title="Promociones" />');
  });

  test('las guardas administrativas no conceden acceso a Cliente ni Barbero', () => {
    expect(ROLE_ROUTE_ALLOWED_ROLES.admin).toContain('admin');
    expect(ROLE_ROUTE_ALLOWED_ROLES.admin).not.toContain('cliente');
    expect(ROLE_ROUTE_ALLOWED_ROLES.admin).not.toContain('barbero');
    expect(adminRoutes).toContain('<ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.admin}>');
    expect(superRoutes).toContain('<ProtectedRoute allowedRoles={ROLE_ROUTE_ALLOWED_ROLES.super_admin}>');
  });

  test('las rutas de Comunicación y Seguridad de Admin conservan sus elementos', () => {
    expect(adminRoutes).toContain('<Route path="configuracion/comunicacion" element={<RouteErrorBoundary><AdminConfiguracionComunicacionPage /></RouteErrorBoundary>} />');
    expect(adminRoutes).toContain('<Route path="seguridad" element={<Navigate to="/unauthorized" replace />} />');
  });
});
