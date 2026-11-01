import { Ticket } from 'lucide-react';
import { buildBookingShortCode } from '../../public/booking/bookingUtils.js';

export default function AdminReservationCode({ groupId }) {
  return <div className="my-3 flex items-center justify-between gap-3 rounded-2xl border border-[color:color-mix(in_srgb,var(--mf-accent)_45%,transparent)] bg-[color:color-mix(in_srgb,var(--mf-accent)_9%,var(--mf-card))] px-4 py-2.5"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase text-[var(--mf-text-2)]">Código de reserva</p><p className="break-all text-2xl font-semibold text-[var(--mf-accent)]">{groupId ? buildBookingShortCode(groupId, 5) : 'No disponible'}</p></div><Ticket size={21} className="shrink-0 text-[var(--mf-accent)]" aria-hidden="true" /></div>;
}
