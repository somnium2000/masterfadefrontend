// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import Page from '../BarberoHomePage.jsx';

const api = vi.hoisted(() => ({ context: vi.fn(), list: vi.fn(), completed: vi.fn() }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id_usuario: 'U', empleado_id: 'B' }, isAuthenticated: true }), getUserDisplayName: () => 'Barbero sintetico' }));
vi.mock('../../../admin/lib/adminCitasApi.js', () => ({ getAdminCitasOperativasContexto: api.context, listAdminCitasOperativas: api.list, getAdminCitasOperativasCompletadasHoy: api.completed }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-15T18:00:00Z'));
  api.context.mockResolvedValue({ data: { sucursales: [], barberos: [] } });
  api.completed.mockResolvedValue({ data: { citas: [{ id_cita: 'done', estado_cita_codigo: 'completada' }] } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

test.each([
  ['en_espera', 'En espera'], ['pendiente_pago', 'Pendiente de pago'], ['confirmada', 'Confirmada'],
  ['en_salon', 'En salón'], ['en_atencion', 'En atención'], ['completada', 'Completada'],
  ['cancelada', 'Cancelada'], ['cancelada_por_cliente', 'Cancelada por el cliente'],
  ['expirada', 'Expirada'], ['no_show', 'No asistió'], ['anulada', 'Anulada'],
])('%s cambia su etiqueta sin cambiar datos, consulta ni conteos', async (code, label) => {
  const row = Object.freeze({ id_cita: 'appointment', estado_cita_codigo: code, inicio_at: '2026-11-15T14:00:00Z', nombre_cliente: 'Cliente sintetico' });
  api.list.mockResolvedValue({ data: { citas: Object.freeze([row]) } });
  const view = render(<MemoryRouter><Page /></MemoryRouter>);
  await waitFor(() => expect(screen.getAllByText(label).length).toBeGreaterThan(0));
  expect(row.estado_cita_codigo).toBe(code);
  expect(api.list).toHaveBeenCalledExactlyOnceWith({ fecha_desde: '2026-11-15', fecha_hasta: '2026-11-15', limit: 240 });
  expect(api.completed).toHaveBeenCalledExactlyOnceWith({ fecha_desde: '2026-11-15', fecha_hasta: '2026-11-15', limit: 240 });
  for (const [name, value] of [['Citas totales', '2'], ['Citas completadas', '1'], ['Citas restantes', '1']]) {
    const node = [...view.container.querySelectorAll('p')].find(p => p.textContent.toLowerCase() === name.toLowerCase());
    expect(node?.nextElementSibling?.textContent).toBe(value);
  }
});
