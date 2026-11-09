// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SuperAdminDashboardPage from '../SuperAdminDashboardPage.jsx';

const getSummary = vi.fn();
vi.mock('../../lib/superAdminDashboardApi.js', () => ({
  getSuperAdminDashboardSummary: (...args) => getSummary(...args),
}));

const snapshot = {
  data: {
    total_citas: 124,
    valor_citas_hnl: 4,
    planes_activados: 0,
    masterpuntos_canjeados: 0,
    periodo: { fecha_desde: '2026-11-08', fecha_hasta: '2026-11-08' },
    timezone: 'America/Tegucigalpa',
    actualizado_at: '2026-11-08T18:00:00.000Z',
  },
};

describe('SuperAdminDashboardPage', () => {
  afterEach(cleanup);
  beforeEach(() => {
    getSummary.mockReset();
    getSummary.mockResolvedValue(snapshot);
  });

  it('muestra los cuatro indicadores y aclara que el valor no es ingreso', async () => {
    render(<SuperAdminDashboardPage />);
    expect(await screen.findByText('124')).toBeInTheDocument();
    expect(screen.getByText(/L\s*4\.00/)).toBeInTheDocument();
    expect(screen.getByText('Planes activados')).toBeInTheDocument();
    expect(screen.getByText('MasterPuntos canjeados')).toBeInTheDocument();
    expect(screen.getByText(/no representa ingresos cobrados/i)).toBeInTheDocument();
  });

  it('aplica períodos rápidos y ofrece fechas personalizadas', async () => {
    render(<SuperAdminDashboardPage />);
    await screen.findByText('124');
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Personalizado' }));
    expect(screen.getByLabelText('Desde')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Hasta')).toHaveAttribute('type', 'date');
  });

  it('no sustituye el último snapshot por ceros si actualizar falla', async () => {
    render(<SuperAdminDashboardPage />);
    expect(await screen.findByText('124')).toBeInTheDocument();
    getSummary.mockRejectedValueOnce(new Error('Servicio temporalmente no disponible'));
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio temporalmente no disponible');
    expect(screen.getByText('124')).toBeInTheDocument();
  });
});
