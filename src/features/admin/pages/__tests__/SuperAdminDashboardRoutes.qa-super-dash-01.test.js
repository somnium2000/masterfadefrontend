import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../../App.jsx', import.meta.url), 'utf8');

describe('rutas del dashboard superadministrador', () => {
  it('monta el dashboard solo en Super y Admin redirige a empleados', () => {
    const superBlock = source.match(/path="\/home\/super"[\s\S]*?\{\/\* Admin \*\/\}/)?.[0] || '';
    const adminBlock = source.match(/path="\/home\/admin"[\s\S]*?\{\/\* Barbero \*\/\}/)?.[0] || '';
    expect(superBlock.match(/<SuperAdminDashboardPage \/>/g)).toHaveLength(1);
    expect(superBlock).toContain('<Route path="kpis" element={<Navigate to="/home/super" replace />} />');
    expect(adminBlock).toContain('<Route index element={<Navigate to="/home/admin/empleados" replace />} />');
    expect(adminBlock).toContain('<Route path="kpis" element={<Navigate to="/home/admin/empleados" replace />} />');
  });
});
