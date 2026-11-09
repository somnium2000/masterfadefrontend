import { CalendarDays, CreditCard, MapPin, ShieldCheck } from 'lucide-react';
import ConfirmationCard from '../../../components/feedback/ConfirmationCard.jsx';

function confirmedPeriod(receipt) {
  if (receipt?.estado !== 'activa' && receipt?.estado_suscripcion_codigo !== 'activa') return null;
  const start = new Date(receipt.inicio_at);
  const end = new Date(receipt.fin_at);
  if (!receipt.inicio_at || !receipt.fin_at || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return null;
  const options = { timeZone: 'America/Tegucigalpa' };
  return `${start.toLocaleDateString('es-HN', options)} – ${end.toLocaleDateString('es-HN', options)}`;
}

export default function MembershipConfirmation({ plan, branchLabel, totals, paymentConfirmation, onCheckDrawn, onDone }) {
  const receipt = paymentConfirmation?.confirmation || paymentConfirmation || {};
  const active = receipt.estado === 'activa' || receipt.estado_suscripcion_codigo === 'activa';
  const period = confirmedPeriod(receipt);
  const hasAmount = totals.total_hnl !== null && totals.total_hnl !== undefined && totals.total_hnl !== '' && Number.isFinite(Number(totals.total_hnl)) && Number(totals.total_hnl) >= 0;
  return (
    <ConfirmationCard title="¡Membresía VIP confirmada!" subtitle={active ? 'Tu membresía está activa y lista para usar.' : 'Pago confirmado. La activación de tu membresía está por verificar.'} headingLevel="h2" onCheckDrawn={onCheckDrawn} onDone={onDone}>
      <div className="booking-confirmation-receipt">
        <div className="booking-confirmation-row"><ShieldCheck aria-hidden="true" /><span>Plan</span><strong>{plan.nombre_plan || 'No disponible'}</strong></div>
        <div className="booking-confirmation-row"><MapPin aria-hidden="true" /><span>Sucursal</span><strong>{branchLabel}</strong></div>
        <div className="booking-confirmation-row"><CreditCard aria-hidden="true" /><span>Total pagado en HNL</span><strong>{hasAmount ? `L ${Number(totals.total_hnl).toFixed(2)}` : 'No disponible'}</strong></div>
        <div className="booking-confirmation-row"><ShieldCheck aria-hidden="true" /><span>Estado de membresía</span><strong>{active ? 'Activa' : 'Activación por verificar'}</strong></div>
        {period ? <div className="booking-confirmation-row"><CalendarDays aria-hidden="true" /><span>Vigencia</span><strong>{period}</strong></div> : null}
      </div>
    </ConfirmationCard>
  );
}
