import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
const source = readFileSync(new URL('../AdminReportesSubmodulePage.jsx', import.meta.url), 'utf8');
function extract(name, env) {
  const start = source.indexOf(`const ${name} = useCallback(`);
  const body = source.slice(start, source.indexOf('\n  }, [', start)).replace(`const ${name} = useCallback(`, 'return (');
  return new Function(...Object.keys(env), `${body}\n});`)(...Object.values(env));
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(kind) {
  const state = {};
  const request = vi.fn();
  const env = {
    resolvedModuleType: 'concurrencia',
    incomeRequestsRef: { current: { mounted: true, daily: 0, peak: 0, controllers: {} } },
    buildDateKeysBetween: () => ['2026-10-01'], buildDashboardParams: (value) => value,
    buildCurrentMonthDateRange: () => ({ fecha_desde: '2026-10-01', fecha_hasta: '2026-10-31' }),
    fetchDailyTotalsForDateKeys: request, getAdminReportesDashboard: request,
    toInt: (value) => Number(value) || 0,
    setFilteredConcurrencyDaily: (value) => Object.assign(state, value),
    setIndependentConcurrencyPeakDay: (value) => Object.assign(state, value),
    extractMessage: (error) => error.message,
  };
  const run = extract(kind === 'daily' ? 'fetchFilteredConcurrencyDaily' : 'fetchIndependentConcurrencyPeakDay', env);
  const result = (total) => kind === 'daily' ? [{ total_citas: total }] : { data: { concurrencia_clientes: { trafico_por_dia_semana: [{ dia_semana_num: 1, dia_semana_label: 'Lunes', total_citas: total }] } } };
  return { run, request, state, env, result };
}
for (const kind of ['daily', 'peak']) {
  test(`${kind}: respuesta antigua no sustituye datos vigentes`, async () => {
    const { run, request, state, result } = harness(kind); const a = deferred(), b = deferred();
    request.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = run({ fecha_desde: '2026-10-01', fecha_hasta: '2026-10-01' });
    const second = run({ fecha_desde: '2026-10-02', fecha_hasta: '2026-10-02' });
    b.resolve(result(9)); await second; a.resolve(result(1)); await first;
    expect(kind === 'daily' ? state.rows[0].total_citas : state.topDay.total_citas).toBe(9);
  });
  test(`${kind}: error tardío conserva loading y error de la solicitud nueva`, async () => {
    const { run, request, state, result } = harness(kind); const a = deferred(), b = deferred();
    request.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const first = run(), second = run(); a.reject(new Error('SQL old')); await first;
    expect(state.loading).toBe(true); expect(state.error).toBe(''); b.resolve(result(2)); await second;
  });
  test(`${kind}: desmontaje descarta la respuesta aunque el mock ignore cancelación`, async () => {
    const { run, request, state, env, result } = harness(kind); const a = deferred();
    request.mockReturnValue(a.promise); const pending = run(); env.incomeRequestsRef.current.mounted = false;
    a.resolve(result(2)); await pending;
    expect(kind === 'daily' ? state.rows : state.topDay).toEqual(kind === 'daily' ? [] : null);
  });
  test(`${kind}: error vigente no expone diagnóstico técnico`, async () => {
    const { run, request, state } = harness(kind); request.mockRejectedValue(new Error('SQL private'));
    await run(); expect(state.error).not.toContain('SQL'); expect(state.loading).toBe(false);
  });
}
test('cancelar una tendencia detiene lotes posteriores y transmite la señal al HTTP', async () => {
  const controller = new AbortController(); const a = deferred();
  const get = vi.fn().mockReturnValueOnce(a.promise).mockResolvedValue({ data: {} });
  const run = extract('fetchDailyTotalsForDateKeys', {
    CONCURRENCY_FETCH_BATCH_SIZE: 1, getAdminReportesDashboard: get,
    toUtcDate: (value) => new Date(value), toInt: (value) => Number(value) || 0,
  });
  const pending = run(['2026-10-01', '2026-10-02'], (day) => ({ fecha_desde: day }), { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort(); a.resolve({ data: {} }); await rejected;
  expect(get).toHaveBeenCalledTimes(1);
  expect(get.mock.calls[0][1].signal).toBe(controller.signal);
});
