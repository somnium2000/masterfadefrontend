import { Check, Clock3, Lock } from 'lucide-react';
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
  isDisabled = false,
}) {
  const isSelected = selectedTime === slot.hora;
  const isUnavailable = !slot.disponible || isDisabled;
  const classes = [
    'public-booking-time-block',
    isUnavailable ? 'is-unavailable' : 'is-available',
    isSelected ? 'is-selected' : '',
  ].join(' ');
  const startLabel = formatTime12Hour(slot.hora);
  const endLabel = formatTime12Hour(slot.horaFin || slot.hora);
  const statusLabel = isSelected ? 'SELECCIONADO' : isUnavailable ? 'NO DISPONIBLE' : 'DISPONIBLE';

  return (
    <button
      type="button"
      className={classes}
      disabled={isUnavailable}
      onClick={() => onSelect(slot.hora, !isUnavailable)}
      aria-pressed={isSelected}
    >
      <span className="public-booking-time-block-copy">
        <span className="public-booking-time-block-range">[ {startLabel} - {endLabel} ]</span>
        <span className="public-booking-time-block-status">{statusLabel}</span>
      </span>
      <span className="public-booking-time-block-icon" aria-hidden="true">
        {isUnavailable ? <Lock size={15} /> : isSelected ? <Check size={16} /> : <Clock3 size={15} />}
      </span>
    </button>
  );
}
