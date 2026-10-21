import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';
const source = readFileSync('src/features/admin/pages/AdminConfiguracionComunicacionPage.jsx', 'utf8').replace(/\r\n/g, '\n');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture(name) {
  const effects = [];
  const env = { selectedCampaign: { id_campania: 'A' }, mountedRef: { current: true }, campaignContextRef: { current: { id: 'A', generation: 1 } }, campaignOperationRef: { current: null },
    scheduleAt: '', manuallyExcludedIds: [], extractMessage: () => 'Mensaje seguro',
    notifications: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, fetchCampaignDetail: vi.fn().mockResolvedValue(),
  };
  for (const key of ['programAdminConfigComunicacionCampania','sendAdminConfigComunicacionCampania','retryFailedAdminConfigComunicacionCampania','cancelAdminConfigComunicacionCampania']) env[key] = vi.fn();
  for (const key of ['setScheduling','setSending','setRetryingFailed','setCancellingCampaign','setSendSummary','setRetrySummary','setPanelMode']) env[key] = value => effects.push([key, value]);
  function compile(fn, async = false) { const start = source.indexOf('\n', source.indexOf(`  ${async ? 'async ' : ''}function ${fn}(`)) + 1; const body = source.slice(start, source.indexOf('\n  }', start)); return new Function('env', `with(env) { return ${async ? 'async ' : ''}function() { ${body} }; }`)(env); }
  if (source.includes('function beginCampaignOperation(')) env.beginCampaignOperation = compile('beginCampaignOperation');
  return { env, effects, run: compile(name, true) };
}
const cases = [
  ['handleScheduleCampaign','programAdminConfigComunicacionCampania'], ['executeSendCampaign','sendAdminConfigComunicacionCampania'],
  ['executeRetryFailedShipments','retryFailedAdminConfigComunicacionCampania'], ['executeCancelCampaign','cancelAdminConfigComunicacionCampania'],
];
test.each(cases)('%s evita dos operaciones simultáneas y descarta respuesta de otra campaña', async (fn, api) => {
  const f = fixture(fn), pending = deferred(); f.env[api].mockReturnValue(pending.promise);
  const first = f.run(), second = f.run(); expect(f.env[api]).toHaveBeenCalledTimes(1);
  f.env.campaignContextRef.current = { id: 'B', generation: 2 }; f.effects.length = 0;
  pending.resolve({ data: {} }); await Promise.all([first, second]);
  expect(f.env.notifications.success).not.toHaveBeenCalled(); expect(f.env.fetchCampaignDetail).not.toHaveBeenCalled(); expect(f.effects).toEqual([]);
});
test.each(cases)('%s conserva éxito, payload y libera bloqueo vigente', async (fn, api) => {
  const f = fixture(fn); f.env[api].mockResolvedValue({ data: {} }); await f.run();
  expect(f.env[api].mock.calls[0][0]).toBe('A'); expect(f.env.notifications.success).toHaveBeenCalledTimes(1);
  expect(f.env.fetchCampaignDetail).toHaveBeenCalledWith('A'); expect(f.env.campaignOperationRef.current).toBeNull();
  if (fn === 'handleScheduleCampaign') expect(f.env[api]).toHaveBeenCalledWith('A', { programada_para: null, id_clientes_excluidos: [] });
});
test.each(cases)('%s desmontada descarta rechazo y no afecta loading', async (fn, api) => {
  const f = fixture(fn), pending = deferred(); f.env[api].mockReturnValue(pending.promise); const work = f.run();
  f.env.mountedRef.current = false; f.effects.length = 0; pending.reject({ status: 401 }); await work;
  expect(f.env.notifications.error).not.toHaveBeenCalled(); expect(f.effects).toEqual([]);
});
test.each(cases)('%s fallo vigente permite reintento', async (fn, api) => {
  const f = fixture(fn); f.env[api].mockRejectedValueOnce(new Error('SYNTHETIC')).mockResolvedValueOnce({ data: {} });
  await f.run(); expect(f.env.notifications.error).toHaveBeenCalledTimes(1); expect(f.env.campaignOperationRef.current).toBeNull();
  await f.run(); expect(f.env.notifications.success).toHaveBeenCalledTimes(1);
});
