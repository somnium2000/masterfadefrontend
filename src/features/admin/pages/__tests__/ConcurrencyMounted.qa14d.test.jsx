// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  api.getAdminReportesContext.mockResolvedValue({ data: { sucursales: [], barberos: [], rango_default: { fechaDesde: '2026-10-01', fechaHasta: '2026-10-20' } } });
  api.getAdminReportesDashboard.mockResolvedValue({ data: {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

test('React StrictMode conserva carga vigente y muestra error seguro', async () => {
  api.getAdminReportesDashboard.mockRejectedValue(new Error('SQL secret diagnostic'));
  render(<StrictMode><Page moduleType="concurrencia" /></StrictMode>);
  expect(await screen.findByText('No se pudo cargar el reporte de concurrencia.')).toBeInTheDocument();
  expect(screen.queryByText(/secret diagnostic/)).not.toBeInTheDocument();
});
test('modal desmontado descarta la exportación pendiente y retira su aviso', async () => {
  const request = deferred(); const load = vi.fn(() => request.promise);
  const view = render(<StrictMode><Modal open defaultModuleType="concurrencia" onRequestSnapshot={load} /></StrictMode>);
  dates(view.container); fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
  view.unmount();
  await act(async () => { request.resolve({ kpis: {} }); await request.promise; });
  expect(load).toHaveBeenCalledOnce();
  expect(notices.dismiss).toHaveBeenCalledWith('toast');
  expect(notices.update).not.toHaveBeenCalled();
});
test('cambio de identidad invalida la exportación pendiente', async () => {
  const request = deferred(); const load = vi.fn(() => request.promise);
  const view = render(<Modal open defaultModuleType="concurrencia" onRequestSnapshot={load} />);
  dates(view.container); fireEvent.click(screen.getByRole('button', { name: 'Descargar Excel' }));
  auth.user = { id_usuario: 'B' };
  view.rerender(<Modal open defaultModuleType="concurrencia" onRequestSnapshot={load} />);
  await act(async () => { request.reject(new Error('stale error')); await request.promise.catch(() => {}); });
  expect(notices.update).not.toHaveBeenCalled();
});
test('error vigente de exportación no presenta diagnóstico técnico', async () => {
  const load = vi.fn().mockRejectedValue(new Error('private SQL/token'));
  const view = render(<Modal open defaultModuleType="concurrencia" onRequestSnapshot={load} />);
  dates(view.container);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' })); });
  expect(notices.update).toHaveBeenCalledWith('toast', expect.objectContaining({ type: 'error', message: 'No se pudo generar el reporte de concurrencia.' }));
  expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeEnabled();
});

test('StrictMode descarta contexto antiguo y aborta su señal sin mezclar sucursales', async () => {
  const a = deferred(), b = deferred();
  api.getAdminReportesContext.mockReset();
  api.getAdminReportesContext.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  render(<StrictMode><Page moduleType="concurrencia" /></StrictMode>);
  expect(api.getAdminReportesContext.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => { b.resolve({ data: { sucursales: [{ id_sucursal: 'B', nombre_sucursal: 'Sucursal B' }] } }); await b.promise; });
  await act(async () => { a.resolve({ data: { sucursales: [{ id_sucursal: 'A', nombre_sucursal: 'Sucursal A' }] } }); await a.promise; });
  expect(api.getAdminReportesDashboard).toHaveBeenCalledWith(expect.objectContaining({ id_sucursal: 'B' }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(api.getAdminReportesDashboard.mock.calls.some(([params]) => params.id_sucursal === 'A')).toBe(false);
});

test('cambio rápido de fechas conserva filtros y no pierde la carga del día pico', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
  api.getAdminReportesDashboard.mockImplementation(async (params) => ({ data: {
    filtros_aplicados: params, kpis: { total_citas: 5 },
    concurrencia_clientes: { trafico_por_dia_semana: [{ dia_semana_num: 1, dia_semana_label: 'Lunes', total_citas: 5 }], horas_pico: [{ hora: 10, total_citas: 5 }] },
  } }));
  const view = render(<Page moduleType="concurrencia" />);
  await waitFor(() => expect(api.getAdminReportesDashboard).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Filtros' })); dates(view.container);
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
  await waitFor(() => expect(api.getAdminReportesDashboard).toHaveBeenCalledWith(
    expect.objectContaining({ fecha_desde: '2026-10-01', fecha_hasta: '2026-10-20' }), expect.objectContaining({ signal: expect.any(AbortSignal) })
  ));
  await waitFor(() => expect(api.getAdminReportesDashboard.mock.calls.some(([params, options]) => (
    Object.keys(params).length === 2 && params.fecha_desde === '2026-10-01' && params.fecha_hasta === '2026-10-20' && options.signal
  ))).toBe(true));
  expect(screen.getAllByText('Lunes').length).toBeGreaterThan(0);
  expect(screen.getByText('10:00 AM → 5 citas')).toBeInTheDocument();
});
