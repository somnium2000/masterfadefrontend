import { useEffect, useMemo } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown, Clock3, Scissors } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import ErrorBanner from '../../../components/data/ErrorBanner.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { DayButton, ServiceCard, SlotButton } from './PublicBookingBlocks.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import {
  WEEK_DAYS,
  buildCalendarCells,
  formatCurrencyHnl,
  formatFriendlyDate,
  formatMonth,
  getBarberMeta,
  getInitials,
} from './bookingUtils.js';

function CompanionServices({
  companionItems,
  companionsCount,
  services,
  updateCompanionService,
  updateCompanionsCount,
}) {
  return (
    <>
      <div className="citas-services-companion-head mt-2">
        <h4 className="citas-side-title">Acompanantes</h4>
        <select
          className="citas-inline-select"
          value={companionsCount}
          onChange={(event) => updateCompanionsCount(event.target.value)}
        >
          <option value={0}>Sin acompanantes</option>
          <option value={1}>1 acompanante</option>
          <option value={2}>2 acompanantes</option>
          <option value={3}>3 acompanantes</option>
          <option value={4}>4 acompanantes</option>
        </select>
      </div>

      {companionItems.map((item) => (
        <div key={`companion-${item.index}`} className="citas-service-companion-row">
          <div className="citas-selected-date">Acompanante {item.index + 1}</div>
          <select
            className="citas-inline-select"
            value={item.id_servicio}
            onChange={(event) => updateCompanionService(item.index, event.target.value)}
          >
            <option value="">Selecciona servicio</option>
            {services.map((service) => (
              <option key={`${item.index}-${service.id_servicio}`} value={service.id_servicio}>
                {service.nombre_servicio}
              </option>
            ))}
          </select>
        </div>
      ))}
    </>
  );
}

export default function PublicBookingAgendaStep() {
  const {
    allowCompanions,
    availabilityError,
    availabilityMap,
    fetchAvailability,
    goToBarberos,
    goToConfirm,
    onSelectDay,
    onSelectTime,
    selectedBarber,
    selectedDate,
    selectedServices,
    selectedTime,
    serviceIds,
    serviceSelectionComplete,
    services,
    servicesAtEnd,
    servicesCanScroll,
    servicesLoading,
    servicesScrollRef,
    showBlockingAvailabilityLoader,
    slots,
    slotsLoading,
    syncServicesScrollState,
    toggleService,
    totalToPay,
    companionItems,
    companionsCount,
    updateCompanionService,
    updateCompanionsCount,
    currentMonth,
    setMonth,
  } = usePublicBookingFlow();

  const selectedBarberMeta = useMemo(() => getBarberMeta(selectedBarber), [selectedBarber]);
  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);
  const canGoToConfirm = Boolean(serviceSelectionComplete && selectedDate && selectedTime);

  useEffect(() => {
    syncServicesScrollState();
    const scroller = servicesScrollRef.current;
    if (!scroller) return undefined;
    const onScroll = () => syncServicesScrollState();
    scroller.addEventListener('scroll', onScroll);
    window.addEventListener('resize', syncServicesScrollState);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', syncServicesScrollState);
    };
  }, [services.length, companionsCount, servicesScrollRef, syncServicesScrollState]);

  if (servicesLoading) {
    return (
      <div className="citas-surface p-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <EmptyState
        icon={Scissors}
        title="Sin servicios disponibles"
        description="No hay servicios activos para esta sucursal."
      />
    );
  }

  return (
    <>
      {showBlockingAvailabilityLoader ? (
        <div className="citas-surface p-6">
          <LoadingSpinner />
        </div>
      ) : null}

      {availabilityError ? <ErrorBanner message={availabilityError} onRetry={fetchAvailability} /> : null}

      <div className="citas-agenda-layout">
        <div className="citas-agenda-main">
          <div className="citas-surface p-4 citas-services-step">
            <h3 className="citas-side-title">Servicios y acompanantes</h3>

            <div className="citas-services-scroll scrollbar-hide" ref={servicesScrollRef}>
              <div className="citas-services-grid">
                {services.map((service) => (
                  <ServiceCard
                    key={service.id_servicio}
                    service={service}
                    isSelected={serviceIds.includes(service.id_servicio)}
                    onToggle={() => toggleService(service.id_servicio)}
                  />
                ))}
              </div>
            </div>

            {servicesCanScroll && !servicesAtEnd ? (
              <button
                type="button"
                className="citas-services-scroll-hint"
                onClick={() => {
                  const scroller = servicesScrollRef.current;
                  if (!scroller) return;
                  scroller.scrollBy({ top: 170, behavior: 'smooth' });
                }}
                aria-label="Ver mas servicios"
              >
                <ChevronDown size={16} />
              </button>
            ) : null}

            {allowCompanions ? (
              <CompanionServices
                companionItems={companionItems}
                companionsCount={companionsCount}
                services={services}
                updateCompanionService={updateCompanionService}
                updateCompanionsCount={updateCompanionsCount}
              />
            ) : (
              <p className="citas-selected-date">Sin acompanantes para esta cita.</p>
            )}

            <div className="citas-services-summary-row mt-4">
              <span>Servicios cliente: {selectedServices.length}</span>
              <span>Acompanantes: {allowCompanions ? companionsCount : 0}</span>
              <span>Total a pagar: {formatCurrencyHnl(totalToPay)}</span>
            </div>
          </div>

          <div className="public-booking-actions is-inline">
            <Button variant="outline" className="gap-2" onClick={goToBarberos}>
              <ArrowLeft size={15} />
              Volver a barberos
            </Button>
            <Button className="gap-2" onClick={goToConfirm} disabled={!canGoToConfirm}>
              Continuar a confirmar
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>

        <div className="citas-surface">
          <div className="citas-calendar-head">
            <div className="citas-calendar-profile">
              <span className="citas-barber-avatar">{getInitials(selectedBarber?.nombre_completo)}</span>
              <div>
                <div className="citas-calendar-profile-name">{selectedBarber?.nombre_completo || 'Selecciona barbero'}</div>
                <div className="citas-calendar-profile-sub">{selectedBarberMeta.specialty}</div>
              </div>
            </div>
          </div>

          <div className="citas-calendar-head">
            <button type="button" className="citas-nav-round" onClick={() => setMonth(-1)} aria-label="Mes anterior">
              <ArrowLeft size={16} />
            </button>
            <div className="citas-calendar-month">{formatMonth(currentMonth)}</div>
            <button type="button" className="citas-nav-round" onClick={() => setMonth(1)} aria-label="Mes siguiente">
              <ArrowRight size={16} />
            </button>
          </div>

          <div className="citas-calendar-grid">
            <div className="citas-weekdays">
              {WEEK_DAYS.map((day) => (
                <div key={day} className="citas-weekday">
                  {day}
                </div>
              ))}
            </div>

            <div className="citas-days">
              {calendarCells.map((cell) => (
                <DayButton
                  key={cell.key}
                  cell={cell}
                  dayInfo={availabilityMap[cell.key]}
                  selectedDate={selectedDate}
                  onSelect={onSelectDay}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="citas-surface">
          <div className="citas-side-panel">
            <h3 className="citas-side-title">Horarios disponibles</h3>
            <p className="citas-selected-date">
              {selectedDate ? `Fecha seleccionada: ${formatFriendlyDate(selectedDate)}` : 'Selecciona una fecha'}
            </p>

            {slotsLoading ? (
              <LoadingSpinner />
            ) : (
              <div className="citas-timeslots">
                {slots.map((slot) => (
                  <SlotButton
                    key={slot.hora}
                    slot={slot}
                    selectedTime={selectedTime}
                    onSelect={onSelectTime}
                  />
                ))}
              </div>
            )}

            <div className="citas-slot-legend">
              <span>
                <span className="citas-slot-dot is-available" />
                Disponible
              </span>
              <span>
                <span className="citas-slot-dot is-unavailable" />
                No disponible
              </span>
              <span>
                <span className="citas-slot-dot is-selected" />
                Seleccionado
              </span>
            </div>

            <div className="public-booking-slot-hint">
              <Clock3 size={14} />
              <span>Selecciona una hora para habilitar la pantalla de confirmacion.</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
