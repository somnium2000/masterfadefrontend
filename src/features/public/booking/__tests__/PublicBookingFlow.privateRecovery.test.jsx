// @vitest-environment jsdom
// AM: Real flow and payment state; every API is inert and provider operations are forbidden.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Flow from '../PublicBookingFlow.jsx';
import { useBookingFlow } from '../BookingFlowContext.jsx';

const f = vi.hoisted(() => {
  const noop = vi.fn();
  const values = { contextLoading: false, contextError: '', contextData: {}, selectedBranchId: '', branchList: [],
    barbers: [], services: [], packages: [], promotions: [], membershipStateData: null, availabilityMap: {},
    slots: [], slotsCurated: [], slotSuggestions: [], slotMetrics: {}, hold: null, rootRedirectPath: null,
    homePath: '/', homeLabel: 'Inicio', connectionState: 'disabled', companionRuleValidation: { valid: true },
    canAddCompanionBlock: false };
  return { noop, hook: new Proxy(values, { get: (target, key) => key in target ? target[key] : noop }),
    restores: 0, status: vi.fn(), sale: vi.fn(), create: vi.fn(), network: vi.fn() };
});
vi.mock('../../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: {
  id_usuario: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', cliente_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'synthetic@example.test' }, roles: ['cliente'], isAuthenticated: true, isHydrated: true, isHydrating: false }) }));
vi.mock('../../../../context/NotificationsContext.jsx', () => ({ useNotifications: () => ({ error: f.noop, info: f.noop, warning: f.noop, success: f.noop }) }));
vi.mock('../hooks/useBookingCatalogs.js', () => ({ default: () => f.hook }));
vi.mock('../hooks/useBookingAvailability.js', () => ({ default: () => f.hook }));
vi.mock('../hooks/useBookingHold.js', () => ({ default: () => f.hook }));
vi.mock('../hooks/useBookingCompanions.js', () => ({ default: () => f.hook }));
vi.mock('../hooks/useBookingWizardNavigation.js', () => ({ default: () => f.hook }));
vi.mock('../hooks/usePublicAgendaEvents.js', () => ({ default: () => f.hook, parseAgendaSseEnabled: () => false }));
vi.mock('../usePublicAgendaPolling.js', () => ({ default: () => undefined }));
vi.mock('../components/BookingLayout.jsx', () => ({ default: ({ children }) => children }));
vi.mock('../publicBookingApi.js', () => ({ getPublicPaymentStatus: f.status, salePublicPixelPay: f.sale,
  createPublicPaymentIntent: f.create, queryPublicPixelPayStatus: f.noop, validatePublicBookingContacts: f.noop,
  createPublicCitaHold: f.noop, createClienteCitaHold: f.noop, releasePublicCitaHold: f.noop,
  releaseClienteCitaHold: f.noop, confirmClienteCitaHoldWithoutPayment: f.noop, validatePublicTitularForBooking: f.noop,
  completePublicMockPayment: f.noop, completePublicSimulatorPayment: f.noop }));
vi.mock('../hooks/useBookingPayment.js', async importOriginal => {
  const actual = await importOriginal();
  const { useCallback } = await import('react');
  return { default: function useAuditedBookingPayment(options) {
    const payment = actual.default(options);
    const originalRestore = payment.restorePaymentContext;
    const restorePaymentContext = useCallback((...args) => {
      f.restores++;
      if (f.restores > 8) throw new Error('Payment restoration reentered instead of settling');
      return originalRestore(...args);
    }, [originalRestore]);
    return { ...payment, restorePaymentContext };
  } };
});
function Probe() {
  const payment = useBookingFlow();
  return <output>{payment.paymentIntent?.id_intent || 'restoring'}</output>;
}
afterEach(() => { cleanup(); sessionStorage.clear(); vi.unstubAllGlobals(); });

test('private payment recovery settles real state without repeated restoration or a new charge', async () => {
  const group = '11111111-1111-4111-8111-111111111111';
  const intent = '22222222-2222-4222-8222-222222222222';
  sessionStorage.clear();
  f.restores = 0;
  vi.stubGlobal('fetch', f.network.mockRejectedValue(new Error('Network prohibited')));
  f.status.mockResolvedValue({ id_grupo_cita: group, id_intent: intent, monto_hnl: 300,
    estado_intent_codigo: 'link_generado', booking_confirmed: false });
  sessionStorage.setItem('masterfade.publicBookingPayment.v1', JSON.stringify({ id_grupo_cita: group,
    id_intent: intent, titular_email: 'synthetic@example.test', paymentIntent: {
      id_grupo_cita: group, id_intent: intent, estado_intent_codigo: 'link_generado', monto_hnl: 300 } }));
  render(<MemoryRouter initialEntries={[`/agendar/pagar?id_grupo_cita=${group}&id_intent=${intent}`]}>
    <Routes><Route path="/agendar" element={<Flow />}><Route path="pagar" element={<Probe />} /></Route></Routes>
  </MemoryRouter>);
  await screen.findByText(intent);
  await waitFor(() => expect(f.status).toHaveBeenCalledOnce());
  expect(f.restores).toBeLessThanOrEqual(3);
  expect(f.sale).not.toHaveBeenCalled();
  expect(f.create).not.toHaveBeenCalled();
  expect(f.network).not.toHaveBeenCalled();
});
