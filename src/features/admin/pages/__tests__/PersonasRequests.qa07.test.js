import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

function fixture(plural, singular) {
  const source = readFileSync(`src/features/admin/pages/Admin${plural}Page.jsx`, 'utf8');
  const state = {};
  const env = {
    mountedRef: { current: true }, listRequestRef: { current: 0 }, selectionRequestRef: { current: 0 },
    selectionPendingRef: { current: false },
    navigate: vi.fn(), notifications: { error: vi.fn() }, extractMessage: () => 'Error seguro',
    isAdminOnly: false, isPrivilegedEmployee: () => false, FORM_DEFAULTS: { nombres: '' },
    [`map${singular}ToForm`]: value => value,
    [`listAdminPersonas${plural}`]: vi.fn(), [`getAdminPersona${singular}`]: vi.fn(),
  };
  for (const key of ['Loading', 'ListError', plural, 'FormLoading', 'FormError', 'EditingId', 'FormValues', 'FormOpen', 'DetailOpen', 'GuestLinkCandidate', 'GuestLinkError', `Selected${singular}`]) {
    env[`set${key}`] = value => { state[key] = value; };
  }
  const compile = (args, body) => new Function('env', `with (env) { return async function(${args}) { ${body} }; }`)(env);
  const begin = source.indexOf(`  const fetch${plural} = useCallback(async ({ silent = false } = {}) => {`);
  const bodyStart = source.indexOf('\n', begin) + 1;
  const fetch = compile('{ silent = false } = {}', source.slice(bodyStart, source.indexOf('\n  }, [navigate]);', bodyStart)));
  const methods = {};
  if (plural !== 'Usuarios') for (const name of ['openCreate', 'openEdit', 'openDetail', 'handleFormOpenChange', 'handleDetailOpenChange']) {
    const match = source.match(new RegExp(`  (?:async )?function ${name}\\(([^)]*)\\) \\{`));
    const start = source.indexOf('\n', match.index) + 1;
    methods[name] = compile(match[1], source.slice(start, source.indexOf('\n  }', start)));
  }
  return { source, state, env, fetch, ...methods };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

for (const [plural, singular] of [['Empleados', 'Empleado'], ['Clientes', 'Cliente'], ['Usuarios', 'Usuario']]) describe(plural, () => {
  const result = name => ({ data: { [plural.toLowerCase()]: [name] } });
  test('solo la carga vigente cambia resultados y loading', async () => {
    const f = fixture(plural, singular), a = deferred(), b = deferred();
    f.env[`listAdminPersonas${plural}`].mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = f.fetch(), second = f.fetch();
    a.resolve(result('A')); await first;
    expect(f.state.Loading).toBe(true); expect(f.state[plural]).toBeUndefined();
    b.resolve(result('B')); await second;
    expect(f.state[plural]).toEqual(['B']); expect(f.state.Loading).toBe(false);
  });
  for (const status of [401, 403, 500]) test(`error antiguo ${status} no navega ni sustituye éxito nuevo`, async () => {
    const f = fixture(plural, singular), a = deferred();
    f.env[`listAdminPersonas${plural}`].mockReturnValueOnce(a.promise).mockResolvedValueOnce(result('B'));
    const first = f.fetch(); await f.fetch(); a.reject({ status }); await first;
    expect(f.state[plural]).toEqual(['B']); expect(f.state.ListError).toBe('');
    expect(f.env.navigate).not.toHaveBeenCalled();
  });
  test('refresco silencioso vigente libera loading de una carga anterior', async () => {
    const f = fixture(plural, singular), a = deferred();
    f.env[`listAdminPersonas${plural}`].mockReturnValueOnce(a.promise).mockResolvedValueOnce(result('B'));
    const first = f.fetch(); await f.fetch({ silent: true });
    expect(f.state.Loading).toBe(false);
    a.resolve(result('A')); await first; expect(f.state[plural]).toEqual(['B']);
  });
  for (const [status, route] of [[401, '/login'], [403, '/unauthorized']]) test(`error vigente ${status} conserva navegación`, async () => {
    const f = fixture(plural, singular);
    f.env[`listAdminPersonas${plural}`].mockRejectedValue({ status }); await f.fetch();
    expect(f.env.navigate).toHaveBeenCalledWith(route);
  });
  test('respuesta antigua no sustituye datos nuevos; desmontaje descarta resultados', async () => {
    const f = fixture(plural, singular), a = deferred();
    f.env[`listAdminPersonas${plural}`].mockReturnValueOnce(a.promise).mockResolvedValueOnce(result('B'));
    const first = f.fetch(); await f.fetch(); a.resolve(result('A')); await first;
    expect(f.state[plural]).toEqual(['B']);
    const c = deferred(); f.env[`listAdminPersonas${plural}`].mockReturnValueOnce(c.promise);
    const last = f.fetch(); f.env.mountedRef.current = false; c.resolve(result('C')); await last;
    expect(f.state[plural]).toEqual(['B']);
    expect(f.source).toContain('invalidateRequests();');
  });
  if (plural === 'Usuarios') return;
  const detail = name => ({ data: { [singular.toLowerCase()]: { nombres: name } } });
  for (const mode of ['openEdit', 'openDetail']) test(`${mode}: A tardía no reemplaza B`, async () => {
    const f = fixture(plural, singular), a = deferred();
    f.env[`getAdminPersona${singular}`].mockReturnValueOnce(a.promise).mockResolvedValueOnce(detail('B'));
    const first = f[mode]('A'); await f[mode]('B'); a.resolve(detail('A')); await first;
    if (mode === 'openEdit') { expect(f.state.EditingId).toBe('B'); expect(f.state.FormValues.nombres).toBe('B'); }
    else expect(f.state[`Selected${singular}`].nombres).toBe('B');
  });
  test('Crear invalida edición pendiente sin recuperar editingId', async () => {
    const f = fixture(plural, singular), a = deferred(); f.env[`getAdminPersona${singular}`].mockReturnValue(a.promise);
    const first = f.openEdit('A'); await f.openCreate(); a.resolve(detail('A')); await first;
    expect(f.state.EditingId).toBe(''); expect(f.state.FormValues).toEqual(f.env.FORM_DEFAULTS);
    expect(f.state.FormLoading).toBe(false);
  });
  test('cerrar o abrir Crear no libera el bloqueo de un guardado en curso', async () => {
    const f = fixture(plural, singular);
    f.state.FormLoading = true;
    await f.handleFormOpenChange(false); await f.openCreate();
    expect(f.state.FormLoading).toBe(true);
  });
  for (const [mode, close, key] of [['openEdit', 'handleFormOpenChange', 'FormOpen'], ['openDetail', 'handleDetailOpenChange', 'DetailOpen']]) test(`cerrar ${mode} impide reapertura tardía`, async () => {
    const f = fixture(plural, singular), a = deferred(); f.env[`getAdminPersona${singular}`].mockReturnValue(a.promise);
    const first = f[mode]('A'); await f[close](false); a.resolve(detail('A')); await first;
    expect(f.state[key]).toBe(false); expect(f.state.EditingId).not.toBe('A');
    expect(f.source).toContain(`onOpenChange={${close}}`);
  });
  test('alternar detalle/edición descarta error y finally anteriores', async () => {
    const f = fixture(plural, singular), a = deferred(), b = deferred();
    f.env[`getAdminPersona${singular}`].mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = f.openDetail('A'), second = f.openEdit('B');
    a.reject(new Error('antiguo')); await first;
    expect(f.state.FormLoading).toBe(true); expect(f.env.notifications.error).not.toHaveBeenCalled();
    b.resolve(detail('B')); await second; expect(f.state.EditingId).toBe('B'); expect(f.state.FormLoading).toBe(false);
  });
  test('editar→detalle y desmontaje no reabren formulario', async () => {
    const f = fixture(plural, singular), a = deferred();
    f.env[`getAdminPersona${singular}`].mockReturnValueOnce(a.promise).mockResolvedValueOnce(detail('B'));
    const first = f.openEdit('A'); await f.openDetail('B'); a.resolve(detail('A')); await first;
    expect(f.state.FormOpen).toBe(false); expect(f.state[`Selected${singular}`].nombres).toBe('B');
    const c = deferred(); f.env[`getAdminPersona${singular}`].mockReturnValueOnce(c.promise);
    const last = f.openEdit('C'); f.env.mountedRef.current = false; c.resolve(detail('C')); await last;
    expect(f.state.EditingId).not.toBe('C');
  });
});
