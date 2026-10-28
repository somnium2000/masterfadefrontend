export function playBookingConfirmationSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};
  let context;
  const close = () => {
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  };
  try {
    context = new AudioContext();
    // AM: No reanudar contextos bloqueados ni reproducir audio tarde tras otra interaccion.
    if (context.state !== 'running') { close(); return () => {}; }
    const start = context.currentTime;
    [1760, 2640].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(index ? 0.018 : 0.045, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (index === 1) close();
      };
      oscillator.start(start);
      oscillator.stop(start + 0.3);
    });
  } catch { close(); }
  return close;
}
