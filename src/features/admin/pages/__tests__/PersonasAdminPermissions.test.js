import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getAssignableEmployeeRoles,
  isPrivilegedEmployee,
} from '../AdminEmpleadosPage.jsx';
import { isPrivilegedUsuario } from '../AdminUsuariosPage.jsx';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_SOURCE = fs.readFileSync(path.resolve(CURRENT_DIR, '../../../../App.jsx'), 'utf8');
const CLIENTS_SOURCE = fs.readFileSync(path.resolve(CURRENT_DIR, '../AdminClientesPage.jsx'), 'utf8');

describe('rutas Personas por rol', () => {
  for (const [route, component] of [
    ['empleados', 'AdminEmpleadosPage'],
    ['clientes', 'AdminClientesPage'],
    ['usuarios', 'AdminUsuariosPage'],
  ]) {
    it(`admin y super_admin reutilizan ${component} en ${route}`, () => {
      const routePattern = new RegExp(
        `<Route path="${route}" element=\\{<RouteErrorBoundary><${component} /><\\/RouteErrorBoundary>\\} \\/>`,
        'g'
      );
      expect(APP_SOURCE.match(routePattern)).toHaveLength(2);
    });
  }
});

describe('jerarquia visual de Empleados', () => {
  it('admin no recibe super_admin entre los roles asignables', () => {
    expect(getAssignableEmployeeRoles(['super_admin', 'admin', 'barbero'], true)).toEqual(['admin', 'barbero']);
  });

  it('el saneamiento evita enviar super_admin aunque aparezca en el estado del formulario', () => {
    expect(getAssignableEmployeeRoles(['admin', 'super_admin'], true)).toEqual(['admin']);
  });

  it('super_admin conserva el selector original', () => {
    expect(getAssignableEmployeeRoles(['super_admin', 'admin', 'barbero'], false)).toEqual([
      'super_admin',
      'admin',
      'barbero',
    ]);
  });

  it('identifica empleados privilegiados para ocultar edición y ciclo de vida al admin', () => {
    expect(isPrivilegedEmployee({ roles: ['super_admin', 'barbero'] })).toBe(true);
    expect(isPrivilegedEmployee({ roles: ['admin'] })).toBe(false);
  });
});

describe('protecciones visuales de Usuarios y Clientes', () => {
  it('identifica usuarios super_admin o protegidos', () => {
    expect(isPrivilegedUsuario({ roles: [{ rol: 'super_admin' }] })).toBe(true);
    expect(isPrivilegedUsuario({ is_protected: true, roles: [{ rol: 'admin' }] })).toBe(true);
    expect(isPrivilegedUsuario({ roles: [{ rol: 'admin' }] })).toBe(false);
  });

  it('Clientes conserva solo visualización de fotografía privada', () => {
    expect(CLIENTS_SOURCE).toContain('foto_perfil_signed_url');
    expect(CLIENTS_SOURCE).not.toContain('ImageUploaderField');
    expect(CLIENTS_SOURCE).not.toContain('foto_perfil_asset_id:');
  });
});
