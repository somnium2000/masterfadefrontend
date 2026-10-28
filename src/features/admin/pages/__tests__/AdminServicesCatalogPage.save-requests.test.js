import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';

const source = readFileSync('src/features/admin/pages/AdminServicesCatalogPage.jsx', 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture() {
  const effects = [];
  const env = {
    mountedRef: { current: true }, editorGenerationRef: { current: 0 }, saveOperationRef: { current: null },
    requestScope: 'scopeA', currentScopeRef: { current: 'scopeA' }, refreshServicesRef: { current: vi.fn().mockResolvedValue() },
    validateForm: () => null,
    formValues: { nombre_servicio: 'A', descripcion: 'Texto A', orden_visual: '10', visible_publico: true, agendable: true },
    editTarget: { id_servicio: 'A', _mutation_branch_id: 'A' }, createBranchTariffs: [],
    canManageServiceBarberAssignments: false, sucursal: 'A',
    updateAdminServicio: vi.fn(), createAdminServicio: vi.fn(),
    notifications: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
    navigate: vi.fn(), extractMessage: () => 'Error seguro', emitCatalogSync: vi.fn(), fetchServicios: vi.fn().mockResolvedValue(),
    setFormLoading: value => effects.push(['loading', value]),
    setFormError: value => effects.push(['error', value]), setDialogOpen: value => effects.push(['dialog', value]),
  };
  const start = source.indexOf('\n', source.indexOf('    async function handleGuardar() {')) + 1;
  const body = source.slice(start, source.indexOf('\n    }', start));
  const save = new Function('env', `with(env) { return async function() { ${body} }; }`)(env);
  const invalidate = () => { env.editorGenerationRef.current++; env.saveOperationRef.current = null; effects.length = 0; };
  return { env, effects, save, invalidate };
}
for (const action of ['abrir B', 'cerrar', 'desmontar', 'cambiar alcance']) test(`guardado A no altera UI después de ${action}`, async () => {
  const f = fixture(), a = deferred(); f.env.updateAdminServicio.mockReturnValue(a.promise);
  const first = f.save(); f.invalidate();
  if (action === 'desmontar') f.env.mountedRef.current = false;
  if (action === 'cambiar alcance') f.env.currentScopeRef.current = 'scopeB';
  a.resolve({ data: { id_servicio: 'A' } }); await first;
  expect(f.effects).toEqual([]); expect(f.env.notifications.success).not.toHaveBeenCalled();
  expect(f.env.emitCatalogSync).toHaveBeenCalledWith('servicio-updated');
});
for (const status of [401, 403, 500]) test(`error antiguo ${status} y finally no alteran guardado B`, async () => {
  const f = fixture(), a = deferred(), b = deferred();
  f.env.updateAdminServicio.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const first = f.save(); f.invalidate(); f.env.editTarget = { id_servicio: 'B', _mutation_branch_id: 'B' };
  const second = f.save(); f.effects.length = 0; a.reject({ status }); await first;
  expect(f.effects).toEqual([]); expect(f.env.navigate).not.toHaveBeenCalled(); expect(f.env.notifications.error).not.toHaveBeenCalled();
  expect(f.env.saveOperationRef.current).not.toBeNull(); b.resolve({ data: {} }); await second;
  expect(f.env.notifications.success).toHaveBeenCalledTimes(1);
});
test('doble clic síncrono envía una sola mutación', async () => {
  const f = fixture(), a = deferred(); f.env.updateAdminServicio.mockReturnValue(a.promise);
  const first = f.save(), second = f.save();
  expect(f.env.updateAdminServicio).toHaveBeenCalledTimes(1); a.resolve({ data: {} }); await Promise.all([first, second]);
});
test('éxito normal conserva notificación, refresh y cierre', async () => {
  const f = fixture(); f.env.updateAdminServicio.mockResolvedValue({ data: {} }); await f.save();
  expect(f.env.notifications.success).toHaveBeenCalledTimes(1); expect(f.env.fetchServicios).toHaveBeenCalledTimes(1);
  expect(f.effects).toContainEqual(['dialog', false]); expect(f.effects.at(-1)).toEqual(['loading', false]);
});
test('fallo normal conserva formulario y libera operación', async () => {
  const f = fixture(); f.env.updateAdminServicio.mockRejectedValue({ status: 409 }); await f.save();
  expect(f.env.notifications.error).toHaveBeenCalledWith('Error seguro', expect.any(Object));
  expect(f.effects).not.toContainEqual(['dialog', false]); expect(f.effects.at(-1)).toEqual(['loading', false]);
  expect(f.env.saveOperationRef.current).toBeNull();
});
test('cambiar selección durante refresh no cierra el editor nuevo', async () => {
  const f = fixture(), refresh = deferred(); f.env.updateAdminServicio.mockResolvedValue({ data: {} }); f.env.fetchServicios.mockReturnValue(refresh.promise);
  const first = f.save(); await Promise.resolve(); f.invalidate(); refresh.resolve(); await first;
  expect(f.effects).toEqual([]);
});
