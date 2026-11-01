import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http }));
import { createAdminClientePuntosAjuste, getAdminClientePuntosResumen, getAdminMasterPuntosRegalias, searchAdminClientesActivos } from '../adminMasterPuntosApi.js';
beforeEach(() => { vi.clearAllMocks(); http.get.mockResolvedValue({ data: {} }); });
afterEach(() => { expect(http.patch).not.toHaveBeenCalled(); });
test('resumen transmite la señal y conserva el identificador', async () => {
  const controller = new AbortController();
  await getAdminClientePuntosResumen('cliente-a', { signal: controller.signal });
  expect(http.get).toHaveBeenCalledWith('/v1/admin/puntos/clientes/cliente-a/resumen', { signal: controller.signal });
});
test('consulta de regalías transmite la señal sin guardar configuración', async () => {
  const controller = new AbortController();
  await getAdminMasterPuntosRegalias({ signal: controller.signal });
  expect(http.get).toHaveBeenCalledWith('/v1/admin/puntos/regalias', { signal: controller.signal });
});
test('búsqueda conserva codificación, límite y señal', async () => {
  const controller = new AbortController();
  await searchAdminClientesActivos('  A & B  ', { limit: 999, signal: controller.signal });
  expect(http.get).toHaveBeenCalledWith('/v1/admin/puntos/clientes/buscar?q=A+%26+B&limit=20', { signal: controller.signal });
});
test('búsqueda corta no realiza peticiones', async () => {
  expect(await searchAdminClientesActivos('A')).toEqual({ ok: true, data: { clientes: [] } });
  expect(http.get).not.toHaveBeenCalled();
});
test('sin cliente no consulta un resumen global', async () => {
  await expect(getAdminClientePuntosResumen('')).rejects.toThrow('Debes seleccionar un cliente.');
  expect(http.get).not.toHaveBeenCalled();
});
test('consumidores sin señal mantienen el contrato anterior', async () => {
  await getAdminClientePuntosResumen('cliente-a'); await getAdminMasterPuntosRegalias();
  expect(http.get).toHaveBeenCalledWith('/v1/admin/puntos/clientes/cliente-a/resumen');
  expect(http.get).toHaveBeenCalledWith('/v1/admin/puntos/regalias');
});
test('ajuste manual envía la clave idempotente en el header', async () => {
  await createAdminClientePuntosAjuste('cliente-a', { accion: 'sumar', puntos: 5, motivo: 'Ajuste QA' }, { idempotencyKey: '11111111-1111-4111-8111-111111111111' });
  expect(http.post).toHaveBeenCalledWith('/v1/admin/puntos/clientes/cliente-a/ajuste', { accion: 'sumar', puntos: 5, motivo: 'Ajuste QA' }, { headers: { 'x-idempotency-key': '11111111-1111-4111-8111-111111111111' } });
});
