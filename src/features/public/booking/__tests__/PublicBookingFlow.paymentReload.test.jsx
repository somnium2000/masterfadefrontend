// @vitest-environment jsdom

import React, { useEffect, useMemo, useRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { PublicBookingProvider } from '../BookingFlowContext.jsx';
import PublicBookingPaymentStep from '../PublicBookingPaymentStep.jsx';
import { resolvePaymentExecutionContext, shouldPreserveUnresolvedPaymentState } from '../PublicBookingFlow.jsx';
import useBookingPayment from '../hooks/useBookingPayment.js';
import { resolvePaymentStepRedirect } from '../hooks/useBookingWizardNavigation.js';
import { resolvePaymentResumeContext } from '../paymentResumeContext.js';
import { getPublicPaymentStatus, queryPublicPixelPayStatus, salePublicPixelPay } from '../publicBookingApi.js';

const GROUP_ID = '11111111-2222-4333-8444-555555555555';
const INTENT_ID = '99999999-9999-4999-8999-999999999999';
const ALTERNATE_INTENT_ID = '88888888-8888-4888-8888-888888888888';
const EMAIL = 'qa@example.com';
const SERVICE_ID = '77777777-7777-4777-8777-777777777777';
const PLACEHOLDER_BOOKING_BLOCK = {
  id: 'placeholder',
  alias: 'Titular',
  total_hnl: 0,
  isComplete: false,
  selectedServices: [],
  selectedServiceIdsEffective: [],
  selectedPackage: null,
  selection_type: 'services',
};
const REAL_BOOKING_BLOCK = {
  id: 'block-1',
  alias: 'Titular',
  total_hnl: 8,
  isComplete: true,
  selectedServices: [{ id_servicio: SERVICE_ID, precio_hnl: 8 }],
  selectedServiceIdsEffective: [SERVICE_ID],
  selectedPackage: null,
  selection_type: 'services',
};

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

function PaymentReloadHarness({
  holdPricing = null,
  bookingBlocksSummary = [PLACEHOLDER_BOOKING_BLOCK],
} = {}) {
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
  const paymentResultMatches = Boolean(
    payment.paymentResult?.id_grupo_cita === resumeContext?.id_grupo_cita
    && payment.paymentResult?.id_intent === resumeContext?.id_intent
  );
  const paymentRestoring = isPendingPaymentResumeRoute && !paymentResultMatches;
  const paymentCanExecuteSale = Boolean(
    paymentResultMatches
    && payment.paymentResult?.estado_intent_codigo === 'link_generado'
    && Number(payment.paymentResult?.monto_hnl) > 0
    && resumeContext?.titular_email
  );
  const completePixelPayPayment = ({ card, billing }) => payment.salePixelPayOnce({
    groupId: resumeContext.id_grupo_cita,
    intentId: resumeContext.id_intent,
    titularEmail: resumeContext.titular_email,
    card,
    billing,
  });

  return (
    <>
      <output data-testid="pathname">{location.pathname}</output>
      <PublicBookingProvider value={{
        bookingBlocksSummary,
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
        completePixelPayPayment,
        confirmHoldWithoutPayment: vi.fn(),
        holdPricing,
        holdTotalToPay: 0,
        membershipHasContext: false,
        membershipUxMessage: '',
        membershipCompanionNotice: '',
        paymentTitularEmail: resumeContext?.titular_email || '',
        paymentRestoring,
        paymentCanExecuteSale,
      }}>
        <PublicBookingPaymentStep />
      </PublicBookingProvider>
    </>
  );
}

function writeStandardContext(intentId = INTENT_ID) {
  window.sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({
    id_grupo_cita: GROUP_ID,
    id_intent: intentId,
    titular_email: EMAIL,
    paymentIntent: {
      id_grupo_cita: GROUP_ID,
      id_intent: intentId,
      monto_hnl: 1,
      estado_intent_codigo: 'link_generado',
    },
  }));
}

function writePendingContext(intentId = INTENT_ID) {
  window.sessionStorage.setItem('mf_pending_payment_context_v1', JSON.stringify({
    id_grupo_cita: GROUP_ID,
    id_intent: intentId,
    titular_email: EMAIL,
  }));
}

function renderPaymentFlow(initialEntry = '/agendar/pagar', providerOverrides = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PaymentReloadHarness {...providerOverrides} />
    </MemoryRouter>
  );
}

function getPaymentSummary() {
  return within(screen.getByText('Resumen para cobro').parentElement);
}

function fillPixelPayForm() {
  fireEvent.change(screen.getByLabelText('Nombre del titular'), { target: { value: 'CLIENTE QA' } });
  fireEvent.change(screen.getByLabelText('Numero de tarjeta'), { target: { value: '4111111111111111' } });
  fireEvent.change(screen.getByLabelText('Expiracion'), { target: { value: '07/28' } });
  fireEvent.change(screen.getByLabelText('CVV'), { target: { value: '999' } });
  fireEvent.change(screen.getByLabelText('Telefono de contacto'), { target: { value: '99999999' } });
  fireEvent.change(screen.getByLabelText('Direccion de facturacion'), { target: { value: 'Calle QA' } });
  fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'San Pedro Sula' } });
  fireEvent.change(screen.getByLabelText('Departamento'), { target: { value: 'HN-CR' } });
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

  test('F5 restaura monto L1 y permite una sola Sale manual con contexto recuperado', async () => {
    writeStandardContext();
    let resolveStatus;
    getPublicPaymentStatus.mockReturnValue(new Promise((resolve) => { resolveStatus = resolve; }));
    salePublicPixelPay.mockResolvedValue({
      booking_confirmed: true,
      estado_intent_codigo: 'confirmado',
    });
    const view = renderPaymentFlow();

    expect(await screen.findByText('Verificando pago')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pagar con PixelPay Sandbox' })).toBeNull();
    expect(screen.queryByText('L 0.00')).toBeNull();
    expect(screen.queryByText('Total servicios')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(salePublicPixelPay).not.toHaveBeenCalled();

    resolveStatus({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      estado_intent_codigo: 'link_generado',
      booking_confirmed: false,
      monto_hnl: 1,
      moneda_codigo: 'HNL',
    });

    expect(await screen.findByText('Monto: L 1.00')).toBeTruthy();
    expect(screen.getByText('Total a pagar').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 1.00');
    expect(screen.queryByText('Total servicios')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(screen.queryByText('L 0.00')).toBeNull();
    expect(getPaymentSummary().queryByText('Titular')).toBeNull();
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);

    view.rerender(<MemoryRouter initialEntries={['/agendar/pagar']}><PaymentReloadHarness /></MemoryRouter>);
    await waitFor(() => expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Monto: L 1.00')).toBeTruthy();
    expect(getPaymentSummary().queryByText('Titular')).toBeNull();
    expect(screen.queryByText('Total servicios')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(screen.queryByText('L 0.00')).toBeNull();
    expect(salePublicPixelPay).not.toHaveBeenCalled();

    fillPixelPayForm();
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con PixelPay Sandbox' }));

    await waitFor(() => expect(salePublicPixelPay).toHaveBeenCalledTimes(1));
    expect(salePublicPixelPay.mock.calls[0][0]).toMatchObject({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      titular_email: EMAIL,
    });
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  test('pendiente_confirmacion conserva L1, oculta formulario y nunca habilita Sale', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      estado_intent_codigo: 'pendiente_confirmacion',
      booking_confirmed: false,
      monto_hnl: 1,
      moneda_codigo: 'HNL',
    });
    renderPaymentFlow();

    expect(await screen.findByText('Monto: L 1.00')).toBeTruthy();
    expect(screen.queryByLabelText('Numero de tarjeta')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pagar con PixelPay Sandbox' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Verificar estado del pago' })).toBeTruthy();
    expect(salePublicPixelPay).not.toHaveBeenCalled();
  });

  test('flujo con holdPricing conserva subtotal, cobertura y total canonicos', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      estado_intent_codigo: 'link_generado',
      booking_confirmed: false,
      monto_hnl: 8,
      moneda_codigo: 'HNL',
    });
    renderPaymentFlow('/agendar/pagar', {
      holdPricing: {
        subtotal_hnl: 10,
        cubierto_por_plan_hnl: 2,
        extras_a_pagar_hnl: 8,
        total_pagar_hnl: 8,
      },
    });

    expect(await screen.findByText('Monto: L 8.00')).toBeTruthy();
    expect(screen.getByText('Total servicios').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 10.00');
    expect(screen.getByText('Cubierto por tu plan').nextSibling.textContent.replace(/\s/g, ' ')).toBe('-L 2.00');
    expect(screen.getByText('Total a pagar').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 8.00');
    expect(getPaymentSummary().queryByText('Titular')).toBeNull();
    expect(screen.queryByText('L 0.00')).toBeNull();
  });

  test('bookingBlocks validos conservan subtotal fallback real', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      estado_intent_codigo: 'link_generado',
      booking_confirmed: false,
      monto_hnl: 8,
      moneda_codigo: 'HNL',
    });
    renderPaymentFlow('/agendar/pagar', {
      bookingBlocksSummary: [
        {
          ...REAL_BOOKING_BLOCK,
          total_hnl: 5,
          selectedServices: [{ id_servicio: SERVICE_ID, precio_hnl: 5 }],
        },
        {
          ...REAL_BOOKING_BLOCK,
          id: 'block-2',
          alias: 'Acompanante',
          total_hnl: 3,
          selectedServices: [{ id_servicio: 'service-2', precio_hnl: 3 }],
          selectedServiceIdsEffective: ['service-2'],
        },
      ],
    });

    expect(await screen.findByText('Monto: L 8.00')).toBeTruthy();
    expect(getPaymentSummary().getByText('Titular').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 5.00');
    expect(getPaymentSummary().getByText('Acompanante').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 3.00');
    expect(screen.getByText('Total servicios').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 8.00');
    expect(screen.getByText('Total a pagar').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 8.00');
  });

  test('cero real completo conserva fila y subtotal sin confundirlo con placeholder', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      estado_intent_codigo: 'link_generado',
      booking_confirmed: false,
      monto_hnl: 0,
      moneda_codigo: 'HNL',
    });
    renderPaymentFlow('/agendar/pagar', {
      bookingBlocksSummary: [{
        ...REAL_BOOKING_BLOCK,
        total_hnl: 0,
        selectedServices: [{ id_servicio: SERVICE_ID, precio_hnl: 0, coveredByPlan: true }],
      }],
    });

    expect(await screen.findByText('Monto: L 0.00')).toBeTruthy();
    expect(getPaymentSummary().getByText('Titular').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 0.00');
    expect(screen.getByText('Total servicios').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 0.00');
  });

  test('bloques mixtos muestran solo filas reales y no inventan subtotal parcial', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      estado_intent_codigo: 'link_generado',
      booking_confirmed: false,
      monto_hnl: 8,
      moneda_codigo: 'HNL',
    });
    renderPaymentFlow('/agendar/pagar', {
      bookingBlocksSummary: [REAL_BOOKING_BLOCK, PLACEHOLDER_BOOKING_BLOCK],
    });

    expect(await screen.findByText('Monto: L 8.00')).toBeTruthy();
    expect(getPaymentSummary().getAllByText('Titular')).toHaveLength(1);
    expect(getPaymentSummary().getByText('Titular').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 8.00');
    expect(screen.queryByText('Total servicios')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(screen.getByText('Total a pagar').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 8.00');
  });

  test('monto promocional recuperado no inventa subtotal', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      estado_intent_codigo: 'link_generado',
      booking_confirmed: false,
      monto_hnl: 7,
      moneda_codigo: 'HNL',
    });
    renderPaymentFlow();

    expect(await screen.findByText('Monto: L 7.00')).toBeTruthy();
    expect(screen.getByText('Total a pagar').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 7.00');
    expect(screen.queryByText('Total servicios')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
  });

  test('monto backend cero real permanece visible sin inventar desglose', async () => {
    writeStandardContext();
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID,
      id_intent: INTENT_ID,
      estado_intent_codigo: 'link_generado',
      booking_confirmed: false,
      monto_hnl: 0,
      moneda_codigo: 'HNL',
    });
    renderPaymentFlow();

    expect(await screen.findByText('Monto: L 0.00')).toBeTruthy();
    expect(screen.getByText('Total a pagar').nextSibling.textContent.replace(/\s/g, ' ')).toBe('L 0.00');
    expect(screen.queryByText('Total servicios')).toBeNull();
    expect(screen.queryByText('Subtotal')).toBeNull();
    expect(salePublicPixelPay).not.toHaveBeenCalled();
  });

  test('query params validos mantienen payment aunque agenda este incompleta', async () => {
    renderPaymentFlow(`/agendar/pagar?id_grupo_cita=${GROUP_ID}&id_intent=${INTENT_ID}`);
    await waitFor(() => expect(screen.getByTestId('pathname').textContent).toBe('/agendar/pagar'));
    expect(getPublicPaymentStatus).not.toHaveBeenCalled();
    expect(salePublicPixelPay).not.toHaveBeenCalled();
  });

  test('query G1/I2 nunca es sustituido por storage G1/I1 y no cambia al rerender', async () => {
    writeStandardContext(INTENT_ID);
    salePublicPixelPay.mockResolvedValue({
      pending_confirmation: true,
      estado_intent_codigo: 'pendiente_confirmacion',
    });
    getPublicPaymentStatus.mockResolvedValue({
      id_grupo_cita: GROUP_ID,
      id_intent: ALTERNATE_INTENT_ID,
      estado_intent_codigo: 'link_generado',
      booking_confirmed: false,
      monto_hnl: 1,
      moneda_codigo: 'HNL',
    });
    const entry = `/agendar/pagar?id_grupo_cita=${GROUP_ID}&id_intent=${ALTERNATE_INTENT_ID}`;
    const view = renderPaymentFlow(entry);

    expect(await screen.findByText('Monto: L 1.00')).toBeTruthy();
    expect(screen.getByTestId('pathname').textContent).toBe('/agendar/pagar');
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(getPublicPaymentStatus.mock.calls[0][0]).toMatchObject({
      id_grupo_cita: GROUP_ID,
      id_intent: ALTERNATE_INTENT_ID,
      titular_email: EMAIL,
    });
    expect(getPublicPaymentStatus.mock.calls[0][0].id_intent).not.toBe(INTENT_ID);
    expect(getPaymentSummary().queryByText('Titular')).toBeNull();
    expect(screen.queryByText('Total servicios')).toBeNull();
    expect(screen.queryByText('L 0.00')).toBeNull();
    fillPixelPayForm();
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con PixelPay Sandbox' }));
    await waitFor(() => expect(salePublicPixelPay).toHaveBeenCalledTimes(1));
    expect(salePublicPixelPay.mock.calls[0][0]).toMatchObject({
      id_grupo_cita: GROUP_ID,
      id_intent: ALTERNATE_INTENT_ID,
      titular_email: EMAIL,
    });
    expect(salePublicPixelPay.mock.calls[0][0].id_intent).not.toBe(INTENT_ID);
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();

    view.rerender(<MemoryRouter initialEntries={[entry]}><PaymentReloadHarness /></MemoryRouter>);
    await waitFor(() => expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('pathname').textContent).toBe('/agendar/pagar');
    expect(getPublicPaymentStatus.mock.calls[0][0].id_intent).toBe(ALTERNATE_INTENT_ID);
    expect(salePublicPixelPay).toHaveBeenCalledTimes(1);
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  test('pending G1/I2 no es sustituido por standard G1/I1', async () => {
    writeStandardContext(INTENT_ID);
    writePendingContext(ALTERNATE_INTENT_ID);
    getPublicPaymentStatus.mockResolvedValue({
      estado_intent_codigo: 'pendiente_confirmacion', booking_confirmed: false,
    });
    renderPaymentFlow();

    expect(await screen.findByText('Tu pago requiere verificación. No vuelvas a realizar el pago.')).toBeTruthy();
    expect(getPublicPaymentStatus).toHaveBeenCalledTimes(1);
    expect(getPublicPaymentStatus.mock.calls[0][0]).toMatchObject({
      id_grupo_cita: GROUP_ID,
      id_intent: ALTERNATE_INTENT_ID,
      titular_email: EMAIL,
    });
    expect(getPublicPaymentStatus.mock.calls[0][0].id_intent).not.toBe(INTENT_ID);
    expect(salePublicPixelPay).not.toHaveBeenCalled();
    expect(queryPublicPixelPayStatus).not.toHaveBeenCalled();
  });

  test('email actual valido tiene prioridad y un contexto de otro intent no se mezcla', () => {
    expect(resolvePaymentExecutionContext({
      paymentIntent: { id_grupo_cita: GROUP_ID, id_intent: ALTERNATE_INTENT_ID },
      pendingResumeContext: {
        id_grupo_cita: GROUP_ID,
        id_intent: ALTERNATE_INTENT_ID,
        titular_email: 'restored@example.com',
      },
      currentEmail: 'actual@example.com',
    })).toEqual({
      groupId: GROUP_ID,
      intentId: ALTERNATE_INTENT_ID,
      titularEmail: 'actual@example.com',
    });

    expect(resolvePaymentExecutionContext({
      paymentIntent: { id_grupo_cita: GROUP_ID, id_intent: ALTERNATE_INTENT_ID },
      pendingResumeContext: {
        id_grupo_cita: GROUP_ID,
        id_intent: INTENT_ID,
        titular_email: 'historico@example.com',
      },
      currentEmail: '',
    }).titularEmail).toBe('');
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
