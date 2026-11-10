import { CalendarX2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PUBLIC_BOOKING_LOCK_MESSAGE } from '../lib/publicBookingFeatureFlags.js';

export default function BookingUnavailablePage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--mf-bg)] px-6 text-[var(--mf-text)]">
      <section className="w-full max-w-lg rounded-3xl border border-[var(--mf-btn-border)] bg-[var(--mf-card)] p-8 text-center shadow-xl">
        <CalendarX2 className="mx-auto text-[var(--mf-accent)]" size={42} aria-hidden="true" />
        <h1 className="mt-5 text-2xl font-semibold">Reservas temporalmente pausadas</h1>
        <p className="mt-3 text-[var(--mf-text-2)]">{PUBLIC_BOOKING_LOCK_MESSAGE}</p>
        <p className="mt-2 text-sm text-[var(--mf-text-2)]">La agenda administrativa continúa operando con normalidad.</p>
        <Link className="mf-accent-gradient mf-focus-ring mt-7 inline-flex rounded-xl px-5 py-3 font-semibold" to="/">
          Volver al inicio
        </Link>
      </section>
    </main>
  );
}
