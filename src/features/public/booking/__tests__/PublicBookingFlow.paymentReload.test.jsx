// @vitest-environment jsdom

import React, { useEffect, useMemo, useRef } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { PublicBookingProvider } from '../BookingFlowContext.jsx';
import PublicBookingPaymentStep from '../PublicBookingPaymentStep.jsx';
import { shouldPreserveUnresolvedPaymentState } from '../PublicBookingFlow.jsx';
import useBookingPayment from '../hooks/useBookingPayment.js';
import { resolvePaymentStepRedirect } from '../hooks/useBookingWizardNavigation.js';
import { resolvePaymentResumeContext } from '../paymentResumeContext.js';
import { getPublicPaymentStatus, queryPublicPixelPayStatus, salePublicPixelPay } from '../publicBookingApi.js';

const GROUP_ID = '11111111-2222-4333-8444-555555555555';
const INTENT_ID = '99999999-9999-4999-8999-999999999999';
const EMAIL = 'qa@example.com';

vi.mock('../publicBookingApi.js', () => ({
  completePublicMockPayment: vi.fn(),
  completePublicSimulatorPayment: vi.fn(),
  confirmClienteCitaHoldWithoutPayment: vi.fn(),
  createClienteCitaHold: vi.fn(),
  createPublicCitaHold: vi.fn(),
  createPublicPaymentIntent: vi.fn(),
  getPublicPaymentStatus: vi.fn(),
  queryPublicPixelPayStatus: vi.fn(),
  releaseClienteCitaHold: vi.fn(),
  releasePublicCitaHold: vi.fn(),
  salePublicPixelPay: vi.fn(),
  validatePublicBookingContacts: vi.fn(),
}));

function PaymentReloadHarness() {
  const location = useLocation();
  const navigate = useNavigate();
  const checkedRef = useRef('');
  const resumeContext = useMemo(
    () => resolvePaymentResumeContext({ search: location.search }),
    [location.search]
  );
  const payment = useBookingPayment({ currentGroupId: '' });
  const isPendingPaymentResumeRoute = location.pathname.startsWith('/agendar/pagar')
    && Boolean(resumeContext?.id_grupo_cita && resumeContext?.id_intent);

  useEffect(() => {
    const target = resolvePaymentStepRedirect({
      pathname: location.pathname,
      allBlocksComplete: false,
      isPendingPaymentResumeRoute,
      paymentConfirmed: payment.paymentResult?.booking_confirmed === true,
    });
    if (target) navigate(target, { replace: true });
  }, [isPendingPaymentResumeRoute, location.pathname, navigate, payment.paymentResult?.booking_confirmed]);

  useEffect(() => {
    if (!isPendingPaymentResumeRoute) return;
    const key = `${resumeContext.id_grupo_cita}|${resumeContext.id_intent}`;
    if (checkedRef.current === key) return;
    checkedRef.current = key;
    const context = payment.restorePaymentContext(resumeContext.id_grupo_cita, resumeContext) || resumeContext;
    if (!context?.titular_email) return;
    void payment.fetchPaymentStatusOnce({
      groupId: context.id_grupo_cita,
      intentId: context.id_intent,
      titularEmail: context.titular_email,
    });
  }, [isPendingPaymentResumeRoute, payment, resumeContext]);

  useEffect(() => {
    const result = payment.paymentResult;
    if (!result || result.booking_confirmed) return;
    const preserve = shouldPreserveUnresolvedPaymentState({
      currentResult: null,
      nextResult: result,
      paymentIntent: payment.paymentIntent,
    });
    if (!preserve && String(result.estado_intent_codigo || '').toLowerCase() === 'fallido') {
      payment.clearPaymentState();
      navigate('/agendar/agenda', { replace: true });
    }
  }, [navigate, payment]);

  const refreshPaymentStatus = async (options = {}) => {
    if (!resumeContext?.titular_email) return null;
    const input = {
      groupId: resumeContext.id_grupo_cita,
      intentId: resumeContext.id_intent,
      titularEmail: resumeContext.titular_email,
    };
    return options.queryPixelPayProvider
      ? payment.queryPixelPayStatusOnce(input)
      : payment.fetchPaymentStatusOnce(input);
  };

  return (
    <>
      <output data-testid="pathname">{location.pathname}</output>
      <PublicBookingProvider value={{
        bookingBlocksSummary: [],
        cancelBookingFlow: vi.fn(),
        createPaymentIntentForHold: vi.fn(),
        creatingPaymentIntent: false,
        goToConfirm: vi.fn(),
        holdExpired: true,
        holdExpiresAtIso: null,
        holdRemainingMs: 0,
        paymentIntent: payment.paymentIntent,
        paymentResult: payment.paymentResult,
        refreshPaymentStatus,
        checkingPaymentStatus: payment.checkingPaymentStatus,
        completePaymentSimulation: vi.fn(),
        completePixelPayPayment: payment.salePixelPayOnce,
        confirmHoldWithoutPayment: vi.fn(),
        holdPricing: { subtotal_hnl: 1, cubierto_por_plan_hnl: 0, total_pagar_hnl: 1 },
        holdTotalToPay: 1,
        membershipHasContext: false,
        membershipUxMessage: '',
        membershipCompanionNotice: '',
      }}>
        <PublicBookingPaymentStep />
      </PublicBookingProvider>
    </>
  );
}

function writeStandardContext() {
  window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({
    id_grupo_cita: GROUP_ID,
    id_intent: INTENT_ID,
    titular_email: EMAIL,
    paymentIntent: {
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      monto_hnl: 1,
      estado_intent_codigo: 'link_generado',
    },
  }));
}

function writePendingContext() {
  window.sessionStorage.setItem('mf_pending_payment_context_v1', JSON.stringify({
    id_grupo_cita: GROUP_ID,
    id_intent: INTENT_ID,
    titular_email: EMAIL,
  }));
}

function renderPaymentFlow(initialEntry = '/agendar/pagar') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PaymentReloadHarness />
    </MemoryRouter>
  );
}

describe('PublicBookingFlow payment hard reload integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_PAYMENT_PROVIDER', 'pixelpay');
    vi.stubEnv('VITE_ENABLE_PAYMENT_SIMULATOR', 'false');
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  test('contexto estandar evita redirect y reconstruye la UI pendiente desde backend', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({
      estado_intent_codigo: 'pendiente_confirmacion', booking_confirmed: false, monto_hnl: 1, moneda_codigo: 'HNL',
    });
    const view = renderPaymentFlow();

    expect(await screen.findByText('Tu pago requiere verificación. No vuelvas a realizar el pago.')).toBeTruthy();
    expect(screen.getByTestId('pathname').textContent).toBe('/agendar/pagar');
    expect(screen.getByRole('button', { name: 'Verificar estado del pago' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pagar con PixelPay Sandbox' })).toBeNull();
    expect(screen.queryByLabelText('Numero de tarjeta')).toBeNull();
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).not.toBeNull();

    view.rerender(<MemoryRouter initialEntries={['/agendar/pagar']}><PaymentReloadHarness /></MemoryRouter>);
    await waitFor(() => expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('pathname').textContent).toBe('/agendar/pagar');
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  test('query params validos mantienen payment aunque agenda este incompleta', async () => {
    renderPaymentFlow(`/agendar/pagar?id_grupo_cita=${GROUP_ID}&id_intent=${INTENT_ID}`);
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/agendar/pagar'));
    expect(getPublicPaymentStatus).not.toHaveBeenCalled();
    expect(salePublicPixelPay).not.toHaveBeenCalled();
  });

  test('contexto pendiente especifico tambien localiza el intent y consulta backend', async () => {
    writePendingContext();
    getPublicPaymentStatus.mockResolvedValue({
      estado_intent_codigo: 'pendiente_confirmacion', booking_confirmed: false,
    });
    renderPaymentFlow();

    expect(await screen.findByText('Tu pago requiere verificación. No vuelvas a realizar el pago.')).toBeTruthy();
    expect(screen.getByTestId('pathname').textContent).toBe('/agendar/pagar');
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  test('estado terminal fallido limpia contexto y recupera agenda', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({ estado_intent_codigo: 'fallido', booking_confirmed: false });
    renderPaymentFlow();

    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/agendar/agenda'));
    expect(window.sessionStorage.getItem('masterfade.publicBookingPayment.v1')).toBeNull();
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  test('prioriza query, luego contexto pendiente y finalmente contexto estandar', () => {
    const queryGroupId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const queryIntentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const pendingGroupId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const pendingIntentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const standardContext = {
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      titular_email: EMAIL,
    };
    const pendingContext = {
      id_grupo_cita: pendingGroupId,
      id_intent: pendingIntentId,
      titular_email: 'pending@example.com',
    };

    expect(resolvePaymentResumeContext({
      search: `?id_grupo_cita=${queryGroupId}&id_intent=${queryIntentId}`,
      pendingContext,
      bookingPaymentContext: standardContext,
    })).toMatchObject({ id_grupo_cita: queryGroupId, id_intent: queryIntentId });

    expect(resolvePaymentResumeContext({
      pendingContext,
      bookingPaymentContext: standardContext,
    })).toMatchObject({ id_grupo_cita: pendingGroupId, id_intent: pendingIntentId });

    expect(resolvePaymentResumeContext({
      pendingContext: null,
      bookingPaymentContext: standardContext,
    })).toMatchObject({ id_grupo_cita: GROUP_ID, id_intent: INTENT_ID });
  });
});
