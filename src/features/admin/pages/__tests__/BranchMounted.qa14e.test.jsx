// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminReportesSucursalesPage.jsx';
import Modal from '../../components/ReportesCustomReportModal.jsx';

const api = vi.hoisted(() => ({ getAdminReportesContext: vi.fn(), getAdminReportesDashboard: vi.fn() }));
const notices = vi.hoisted(() => ({ warning: vi.fn(), loading: vi.fn(() => 'toast'), update: vi.fn(), dismiss: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id_usuario: 'A' }, roles: ['super_admin'], branchIds: [] }));
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
  const kpi = screen.queryByRole('checkbox', { name: 'Ingresos totales', exact: true });
  if (kpi && !kpi.checked) fireEvent.click(kpi);
}
beforeEach(() => {
  vi.clearAllMocks(); auth.user = { id_usuario: 'A' }; auth.roles = ['super_admin']; auth.branchIds = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  api.getAdminReportesContext.mockResolvedValue({ data: { sucursales: [], barberos: [], rango_default: { fechaDesde: '2026-10-01', fechaHasta: '2026-10-20' } } });
  api.getAdminReportesDashboard.mockResolvedValue({ data: {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

test('React StrictMode conserva carga vigente y muestra error seguro', async () => {
  api.getAdminReportesDashboard.mockRejectedValue(new Error('SQL secret diagnostic'));
  render(<StrictMode><Page moduleType="sucursales" /></StrictMode>);
  expect(await screen.findByText('No se pudo cargar el reporte de sucursales.')).toBeInTheDocument();
  expect(screen.queryByText(/secret diagnostic/)).not.toBeInTheDocument();
});
test('modal desmontado descarta la exportación pendiente y retira su aviso', async () => {
  const request = deferred(); const load = vi.fn(() => request.promise);
  const view = render(<StrictMode><Modal open defaultModuleType="sucursales" onRequestSnapshot={load} /></StrictMode>);
  dates(view.container); fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' }));
  view.unmount();
  await act(async () => { request.resolve({ kpis: {} }); await request.promise; });
  expect(load).toHaveBeenCalledOnce();
  expect(notices.dismiss).toHaveBeenCalledWith('toast');
  expect(notices.update).not.toHaveBeenCalled();
});
test('cambio de identidad invalida la exportación pendiente', async () => {
  const request = deferred(); const load = vi.fn(() => request.promise);
  const view = render(<Modal open defaultModuleType="sucursales" onRequestSnapshot={load} />);
  dates(view.container); fireEvent.click(screen.getByRole('button', { name: 'Descargar Excel' }));
  auth.user = { id_usuario: 'B' };
  view.rerender(<Modal open defaultModuleType="sucursales" onRequestSnapshot={load} />);
  await act(async () => { request.reject(new Error('stale error')); await request.promise.catch(() => {}); });
  expect(notices.update).not.toHaveBeenCalled();
});
test('error vigente de exportación no presenta diagnóstico técnico', async () => {
  const load = vi.fn().mockRejectedValue(new Error('private SQL/token'));
  const view = render(<Modal open defaultModuleType="sucursales" onRequestSnapshot={load} />);
  dates(view.container);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descargar CSV' })); });
  expect(notices.update).toHaveBeenCalledWith('toast', expect.objectContaining({ type: 'error', message: 'No se pudo generar el reporte de sucursales.' }));
  expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeEnabled();
});

test('StrictMode descarta contexto antiguo y aborta su señal sin mezclar sucursales', async () => {
  const a = deferred(), b = deferred();
  api.getAdminReportesContext.mockReset();
  api.getAdminReportesContext.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  render(<StrictMode><Page moduleType="sucursales" /></StrictMode>);
  expect(api.getAdminReportesContext.mock.calls[0][1].signal.aborted).toBe(true);
  await act(async () => { b.resolve({ data: { sucursales: [{ id_sucursal: 'B', nombre_sucursal: 'Sucursal B' }], rango_default: { fechaDesde: '2026-10-01', fechaHasta: '2026-10-20' } } }); await b.promise; });
  await act(async () => { a.resolve({ data: { sucursales: [{ id_sucursal: 'A', nombre_sucursal: 'Sucursal A' }] } }); await a.promise; });
  expect(api.getAdminReportesDashboard).toHaveBeenCalledWith(expect.objectContaining({ id_sucursal: 'B' }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(api.getAdminReportesDashboard.mock.calls.some(([params]) => params.id_sucursal === 'A')).toBe(false);
});

test.each(['admin', 'barbero', 'cliente', 'anónimo'])('wrapper no consulta ni muestra el reporte para %s', (role) => {
  auth.roles = role === 'anónimo' ? [] : [role]; render(<Page />);
  expect(api.getAdminReportesContext).not.toHaveBeenCalled();
  expect(api.getAdminReportesDashboard).not.toHaveBeenCalled();
  expect(screen.queryByText('Reportes · Sucursales')).not.toBeInTheDocument();
});
test('superadmin multirrol conserva acceso al componente existente', async () => {
  auth.roles = ['super_admin', 'admin']; render(<Page />);
  await screen.findByText('Reportes · Sucursales');
  expect(api.getAdminReportesContext).toHaveBeenCalledOnce();
});
test('cambio de identidad limpia el snapshot anterior antes de cargar el nuevo', async () => {
  api.getAdminReportesDashboard.mockResolvedValue({ data: { ventas_ingresos: { ingresos_por_sucursal: [{ id_sucursal: 'A', nombre_sucursal: 'Sede anterior', ingresos_hnl: 100, citas_pagadas: 2 }] } } });
  const view = render(<Page />); await screen.findAllByText('Sede anterior');
  api.getAdminReportesDashboard.mockResolvedValue({ data: { ventas_ingresos: { ingresos_por_sucursal: [{ id_sucursal: 'B', nombre_sucursal: 'Sede vigente', ingresos_hnl: 60, citas_pagadas: 3 }] } } });
  auth.user = { id_usuario: 'B' }; view.rerender(<Page />);
  expect(screen.queryAllByText('Sede anterior')).toHaveLength(0);
  await screen.findAllByText('Sede vigente');
});
test('indicadores y ticket promedio conservan el comparativo recibido, incluso con cero cobros', async () => {
  api.getAdminReportesDashboard.mockResolvedValue({ data: { ventas_ingresos: { ingresos_por_sucursal: [
    { id_sucursal: 'A', nombre_sucursal: 'Sede A', ingresos_hnl: 100, citas_pagadas: 2 },
    { id_sucursal: 'B', nombre_sucursal: 'Sede B', ingresos_hnl: 60, citas_pagadas: 3 },
    { id_sucursal: 'C', nombre_sucursal: 'Sede C', ingresos_hnl: 0, citas_pagadas: 0 },
  ] } } });
  render(<Page />); await screen.findAllByText('Sede A');
  expect(screen.getAllByText('L 160.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('L 50.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('L 20.00').length).toBeGreaterThan(0);
  expect(screen.getAllByText('L 0.00').length).toBeGreaterThan(0);
  expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument();
});
