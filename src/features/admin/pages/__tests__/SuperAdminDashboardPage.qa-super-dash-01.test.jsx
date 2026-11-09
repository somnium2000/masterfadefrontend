// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SuperAdminDashboardPage from '../SuperAdminDashboardPage.jsx';

const getSummary = vi.fn();
const originalMatchMedia = window.matchMedia;
vi.mock('../../lib/superAdminDashboardApi.js', () => ({
  getSuperAdminDashboardSummary: (...args) => getSummary(...args),
}));

function responseFor(periodo, overrides = {}) {
  return { data: {
    total_citas: 124,
    ingresos_citas_hnl_total: 34,
    ingresos_citas_hnl_periodo: 3,
    planes_activados: 2,
    masterpuntos_canjeados: 3,
    ingresos_serie: [{ periodo: `${periodo.fecha_hasta}T10:00:00`, ingresos_hnl: 3 }],
    actividad_serie: [{ periodo: `${periodo.fecha_hasta}T00:00:00`, planes_activados: 2, masterpuntos_canjeados: 3 }],
    agrupacion: periodo.fecha_desde === periodo.fecha_hasta ? 'hour' : 'day',
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
  afterEach(() => {
    cleanup();
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });
  beforeEach(() => {
    getSummary.mockReset();
    getSummary.mockImplementation((periodo) => Promise.resolve(responseFor(periodo)));
  });

  it('muestra los cuatro indicadores, ingresos reales y dos gráficas accesibles', async () => {
    render(<SuperAdminDashboardPage />);
    expect(await screen.findByText('124')).toBeInTheDocument();
    expect(screen.getByText(/L\s*34\.00/)).toBeInTheDocument();
    expect(screen.getByText(/Período:.*3\.00/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Evolución temporal de ingresos/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Comparación temporal/i })).toBeInTheDocument();
    expect(screen.getAllByText('Planes activados').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('MasterPuntos canjeados')).toBeInTheDocument();
    expect(screen.getByText(/Cobros confirmados asociados exclusivamente a citas/i)).toBeInTheDocument();
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
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
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

  it('representa fechas discontinuas con ceros y conserva totales exactos', async () => {
    render(<SuperAdminDashboardPage />);
    await screen.findByText('124');
    getSummary.mockImplementationOnce((periodo) => Promise.resolve(responseFor(periodo, {
      ingresos_citas_hnl_periodo: 5,
      planes_activados: 1,
      masterpuntos_canjeados: 2,
      ingresos_serie: [
        { periodo: '2026-11-06T00:00:00', ingresos_hnl: 2 },
        { periodo: '2026-11-07T00:00:00', ingresos_hnl: 0 },
        { periodo: '2026-11-08T00:00:00', ingresos_hnl: 3 },
      ],
      actividad_serie: [
        { periodo: '2026-11-06T00:00:00', planes_activados: 0, masterpuntos_canjeados: 1 },
        { periodo: '2026-11-07T00:00:00', planes_activados: 0, masterpuntos_canjeados: 0 },
        { periodo: '2026-11-08T00:00:00', planes_activados: 1, masterpuntos_canjeados: 1 },
      ],
      agrupacion: 'day',
    })));
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    expect(await screen.findByText(/Período:.*5\.00/)).toBeInTheDocument();
    expect(screen.getAllByText(/07\/11: L\s*0\.00/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/07\/11: 0 planes activados y 0 canjes/)).toBeInTheDocument();
  });

  it.each([[360, '0 0 340 230'], [390, '0 0 340 230'], [768, '0 0 720 250'], [1440, '0 0 720 250']])(
    'adapta la geometría SVG al viewport de %ipx',
    async (width, viewBox) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      window.matchMedia = vi.fn(() => ({ matches: width < 640, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
      render(<SuperAdminDashboardPage />);
      const income = await screen.findByRole('img', { name: /Evolución temporal de ingresos/i });
      const activity = screen.getByRole('img', { name: /Comparación temporal/i });
      expect(income).toHaveAttribute('viewBox', viewBox);
      expect(activity).toHaveAttribute('viewBox', viewBox);
      expect(income).toHaveClass('max-w-full');
      expect(activity).toHaveClass('max-w-full');
    },
  );
});
