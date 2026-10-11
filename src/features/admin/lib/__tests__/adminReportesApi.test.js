import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock('../../../../services/httpClient.js', () => ({
  http: { get: getMock },
}));

const api = await import('../adminReportesApi.js');

function setSession(userId, roles = ['super_admin'], branchIds = ['branch-1']) {
  api.setAdminReportesSessionScope({ userId, roles, branchIds, empresaId: 'company-1' });
}

describe('adminReportesApi session cache', () => {
  beforeEach(() => {
    getMock.mockReset();
    api.setAdminReportesSessionScope();
    api.clearAdminReportesApiCache();
  });

  it('reutiliza cache solo dentro de la misma identidad y desactiva cache/dedupe HTTP', async () => {
    setSession('super-1');
    getMock.mockResolvedValueOnce({ data: { owner: 'super-1' } });

    const first = await api.getAdminReportesDashboard({ fecha_desde: '2026-10-01' });
    const second = await api.getAdminReportesDashboard({ fecha_desde: '2026-10-01' });

    expect(first).toEqual(second);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock).toHaveBeenCalledWith(expect.any(String), { cache: false, dedupe: false });
  });

  it('no comparte snapshots entre dos super_admin ni con una identidad admin', async () => {
    setSession('super-1');
    getMock.mockResolvedValueOnce({ data: { owner: 'super-1' } });
    await api.getAdminReportesDashboard();

    setSession('super-2');
    getMock.mockResolvedValueOnce({ data: { owner: 'super-2' } });
    expect(await api.getAdminReportesDashboard()).toEqual({ data: { owner: 'super-2' } });

    setSession('admin-1', ['admin']);
    getMock.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { status: 403 }));
    await expect(api.getAdminReportesDashboard()).rejects.toMatchObject({ status: 403 });
    expect(getMock).toHaveBeenCalledTimes(3);
  });

  it('invalida al cambiar roles, sucursales o cerrar sesion', async () => {
    setSession('super-1', ['super_admin'], ['branch-1']);
    getMock.mockResolvedValue({ data: { call: 1 } });
    await api.getAdminReportesContext();

    setSession('super-1', ['super_admin', 'admin'], ['branch-1']);
    await api.getAdminReportesContext();
    setSession('super-1', ['super_admin', 'admin'], ['branch-1', 'branch-2']);
    await api.getAdminReportesContext();
    api.setAdminReportesSessionScope();
    setSession('super-1', ['super_admin'], ['branch-1']);
    await api.getAdminReportesContext();

    expect(getMock).toHaveBeenCalledTimes(4);
  });

  it('una respuesta anterior al logout no repuebla cache ni se comparte con la nueva sesion', async () => {
    let resolveOldRequest;
    setSession('super-1');
    getMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOldRequest = resolve; }));
    const oldRequest = api.getAdminReportesDashboard();

    api.setAdminReportesSessionScope();
    setSession('super-2');
    getMock.mockResolvedValueOnce({ data: { owner: 'super-2' } });
    const newRequest = api.getAdminReportesDashboard();
    expect(newRequest).not.toBe(oldRequest);

    resolveOldRequest({ data: { owner: 'super-1' } });
    await oldRequest;
    expect(await newRequest).toEqual({ data: { owner: 'super-2' } });
    expect(await api.getAdminReportesDashboard()).toEqual({ data: { owner: 'super-2' } });
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});
