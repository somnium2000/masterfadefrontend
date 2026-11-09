import { useEffect, useId, useRef } from 'react';
import { Button } from '../ui/button.jsx';
import { playBookingConfirmationSound } from '../../features/public/booking/bookingConfirmationSound.js';
import './confirmationCard.css';

export function useConfirmationSound(enabled, confirmationId = 'confirmation') {
  const played = useRef(new Set());
  const stop = useRef(null);
  useEffect(() => () => stop.current?.(), []);
  useEffect(() => { if (!enabled) stop.current?.(); }, [enabled]);
  return (event) => {
    if (event.animationName !== 'booking-check-draw' || !enabled || played.current.has(confirmationId)) return;
    played.current.add(confirmationId);
    stop.current?.();
    stop.current = playBookingConfirmationSound();
  };
}

export default function ConfirmationCard({ title, subtitle, titleId, headingLevel = 'h1', onCheckDrawn, onDone, children }) {
  const generatedId = useId();
  const id = titleId || generatedId;
  const Heading = headingLevel;
  return (
    <section className="booking-confirmation-card" aria-labelledby={id}>
      <div className="booking-confirmation-seal" aria-hidden="true">
        <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="33" /><path onAnimationEnd={onCheckDrawn} pathLength="1" d="m25 40 10 10 21-23" /></svg>
        <span className="booking-confirmation-spark spark-one">✦</span><span className="booking-confirmation-spark spark-two">✦</span>
      </div>
      <header className="booking-confirmation-heading"><Heading id={id}>{title}</Heading><p>{subtitle}</p></header>
      <div className="booking-confirmation-content">
        {children}
        <Button className="booking-confirmation-done" onClick={onDone}>Entendido</Button>
      </div>
    </section>
  );
}
