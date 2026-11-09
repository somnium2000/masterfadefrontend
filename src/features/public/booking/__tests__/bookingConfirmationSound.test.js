import { afterEach, expect, it, vi } from 'vitest';
import { playBookingConfirmationSound } from '../bookingConfirmationSound.js';
afterEach(() => vi.unstubAllGlobals());
function setup(reduced = false, blocked = false) {
  const audio = { play: vi.fn(() => blocked ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve()), pause: vi.fn(), removeAttribute: vi.fn(), load: vi.fn() };
  const Audio = vi.fn(function () { return audio; });
  vi.stubGlobal('window', { Audio, matchMedia: () => ({ matches: reduced }) });
  return { audio, Audio };
}
it('reproduce MP3 original una vez a 0.85 y limpia al terminar', () => {
  const { audio, Audio } = setup();
  const stop = playBookingConfirmationSound();
  expect(Audio).toHaveBeenCalledWith('/sounds/booking-confirmation.mp3');
  expect(audio.volume).toBe(0.85);
  expect(audio.preload).toBe('auto');
  expect(audio.playbackRate).toBeUndefined();
  expect(audio.play).toHaveBeenCalledOnce();
  audio.onended(); stop();
  expect(audio.pause).toHaveBeenCalledOnce();
  expect(audio.removeAttribute).toHaveBeenCalledWith('src');
  expect(audio.load).toHaveBeenCalledOnce();
});
it('omite autoplay bloqueado sin reintentar', async () => {
  const { audio } = setup(false, true);
  playBookingConfirmationSound();
  await Promise.resolve();
  expect(audio.play).toHaveBeenCalledOnce();
  expect(audio.pause).toHaveBeenCalledOnce();
});
it('respeta movimiento reducido y ausencia de Audio', () => {
  const { Audio } = setup(true);
  playBookingConfirmationSound();
  expect(Audio).not.toHaveBeenCalled();
  vi.stubGlobal('window', {});
  expect(() => playBookingConfirmationSound()()).not.toThrow();
});
it('cancela al desmontar o fallar la carga', () => {
  const { audio } = setup();
  const stop = playBookingConfirmationSound();
  audio.onerror(); stop();
  expect(audio.pause).toHaveBeenCalledOnce();
});
