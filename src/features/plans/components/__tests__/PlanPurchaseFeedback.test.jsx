// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PlanPurchaseFlowDialog from '../PlanPurchaseFlowDialog.jsx';
import { getPixelPayCustomerMessage } from '../../../payments/pixelPayPresentation.js';

const audio = vi.hoisted(() => ({ play: vi.fn(() => vi.fn()) }));
vi.mock('../../../public/booking/bookingConfirmationSound.js', () => ({ playBookingConfirmationSound: audio.play }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const summary = { id_order: 'order-a', plan: { nombre_plan: 'Master Elite', sucursal_nombre: 'Centro' }, totales: { total_hnl: 1600 } };
const props = { open: true, step: 'success', orderSummary: summary, paymentIntent: { id_payment_intent: 'intent-a' }, paymentConfirmation: { confirmation: { estado: 'activa' } } };
function drawn() {
  const path = document.querySelector('path[pathLength="1"]');
  const event = new Event('webkitAnimationEnd', { bubbles: true });
  Object.defineProperty(event, 'animationName', { value: 'booking-check-draw' });
  fireEvent(path, event);
}

it('reutiliza el check y solo suena una vez por operación, también tras reabrirla', () => {
  const onFinish = vi.fn();
  const view = render(<PlanPurchaseFlowDialog {...props} onFinish={onFinish} />);
  expect(screen.getByText('¡Membresía VIP confirmada!')).toBeTruthy();
  expect(screen.getByText('L 1600.00')).toBeTruthy();
  expect(screen.getByText('Activa')).toBeTruthy();
  expect(audio.play).not.toHaveBeenCalled();
  drawn(); view.rerender(<PlanPurchaseFlowDialog {...props} onFinish={onFinish} />); drawn();
  view.rerender(<PlanPurchaseFlowDialog {...props} open={false} />);
  view.rerender(<PlanPurchaseFlowDialog {...props} onFinish={onFinish} />); drawn();
  expect(audio.play).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  expect(onFinish).toHaveBeenCalledOnce();
  view.rerender(<PlanPurchaseFlowDialog {...props} paymentIntent={{ id_payment_intent: 'intent-b' }} />); drawn();
  expect(audio.play).toHaveBeenCalledTimes(2);
});

it('no inventa activación ni vigencia desde el catálogo', () => {
  render(<PlanPurchaseFlowDialog {...props} paymentConfirmation={{ normalized_status: 'PAGADO', id_suscripcion: 'subscription-a' }} orderSummary={{ ...summary, plan: { ...summary.plan, estado: 'activa', duracion_dias: 30 } }} />);
  expect(screen.getByText('Activación por verificar')).toBeTruthy();
  expect(screen.queryByText('Activa')).toBeNull();
  expect(screen.queryByText('Vigencia')).toBeNull();
});

it('muestra vigencia solo si está confirmada en la respuesta', () => {
  render(<PlanPurchaseFlowDialog {...props} paymentConfirmation={{ confirmation: { estado: 'activa', inicio_at: '2026-10-29T12:00:00Z', fin_at: '2026-11-29T12:00:00Z' } }} />);
  expect(screen.getByText('Vigencia')).toBeTruthy();
});

it('un error secundario de actualización no presenta un pago ya confirmado como fallido', () => {
  render(<PlanPurchaseFlowDialog {...props} errorMessage={getPixelPayCustomerMessage({ code: 'PIXELPAY_PAYMENT_PROCESSING_FAILED' })} />);
  expect(screen.getByText('¡Membresía VIP confirmada!')).toBeTruthy();
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('presenta un único error externo, vuelve al formulario y conserva sus datos', async () => {
  const onOpenChange = vi.fn();
  const initial = { ...props, step: 'payment', onOpenChange };
  const errorMessage = getPixelPayCustomerMessage({ code: 'PIXELPAY_PAYMENT_DECLINED' });
  const view = render(<PlanPurchaseFlowDialog {...initial} />);
  fireEvent.change(screen.getByLabelText('Nombre del titular'), { target: { value: 'Cliente de prueba' } });
  view.rerender(<PlanPurchaseFlowDialog {...initial} errorMessage={errorMessage} />);
  expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
  expect(screen.queryByLabelText('Numero de tarjeta')).toBeNull();
  const understood = screen.getByRole('button', { name: 'Entendido' });
  await waitFor(() => expect(document.activeElement).toBe(understood));
  fireEvent.click(understood);
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByLabelText('Nombre del titular').value).toBe('Cliente de prueba');
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Numero de tarjeta')));
  view.rerender(<PlanPurchaseFlowDialog {...initial} errorMessage={errorMessage} />);
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(audio.play).not.toHaveBeenCalled();
  view.rerender(<PlanPurchaseFlowDialog {...initial} />);
  view.rerender(<PlanPurchaseFlowDialog {...initial} errorMessage={errorMessage} />);
  expect(screen.getByRole('alertdialog')).toBeTruthy();
});

it('Escape reconoce el error sin cancelar la compra ni exponer mensajes técnicos', async () => {
  const onCancel = vi.fn();
  render(<PlanPurchaseFlowDialog {...props} step="payment" errorMessage="SQL secreto token PAN interno" onCancel={onCancel} />);
  expect(screen.queryByText(/SQL secreto/)).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Entendido' })));
  fireEvent.keyDown(document.activeElement, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getByLabelText('Numero de tarjeta')).toBeTruthy();
  expect(onCancel).not.toHaveBeenCalled();
});

it.each([true, false])('pending/uncertain nunca se presenta como error definitivo ni permite pagar (%s)', (explicitPending) => {
  render(<PlanPurchaseFlowDialog {...props} step="payment" pendingConfirmation={explicitPending} errorMessage={getPixelPayCustomerMessage({ code: 'PIXELPAY_PAYMENT_UNCERTAIN' })} />);
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Pagar con PixelPay' }).disabled).toBe(true);
  expect(document.querySelector('path[pathLength="1"]')).toBeNull();
  expect(audio.play).not.toHaveBeenCalled();
});

it('mantiene validaciones por campo sin abrir una notificación global', () => {
  const onConfirmPayment = vi.fn();
  render(<PlanPurchaseFlowDialog {...props} step="payment" onConfirmPayment={onConfirmPayment} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pagar con PixelPay' }));
  expect(screen.getByText('Ingresa un número de tarjeta válido.')).toBeTruthy();
  expect(screen.getByText('Ingresa un CVV de 3 o 4 dígitos.')).toBeTruthy();
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(onConfirmPayment).not.toHaveBeenCalled();
});
