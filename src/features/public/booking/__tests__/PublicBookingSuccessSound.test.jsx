// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PublicBookingSuccessStep from '../PublicBookingSuccessStep.jsx';

const mocks = vi.hoisted(() => ({ state: {}, play: vi.fn(() => vi.fn()) }));
vi.mock('../BookingFlowContext.jsx', () => ({ usePublicBookingFlow: () => mocks.state }));
vi.mock('../bookingConfirmationSound.js', () => ({ playBookingConfirmationSound: mocks.play }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('suena solo al terminar el trazado y nunca se duplica por eventos o rerenders', () => {
  mocks.state = { bookingSuccessResult: { booking_confirmed: true, codigo_cita: 'ABC12' }, bookingBlocksSummary: [] };
  const view = render(<PublicBookingSuccessStep />);
  const check = view.container.querySelector('path[pathLength="1"]');
  const end = () => {
    const event = new Event('webkitAnimationEnd', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'booking-check-draw' });
    fireEvent(check, event);
  };
  end();
  view.rerender(<PublicBookingSuccessStep />);
  end();
  expect(mocks.play).toHaveBeenCalledOnce();
});

it('no presenta el check ni reproduce sonido en pendiente', () => {
  mocks.state = { bookingBlocksSummary: [] };
  const view = render(<PublicBookingSuccessStep />);
  expect(view.container.querySelector('path[pathLength="1"]')).toBeNull();
  expect(mocks.play).not.toHaveBeenCalled();
});
