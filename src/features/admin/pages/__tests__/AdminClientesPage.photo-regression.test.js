import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildPayload, mapClienteToForm } from '../AdminClientesPage.jsx';

function formValues(overrides = {}) {
  return {
    nombres: ' Ana ',
    apellidos: ' Prueba ',
    fecha_nacimiento: '1990-01-02',
    fecha_ingreso: '2026-01-03',
    genero_codigo: 'F',
    dni: '0801199012345',
    rtn: '08011990123456',
    telefono_principal: '9999-9999',
    direccion_texto: 'Centro',
    observaciones: 'Cliente frecuente',
    correo_principal: 'ANA@EXAMPLE.TEST',
    id_sucursal_origen: '',
    estado: true,
    estado_cliente: true,
    tiene_acceso: true,
    consentimiento_marketing: true,
    acepta_terminos: true,
    ...overrides,
  };
}

describe('payload de edición de clientes', () => {
  test('conserva la fotografía al editar otros datos y persiste los demás campos', () => {
    const mapped = mapClienteToForm(formValues());
    const payload = buildPayload({ ...mapped, observaciones: 'Dato actualizado' });

    expect(payload.cliente).not.toHaveProperty('foto_perfil_asset_id');
    expect(payload.persona).toMatchObject({
      nombres: 'Ana',
      apellidos: 'Prueba',
      dni: '0801199012345',
      observaciones: 'Dato actualizado',
    });
    expect(payload.acceso.correo_principal).toBe('ana@example.test');
    expect(payload.cliente).toMatchObject({
      estado: true,
      consentimiento_marketing: true,
      acepta_terminos: true,
    });
  });

  test('no ofrece controles administrativos para modificar la fotografía', () => {
    const source = readFileSync(new URL('../AdminClientesPage.jsx', import.meta.url), 'utf8');
    expect(source).not.toContain('ImageUploaderField');
    expect(source).not.toContain('Guarda primero el cliente para habilitar carga de foto de perfil privada.');
    expect(source).toContain('selectedCliente.foto_perfil_signed_url');
  });
});
