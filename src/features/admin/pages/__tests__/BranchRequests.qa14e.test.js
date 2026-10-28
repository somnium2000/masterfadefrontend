import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

const source = readFileSync(new URL('../AdminReportesSubmodulePage.jsx', import.meta.url), 'utf8');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(moduleType = 'sucursales') {
  const start = source.indexOf('const fetchDashboard = useCallback(async (options = {}) => {');
  const body = source.slice(start, source.indexOf('\n  }, [', start))
    .replace('const fetchDashboard = useCallback(', 'return (');
  const state = { snapshot: null, error: '', loading: false };
  const env = {
    resolvedModuleType: moduleType,
    incomeRequestsRef: { current: { mounted: true, dashboard: 0, context: 0, charts: 0, controllers: {} } },
    filters: { fecha_desde: '2026-10-01', fecha_hasta: '2026-10-20' },
    notifications: { warning: vi.fn() },
    buildDashboardParams: (value) => value,
    getAdminReportesDashboard: vi.fn(),
    setSnapshot: (value) => { state.snapshot = value; },
    setLoadError: (value) => { state.error = value; },
    setLoadingDashboard: (value) => { state.loading = value; },
    setCanClearKpiFilters: vi.fn(), hasAppliedKpiFilterChanges: () => true,
    extractMessage: (error) => error.message,
  };
  const run = new Function(...Object.keys(env), `${body}\n});`)(...Object.values(env));
  return { run, env, state };
}

describe('Sucursales: propiedad de solicitudes', () => {
  test('una respuesta antigua no sustituye el último resultado', async () => {
    const { run, env, state } = harness();
    const a = deferred(), b = deferred();
    env.getAdminReportesDashboard.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = run(), second = run();
    b.resolve({ data: { id: 'B' } }); await second;
    a.resolve({ data: { id: 'A' } }); await first;
    expect(state.snapshot).toEqual({ id: 'B' });
  });
  test('error antiguo no altera error ni loading de la solicitud vigente', async () => {
    const { run, env, state } = harness();
    const a = deferred(), b = deferred();
    env.getAdminReportesDashboard.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = run(), second = run();
    a.reject(new Error('SQL private diagnostic')); await first;
    expect(state.error).toBe(''); expect(state.loading).toBe(true);
    b.resolve({ data: { id: 'B' } }); await second;
    expect(state.loading).toBe(false);
  });
  test('error vigente muestra únicamente un mensaje funcional', async () => {
    const { run, env, state } = harness();
    env.getAdminReportesDashboard.mockRejectedValue(new Error('SQL private diagnostic'));
    await run();
    expect(state.error).toBe('No se pudo cargar el reporte de sucursales.');
    expect(state.loading).toBe(false);
  });
  test('respuesta tras desmontaje no actualiza el estado', async () => {
    const { run, env, state } = harness();
    const request = deferred(); env.getAdminReportesDashboard.mockReturnValue(request.promise);
    const pending = run(); env.incomeRequestsRef.current.mounted = false;
    request.resolve({ data: { id: 'A' } }); await pending;
    expect(state.snapshot).toBe(null);
  });
  test('fechas invertidas no producen consultas', async () => {
    const { run, env } = harness();
    await run({ overrideFilters: { fecha_desde: '2026-10-20', fecha_hasta: '2026-10-01' } });
    expect(env.getAdminReportesDashboard).not.toHaveBeenCalled();
    expect(env.notifications.warning).toHaveBeenCalledOnce();
  });
  test('conserva parámetros y resultado del reporte vacío', async () => {
    const { run, env, state } = harness();
    env.getAdminReportesDashboard.mockResolvedValue({ data: {} });
    await run({ overrideFilters: { id_sucursal: 'A' } });
    expect(env.getAdminReportesDashboard).toHaveBeenCalledWith(expect.objectContaining({ id_sucursal: 'A' }), { signal: expect.any(AbortSignal) });
    expect(state.snapshot).toEqual({});
  });
  test('Ingresos conserva el mensaje seguro aprobado', async () => {
    const { run, env, state } = harness('ingresos');
    env.getAdminReportesDashboard.mockRejectedValue(new Error('existing behavior'));
    await run(); expect(state.error).toBe('No se pudo cargar el reporte de ingresos.');
  });
});
