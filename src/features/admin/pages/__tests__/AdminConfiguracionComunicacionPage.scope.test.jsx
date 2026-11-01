// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import Page from '../AdminConfiguracionComunicacionPage.jsx';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const api = vi.hoisted(() => ({
  listAdminConfigComunicacionCampanias: vi.fn(), getAdminConfigComunicacionCampania: vi.fn(),
  getAdminConfigComunicacionElegibilidad: vi.fn(), listAdminConfigComunicacionElegibilidadDestinatarios: vi.fn(),
  listAdminConfigComunicacionCampaniaEnvios: vi.fn(), createAdminConfigComunicacionCampania: vi.fn(), updateAdminConfigComunicacionCampania: vi.fn(),
  programAdminConfigComunicacionCampania: vi.fn(), sendAdminConfigComunicacionCampania: vi.fn(), retryFailedAdminConfigComunicacionCampania: vi.fn(), cancelAdminConfigComunicacionCampania: vi.fn(),
}));
const notifications = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
const auth = vi.hoisted(() => ({ roles: ['admin'], user: { id_usuario: 'actor-a' } }));
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => auth }));
vi.mock('../../lib/adminConfiguracionApi.js', () => api);
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => notifications }));
vi.mock('../../../../components/data/CardsCarousel.jsx', () => ({ default: ({ items, renderItem }) => <div>{items.map((item) => <div key={item.id_campania}>{renderItem(item)}</div>)}</div> }));
vi.mock('../../../../components/data/LoadingSpinner.jsx', () => ({ default: () => <p role="status">Cargando consulta</p> }));

function campaign(id = A) {
  const label = id === A ? 'A' : 'B';
  return { id_campania: id, nombre_interno: `Campaña ${label}`, asunto: `Asunto ${label}`, contenido_texto: `Contenido ${label}`,
    observaciones: `Observaciones ${label}`, tipo_campania: 'informativa', canal: 'email', estado: 'borrador', programada_para: id === A ? '2027-01-01T12:00:00Z' : '2027-02-01T13:00:00Z' };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function panel() { return within(document.querySelectorAll('article')[1]); }
async function pick(id) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Campaña ${id === A ? 'A' : 'B'}`) }));
}
beforeEach(() => {
  auth.roles = ['admin']; auth.user = { id_usuario: 'actor-a' };
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Object.values(api).forEach((mock) => mock.mockReset());
  Object.values(notifications).forEach((mock) => mock.mockReset());
  api.listAdminConfigComunicacionCampanias.mockResolvedValue({ data: { campanias: [campaign(A), campaign(B)], total: 2, offset: 0 } });
  api.getAdminConfigComunicacionCampania.mockImplementation((id) => Promise.resolve({ data: { campania: campaign(id) } }));
  api.getAdminConfigComunicacionElegibilidad.mockImplementation((id) => Promise.resolve({ data: { tipo_campania: 'informativa', resumen: { total_clientes_evaluados: id === A ? 11 : 22, total_elegibles: 1, total_excluidos: 1 } } }));
  api.listAdminConfigComunicacionElegibilidadDestinatarios.mockImplementation((id, { estado }) => Promise.resolve({ data: { destinatarios: [{ id_cliente: 'cliente-compartido', nombre_cliente: `${estado} ${id === A ? 'A' : 'B'}`, correo_destino: `${estado}@example.test`, motivo_exclusion: estado === 'excluido' ? 'sin_correo' : null }] } }));
  api.listAdminConfigComunicacionCampaniaEnvios.mockImplementation((id) => Promise.resolve({ data: { envios: [{ id_envio: id, nombre_cliente: `Envio ${id === A ? 'A' : 'B'}`, correo_destino: 'envio@example.test', estado_envio: 'pendiente' }], total: id === A ? 10 : 20 } }));
  api.createAdminConfigComunicacionCampania.mockResolvedValue({ data: { campania: campaign(B) } });
  api.updateAdminConfigComunicacionCampania.mockResolvedValue({ data: { campania: campaign(A) } });
});
afterEach(() => {
  for (const key of ['programAdminConfigComunicacionCampania', 'sendAdminConfigComunicacionCampania', 'retryFailedAdminConfigComunicacionCampania', 'cancelAdminConfigComunicacionCampania']) expect(api[key]).not.toHaveBeenCalled();
  cleanup();
});

test('QA11 historial no presenta diagnóstico técnico aunque llegue de una versión anterior', async () => {
  api.listAdminConfigComunicacionCampaniaEnvios.mockResolvedValue({ data: { envios: [{ id_envio: A, estado_envio: 'fallido', ultimo_error: 'smtp internal.test token=SYNTHETIC /private/key' }], total: 1 } });
  render(<Page />);
  expect(await screen.findByText('No se pudo enviar el correo. Reintenta más tarde.')).toBeInTheDocument();
  expect(screen.queryByText(/internal.test|SYNTHETIC|private\/key/)).not.toBeInTheDocument();
});

test('QA13: listado no expone mensaje técnico arbitrario', async () => {
  api.listAdminConfigComunicacionCampanias.mockRejectedValue({ message: 'ECONNREFUSED private.internal password=SYNTHETIC' }); render(<Page />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo completar la operación en este momento.');
});
test('QA13: cambio de identidad limpia campaña y editor anterior', async () => {
  const view = render(<Page />); await pick(A); await screen.findByText('Asunto A');
  auth.user = { id_usuario: 'actor-b' }; api.listAdminConfigComunicacionCampanias.mockResolvedValue({ data: { campanias: [], total: 0, offset: 0 } }); view.rerender(<Page />);
  expect(screen.queryByText('Asunto A')).not.toBeInTheDocument();
});
test('QA13: doble guardado emite un solo borrador', async () => {
  const pending = deferred(); api.createAdminConfigComunicacionCampania.mockReturnValue(pending.promise);
  render(<Page />); await panel().findByText('Campaña A'); fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
  const fields = panel().getAllByRole('textbox').filter(field => !field.disabled);
  ['Nombre sintético','Asunto sintético','Contenido sintético','Notas'].forEach((value, index) => fireEvent.change(fields[index], { target: { value } }));
  const button = screen.getByRole('button', { name: 'Crear borrador' }); act(() => { button.click(); button.click(); });
  expect(api.createAdminConfigComunicacionCampania).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ data: { campania: campaign(B) } }));
});

test('Cancelar sin cambios cierra inmediatamente y con cambios solicita confirmacion', async () => {
  render(<Page />); await panel().findByText('Campaña A');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('heading', { name: '¿Descartar los cambios?' })).not.toBeInTheDocument();
  expect(panel().getByText('Campaña A')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
  const fields = panel().getAllByRole('textbox').filter(field => !field.disabled);
  fireEvent.change(fields[0], { target: { value: 'Borrador pendiente' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByRole('heading', { name: '¿Descartar los cambios?' })).toBeInTheDocument();
});

test('Seguir editando conserva todos los campos y Descartar ejecuta el cierre pendiente', async () => {
  render(<Page />); await panel().findByText('Campaña A');
  fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
  const values = ['Nombre pendiente', 'Asunto pendiente', 'Contenido pendiente', 'Notas pendientes'];
  const fields = panel().getAllByRole('textbox').filter(field => !field.disabled);
  values.forEach((value, index) => fireEvent.change(fields[index], { target: { value } }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  values.forEach(value => expect(screen.getByDisplayValue(value)).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
  expect(screen.queryByRole('heading', { name: 'Nueva campaña borrador' })).not.toBeInTheDocument();
  values.forEach(value => expect(screen.queryByDisplayValue(value)).not.toBeInTheDocument());
});

test('Nueva campaña protege la edicion actual y renueva el snapshot al descartar', async () => {
  render(<Page />); await panel().findByText('Campaña A');
  fireEvent.click(screen.getByRole('button', { name: 'Editar borrador' }));
  const name = await screen.findByDisplayValue('Campaña A');
  fireEvent.change(name, { target: { value: 'Campaña A modificada' } });
  fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
  expect(screen.getByDisplayValue('Campaña A modificada')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
  expect(screen.getByRole('heading', { name: 'Nueva campaña borrador' })).toBeInTheDocument();
  expect(panel().getAllByRole('textbox').filter(field => !field.disabled)[0]).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('heading', { name: '¿Descartar los cambios?' })).not.toBeInTheDocument();
});

test('cambiar de A a B exige descarte; rechazar no consulta B y confirmar si lo hace', async () => {
  render(<Page />); await panel().findByText('Campaña A');
  fireEvent.click(screen.getByRole('button', { name: 'Editar borrador' }));
  fireEvent.change(await screen.findByDisplayValue('Campaña A'), { target: { value: 'A sin guardar' } });
  const callsBefore = api.getAdminConfigComunicacionCampania.mock.calls.filter(([id]) => id === B).length;
  await pick(B);
  expect(screen.getByRole('heading', { name: '¿Descartar los cambios?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  expect(screen.getByDisplayValue('A sin guardar')).toBeInTheDocument();
  expect(api.getAdminConfigComunicacionCampania.mock.calls.filter(([id]) => id === B)).toHaveLength(callsBefore);

  await pick(B);
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }));
  await panel().findByText('Campaña B');
  expect(api.getAdminConfigComunicacionCampania.mock.calls.filter(([id]) => id === B)).toHaveLength(callsBefore + 1);
});

test('guardado fallido conserva valores, no pierde snapshot y permite reintentar', async () => {
  api.updateAdminConfigComunicacionCampania.mockRejectedValueOnce(new Error('SYNTHETIC')).mockResolvedValueOnce({ data: { campania: campaign(A) } });
  render(<Page />); await panel().findByText('Campaña A');
  fireEvent.click(screen.getByRole('button', { name: 'Editar borrador' }));
  fireEvent.change(await screen.findByDisplayValue('Campaña A'), { target: { value: 'Cambio recuperable' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.updateAdminConfigComunicacionCampania).toHaveBeenCalledTimes(1));
  expect(screen.getByDisplayValue('Cambio recuperable')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.getByRole('heading', { name: '¿Descartar los cambios?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.updateAdminConfigComunicacionCampania).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Editar campaña borrador' })).not.toBeInTheDocument());
  expect(screen.queryByRole('heading', { name: '¿Descartar los cambios?' })).not.toBeInTheDocument();
});

test('guardado pendiente bloquea Cancelar, Nueva y cambio de campaña sin confirmaciones duplicadas', async () => {
  const pending = deferred(); api.updateAdminConfigComunicacionCampania.mockReturnValue(pending.promise);
  render(<Page />); await panel().findByText('Campaña A');
  fireEvent.click(screen.getByRole('button', { name: 'Editar borrador' }));
  fireEvent.change(await screen.findByDisplayValue('Campaña A'), { target: { value: 'Guardando A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.updateAdminConfigComunicacionCampania).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Nueva' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Campaña B/ })).toBeDisabled();
  expect(screen.queryByRole('heading', { name: '¿Descartar los cambios?' })).not.toBeInTheDocument();
  await act(async () => pending.resolve({ data: { campania: campaign(A) } }));
});

test.each(['success', 'error'])('listado antiguo (%s) no sustituye busqueda vigente', async (outcome) => {
  const pending = deferred();
  api.listAdminConfigComunicacionCampanias.mockImplementation(({ q }) => q === 'A' ? pending.promise : Promise.resolve({ data: { campanias: q === 'B' ? [campaign(B)] : [], total: q === 'B' ? 1 : 0, offset: 0 } }));
  render(<Page />);
  fireEvent.change(screen.getByPlaceholderText('Buscar nombre o asunto'), { target: { value: 'A' } });
  fireEvent.change(screen.getByPlaceholderText('Buscar nombre o asunto'), { target: { value: 'B' } });
  await screen.findByText('Mostrando 1-1 de 1 campañas');
  await act(async () => outcome === 'success' ? pending.resolve({ data: { campanias: [campaign(A)], total: 200, offset: 100 } }) : pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(screen.getByText('Mostrando 1-1 de 1 campañas')).toBeInTheDocument();
  expect(screen.queryByText('Error antiguo')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Campaña A/ })).not.toBeInTheDocument();
  expect(api.listAdminConfigComunicacionCampanias.mock.calls.every(([params]) => params.offset === 0)).toBe(true);
});

test('detalle A tardio no reemplaza campaña B', async () => {
  const pending = deferred();
  api.getAdminConfigComunicacionCampania.mockImplementation((id) => id === A ? pending.promise : Promise.resolve({ data: { campania: campaign(B) } }));
  render(<Page />); await pick(B);
  await panel().findByText('Campaña B');
  await act(async () => pending.resolve({ data: { campania: campaign(A) } }));
  expect(panel().getByText('Campaña B')).toBeInTheDocument();
  expect(panel().queryByText('Campaña A')).not.toBeInTheDocument();
});

test.each(['eligibility', 'shipments'])('%s A tardio no se mezcla con B', async (kind) => {
  const pending = deferred();
  if (kind === 'eligibility') api.listAdminConfigComunicacionElegibilidadDestinatarios.mockImplementation((id, { estado }) => id === A ? pending.promise : Promise.resolve({ data: { destinatarios: [{ id_cliente: `${estado}-B`, nombre_cliente: `${estado} B` }] } }));
  else api.listAdminConfigComunicacionCampaniaEnvios.mockImplementation((id) => id === A ? pending.promise : Promise.resolve({ data: { envios: [{ id_envio: B, nombre_cliente: 'Envio B' }], total: 20 } }));
  render(<Page />);
  await waitFor(() => expect(api.getAdminConfigComunicacionCampania).toHaveBeenCalledWith(A));
  await waitFor(() => expect(kind === 'eligibility' ? api.listAdminConfigComunicacionElegibilidadDestinatarios : api.listAdminConfigComunicacionCampaniaEnvios).toHaveBeenCalled());
  await pick(B);
  await panel().findByText('Campaña B');
  await act(async () => pending.resolve({ data: kind === 'eligibility' ? { destinatarios: [{ id_cliente: A, nombre_cliente: 'Destinatario A antiguo' }] } : { envios: [{ id_envio: A, nombre_cliente: 'Envio A antiguo' }], total: 10 } }));
  expect(panel().getByText('Campaña B')).toBeInTheDocument();
  expect(screen.queryAllByText('Destinatario A antiguo')).toHaveLength(0);
  expect(screen.queryByText('Envio A antiguo')).not.toBeInTheDocument();
});

test('loading del listado permanece hasta terminar solicitud B', async () => {
  const a = deferred(), b = deferred();
  api.listAdminConfigComunicacionCampanias.mockImplementation(({ q }) => q === 'A' ? a.promise : q === 'B' ? b.promise : Promise.resolve({ data: { campanias: [], total: 0, offset: 0 } }));
  render(<Page />);
  fireEvent.change(screen.getByPlaceholderText('Buscar nombre o asunto'), { target: { value: 'A' } });
  fireEvent.change(screen.getByPlaceholderText('Buscar nombre o asunto'), { target: { value: 'B' } });
  await act(async () => a.resolve({ data: { campanias: [campaign(A)], total: 1, offset: 0 } }));
  expect(within(document.querySelectorAll('article')[0]).getByRole('status')).toBeInTheDocument();
  await act(async () => b.resolve({ data: { campanias: [campaign(B)], total: 1, offset: 0 } }));
  expect(screen.getByText('Mostrando 1-1 de 1 campañas')).toBeInTheDocument();
});

test('detalle previo desaparece inmediatamente al seleccionar B', async () => {
  render(<Page />); await panel().findByText('Campaña A');
  const pending = deferred(); api.getAdminConfigComunicacionCampania.mockImplementation(() => pending.promise);
  await pick(B);
  expect(panel().queryByText('Campaña A')).not.toBeInTheDocument();
  expect(panel().getByRole('status')).toBeInTheDocument();
  await act(async () => pending.resolve({ data: { campania: campaign(B) } }));
  expect(panel().getByText('Campaña B')).toBeInTheDocument();
  expect(document.querySelector('input[type="datetime-local"]').value).toContain('2027-02-01');
});

test('apertura antigua de editor no reemplaza Nueva campaña', async () => {
  render(<Page />); await panel().findByText('Campaña A');
  const pending = deferred(); api.getAdminConfigComunicacionCampania.mockImplementation(() => pending.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Editar borrador' }));
  fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
  await act(async () => pending.resolve({ data: { campania: campaign(A) } }));
  expect(panel().getByRole('heading', { name: 'Nueva campaña borrador' })).toBeInTheDocument();
  expect(screen.queryByDisplayValue('Campaña A')).not.toBeInTheDocument();
});

test.each(['detail', 'eligibility', 'shipments'])('error tardio %s de A no altera B', async (kind) => {
  const pending = deferred();
  if (kind === 'detail') api.getAdminConfigComunicacionCampania.mockImplementation((id) => id === A ? pending.promise : Promise.resolve({ data: { campania: campaign(B) } }));
  if (kind === 'eligibility') api.getAdminConfigComunicacionElegibilidad.mockImplementation((id) => id === A ? pending.promise : Promise.resolve({ data: { resumen: { total_elegibles: 1 } } }));
  if (kind === 'shipments') api.listAdminConfigComunicacionCampaniaEnvios.mockImplementation((id) => id === A ? pending.promise : Promise.resolve({ data: { envios: [{ id_envio: B, nombre_cliente: 'Envio B' }], total: 20 } }));
  render(<Page />);
  const selectedMock = kind === 'detail' ? api.getAdminConfigComunicacionCampania : kind === 'eligibility' ? api.getAdminConfigComunicacionElegibilidad : api.listAdminConfigComunicacionCampaniaEnvios;
  await waitFor(() => expect(selectedMock.mock.calls.some(([id]) => id === A)).toBe(true));
  await pick(B); await panel().findByText('Campaña B');
  await act(async () => pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(panel().getByText('Campaña B')).toBeInTheDocument();
  expect(screen.queryByText('Error antiguo')).not.toBeInTheDocument();
  expect(notifications.error).not.toHaveBeenCalled();
});

test('selecciones y exclusiones manuales se preservan al refrescar A, pero no pasan a B', async () => {
  render(<Page />); await panel().findByText('Campaña A');
  document.querySelectorAll('details').forEach((item) => { item.open = true; });
  fireEvent.click(screen.getByRole('checkbox', { name: /elegible A/ }));
  const audience = screen.getByText('Control operativo de audiencia').closest('details');
  fireEvent.click(within(audience).getByRole('button', { name: 'Actualizar' }));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /elegible A/ })).toBeChecked());
  fireEvent.click(screen.getByRole('button', { name: 'Excluir seleccionados' }));
  expect(screen.getByRole('checkbox', { name: /elegible A/ })).toBeDisabled();
  fireEvent.click(within(audience).getByRole('button', { name: 'Actualizar' }));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /elegible A/ })).toBeDisabled());
  await pick(B); await panel().findByText('Campaña B');
  document.querySelectorAll('details').forEach((item) => { item.open = true; });
  expect(screen.getByRole('checkbox', { name: /elegible B/ })).not.toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /elegible B/ })).not.toBeChecked();
  expect(screen.queryByText('Excluido manualmente')).not.toBeInTheDocument();
});

test('filtros, orden y offset ignoran respuestas de criterios anteriores', async () => {
  const pending = deferred();
  api.listAdminConfigComunicacionCampanias.mockImplementation(({ estado_operativo, sort }) => estado_operativo === 'borrador' && sort === 'updated_desc' ? pending.promise : Promise.resolve({ data: { campanias: [campaign(B)], total: 1, offset: 0 } }));
  render(<Page />); await screen.findByText('Mostrando 1-1 de 1 campañas');
  fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
  fireEvent.change(screen.getByRole('option', { name: 'Borrador' }).parentElement, { target: { value: 'borrador' } });
  fireEvent.change(screen.getByRole('option', { name: 'Antiguas primero' }).parentElement, { target: { value: 'created_asc' } });
  await waitFor(() => expect(api.listAdminConfigComunicacionCampanias).toHaveBeenCalledWith(expect.objectContaining({ estado_operativo: 'borrador', sort: 'created_asc', limit: 100, offset: 0 })));
  await act(async () => pending.resolve({ data: { campanias: [campaign(A)], total: 300, offset: 200 } }));
  expect(screen.getByText('Mostrando 1-1 de 1 campañas')).toBeInTheDocument();
  expect(api.listAdminConfigComunicacionCampanias.mock.calls.every(([params]) => params.offset === 0)).toBe(true);
});

test('StrictMode conserva consultas y advertencia, sin ejecutar campañas', async () => {
  render(<StrictMode><Page /></StrictMode>);
  await panel().findByText('Campaña A');
  expect(screen.getByText(/Programar no envía inmediatamente/)).toHaveTextContent(/aproximadamente 24 horas después/);
  expect(screen.getByText(/Programar no envía inmediatamente/)).toHaveTextContent(/programación automática habilitada y SMTP configurado/);
  expect(api.getAdminConfigComunicacionElegibilidad).toHaveBeenCalledWith(A, { limit_elegibles: 10, limit_excluidos: 10 });
  expect(api.listAdminConfigComunicacionCampaniaEnvios).toHaveBeenCalledWith(A, { limit: 50, offset: 0 });
});

test('desmontaje descarta todas las consultas pendientes sin notificar', async () => {
  const pending = deferred();
  api.getAdminConfigComunicacionCampania.mockImplementation(() => pending.promise);
  const view = render(<Page />);
  await waitFor(() => expect(api.getAdminConfigComunicacionCampania).toHaveBeenCalledWith(A));
  view.unmount();
  await act(async () => pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  expect(notifications.error).not.toHaveBeenCalled();
});

test('una falla de consulta no borra exclusiones manuales de la misma campaña', async () => {
  render(<Page />); await panel().findByText('Campaña A');
  document.querySelectorAll('details').forEach((item) => { item.open = true; });
  fireEvent.click(screen.getByRole('checkbox', { name: /elegible A/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Excluir seleccionados' }));
  const audience = screen.getByText('Control operativo de audiencia').closest('details');
  api.getAdminConfigComunicacionElegibilidad.mockRejectedValueOnce({ data: { error: { message: 'Consulta no disponible' } } });
  fireEvent.click(within(audience).getByRole('button', { name: 'Actualizar' }));
  await screen.findByText('No se pudo completar la operación en este momento.');
  fireEvent.click(within(audience).getByRole('button', { name: 'Actualizar' }));
  await waitFor(() => expect(screen.getByRole('checkbox', { name: /elegible A/ })).toBeDisabled());
});

test.each(['success', 'error'])('guardado pendiente (%s) bloquea el cambio a B y conserva el resultado correcto', async (outcome) => {
  const pending = deferred(); api.updateAdminConfigComunicacionCampania.mockImplementation(() => pending.promise);
  render(<Page />); await panel().findByText('Campaña A');
  fireEvent.click(screen.getByRole('button', { name: 'Editar borrador' }));
  await screen.findByRole('heading', { name: 'Editar campaña borrador' });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.updateAdminConfigComunicacionCampania).toHaveBeenCalledTimes(1));
  await pick(B);
  expect(screen.getByDisplayValue('Campaña A')).toBeDisabled();
  await act(async () => outcome === 'success' ? pending.resolve({ data: { campania: campaign(A) } }) : pending.reject({ data: { error: { message: 'Error antiguo' } } }));
  if (outcome === 'success') {
    await waitFor(() => expect(notifications.success).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'Editar campaña borrador' })).not.toBeInTheDocument();
  } else {
    await waitFor(() => expect(notifications.error).toHaveBeenCalledTimes(1));
    expect(screen.getByDisplayValue('Campaña A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).not.toBeDisabled();
  }
  expect(api.updateAdminConfigComunicacionCampania).toHaveBeenCalledTimes(1);
});

test('detalle exitoso despues del desmontaje no encadena otras consultas', async () => {
  const pending = deferred(); api.getAdminConfigComunicacionCampania.mockImplementation(() => pending.promise);
  const view = render(<Page />);
  await waitFor(() => expect(api.getAdminConfigComunicacionCampania).toHaveBeenCalledWith(A));
  view.unmount();
  await act(async () => pending.resolve({ data: { campania: campaign(A) } }));
  expect(api.getAdminConfigComunicacionElegibilidad).not.toHaveBeenCalled();
  expect(api.listAdminConfigComunicacionCampaniaEnvios).not.toHaveBeenCalled();
  expect(api.listAdminConfigComunicacionElegibilidadDestinatarios).not.toHaveBeenCalled();
});

test.each(['create', 'edit'])('borrador %s conserva contrato existente', async (mode) => {
  render(<Page />); await panel().findByText('Campaña A');
  if (mode === 'create') fireEvent.click(screen.getByRole('button', { name: 'Nueva' }));
  else { fireEvent.click(screen.getByRole('button', { name: 'Editar borrador' })); await screen.findByRole('heading', { name: 'Editar campaña borrador' }); }
  const fields = panel().getAllByRole('textbox');
  // AM: Controles existentes sin htmlFor; los dos primeros campos editables son nombre y asunto.
  const editable = fields.filter((field) => !field.disabled);
  fireEvent.change(editable[0], { target: { value: 'Nombre actualizado' } });
  fireEvent.change(editable[1], { target: { value: 'Asunto actualizado' } });
  fireEvent.change(editable[2], { target: { value: 'Contenido actualizado' } });
  fireEvent.change(editable[3], { target: { value: 'Notas actualizadas' } });
  fireEvent.click(screen.getByRole('button', { name: mode === 'create' ? 'Crear borrador' : 'Guardar cambios' }));
  const payload = { tipo_campania: 'informativa', nombre_interno: 'Nombre actualizado', asunto: 'Asunto actualizado', contenido_texto: 'Contenido actualizado', observaciones: 'Notas actualizadas' };
  await waitFor(() => mode === 'create' ? expect(api.createAdminConfigComunicacionCampania).toHaveBeenCalledWith(payload) : expect(api.updateAdminConfigComunicacionCampania).toHaveBeenCalledWith(A, payload));
  await waitFor(() => expect(notifications.success).toHaveBeenCalledTimes(1));
});
