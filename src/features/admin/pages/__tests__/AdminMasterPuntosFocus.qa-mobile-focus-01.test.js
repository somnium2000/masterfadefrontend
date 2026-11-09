import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../AdminMasterPuntosPage.jsx', import.meta.url), 'utf8');
const sharedFormSources = [
  '../AdminEmpleadosPage.jsx',
  '../AdminClientesPage.jsx',
  '../AdminUsuariosPage.jsx',
  '../../../cliente/components/ClienteProfileEditModal.jsx',
].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'));

describe('MasterPuntos focus inicial', () => {
  it('el buscador de clientes no solicita autoFocus explícito', () => {
    const picker = source.match(/<DialogTitle>Seleccionar cliente activo<\/DialogTitle>[\s\S]*?aria-label="Buscar cliente activo"/)?.[0] || '';
    expect(picker).not.toContain('autoFocus');
  });

  it('formularios administrativos y de Cliente delegan el foco al diálogo compartido', () => {
    for (const formSource of sharedFormSources) {
      expect(formSource).toContain('<DialogContent');
      expect(formSource).not.toMatch(/\bautoFocus\b/);
    }
  });
});
