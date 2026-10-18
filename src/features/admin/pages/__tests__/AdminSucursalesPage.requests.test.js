import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';

const source = readFileSync('src/features/admin/pages/AdminSucursalesPage.jsx', 'utf8');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fixture() {
  const state = {};
  const env = {
    mountedRef: { current: true }, listRequestRef: { current: 0 },
    selectionRequestRef: { current: 0 }, selectionPendingRef: { current: false },
    listAdminSucursales: vi.fn(), getAdminSucursal: vi.fn(), navigate: vi.fn(),
    notifications: { error: vi.fn() }, extractMessage: () => 'Error seguro',
    FORM_DEFAULTS: {}, mapSucursalToForm: value => value,
  };
  for (const key of ['Loading', 'ListError', 'Sucursales', 'FormLoading', 'FormError', 'EditingId', 'FormValues', 'FormOpen']) {
    env[`set${key}`] = value => { state[key] = value; };
  }
  const compile = (args, body) => new Function('env', `with(env) { return async function(${args}) { ${body} }; }`)(env);
  const start = source.indexOf('\n', source.indexOf('  const fetchSucursales = useCallback(')) + 1;
  const fetch = compile('{ silent = false } = {}', source.slice(start, source.indexOf('\n  }, [navigate]);', start)));
  const methods = {};
  for (const name of ['openCreate', 'openEdit', 'handleFormOpenChange']) {
    const match = source.match(new RegExp(`  (?:async )?function ${name}\\(([^)]*)\\) \\{`));
    if (!match) continue;
    const begin = source.indexOf('\n', match.index) + 1;
    methods[name] = compile(match[1], source.slice(begin, source.indexOf('\n  }', begin)));
  }
  return { env, state, fetch, ...methods };
}
const list = name => ({ data: { sucursales: [name] } });
const detail = name => ({ data: { sucursal: { name } } });
test('B vigente no es reemplazada por A tardía y no hay llamadas extra', async () => {
  const f = fixture(), a = deferred();
  f.env.listAdminSucursales.mockReturnValueOnce(a.promise).mockResolvedValueOnce(list('B'));
  const first = f.fetch(); await f.fetch(); a.resolve(list('A')); await first;
  expect(f.state.Sucursales).toEqual(['B']); expect(f.env.listAdminSucursales).toHaveBeenCalledTimes(2);
});
for (const status of [401, 403, 500]) test(`error obsoleto ${status} no altera B`, async () => {
  const f = fixture(), a = deferred();
  f.env.listAdminSucursales.mockReturnValueOnce(a.promise).mockResolvedValueOnce(list('B'));
  const first = f.fetch(); await f.fetch(); a.reject({ status }); await first;
  expect(f.state.Sucursales).toEqual(['B']); expect(f.state.ListError).toBe(''); expect(f.env.navigate).not.toHaveBeenCalled();
});
for (const [status, path] of [[401, '/login'], [403, '/unauthorized']]) test(`error vigente ${status} navega`, async () => {
  const f = fixture(); f.env.listAdminSucursales.mockRejectedValue({ status }); await f.fetch();
  expect(f.env.navigate).toHaveBeenCalledWith(path);
});
test('loading pertenece a B y refresco silencioso libera loading anterior', async () => {
  const f = fixture(), a = deferred(), b = deferred();
  f.env.listAdminSucursales.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const first = f.fetch(), second = f.fetch({ silent: true });
  a.resolve(list('A')); await first; expect(f.state.Loading).toBe(true);
  b.resolve(list('B')); await second; expect(f.state.Loading).toBe(false);
});
test('desmontaje descarta listado y edición', async () => {
  const f = fixture(), a = deferred(), b = deferred();
  f.env.listAdminSucursales.mockReturnValue(a.promise); f.env.getAdminSucursal.mockReturnValue(b.promise);
  const first = f.fetch(), second = f.openEdit('A'); f.env.mountedRef.current = false;
  a.resolve(list('A')); b.resolve(detail('A')); await Promise.all([first, second]);
  expect(f.state.Sucursales).toBeUndefined(); expect(f.state.FormOpen).toBeUndefined();
});
test('edición B prevalece sobre A', async () => {
  const f = fixture(), a = deferred();
  f.env.getAdminSucursal.mockReturnValueOnce(a.promise).mockResolvedValueOnce(detail('B'));
  const first = f.openEdit('A'); await f.openEdit('B'); a.resolve(detail('A')); await first;
  expect(f.state.EditingId).toBe('B'); expect(f.state.FormValues.name).toBe('B');
});
test('Crear invalida edición pendiente', async () => {
  const f = fixture(), a = deferred(); f.env.getAdminSucursal.mockReturnValue(a.promise);
  const first = f.openEdit('A'); await f.openCreate(); a.resolve(detail('A')); await first;
  expect(f.state.EditingId).toBe(''); expect(f.state.FormValues).toEqual({}); expect(f.state.FormLoading).toBe(false);
});
test('cerrar invalida lectura y no libera guardado', async () => {
  const f = fixture(), a = deferred(); f.env.getAdminSucursal.mockReturnValue(a.promise);
  const first = f.openEdit('A'); await f.handleFormOpenChange(false); a.resolve(detail('A')); await first;
  expect(f.state.FormOpen).toBe(false);
  f.state.FormLoading = true; await f.handleFormOpenChange(false); await f.openCreate(); expect(f.state.FormLoading).toBe(true);
});
test('error y finally antiguos no alteran edición vigente', async () => {
  const f = fixture(), a = deferred(), b = deferred();
  f.env.getAdminSucursal.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const first = f.openEdit('A'), second = f.openEdit('B'); a.reject({ status: 403 }); await first;
  expect(f.state.FormLoading).toBe(true); expect(f.env.navigate).not.toHaveBeenCalled(); expect(f.env.notifications.error).not.toHaveBeenCalled();
  b.resolve(detail('B')); await second; expect(f.state.FormLoading).toBe(false);
});
