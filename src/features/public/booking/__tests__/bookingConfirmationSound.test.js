import { afterEach, expect, it, vi } from 'vitest';
import { playBookingConfirmationSound } from '../bookingConfirmationSound.js';

afterEach(() => vi.unstubAllGlobals());

function setup(state = 'running', reduced = false) {
  const oscillators = [];
  const context = {
    state, currentTime: 1, destination: {}, close: vi.fn().mockResolvedValue(),
    createOscillator: vi.fn(() => {
      const node = { frequency: {}, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      oscillators.push(node);
      return node;
    }),
    createGain: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn(), gain: {
      setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(),
    } })),
  };
  const AudioContext = vi.fn(function () { return context; });
  vi.stubGlobal('window', { AudioContext, matchMedia: () => ({ matches: reduced }) });
  return { context, oscillators, AudioContext };
}

it('genera campanilla de 400 ms con ganancia acotada y libera todos los nodos', () => {
  const { context, oscillators } = setup();
  playBookingConfirmationSound();
  expect(oscillators).toHaveLength(3);
  expect(oscillators.map((node) => node.frequency.value)).toEqual([1320, 2640, 3960]);
  expect(oscillators[0].start).toHaveBeenCalledWith(1);
  expect(oscillators[0].stop).toHaveBeenCalledWith(1.4);
  const gains = context.createGain.mock.results.map(({ value }) => value);
  expect(gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.16, 1);
  const peaks = gains.slice(1).map((node) => node.gain.linearRampToValueAtTime.mock.calls[0][0]);
  expect(peaks.reduce((sum, peak) => sum + peak, 0) * 0.16).toBeCloseTo(0.1712);
  gains.slice(1).forEach((node) => {
    expect(node.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 1.38);
    expect(node.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.4);
  });
  oscillators.forEach((node) => node.onended());
  expect(context.close).toHaveBeenCalledOnce();
  expect(oscillators[0].disconnect).toHaveBeenCalledOnce();
  gains.forEach((node) => expect(node.disconnect).toHaveBeenCalledOnce());
});

it('no intenta reanudar ni reproducir audio bloqueado', () => {
  const { context } = setup('suspended');
  expect(() => playBookingConfirmationSound()).not.toThrow();
  expect(context.createOscillator).not.toHaveBeenCalled();
  expect(context.close).toHaveBeenCalledOnce();
});

it('respeta movimiento reducido sin crear recursos', () => {
  const { AudioContext } = setup('running', true);
  playBookingConfirmationSound();
  expect(AudioContext).not.toHaveBeenCalled();
});

it('permite limpiar al desmontar y tolera navegadores sin Web Audio', () => {
  const { context } = setup();
  playBookingConfirmationSound()();
  expect(context.close).toHaveBeenCalledOnce();
  vi.stubGlobal('window', {});
  expect(() => playBookingConfirmationSound()()).not.toThrow();
});
