// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import PublicBookingPaymentStep, {
  resolvePaymentSimulationAction,
} from '../PublicBookingPaymentStep.jsx';
import TodoPagoHostedModal from '../components/TodoPagoHostedModal.jsx';

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

  test('rechaza postMessage con origin incorrecto', () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    dispatchProviderMessage(iframe, { origin: 'https://attacker.example.test' });
    expect(props.onResult).not.toHaveBeenCalled();
  });

  test('rechaza postMessage con source incorrecto', () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    dispatchProviderMessage(iframe, { source: window });
    expect(props.onResult).not.toHaveBeenCalled();
  });

  test('rechaza postMessage con JSON invalido', () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
    dispatchProviderMessage(iframe, { data: { accion: 'Resultado', valor: '{invalid-json' } });
    expect(props.onResult).not.toHaveBeenCalled();
  });

  test('acepta un resultado valido como senal visual', () => {
    const { props } = renderModal();
    const iframe = screen.getByTitle('Portal de pago TodoPago');
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

    render(<PublicBookingPaymentStep />);
    expect(screen.queryByLabelText('Numero de tarjeta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con TodoPago' }));
    const iframe = await screen.findByTitle('Portal de pago TodoPago');
    await waitFor(() => expect(HTMLFormElement.prototype.submit).toHaveBeenCalledTimes(1));

    dispatchProviderMessage(iframe);

    expect(screen.getAllByText(/Resultado recibido/).length).toBeGreaterThan(0);
    expect(refreshPaymentStatus).not.toHaveBeenCalled();
    expect(completePaymentSimulation).not.toHaveBeenCalled();
    expect(confirmHoldWithoutPayment).not.toHaveBeenCalled();
  });
});
