import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../../../../App.jsx', import.meta.url), 'utf8');

describe('rutas del dashboard superadministrador', () => {
  it('monta el dashboard en inicio y KPIs sin modificar el inicio de admin', () => {
    const superBlock = source.match(/path="\/home\/super"[\s\S]*?\{\/\* Admin \*\/\}/)?.[0] || '';
    const adminBlock = source.match(/path="\/home\/admin"[\s\S]*?\{\/\* Barbero \*\/\}/)?.[0] || '';
    expect(superBlock.match(/<SuperAdminDashboardPage \/>/g)).toHaveLength(2);
    expect(adminBlock).toContain('<UnderConstructionPage title="Inicio" />');
    expect(adminBlock).toContain('<UnderConstructionPage title="KPIs" />');
  });
});
