import { beforeEach, expect, test, vi } from 'vitest';
import { getPublicCatalog } from '../catalogApi.js';

const http = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../../../services/httpClient.js', () => ({ http }));
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const services = [{ id_servicio: 'S', nombre_servicio: 'Corte', agendable: false, precio_hnl: 123 }];
const packages = [{ id_paquete: 'P', precio_hnl: 300, items: [{ id_servicio: 'S', cantidad: 2 }] }];
const failure = () => Object.assign(new Error('detalle tecnico privado'), { status: 500 });
function responses({ serviceRows = services, packageRows = packages, servicesFail = false, packagesFail = false } = {}) {
  http.get.mockImplementation((url) => {
    if (url.includes('/servicios')) return servicesFail ? Promise.reject(failure()) : Promise.resolve({ data: { servicios: serviceRows } });
    if (url.includes('/paquetes')) return packagesFail ? Promise.reject(failure()) : Promise.resolve({ data: { paquetes: packageRows } });
    throw new Error('Unexpected mock endpoint');
  });
}
beforeEach(() => { http.get.mockReset(); responses(); });

test('ambos exitosos conservan registros, precios, cantidades y clasificadores', async () => {
  const result = await getPublicCatalog({ id_sucursal: A });
  expect(result).toEqual({ services, packages, errors: { services: false, packages: false } });
  expect(result.services).toBe(services);
  expect(result.packages).toBe(packages);
  expect(http.get.mock.calls).toEqual([
    [`/v1/public/catalog/servicios?id_sucursal=${A}`], [`/v1/public/catalog/paquetes?id_sucursal=${A}`],
  ]);
});
test('ambos vacios son ausencia legitima sin errores', async () => {
  responses({ serviceRows: [], packageRows: [] });
  expect(await getPublicCatalog()).toEqual({ services: [], packages: [], errors: { services: false, packages: false } });
});
test('Servicios 500 no equivale a vacio y conserva Paquetes', async () => {
  responses({ servicesFail: true });
  const result = await getPublicCatalog({ id_sucursal: A });
  expect(result.services).toEqual([]);
  expect(result.packages).toEqual(packages);
  expect(result.errors).toEqual({ services: true, packages: false });
  expect(JSON.stringify(result)).not.toContain('detalle tecnico');
});
test('Paquetes 500 no equivale a vacio y conserva Servicios', async () => {
  responses({ packagesFail: true });
  const result = await getPublicCatalog({ id_sucursal: A });
  expect(result.packages).toEqual([]);
  expect(result.services).toEqual(services);
  expect(result.errors).toEqual({ services: false, packages: true });
});
test('ambos fallan conserva rechazo general', async () => {
  responses({ servicesFail: true, packagesFail: true });
  await expect(getPublicCatalog()).rejects.toThrow('detalle tecnico privado');
  expect(http.get).toHaveBeenCalledTimes(2);
});
test.each(['services', 'packages'])('%s vacio con la otra seccion poblada no es fallo', async (empty) => {
  responses(empty === 'services' ? { serviceRows: [] } : { packageRows: [] });
  const result = await getPublicCatalog();
  expect(result[empty]).toEqual([]);
  expect(result.errors).toEqual({ services: false, packages: false });
});
test('reintento recupera datos sin errores persistentes ni llamadas adicionales', async () => {
  responses({ servicesFail: true });
  expect((await getPublicCatalog({ id_sucursal: A })).errors.services).toBe(true);
  responses();
  expect(await getPublicCatalog({ id_sucursal: A })).toEqual({ services, packages, errors: { services: false, packages: false } });
  expect(http.get).toHaveBeenCalledTimes(4);
});
test('Todas conserva consultas globales de lectura', async () => {
  await getPublicCatalog();
  expect(http.get.mock.calls).toEqual([['/v1/public/catalog/servicios'], ['/v1/public/catalog/paquetes']]);
});
