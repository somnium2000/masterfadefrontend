import { Check, Clock3 } from 'lucide-react';
import {
  formatTime12Hour,
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
  disabled = false,
}) {
  return (
    <button
      type="button"
      className={`citas-service-card ${isSelected ? 'is-selected' : ''}`}
      onClick={onToggle}
      aria-pressed={isSelected}
      disabled={disabled}
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
  minDateKey,
  selectedDate,
  dayInfo,
  onSelect,
}) {
  const isSelected = selectedDate === cell.key;
  const isAvailable = Boolean(dayInfo?.disponible);
  const isPastDate = Boolean(minDateKey && cell.key < minDateKey);
  const isEnabled = cell.inMonth && isAvailable && !isPastDate;
  const classes = [
    'citas-day-btn',
    cell.inMonth ? 'is-in-month' : 'is-outside',
    isAvailable ? 'is-available' : 'is-unavailable',
    isPastDate ? 'is-past' : '',
    isSelected ? 'is-selected' : '',
  ].join(' ');

  return (
    <button
      key={cell.key}
      type="button"
      className={classes}
      disabled={!isEnabled}
      onClick={() => onSelect(cell.key, isEnabled)}
      aria-label={`${cell.key} ${isEnabled ? 'disponible' : 'sin disponibilidad'}`}
    >
      {cell.label}
    </button>
  );
}

export function SlotButton({
  slot,
  selectedTime,
  onSelect,
  disabled = false,
  variant = 'default',
  helperText = '',
}) {
  const isSelected = selectedTime === slot.hora;
  const classes = [
    'public-booking-time-block',
    variant === 'danger' ? 'is-blocked-danger' : '',
    variant === 'muted' ? 'is-blocked-muted' : 'is-available',
    isSelected ? 'is-selected' : '',
  ].join(' ');
  const startLabel = formatTime12Hour(slot.hora);
  const endLabel = formatTime12Hour(slot.horaFin || slot.hora);
  const durationLabel = `${Math.max(0, Number(slot?.duracionVisibleMin || 0))} min`;

  return (
    <button
      type="button"
      className={classes}
      onClick={() => onSelect(slot.hora, !disabled)}
      aria-pressed={isSelected}
      disabled={disabled}
      title={helperText || undefined}
    >
      <span className="public-booking-time-block-copy">
        <span className="public-booking-time-block-range">{startLabel} - {endLabel}</span>
        <span className="public-booking-time-block-status">{helperText || durationLabel}</span>
      </span>
      <span className="public-booking-time-block-icon" aria-hidden="true">
        {isSelected ? <Check size={16} /> : <Clock3 size={15} />}
      </span>
    </button>
  );
}
