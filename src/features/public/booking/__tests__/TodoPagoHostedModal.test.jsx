// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import PublicBookingPaymentStep, {
  resolvePaymentSimulationAction,
} from '../PublicBookingPaymentStep.jsx';
import TodoPagoHostedModal, {
  TODO_PAGO_LOAD_TIMEOUT_MS,
} from '../components/TodoPagoHostedModal.jsx';

const bookingFlowMock = vi.hoisted(() => ({ current: null }));

vi.mock('../BookingFlowContext.jsx', () => ({
  usePublicBookingFlow: () => bookingFlowMock.current,
}));

const ALLOWED_ORIGIN = 'https://checkout.example.test';
const launch = {
  type: 'iframe_post',
  action: `${ALLOWED_ORIGIN}/modal`,
  method: 'POST',
  fields: {
    idTransaccion: 'transaction-private-value',
    opaqueSession: 'private-session-value',
    tenant: 'private-tenant-value',
  },
  allowedMessageOrigin: ALLOWED_ORIGIN,
  expiresAt: '2099-08-01T12:00:00.000Z',
};

function renderModal(overrides = {}) {
  const props = {
    open: true,
    launch,
    onResult: vi.fn(),
    onClose: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
  const view = render(<TodoPagoHostedModal {...props} />);
  return { ...view, props };
}

function dispatchProviderMessage(iframe, overrides = {}) {
  const event = new MessageEvent('message', {
    origin: ALLOWED_ORIGIN,
    source: iframe.contentWindow,
    data: {
      accion: 'Resultado',
      valor: JSON.stringify({ estado: 'recibido' }),
      ...overrides.data,
    },
    ...overrides,
  });
  fireEvent(window, event);
}

beforeEach(() => {
  vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('TodoPagoHostedModal', () => {
  test('crea y envia un formulario POST al iframe montado', async () => {
    renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    const form = document.querySelector('form');

    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));
    expect(form.method.toLowerCase()).toBe('post');
    expect(form.action).toBe(launch.action);
    expect(form.target).toBe(iframe.name);
    expect(iframe.name).toMatch(/^todopago-hosted-/);
  });

  test('crea inputs hidden correctos sin mostrar sus valores', async () => {
    renderModal();
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));

    const sessionInput = document.querySelector('input[name="opaqueSession"]');
    const tenantInput = document.querySelector('input[name="tenant"]');
    expect(sessionInput).toMatchObject({ type: 'hidden', value: 'private-session-value' });
    expect(tenantInput).toMatchObject({ type: 'hidden', value: 'private-tenant-value' });
    expect(screen.queryByText('private-session-value')).toBeNull();
    expect(screen.queryByText('private-tenant-value')).toBeNull();
  });

  test('rechaza postMessage con origin incorrecto', async () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));
    dispatchProviderMessage(iframe, { origin: 'https://attacker.example.test' });
    expect(props.onResult).not.toHaveBeenCalled();
  });

  test('rechaza postMessage con source incorrecto', async () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));
    dispatchProviderMessage(iframe, { source: window });
    expect(props.onResult).not.toHaveBeenCalled();
  });

  test('rechaza postMessage con JSON invalido', async () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));
    dispatchProviderMessage(iframe, { data: { accion: 'Resultado', valor: '{invalid-json' } });
    expect(props.onResult).not.toHaveBeenCalled();
  });

  test('acepta un resultado valido como senal visual', async () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));
    dispatchProviderMessage(iframe);
    expect(props.onResult).toHaveBeenCalledOnce();
    expect(props.onResult).toHaveBeenCalledWith({ estado: 'recibido' });
    expect(screen.getByText('Resultado recibido')).not.toBeNull();
  });

  test('cierra con Escape y restaura el foco previo', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { props, unmount } = renderModal();

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('dialog')));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledOnce();
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  test('cerrar y reabrir con un clon profundo del launch no ejecuta otro submit', async () => {
    const view = renderModal();
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));
    const clonedLaunch = JSON.parse(JSON.stringify(launch));
    clonedLaunch.fields = {
      tenant: clonedLaunch.fields.tenant,
      opaqueSession: clonedLaunch.fields.opaqueSession,
      idTransaccion: clonedLaunch.fields.idTransaccion,
    };

    view.rerender(<TodoPagoHostedModal {...view.props} launch={clonedLaunch} open={false} />);
    view.rerender(<TodoPagoHostedModal {...view.props} launch={clonedLaunch} open />);

    await screen.findByText('Lanzamiento ya enviado');
    expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['idTransaccion', (current) => ({
      ...current,
      fields: { ...current.fields, idTransaccion: 'next-transaction-private-value' },
    })],
    ['action', (current) => ({ ...current, action: `${ALLOWED_ORIGIN}/modal/new` })],
    ['fields', (current) => ({
      ...current,
      fields: { ...current.fields, tenant: 'next-private-tenant-value' },
    })],
  ])('un launch con %s diferente permite otro submit', async (_field, mutateLaunch) => {
    const view = renderModal();
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));
    const nextLaunch = mutateLaunch(launch);

    view.rerender(<TodoPagoHostedModal {...view.props} launch={nextLaunch} />);

    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(2));
  });

  test('acepta solo el primer postMessage valido del mismo launch', async () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));

    dispatchProviderMessage(iframe);
    dispatchProviderMessage(iframe, {
      data: { accion: 'Resultado', valor: JSON.stringify({ estado: 'duplicado' }) },
    });

    expect(props.onResult).toHaveBeenCalledOnce();
    expect(props.onResult).toHaveBeenCalledWith({ estado: 'recibido' });
  });

  test('la carga inicial de about:blank no marca el portal como abierto', async () => {
    renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));

    fireEvent.load(iframe);

    expect(screen.getByText('Cargando portal')).not.toBeNull();
    expect(screen.queryByText('Portal abierto')).toBeNull();
  });

  test('el timeout de carga reporta error una sola vez', async () => {
    vi.useFakeTimers();
    const { props } = renderModal();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_PAGO_LOAD_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(TODO_PAGO_LOAD_TIMEOUT_MS);
    });

    expect(props.onError).toHaveBeenCalledOnce();
    expect(props.onError).toHaveBeenCalledWith({ code: 'TODOPAGO_PORTAL_LOAD_TIMEOUT' });
    expect(screen.getByText('Error de carga')).not.toBeNull();
  });

  test('resultado valido cancela el watchdog de carga', async () => {
    vi.useFakeTimers();
    const { props } = renderModal();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const iframe = screen.getByTitle('Portal de pago TodoPago');

    dispatchProviderMessage(iframe);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_PAGO_LOAD_TIMEOUT_MS);
    });

    expect(props.onResult).toHaveBeenCalledOnce();
    expect(props.onError).not.toHaveBeenCalled();
    expect(screen.getByText('Resultado recibido')).not.toBeNull();
  });

  test('resultado valido cancela el temporizador de expiracion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    const expiringLaunch = { ...launch, expiresAt: '2026-08-01T12:00:05.000Z' };
    const { props } = renderModal({ launch: expiringLaunch });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const iframe = screen.getByTitle('Portal de pago TodoPago');

    dispatchProviderMessage(iframe);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(props.onResult).toHaveBeenCalledOnce();
    expect(props.onError).not.toHaveBeenCalled();
    expect(screen.getByText('Resultado recibido')).not.toBeNull();
  });

  test('error de carga cancela la expiracion y no vuelve a llamar onError', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));
    const expiringLaunch = { ...launch, expiresAt: '2026-08-01T12:01:00.000Z' };
    const { props } = renderModal({ launch: expiringLaunch });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(TODO_PAGO_LOAD_TIMEOUT_MS);
    });

    expect(props.onError).toHaveBeenCalledOnce();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TODO_PAGO_LOAD_TIMEOUT_MS);
    });

    expect(props.onError).toHaveBeenCalledOnce();
    expect(screen.getByText('Error de carga')).not.toBeNull();
  });

  test('cambiar launch limpia el resultado y error anteriores', async () => {
    const invalidLaunch = { ...launch, allowedMessageOrigin: '' };
    const view = renderModal({ launch: invalidLaunch });
    await screen.findByText('Error de carga');

    view.rerender(<TodoPagoHostedModal {...view.props} launch={launch} />);
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Error de carga')).toBeNull();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    dispatchProviderMessage(iframe);
    expect(screen.getByText('Resultado recibido')).not.toBeNull();

    const nextLaunch = {
      ...launch,
      action: `${ALLOWED_ORIGIN}/modal/retry`,
      fields: { opaqueSession: 'replacement-private-session-value' },
    };
    view.rerender(<TodoPagoHostedModal {...view.props} launch={nextLaunch} />);

    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Resultado recibido')).toBeNull();
    expect(screen.queryByText('Error de carga')).toBeNull();
    expect(screen.getByText('Cargando portal')).not.toBeNull();
  });
});

describe('integracion del shell TodoPago', () => {
  test.each(['qa.masterfadeapp.com', 'staging.masterfadeapp.com', 'masterfadeapp.com'])(
    'bloquea el simulador fuera de localhost: %s',
    (hostname) => {
      const action = resolvePaymentSimulationAction({
        hostname,
        provider: 'todopago',
        simulatorEnabled: 'true',
      });
      expect(action.canShow).toBe(false);
      expect(action.reason).toBe('host_not_allowed');
    }
  );

  test('postMessage valido solo cambia la senal visual y no confirma la reserva', async () => {
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'todopago');
    vi.stubEnv('VITE_ENABLE_PAYMENT_SIMULATOR', 'false');
    const refreshPaymentStatus = vi.fn();
    const completePaymentSimulation = vi.fn();
    const confirmHoldWithoutPayment = vi.fn();
    bookingFlowMock.current = {
      bookingBlocksSummary: [],
      cancelBookingFlow: vi.fn(),
      createPaymentIntentForHold: vi.fn(),
      creatingPaymentIntent: false,
      goToConfirm: vi.fn(),
      holdExpired: false,
      holdExpiresAtIso: '2099-08-01T12:00:00.000Z',
      holdRemainingMs: 60_000,
      paymentIntent: {
        id_intent: 'intent-visual-only',
        monto_hnl: 100,
        launch,
      },
      paymentResult: null,
      refreshPaymentStatus,
      checkingPaymentStatus: false,
      completePaymentSimulation,
      confirmHoldWithoutPayment,
      holdPricing: { subtotal_hnl: 100, cubierto_por_plan_hnl: 0, total_pagar_hnl: 100 },
      holdTotalToPay: 100,
      membershipHasContext: false,
      membershipUxMessage: '',
      membershipCompanionNotice: '',
    };

    const view = render(<PublicBookingPaymentStep />);
    expect(screen.queryByLabelText('Numero de tarjeta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con TodoPago' }));
    const iframe = await screen.findByTitle('Portal de pago TodoPago');
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));

    dispatchProviderMessage(iframe);

    expect(screen.getAllByText(/Resultado recibido/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Continuar con TodoPago' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Verificar estado del pago' })).not.toBeNull();
    expect(refreshPaymentStatus).not.toHaveBeenCalled();
    expect(completePaymentSimulation).not.toHaveBeenCalled();
    expect(confirmHoldWithoutPayment).not.toHaveBeenCalled();

    bookingFlowMock.current = {
      ...bookingFlowMock.current,
      paymentIntent: {
        ...bookingFlowMock.current.paymentIntent,
        launch: JSON.parse(JSON.stringify(launch)),
      },
    };
    view.rerender(<PublicBookingPaymentStep />);
    expect(screen.queryByRole('button', { name: 'Continuar con TodoPago' })).toBeNull();
    expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1);

    bookingFlowMock.current = {
      ...bookingFlowMock.current,
      paymentIntent: {
        ...bookingFlowMock.current.paymentIntent,
        launch: { ...launch, action: `${ALLOWED_ORIGIN}/modal/replacement` },
      },
    };
    view.rerender(<PublicBookingPaymentStep />);
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Continuar con TodoPago' })
    ).not.toBeNull());
    expect(screen.queryByText(/Resultado recibido/)).toBeNull();
  });
});
