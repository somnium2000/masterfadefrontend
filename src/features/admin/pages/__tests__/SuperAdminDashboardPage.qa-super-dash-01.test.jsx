// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SuperAdminDashboardPage from '../SuperAdminDashboardPage.jsx';

const getSummary = vi.fn();
vi.mock('../../lib/superAdminDashboardApi.js', () => ({
  getSuperAdminDashboardSummary: (...args) => getSummary(...args),
}));

function responseFor(periodo, overrides = {}) {
  return { data: {
    total_citas: 124,
    valor_citas_hnl: 4,
    planes_activados: 2,
    masterpuntos_canjeados: 3,
    periodo,
    timezone: 'America/Tegucigalpa',
    actualizado_at: '2026-11-08T18:00:00.000Z',
    ...overrides,
  } };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('SuperAdminDashboardPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    getSummary.mockReset();
    getSummary.mockImplementation((periodo) => Promise.resolve(responseFor(periodo)));
  });

  it('muestra los cuatro indicadores y aclara que el valor no es ingreso', async () => {
    render(<SuperAdminDashboardPage />);
    expect(await screen.findByText('124')).toBeInTheDocument();
    expect(screen.getByText(/L\s*4\.00/)).toBeInTheDocument();
    expect(screen.getByText('Planes activados')).toBeInTheDocument();
    expect(screen.getByText('MasterPuntos canjeados')).toBeInTheDocument();
    expect(screen.getByText(/no representa ingresos cobrados/i)).toBeInTheDocument();
  });

  it('cambia de Hoy a 7 días y muestra únicamente la respuesta del nuevo período', async () => {
    render(<SuperAdminDashboardPage />);
    await screen.findByText('124');
    getSummary.mockImplementationOnce((periodo) => Promise.resolve(responseFor(periodo, { planes_activados: 7, masterpuntos_canjeados: 8 })));
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('muestra métricas no disponibles si falla un período distinto', async () => {
    render(<SuperAdminDashboardPage />);
    expect(await screen.findByText('124')).toBeInTheDocument();
    const nextPeriod = deferred();
    getSummary.mockImplementationOnce(() => nextPeriod.promise);
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    expect(await screen.findByLabelText('Cargando Planes activados')).toBeInTheDocument();
    expect(screen.getByLabelText('Cargando MasterPuntos canjeados')).toBeInTheDocument();
    nextPeriod.reject(new Error('Servicio temporalmente no disponible'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio temporalmente no disponible');
    expect(screen.getByText('124')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText(/última lectura válida/i)).not.toBeInTheDocument();
  });

  it('conserva e identifica la última lectura válida si falla actualizar el mismo período', async () => {
    render(<SuperAdminDashboardPage />);
    expect(await screen.findByText('2')).toBeInTheDocument();
    getSummary.mockRejectedValueOnce(new Error('Servicio temporalmente no disponible'));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText(/última lectura válida de este período/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('valida fechas personalizadas vacías o invertidas sin enviar solicitudes', async () => {
    render(<SuperAdminDashboardPage />);
    await screen.findByText('124');
    fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '' } });
    expect(await screen.findByText(/Selecciona ambas fechas/i)).toBeInTheDocument();
    expect(getSummary).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-10' } });
    expect(await screen.findByText(/no puede ser posterior/i)).toBeInTheDocument();
    expect(getSummary).toHaveBeenCalledTimes(1);
  });

  it('ignora respuestas concurrentes que llegan fuera de orden', async () => {
    render(<SuperAdminDashboardPage />);
    await screen.findByText('124');
    const sevenDays = deferred();
    const thirtyDays = deferred();
    getSummary.mockImplementationOnce(() => sevenDays.promise).mockImplementationOnce(() => thirtyDays.promise);
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: '30 días' }));
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(3));
    const thirtyRange = getSummary.mock.calls[2][0];
    thirtyDays.resolve(responseFor(thirtyRange, { planes_activados: 30, masterpuntos_canjeados: 31 }));
    expect(await screen.findByText('30')).toBeInTheDocument();
    const sevenRange = getSummary.mock.calls[1][0];
    sevenDays.resolve(responseFor(sevenRange, { planes_activados: 70, masterpuntos_canjeados: 71 }));
    await waitFor(() => expect(screen.queryByText('70')).not.toBeInTheDocument());
    expect(screen.getByText('30')).toBeInTheDocument();
  });
});
