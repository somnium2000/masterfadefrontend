import { useState } from 'react';
import { Check, Clock3 } from 'lucide-react';
import {
  formatTime12Hour,
  formatCurrencyHnl,
  getInitials,
  getServiceDurationLabel,
} from './bookingUtils.js';
import { withImageVersion } from '../../../lib/imageCache.js';

export function BarberCard({
  barber,
  onSelect,
}) {
  const displayName = String(barber?.nombre_completo || '').trim() || 'Barbero';
  const aliasPublico = String(barber?.alias_publico || '').trim() || displayName;
  const resumenPublico = String(barber?.resumen_publico || '').trim();
  const [failedPhotoUrl, setFailedPhotoUrl] = useState('');
  const photoUrl = withImageVersion(
    String(barber?.foto_perfil_url || '').trim(),
    barber?.foto_perfil_updated_at
  );
  const hasPhoto = Boolean(photoUrl) && failedPhotoUrl !== photoUrl;

  return (
    <button
      type="button"
      className="public-booking-barber-card"
      onClick={onSelect}
      aria-label={`Seleccionar a ${aliasPublico}`}
    >
      <div className="public-booking-barber-card-media">
        {hasPhoto ? (
          <img
            src={photoUrl}
            alt={aliasPublico}
            className="public-booking-barber-card-image"
            loading="lazy"
            onError={() => setFailedPhotoUrl(photoUrl)}
          />
        ) : (
          <span className="public-booking-barber-card-avatar">{getInitials(displayName)}</span>
        )}
      </div>
      <div className="public-booking-barber-card-body">
        <p className="public-booking-barber-card-name">{aliasPublico}</p>
        {resumenPublico ? <p className="public-booking-barber-card-summary">{resumenPublico}</p> : null}
      </div>
    </button>
  );
}

export function ServiceCard({
  service,
  isSelected,
  onToggle,
  disabled = false,
  blocked = false,
  blockedReason = '',
  blockedLabel = '',
  coveredByPlan = false,
}) {
  const handleClick = () => {
    if (disabled || blocked) return;
    onToggle?.();
  };
  const helperLabel = blockedLabel || (coveredByPlan ? 'Cubierto por tu plan' : 'Incluido en paquete');
  const title = blockedReason || (coveredByPlan
    ? 'Este servicio está cubierto por tu plan y no se puede quitar.'
    : 'Ese servicio ya lo incluye el paquete seleccionado');
  return (
    <button
      type="button"
      className={`citas-service-card ${isSelected ? 'is-selected' : ''} ${blocked ? 'is-blocked' : ''}`}
      onClick={handleClick}
      aria-pressed={isSelected}
      disabled={disabled}
      aria-disabled={disabled || blocked}
      title={blocked ? title : undefined}
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
      {blocked ? (
        <div className="citas-service-meta">
          <span>{helperLabel}</span>
        </div>
      ) : null}
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
