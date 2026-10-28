import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';

const source = readFileSync(new URL('../../components/ReportesCustomReportModal.jsx', import.meta.url), 'utf8');
function harness() {
  let resolve;
  const pending = new Promise((yes) => { resolve = yes; });
  const start = source.indexOf('  async function handleGenerate(actionType) {');
  const body = source.slice(start, source.indexOf('\n  return (', start));
  const env = {
    defaultModuleType: 'membresias',
    generationRef: { current: 1 }, actionRef: { current: null },
    dateFrom: '2026-10-01', dateTo: '2026-10-20', selectedKpiIds: ['membresias_activas_por_membresia'],
    notifications: { warning: vi.fn(), loading: vi.fn(() => 'toast'), update: vi.fn(), dismiss: vi.fn() },
    setRunningAction: vi.fn(), setIsGeneratingReport: vi.fn(),
    onRequestSnapshot: vi.fn(() => pending),
    buildSelectedSections: vi.fn(() => [{ title: 'Ingreso', rows: [['total', 123]] }]),
    buildCsvContent: vi.fn(() => 'total,123'), buildExcelHtml: vi.fn(() => '<table>123</table>'),
    downloadTextFile: vi.fn(), userDisplayName: 'Synthetic', extractMessage: (error) => error.message,
  };
  const run = new Function(...Object.keys(env), `${body}\nreturn handleGenerate;`)(...Object.values(env));
  return { run, env, resolve };
}

test('exportación de Membresías no se duplica con doble clic', async () => {
  const { run, env, resolve } = harness();
  const a = run('csv'), b = run('csv');
  expect(env.onRequestSnapshot).toHaveBeenCalledTimes(1);
  resolve({ kpis: { ingresos_totales: 123 } }); await Promise.all([a, b]);
  expect(env.downloadTextFile).toHaveBeenCalledOnce();
});
test('exportación cerrada o de identidad anterior no descarga ni notifica', async () => {
  const { run, env, resolve } = harness();
  const pending = run('csv'); env.generationRef.current += 1;
  resolve({ kpis: { ingresos_totales: 123 } }); await pending;
  expect(env.downloadTextFile).not.toHaveBeenCalled();
  expect(env.notifications.update).not.toHaveBeenCalled();
});
for (const format of ['csv', 'excel']) test(`${format} conserva rango, selección y snapshot sin operaciones externas`, async () => {
  const { run, env, resolve } = harness();
  const data = { kpis: { ingresos_totales: 123 } };
  const pending = run(format); resolve(data); await pending;
  expect(env.onRequestSnapshot).toHaveBeenCalledWith({ fecha_desde: '2026-10-01', fecha_hasta: '2026-10-20', signal: expect.any(AbortSignal) });
  expect(env.buildSelectedSections).toHaveBeenCalledWith(data, ['membresias_activas_por_membresia']);
  expect(env.downloadTextFile).toHaveBeenCalledWith(expect.objectContaining({ filename: expect.stringContaining('2026-10-01_2026-10-20') }));
});
