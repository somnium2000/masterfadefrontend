// @vitest-environment jsdom

import React, { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import PublicBookingBarberosStep from '../PublicBookingBarberosStep.jsx';
import { PublicBookingProvider } from '../BookingFlowContext.jsx';
import useBookingCatalogs from '../hooks/useBookingCatalogs.js';
import { createBookingBlock } from '../utils/bookingMappers.js';

const api = vi.hoisted(() => ({
  getPublicBookingContext: vi.fn(), getClienteMembershipEstado: vi.fn(),
  listPublicAgendaBarberos: vi.fn(), listPublicAgendaPromociones: vi.fn(),
  listPublicCatalogServicios: vi.fn(), listPublicCatalogPaquetes: vi.fn(),
}));
vi.mock('../publicBookingApi.js', () => api);
const SUYAPA = '21355bf5-3ebc-4c7f-b16a-19e2ba2fe041';
const OTHER = '11111111-1111-4111-8111-111111111111';
const BARBER = { id_empleado: '9f7192ec-f8ee-41be-91c4-b0f4024e63a2', nombre_completo: 'QA Fase2 Promos Barbero' };
const OTHER_BARBER = { id_empleado: '22222222-2222-4222-8222-222222222222', nombre_completo: 'Otro Barbero' };
const branches = [{ id_sucursal: SUYAPA, nombre_sucursal: 'MasterFade Blvd. Suyapa' },
  { id_sucursal: OTHER, nombre_sucursal: 'Otra sucursal test' }];

function Harness() {
  const [blocks, setBookingBlocks] = useState(() => [createBookingBlock()]);
  const catalogs = useBookingCatalogs({ activeBlockBarberId: blocks[0]?.idBarbero, setBookingBlocks });
  const selectBranch = (id) => {
    if (!id || id === catalogs.selectedBranchId) return;
    setBookingBlocks([createBookingBlock()]);
    catalogs.setSelectedBranchId(id);
  };
  return <PublicBookingProvider value={{ ...catalogs, selectBranch }}>
    <output data-testid="react-branch">{catalogs.selectedBranchId}</output>
    <output data-testid="active-barber">{blocks[0]?.idBarbero}</output>
    <output data-testid="barber-count">{catalogs.barbers.length}</output>
    <PublicBookingBarberosStep />
  </PublicBookingProvider>;
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function ready() {
  render(<Harness />);
  await screen.findByRole('option', { name: 'MasterFade Blvd. Suyapa' });
  return screen.getByRole('combobox', { name: 'Sucursal' });
}
beforeEach(() => {
  vi.resetAllMocks();
  api.getPublicBookingContext.mockResolvedValue({ ok: true, data: { sucursales: branches, parametros: {} } });
  api.listPublicAgendaBarberos.mockImplementation(({ id_sucursal }) => Promise.resolve({
    ok: true, data: { barberos: [id_sucursal === SUYAPA ? BARBER : OTHER_BARBER] },
  }));
  api.listPublicCatalogServicios.mockResolvedValue({ ok: true, data: { servicios: [] } });
  api.listPublicCatalogPaquetes.mockResolvedValue({ ok: true, data: { paquetes: [] } });
  api.listPublicAgendaPromociones.mockResolvedValue({ ok: true, data: { promociones: [] } });
});
afterEach(cleanup);

test('A varias sucursales: DOM y React vacios, placeholder explicito y ninguna consulta de barberos', async () => {
  const select = await ready();
  expect(screen.getByTestId('react-branch').textContent).toBe('');
  expect(select).toHaveValue('');
  expect(select.selectedOptions[0].textContent).toBe('Selecciona una sucursal');
  expect(select.selectedOptions[0].disabled).toBe(true);
  expect(api.listPublicAgendaBarberos).not.toHaveBeenCalled();
});

test('B seleccionar Suyapa dispara exactamente su consulta inicial', async () => {
  const pending = deferred();
  api.listPublicAgendaBarberos.mockReturnValue(pending.promise);
  const select = await ready();
  fireEvent.change(select, { target: { value: SUYAPA } });
  await waitFor(() => expect(api.listPublicAgendaBarberos).toHaveBeenCalledTimes(1));
  expect(api.listPublicAgendaBarberos).toHaveBeenCalledWith({ id_sucursal: SUYAPA },
    expect.objectContaining({ signal: expect.any(AbortSignal), dedupe: false, cache: false }));
  expect(screen.getByTestId('react-branch')).toHaveTextContent(SUYAPA);
});

test('C data.barberos de API renderiza una BarberCard real', async () => {
  fireEvent.change(await ready(), { target: { value: SUYAPA } });
  await screen.findByRole('button', { name: 'Seleccionar a QA Fase2 Promos Barbero' });
  expect(document.querySelectorAll('button.public-booking-barber-card')).toHaveLength(1);
  expect(screen.getByTestId('barber-count')).toHaveTextContent('1');
});

test('D fallback cambia activeBlockBarberId: refetch no borra el barbero mientras espera', async () => {
  const second = deferred();
  api.listPublicAgendaBarberos.mockResolvedValueOnce({ ok: true, data: { barberos: [BARBER] } })
    .mockReturnValueOnce(second.promise);
  fireEvent.change(await ready(), { target: { value: SUYAPA } });
  await waitFor(() => expect(api.listPublicAgendaBarberos).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId('active-barber')).toHaveTextContent(BARBER.id_empleado);
  expect(screen.getByRole('button', { name: 'Seleccionar a QA Fase2 Promos Barbero' })).toBeVisible();
  await act(async () => second.resolve({ ok: true, data: { barberos: [BARBER] } }));
  expect(screen.getByTestId('barber-count')).toHaveTextContent('1');
  expect(api.listPublicAgendaBarberos.mock.calls.every(([params]) => params.id_sucursal === SUYAPA)).toBe(true);
});

test('E cambiar sucursal carga lista nueva y limpia el barbero anterior al completarse', async () => {
  const select = await ready();
  fireEvent.change(select, { target: { value: SUYAPA } });
  await waitFor(() => expect(screen.getByTestId('active-barber')).toHaveTextContent(BARBER.id_empleado));
  fireEvent.change(select, { target: { value: OTHER } });
  await screen.findByRole('button', { name: 'Seleccionar a Otro Barbero' });
  await waitFor(() => expect(screen.getByTestId('active-barber')).toHaveTextContent(OTHER_BARBER.id_empleado));
  expect(screen.queryByRole('button', { name: 'Seleccionar a QA Fase2 Promos Barbero' })).toBeNull();
  expect(select).toHaveValue(OTHER);
});

test('F respuesta stale aun si ignora abort no pisa la sucursal actual', async () => {
  const stale = deferred();
  let oldSignal;
  api.listPublicAgendaBarberos.mockImplementation(({ id_sucursal }, { signal }) => {
    if (id_sucursal === SUYAPA) { oldSignal = signal; return stale.promise; }
    return Promise.resolve({ ok: true, data: { barberos: [OTHER_BARBER] } });
  });
  const select = await ready();
  fireEvent.change(select, { target: { value: SUYAPA } });
  await waitFor(() => expect(oldSignal).toBeDefined());
  fireEvent.change(select, { target: { value: OTHER } });
  await screen.findByRole('button', { name: 'Seleccionar a Otro Barbero' });
  expect(oldSignal.aborted).toBe(true);
  await act(async () => stale.resolve({ ok: true, data: { barberos: [BARBER] } }));
  expect(screen.getByTestId('react-branch')).toHaveTextContent(OTHER);
  expect(screen.queryByRole('button', { name: 'Seleccionar a QA Fase2 Promos Barbero' })).toBeNull();
  expect(screen.getByTestId('barber-count')).toHaveTextContent('1');
});

test('una sola sucursal sigue autoseleccionada y carga su barbero', async () => {
  api.getPublicBookingContext.mockResolvedValue({ ok: true, data: { sucursales: [branches[0]], parametros: {} } });
  const select = await ready();
  await screen.findByRole('button', { name: 'Seleccionar a QA Fase2 Promos Barbero' });
  expect(select).toHaveValue(SUYAPA);
  expect(screen.queryByRole('option', { name: 'Selecciona una sucursal' })).toBeNull();
});
