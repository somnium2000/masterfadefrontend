import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
const source = readFileSync(new URL('../AdminReportesSubmodulePage.jsx', import.meta.url), 'utf8');
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const start = source.indexOf('const fetchIndependentBarbersOverview = useCallback(async () => {');
  const body = source.slice(start, source.indexOf('\n  }, [', start)).replace('const fetchIndependentBarbersOverview = useCallback(', 'return (');
  const state = {};
  const env = {
    resolvedModuleType: 'barberos',
    incomeRequestsRef: { current: { mounted: true, charts: 0, controllers: {} } },
    buildUtcDateRange: () => ({ endDate: new Date('2026-10-20T12:00:00Z') }),
    formatLocalDate: (date) => date.toISOString().slice(0, 10),
    getAdminReportesDashboard: vi.fn(),
    setIndependentBarbersOverview: (value) => Object.assign(state, value),
    extractMessage: (error) => error.message,
  };
  const run = new Function(...Object.keys(env), `${body}\n});`)(...Object.values(env));
  return { run, env, state };
}
test('siete snapshots antiguos no sobrescriben la vista vigente', async () => {
  const { run, env, state } = harness(); const a = deferred(), b = deferred();
  env.getAdminReportesDashboard.mockImplementationOnce(() => a.promise);
  for (let i = 1; i < 7; i += 1) env.getAdminReportesDashboard.mockImplementationOnce(() => a.promise);
  env.getAdminReportesDashboard.mockImplementation(() => b.promise);
  const first = run(), second = run();
  b.resolve({ data: { owner: 'B' } }); await second;
  a.resolve({ data: { owner: 'A' } }); await first;
  expect(Object.values(state.snapshotsByDate).every((value) => value.owner === 'B')).toBe(true);
  expect(Object.keys(state.snapshotsByDate)).toHaveLength(7);
});
test('error tardío no cambia loading ni error vigente', async () => {
  const { run, env, state } = harness(); const a = deferred(), b = deferred();
  for (let i = 0; i < 7; i += 1) env.getAdminReportesDashboard.mockImplementationOnce(() => a.promise);
  env.getAdminReportesDashboard.mockImplementation(() => b.promise);
  const first = run(), second = run(); a.reject(new Error('old SQL')); await first;
  expect(state.loading).toBe(true); expect(state.error).toBe('');
  b.resolve({ data: {} }); await second;
});
test('desmontaje descarta snapshots incluso si el doble ignora el aborto', async () => {
  const { run, env, state } = harness(); const request = deferred();
  env.getAdminReportesDashboard.mockReturnValue(request.promise);
  const pending = run(); env.incomeRequestsRef.current.mounted = false;
  request.resolve({ data: { owner: 'old' } }); await pending;
  expect(state.snapshotsByDate).toEqual({});
});
test('error vigente es funcional y las siete consultas llevan señal propia', async () => {
  const { run, env, state } = harness();
  env.getAdminReportesDashboard.mockRejectedValue(new Error('private SQL'));
  await run(); expect(state.error).toBe('No se pudo cargar la vista de barberos.');
  expect(env.getAdminReportesDashboard).toHaveBeenCalledTimes(7);
  for (const [, options] of env.getAdminReportesDashboard.mock.calls) expect(options.signal).toBeInstanceOf(AbortSignal);
});
