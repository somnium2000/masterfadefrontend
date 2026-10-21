// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminReportesSubmodulePage.jsx';
import Modal from '../../components/ReportesCustomReportModal.jsx';

const api = vi.hoisted(() => ({ getAdminReportesContext: vi.fn(), getAdminReportesDashboard: vi.fn() }));
const notices = vi.hoisted(() => ({ warning: vi.fn(), loading: vi.fn(() => 'toast'), update: vi.fn(), dismiss: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id_usuario: 'A' } }));
vi.mock('../../lib/adminReportesApi.js', () => api);
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notices }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth, getUserDisplayName: () => 'Synthetic' }));
vi.mock('../../../../components/ui/dialog.jsx', () => ({
  Dialog: ({ open, children }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>, DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>, DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
}));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function dates(container) {
  const fields = container.querySelectorAll('input[type="date"]');
  fireEvent.change(fields[0], { target: { value: '2026-10-01' } });
  fireEvent.change(fields[1], { target: { value: '2026-10-20' } });
}
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id_usuario: 'A' };
  api.getAdminReportesContext.mockResolvedValue({ data: { sucursales: [], barberos: [], rango_default: { fechaDesde: '2026-10-01', fechaHasta: '2026-10-20' } } });
  api.getAdminReportesDashboard.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

test('React StrictMode conserva carga vigente y muestra error seguro', async () => {
  api.getAdminReportesDashboard.mockRejectedValue(new Error('SQL secret diagnostic'));
  render(<StrictMode><Page moduleType="ingresos" /></StrictMode>);
  expect(await screen.findByText('No se pudo cargar el reporte de ingresos.')).toBeInTheDocument();
  expect(screen.queryByText(/secret diagnostic/)).not.toBeInTheDocument();
});
test('modal desmontado descarta la exportación pendiente y retira su aviso', async () => {
  const request = deferred(); const load = vi.fn(() => request.promise);
  const view = render(<StrictMode><Modal open defaultModuleType="ingresos" onRequestSnapshot={load} /></StrictMode>);
  dates(view.container); fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
  view.unmount();
  await act(async () => { request.resolve({ kpis: {} }); await request.promise; });
  expect(load).toHaveBeenCalledOnce();
  expect(notices.dismiss).toHaveBeenCalledWith('toast');
  expect(notices.update).not.toHaveBeenCalled();
});
test('cambio de identidad invalida la exportación pendiente', async () => {
  const request = deferred(); const load = vi.fn(() => request.promise);
  const view = render(<Modal open defaultModuleType="ingresos" onRequestSnapshot={load} />);
  dates(view.container); fireEvent.click(screen.getByRole('button', { name: 'Descargar Excel' }));
  auth.user = { id_usuario: 'B' };
  view.rerender(<Modal open defaultModuleType="ingresos" onRequestSnapshot={load} />);
  await act(async () => { request.reject(new Error('stale error')); await request.promise.catch(() => {}); });
  expect(notices.update).not.toHaveBeenCalled();
});
test('error vigente de exportación no presenta diagnóstico técnico', async () => {
  const load = vi.fn().mockRejectedValue(new Error('private SQL/token'));
  const view = render(<Modal open defaultModuleType="ingresos" onRequestSnapshot={load} />);
  dates(view.container);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' })); });
  expect(notices.update).toHaveBeenCalledWith('toast', expect.objectContaining({ type: 'error', message: 'No se pudo generar el reporte de ingresos.' }));
  expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeEnabled();
});
