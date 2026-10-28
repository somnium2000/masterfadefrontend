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
    const master = context.createGain();
    master.gain.setValueAtTime(0.16, start);
    master.connect(context.destination);
    const partials = [[1320, 0.75], [2640, 0.24], [3960, 0.08]];
    partials.forEach(([frequency, peak], index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.38);
      gain.gain.linearRampToValueAtTime(0, start + 0.4);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
        if (index === partials.length - 1) { master.disconnect(); close(); }
      };
      oscillator.start(start);
      oscillator.stop(start + 0.4);
    });
  } catch { close(); }
  return close;
}
