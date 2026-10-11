import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildNavModules } from '../../../../components/layout/DashboardLayout.jsx';

const appSource = fs.readFileSync(new URL('../../../../App.jsx', import.meta.url), 'utf8');
const authContextSource = fs.readFileSync(new URL('../../../../context/AuthContext.jsx', import.meta.url), 'utf8');

describe('Reportes frontend authorization contract', () => {
  it('bloquea la ruta base y cualquier hija en el shell admin', () => {
    const adminStart = appSource.indexOf('{/* Admin */}');
    const adminSection = appSource.slice(adminStart, appSource.indexOf('path="/home/security"', adminStart));
    expect(adminSection).toContain('<Route path="reportes" element={<Navigate to="/unauthorized" replace />} />');
    expect(adminSection).toContain('<Route path="reportes/*" element={<Navigate to="/unauthorized" replace />} />');
    expect(adminSection).not.toContain('<AdminReportesIngresosPage />');
    for (const operationalRoute of ['empleados', 'clientes', 'usuarios', 'citas', 'catalog/servicios', 'sucursales']) {
      expect(adminSection).toContain(`path="${operationalRoute}"`);
    }
  });

  it('conserva ingresos, membresias, barberos, concurrencia y rutas legacy para super_admin', () => {
    const superSection = appSource.slice(appSource.indexOf('{/* Super Admin */}'), appSource.indexOf('{/* Admin */}'));
    for (const route of ['reportes/ingresos', 'reportes/membresias', 'reportes/barberos', 'reportes/concurrencia', 'reportes/ventas', 'reportes/sucursales']) {
      expect(superSection).toContain(`path="${route}"`);
    }
    expect(superSection).toContain('key={reportSessionKey}');
  });

  it('construye el modulo de navegacion Reportes solo para el shell super_admin', () => {
    const superModules = buildNavModules('/home/super', 'super_admin', ['super_admin']);
    const adminModules = buildNavModules('/home/admin', 'admin', ['admin']);
    expect(superModules.find((module) => module.id === 'reportes')?.subItems).toHaveLength(4);
    expect(adminModules.some((module) => module.id === 'reportes')).toBe(false);
    const operationalIds = ['inicio', 'personas', 'servicios', 'sucursales', 'citas', 'superpuntos', 'configuracion'];
    expect(adminModules.map((module) => module.id)).toEqual(expect.arrayContaining(operationalIds));
  });

  it('integra la identidad de Auth con la invalidacion de cache de Reportes', () => {
    expect(authContextSource).toContain("import { setAdminReportesSessionScope } from '../features/admin/lib/adminReportesApi.js'");
    expect(authContextSource).toMatch(/const applyUserState[\s\S]*?setAdminReportesSessionScope\([\s\S]*?userId:[\s\S]*?roles:[\s\S]*?branchIds:[\s\S]*?empresaId:/);
    expect(authContextSource).toMatch(/const clearSessionState[\s\S]*?applyUserState\(null\)/);
    expect(authContextSource).toMatch(/const invalidateSession[\s\S]*?clearSessionState\(\)/);
    expect(authContextSource).toMatch(/const expireIdleSession[\s\S]*?clearSessionState\(\)/);
  });
});
