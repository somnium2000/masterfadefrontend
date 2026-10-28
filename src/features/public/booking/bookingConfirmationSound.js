const CONFIRMATION_VOLUME = 0.85;

export function playBookingConfirmationSound() {
  if (!window.Audio || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  let audio;
  let disposed = false;
  const stop = () => {
    if (!audio || disposed) return;
    disposed = true;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };
  try {
    audio = new window.Audio(`${import.meta.env.BASE_URL}sounds/booking-confirmation.mp3`);
    audio.preload = 'auto';
    audio.volume = CONFIRMATION_VOLUME;
    audio.onended = stop;
    audio.onerror = stop;
    // AM: Autoplay bloqueado se omite sin reintentos ni reproduccion diferida.
    void audio.play()?.catch(stop);
  } catch { stop(); }
  return stop;
}
