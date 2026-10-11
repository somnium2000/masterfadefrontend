import { describe, expect, test } from 'vitest';
import { buildPayload, mapClienteToForm } from '../AdminClientesPage.jsx';

const ASSET_ID = '33333333-3333-4333-8333-333333333333';

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
    foto_perfil_asset_id: ASSET_ID,
    foto_perfil_signed_url: 'https://storage.test/signed/client-profile',
    foto_perfil_modificada: false,
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

  test('envía null únicamente cuando la fotografía fue retirada intencionalmente', () => {
    const payload = buildPayload(formValues({
      foto_perfil_asset_id: null,
      foto_perfil_signed_url: '',
      foto_perfil_modificada: true,
    }));

    expect(payload.cliente.foto_perfil_asset_id).toBeNull();
  });

  test('envía el nuevo asset cuando la fotografía fue reemplazada', () => {
    const payload = buildPayload(formValues({ foto_perfil_modificada: true }));
    expect(payload.cliente.foto_perfil_asset_id).toBe(ASSET_ID);
  });
});
