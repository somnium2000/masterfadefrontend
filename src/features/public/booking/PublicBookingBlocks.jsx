import { Check, Clock3 } from 'lucide-react';
import {
  formatCurrencyHnl,
  getBarberMeta,
  getInitials,
  getServiceDurationLabel,
} from './bookingUtils.js';

export function BarberCard({
  barber,
  isSelected,
  onSelect,
}) {
  const meta = getBarberMeta(barber);

  return (
    <button
      type="button"
      className={`citas-barber-card ${isSelected ? 'is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={isSelected}
    >
      <div className="citas-barber-media" style={{ background: meta.gradient }}>
        <span className="citas-barber-avatar">{getInitials(barber?.nombre_completo)}</span>
        <span className="citas-barber-chip">{meta.specialty}</span>
      </div>
      <div className="citas-barber-body">
        <div className="citas-barber-name">{barber?.nombre_completo || 'Barbero'}</div>
        <div className="citas-barber-years">{meta.years} anos de experiencia</div>
      </div>
    </button>
  );
}

export function ServiceCard({
  service,
  isSelected,
  onToggle,
}) {
  return (
    <button
      type="button"
      className={`citas-service-card ${isSelected ? 'is-selected' : ''}`}
      onClick={onToggle}
      aria-pressed={isSelected}
    >
      <div className="citas-service-name">{service?.nombre_servicio || 'Servicio'}</div>
      <div className="citas-service-meta">
        <Clock3 size={14} />
        <span>{getServiceDurationLabel(service)}</span>
      </div>
      <div className="citas-service-meta">
        <span>{formatCurrencyHnl(service?.precio_hnl)}</span>
        {isSelected ? <Check size={14} /> : null}
      </div>
    </button>
  );
}

export function DayButton({
  cell,
  selectedDate,
  dayInfo,
  onSelect,
}) {
  const isSelected = selectedDate === cell.key;
  const isAvailable = Boolean(dayInfo?.disponible);
  const isEnabled = cell.inMonth && isAvailable;
  const classes = [
    'citas-day-btn',
    cell.inMonth ? 'is-in-month' : 'is-outside',
    isAvailable ? 'is-available' : 'is-unavailable',
    isSelected ? 'is-selected' : '',
  ].join(' ');

  return (
    <button
      key={cell.key}
      type="button"
      className={classes}
      disabled={!isEnabled}
      onClick={() => onSelect(cell.key, isEnabled)}
      aria-label={`${cell.key} ${isAvailable ? 'disponible' : 'sin disponibilidad'}`}
    >
      {cell.label}
    </button>
  );
}

export function SlotButton({
  slot,
  selectedTime,
  onSelect,
}) {
  const isSelected = selectedTime === slot.hora;
  const classes = [
    'citas-slot-btn',
    slot.disponible ? '' : 'is-unavailable',
    isSelected ? 'is-selected' : '',
  ].join(' ');

  return (
    <button
      type="button"
      className={classes}
      disabled={!slot.disponible}
      onClick={() => onSelect(slot.hora, slot.disponible)}
      aria-pressed={isSelected}
    >
      {slot.hora}
    </button>
  );
}
