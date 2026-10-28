import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';

const source = readFileSync('src/features/admin/pages/AdminServicesCatalogPage.jsx', 'utf8').replace(/\r\n/g, '\n');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const effects = [];
  const env = {
    mountedRef: { current: true }, currentScopeRef: { current: 'A' }, requestScope: 'A',
    editorGenerationRef: { current: 0 }, tariffGenerationRef: { current: 0 }, tariffOperationRef: { current: null },
    tariffTarget: { servicio: { id_servicio: 'S-A' }, tarifa: { id_sucursal: 'A', id_tarifa: 'T-A' } },
    tariffFormValues: { precio_hnl: '100', duracion_min: '30', buffer_min: '5', activo: true, servicio_informativo: false },
    validateTariffForm: () => null, extractMessage: () => 'Mensaje seguro',
    updateAdminServicioTarifa: vi.fn(), createAdminServicioTarifa: vi.fn(), fetchServicios: vi.fn().mockResolvedValue(),
    notifications: { success: vi.fn(), error: vi.fn() }, emitCatalogSync: vi.fn(), navigate: vi.fn(),
    setTariffFormError: value => effects.push(['error', value]), setTariffFormLoading: value => effects.push(['loading', value]),
    setTariffDialogOpen: value => effects.push(['dialog', value]), setTariffTarget: value => effects.push(['target', value]),
  };
  const compile = (name, async = false) => {
    const start = source.indexOf('\n', source.indexOf(`    ${async ? 'async ' : ''}function ${name}(`)) + 1;
    const body = source.slice(start, source.indexOf('\n    }', start));
    return new Function('env', `with(env) { return ${async ? 'async ' : ''}function(open) { ${body} }; }`)(env);
  };
  env.handleTariffDialogOpenChange = compile('handleTariffDialogOpenChange');
  return { env, effects, save: compile('handleGuardarTarifa', true), invalidate() { ++env.tariffGenerationRef.current; env.tariffOperationRef.current = null; effects.length = 0; } };
}

test('SV05-ERROR-01: solo mensajes funcionales conocidos, nunca texto arbitrario del API', () => {
  const start = source.indexOf('function extractMessage(err) {');
  const fn = new Function(source.slice(start, source.indexOf('\n}', start) + 2) + ';return extractMessage;')();
  expect(fn({ data: { error: { message: 'connect ECONNREFUSED SYNTHETIC_INTERNAL' } } })).toBe('No se pudo completar la operación de servicios.');
  expect(fn({ data: { error: { code: 'SERVICE_TARIFF_DUPLICATE', message: 'INTERNAL' } } })).toBe('Ya existe una tarifa activa para este servicio en esa sucursal.');
});

test('SV05-TARIFF-DUP-01: dos invocaciones simultáneas emiten una sola petición y conservan payload', async () => {
  const f = fixture(), a = deferred(); f.env.updateAdminServicioTarifa.mockReturnValue(a.promise);
  const first = f.save(), second = f.save();
  expect(f.env.updateAdminServicioTarifa).toHaveBeenCalledTimes(1);
  expect(f.env.updateAdminServicioTarifa).toHaveBeenCalledWith('S-A', 'A', { precio_hnl: 100, duracion_min: 30, buffer_min: 5, activo: true, servicio_informativo: false });
  a.resolve({}); await Promise.all([first, second]);
  expect(f.env.notifications.success).toHaveBeenCalledTimes(1);
  expect(f.effects).toContainEqual(['dialog', false]); expect(f.effects.at(-1)).toEqual(['loading', false]);
});

test('SV05-TARIFF-STALE-01: resultado de A no cierra B, notifica ni libera su loading; tampoco durante refresh', async () => {
  const f = fixture(), a = deferred(), b = deferred();
  f.env.updateAdminServicioTarifa.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const first = f.save(); f.invalidate(); f.env.tariffTarget = { servicio: { id_servicio: 'S-B' }, tarifa: { id_sucursal: 'B', id_tarifa: 'T-B' } };
  const second = f.save(); const operation = f.env.tariffOperationRef.current; f.effects.length = 0;
  a.resolve({}); await first;
  expect(f.effects).toEqual([]); expect(f.env.notifications.success).not.toHaveBeenCalled(); expect(f.env.emitCatalogSync).not.toHaveBeenCalled();
  expect(f.env.tariffOperationRef.current).toBe(operation); expect(f.env.fetchServicios).not.toHaveBeenCalled();
  b.resolve({}); await second; expect(f.env.notifications.success).toHaveBeenCalledTimes(1);
  const g = fixture(), refresh = deferred(); g.env.updateAdminServicioTarifa.mockResolvedValue({}); g.env.fetchServicios.mockReturnValue(refresh.promise);
  const pending = g.save(); await Promise.resolve(); g.invalidate(); refresh.resolve(); await pending; expect(g.effects).toEqual([]);
});

test('SV05-TARIFF-401-01: desmontaje y cierre descartan 401; vigente conserva redirección', async () => {
  const f = fixture(), a = deferred(); f.env.updateAdminServicioTarifa.mockReturnValue(a.promise);
  const pending = f.save(); f.env.mountedRef.current = false; f.effects.length = 0; a.reject({ status: 401 }); await pending;
  expect(f.env.navigate).not.toHaveBeenCalled(); expect(f.effects).toEqual([]);
  const closed = fixture(), c = deferred(); closed.env.updateAdminServicioTarifa.mockReturnValue(c.promise);
  const late = closed.save(); closed.env.handleTariffDialogOpenChange(false); closed.effects.length = 0;
  c.reject({ status: 401 }); await late; expect(closed.env.navigate).not.toHaveBeenCalled(); expect(closed.effects).toEqual([]);
  const current = fixture(); current.env.updateAdminServicioTarifa.mockRejectedValue({ status: 401 }); await current.save();
  expect(current.env.navigate).toHaveBeenCalledWith('/login'); expect(current.effects.at(-1)).toEqual(['loading', false]);
});
