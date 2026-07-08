// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  buildBookingHoldFingerprint,
  resolveBookingHoldIdempotencyKey,
} from '../bookingIdempotency.js';
import { extractMessage, mapPublicBookingErrorMessage } from '../bookingUtils.js';
import useBookingCatalogs from '../hooks/useBookingCatalogs.js';

const HOLD_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const HEADER_REQUEST_ID = '33333333-3333-4333-8333-333333333333';

const publicBookingApiMock = vi.hoisted(() => ({
  getPublicBookingContext: vi.fn(),
  listPublicAgendaBarberos: vi.fn(),
  listPublicAgendaPromociones: vi.fn(),
  listPublicCatalogPaquetes: vi.fn(),
  listPublicCatalogServicios: vi.fn(),
  createPublicCitaHold: vi.fn(),
  createClienteCitaHold: vi.fn(),
  releaseClienteCitaHold: vi.fn(),
  releasePublicCitaHold: vi.fn(),
  confirmClienteCitaHoldWithoutPayment: vi.fn(),
}));

const SUYAPA_BRANCH_ID = '21355bf5-3ebc-4c7f-b16a-19e2ba2fe041';

const bookingFlowMock = vi.hoisted(() => ({
  current: null,
}));

vi.mock('../publicBookingApi.js', () => publicBookingApiMock);
vi.mock('../BookingFlowContext.jsx', () => ({
  usePublicBookingFlow: () => bookingFlowMock.current,
}));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({
  useNotifications: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

async function importHttpClientFresh() {
  vi.resetModules();
  return import('../../../../services/httpClient.js');
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.pushState({}, '', '/');
  publicBookingApiMock.createPublicCitaHold.mockReset();
  publicBookingApiMock.getPublicBookingContext.mockReset();
  publicBookingApiMock.listPublicAgendaBarberos.mockReset();
  publicBookingApiMock.listPublicAgendaPromociones.mockReset();
  publicBookingApiMock.listPublicCatalogPaquetes.mockReset();
  publicBookingApiMock.listPublicCatalogServicios.mockReset();
  publicBookingApiMock.createClienteCitaHold.mockReset();
  publicBookingApiMock.releaseClienteCitaHold.mockReset();
  publicBookingApiMock.releasePublicCitaHold.mockReset();
  publicBookingApiMock.confirmClienteCitaHoldWithoutPayment.mockReset();
  bookingFlowMock.current = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('httpClient booking hardening', () => {
  test('401 de /v1/auth/me en /agendar queda como usuario no autenticado esperado', async () => {
    window.history.pushState({}, '', '/agendar');
    globalThis.fetch = vi.fn(async () => jsonResponse({
      ok: false,
      error: { code: 'AUTH_REQUIRED', message: 'No autorizado' },
    }, { status: 401 }));
    const { request } = await importHttpClientFresh();

    await expect(request('/v1/auth/me')).rejects.toMatchObject({
      status: 401,
      expectedUnauthenticated: true,
    });

    try {
      await request('/v1/auth/me');
    } catch (error) {
      expect(extractMessage(error)).toBe('');
    }
  });

  test('dedupe comparte la promesa efectiva para solicitudes GET iguales', async () => {
    let resolveFetch;
    globalThis.fetch = vi.fn(() => new Promise((resolve) => {
      resolveFetch = () => resolve(jsonResponse({ ok: true, data: { ready: true } }));
    }));
    const { http } = await importHttpClientFresh();

    const first = http.get('/v1/public/citas/contexto?id_sucursal=1');
    const second = http.get('/v1/public/citas/contexto?id_sucursal=1');
    expect(first).toBe(second);
    resolveFetch();
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('AbortSignal independientes no comparten una promesa cancelada', async () => {
    const pending = [];
    globalThis.fetch = vi.fn((url, init = {}) => new Promise((resolve, reject) => {
      const requestRecord = { url, init, resolve, reject };
      const abort = () => {
        const error = new DOMException('Aborted', 'AbortError');
        reject(error);
      };
      init.signal?.addEventListener('abort', abort, { once: true });
      pending.push(requestRecord);
    }));
    const { http } = await importHttpClientFresh();
    const firstController = new AbortController();
    const secondController = new AbortController();

    const first = http.get('/v1/public/citas/contexto', { signal: firstController.signal });
    const second = http.get('/v1/public/citas/contexto', { signal: secondController.signal });

    expect(first).not.toBe(second);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    firstController.abort();
    pending[1].resolve(jsonResponse({ ok: true, data: { sucursales: [{ id_sucursal: SUYAPA_BRANCH_ID }] } }));

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toMatchObject({ ok: true });
  });

  test('limpia solicitudes in-flight despues de un aborto y permite un nuevo fetch', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(abortError)
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: { retry: true } }));
    const { http } = await importHttpClientFresh();

    await expect(http.get('/v1/public/citas/contexto')).rejects.toMatchObject({ name: 'AbortError' });
    await expect(http.get('/v1/public/citas/contexto')).resolves.toMatchObject({ ok: true });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  test('cache corto se invalida por cambio de parametros', async () => {
    globalThis.fetch = vi.fn(async (url) => jsonResponse({
      ok: true,
      data: { url: String(url) },
    }));
    const { http } = await importHttpClientFresh();

    await http.get('/v1/public/agenda/disponibilidad?fecha=2026-07-01');
    await http.get('/v1/public/agenda/disponibilidad?fecha=2026-07-01');
    await http.get('/v1/public/agenda/disponibilidad?fecha=2026-07-02');

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('booking catalogs StrictMode', () => {
  const stableSetBookingBlocks = vi.fn();

  function CatalogProbe() {
    const catalogs = useBookingCatalogs({ setBookingBlocks: stableSetBookingBlocks });
    return (
      <div>
        <div data-testid="selected-branch">{catalogs.selectedBranchId}</div>
        <div data-testid="context-error">{catalogs.contextError}</div>
        <ul>
          {catalogs.branchList.map((branch) => (
            <li key={branch.id_sucursal}>{branch.nombre_sucursal}</li>
          ))}
        </ul>
        <ul>
          {catalogs.barbers.map((barber) => (
            <li key={barber.id_empleado}>{barber.nombre_completo}</li>
          ))}
        </ul>
        {!catalogs.contextLoading && !catalogs.contextError && catalogs.selectedBranchId && !catalogs.barbersLoading && catalogs.barbers.length === 0 ? (
          <span>Sin barberos disponibles</span>
        ) : null}
        {catalogs.contextError ? <button type="button" onClick={catalogs.fetchContext}>Reintentar</button> : null}
      </div>
    );
  }

  test('StrictMode recupera contexto y barberos despues de abortar el primer montaje', async () => {
    let contextCall = 0;
    publicBookingApiMock.getPublicBookingContext.mockImplementation(({ signal } = {}) => {
      contextCall += 1;
      if (contextCall === 1) {
        return new Promise((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        });
      }
      return Promise.resolve({
        ok: true,
        data: {
          sucursales: [{ id_sucursal: SUYAPA_BRANCH_ID, nombre_sucursal: 'MasterFade Blvd. Suyapa' }],
          parametros: {},
        },
      });
    });
    publicBookingApiMock.listPublicAgendaBarberos.mockResolvedValue({
      ok: true,
      data: {
        barberos: [{
          id_empleado: '33333333-3333-4333-8333-333333333333',
          nombre_completo: 'Carlos Barber',
        }],
      },
    });
    publicBookingApiMock.listPublicCatalogServicios.mockResolvedValue({ ok: true, data: { servicios: [] } });
    publicBookingApiMock.listPublicCatalogPaquetes.mockResolvedValue({ ok: true, data: { paquetes: [] } });
    publicBookingApiMock.listPublicAgendaPromociones.mockResolvedValue({ ok: true, data: { promociones: [] } });

    render(
      <React.StrictMode>
        <CatalogProbe />
      </React.StrictMode>
    );

    await screen.findByText('MasterFade Blvd. Suyapa');
    await screen.findByText('Carlos Barber');

    expect(screen.getByTestId('selected-branch').textContent).toBe(SUYAPA_BRANCH_ID);
    expect(publicBookingApiMock.listPublicAgendaBarberos).toHaveBeenCalledWith(
      { id_sucursal: SUYAPA_BRANCH_ID },
      expect.objectContaining({ dedupe: false, cache: false })
    );
    expect(screen.queryByText('Sin barberos disponibles')).toBeNull();
  });

  test('error real de contexto muestra error y accion de reintento sin falso vacio de barberos', async () => {
    publicBookingApiMock.getPublicBookingContext.mockRejectedValue(new Error('No se pudo consultar el contexto'));

    render(
      <CatalogProbe />
    );

    await screen.findByText('No se pudo consultar el contexto');
    expect(screen.getByRole('button', { name: /Reintentar/i })).toBeTruthy();
    expect(screen.queryByText('Sin barberos disponibles')).toBeNull();
    expect(publicBookingApiMock.listPublicAgendaBarberos).not.toHaveBeenCalled();
  });

  test('sucursal valida sin barberos muestra estado vacio solo despues de terminar la consulta', async () => {
    publicBookingApiMock.getPublicBookingContext.mockResolvedValue({
      ok: true,
      data: {
        sucursales: [{ id_sucursal: SUYAPA_BRANCH_ID, nombre_sucursal: 'MasterFade Blvd. Suyapa' }],
        parametros: {},
      },
    });
    publicBookingApiMock.listPublicAgendaBarberos.mockResolvedValue({ ok: true, data: { barberos: [] } });
    publicBookingApiMock.listPublicCatalogServicios.mockResolvedValue({ ok: true, data: { servicios: [] } });
    publicBookingApiMock.listPublicCatalogPaquetes.mockResolvedValue({ ok: true, data: { paquetes: [] } });
    publicBookingApiMock.listPublicAgendaPromociones.mockResolvedValue({ ok: true, data: { promociones: [] } });

    render(
      <CatalogProbe />
    );

    await screen.findByText('MasterFade Blvd. Suyapa');
    await screen.findByText('Sin barberos disponibles');
  });
});

describe('booking hold idempotency', () => {
  test('sessionStorage conserva la misma key para el mismo fingerprint y cambia con otro intento', () => {
    const fingerprint = buildBookingHoldFingerprint({
      mode: 'public',
      selectionFingerprint: 'branch:date:barber',
      payload: { ignoredWhenSelectionExists: true },
    });
    const sameA = resolveBookingHoldIdempotencyKey(fingerprint);
    const sameB = resolveBookingHoldIdempotencyKey(fingerprint);
    const other = resolveBookingHoldIdempotencyKey(`${fingerprint}:new`);

    expect(sameA).toBe(sameB);
    expect(other).not.toBe(sameA);
    expect(sameA).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('useBookingHold comparte promesa y POST para el mismo fingerprint', async () => {
    publicBookingApiMock.createPublicCitaHold.mockResolvedValue({
      request_id: REQUEST_ID,
      id_grupo_cita: HOLD_ID,
      estado_grupo_codigo: 'activo',
    });
    const { default: useBookingHold } = await import('../hooks/useBookingHold.js');
    const { result } = renderHook(() => useBookingHold({
      mode: 'public',
      isAuthenticatedBooking: false,
      selectionFingerprint: 'same-selection',
    }));

    let first;
    let second;
    await act(async () => {
      first = result.current.createHold({ id_sucursal: 'branch' });
      second = result.current.createHold({ id_sucursal: 'branch' });
      await Promise.all([first, second]);
    });

    expect(first).toBe(second);
    expect(publicBookingApiMock.createPublicCitaHold).toHaveBeenCalledTimes(1);
    expect(publicBookingApiMock.createPublicCitaHold.mock.calls[0][1].headers['x-idempotency-key']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('retry despues de error de red conserva la misma idempotency key', async () => {
    publicBookingApiMock.createPublicCitaHold
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        request_id: REQUEST_ID,
        id_grupo_cita: HOLD_ID,
        estado_grupo_codigo: 'activo',
      });
    const { default: useBookingHold } = await import('../hooks/useBookingHold.js');
    const { result } = renderHook(() => useBookingHold({
      mode: 'public',
      isAuthenticatedBooking: false,
      selectionFingerprint: 'retry-selection',
    }));

    await act(async () => {
      await expect(result.current.createHold({ id_sucursal: 'branch' })).rejects.toThrow('Failed to fetch');
    });
    await act(async () => {
      await result.current.createHold({ id_sucursal: 'branch' });
    });

    const firstKey = publicBookingApiMock.createPublicCitaHold.mock.calls[0][1].headers['x-idempotency-key'];
    const secondKey = publicBookingApiMock.createPublicCitaHold.mock.calls[1][1].headers['x-idempotency-key'];
    expect(secondKey).toBe(firstKey);
  });

  test('sincroniza request_id con header x-idempotency-key cuando el backend lo devuelve', async () => {
    const response = {
      request_id: REQUEST_ID,
      id_grupo_cita: HOLD_ID,
      estado_grupo_codigo: 'activo',
    };
    Object.defineProperty(response, '__meta', {
      value: { headers: { get: (name) => (name === 'x-idempotency-key' ? HEADER_REQUEST_ID : '') } },
    });
    publicBookingApiMock.createPublicCitaHold.mockResolvedValue(response);
    const { default: useBookingHold } = await import('../hooks/useBookingHold.js');
    const { result } = renderHook(() => useBookingHold({
      mode: 'public',
      isAuthenticatedBooking: false,
      selectionFingerprint: 'sync-selection',
    }));

    let hold;
    await act(async () => {
      hold = await result.current.createHold({ id_sucursal: 'branch' });
    });

    expect(hold.request_id).toBe(REQUEST_ID);
    const storedKey = publicBookingApiMock.createPublicCitaHold.mock.calls[0][1].headers['x-idempotency-key'];
    expect(resolveBookingHoldIdempotencyKey(buildBookingHoldFingerprint({
      mode: 'public',
      isAuthenticatedBooking: false,
      selectionFingerprint: 'sync-selection',
      payload: { id_sucursal: 'branch' },
    }))).toBe(HEADER_REQUEST_ID);
    expect(storedKey).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('booking UI hardening', () => {
  test('doble clic en confirmacion ejecuta un solo submitHold', async () => {
    const submitHold = vi.fn(() => new Promise((resolve) => {
      setTimeout(() => resolve({ id_grupo_cita: HOLD_ID, total_pagar_hnl: 100 }), 20);
    }));
    const startCheckout = vi.fn(async () => {});
    bookingFlowMock.current = {
      bookingBlocksSummary: [{
        id: 'block-1',
        alias: 'Titular',
        barbero: { nombre_completo: 'Barbero Uno' },
        selectedDate: '2026-07-15',
        selectedTime: '09:00',
        selection_type: 'services',
        total_hnl: 100,
        selectedServices: [{ id_servicio: 'svc-1', nombre_servicio: 'Corte', precio_hnl: 100 }],
      }],
      goToAgenda: vi.fn(),
      startCheckout,
      submitHold,
      confirmHoldWithoutPayment: vi.fn(),
      holdResult: null,
      holdPricing: { total_pagar_hnl: 100 },
      cancelBookingFlow: vi.fn(),
      canConfirmWithoutPayment: false,
      paymentRequired: true,
      membershipHasContext: false,
      membershipUxMessage: '',
      membershipAplicaEnCita: false,
      membershipCompanionNotice: '',
      mode: 'public',
      canUseClienteHold: true,
    };
    const { default: PublicBookingConfirmStep } = await import('../PublicBookingConfirmStep.jsx');

    render(<PublicBookingConfirmStep />);
    const button = screen.getByRole('button', { name: /Continuar al pago/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(startCheckout).toHaveBeenCalledTimes(1));
    expect(submitHold).toHaveBeenCalledTimes(1);
  });

  test('mensajes funcionales cubren mantenimiento, slot y red', () => {
    expect(mapPublicBookingErrorMessage('DB_SCHEMA_OUTDATED')).toBe('El servicio de reservas esta temporalmente en mantenimiento.');
    expect(mapPublicBookingErrorMessage('PUBLIC_CITAS_HOLD_CONFLICT')).toMatch(/hora seleccionada/i);
    expect(extractMessage(new TypeError('Failed to fetch'))).toMatch(/conectar con el servidor/i);
  });
});
