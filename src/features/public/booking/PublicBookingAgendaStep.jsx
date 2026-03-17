import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronDown, Clock3, Plus, Scissors, UserRound } from 'lucide-react';
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
  formatTime12Hour,
} from './bookingUtils.js';

const LANDING_EASE = [0.25, 0.46, 0.45, 0.94];

function BookingBlocksSummary({ bookingBlocksSummary, totalToPay }) {
  const completedBlocks = bookingBlocksSummary.filter((block) => block.isComplete);

  return (
    <div className="citas-surface p-4 public-booking-group-summary">
      <h3 className="citas-side-title">Resumen de citas</h3>

      {completedBlocks.length === 0 ? (
        <p className="citas-selected-date mt-2">
          Aun no hay bloques completos. Selecciona servicio, fecha y hora para titular o acompanantes.
        </p>
      ) : (
        <div className="public-booking-summary-grid mt-3">
          {completedBlocks.map((block) => (
            <article key={block.id} className="public-booking-summary-card">
              <header className="public-booking-summary-head">
                <span className="public-booking-summary-alias">{block.alias}</span>
                <span className="public-booking-summary-total">{formatCurrencyHnl(block.total_hnl)}</span>
              </header>
              <div className="citas-selected-date">{block.barbero?.nombre_completo || 'Sin barbero'}</div>
              <div className="citas-selected-date">
                {block.selectedServices.map((service) => service.nombre_servicio).join(', ')}
              </div>
              <div className="citas-selected-date">
                {formatFriendlyDate(block.selectedDate)} - {formatTime12Hour(block.selectedTime)}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="citas-services-summary-row mt-3">
        <span>Total servicios: {formatCurrencyHnl(totalToPay)}</span>
      </div>
    </div>
  );
}

export default function PublicBookingAgendaStep() {
  const {
    activeBlock,
    activeBlockIndex,
    addCompanionBlock,
    allBlocksComplete,
    allowCompanions,
    availabilityError,
    availabilityMap,
    barbers,
    bookingBlocks,
    bookingBlocksSummary,
    canAddCompanionBlock,
    canGoPrevMonth,
    fetchAvailability,
    goToConfirm,
    isPastSlotForToday,
    minBookingDateKey,
    onSelectDay,
    onSelectTime,
    selectSuggestedBarber,
    selectedDate,
    selectedServices,
    selectedTime,
    serviceIds,
    services,
    servicesAtEnd,
    servicesCanScroll,
    servicesLoading,
    servicesScrollRef,
    setActiveBlock,
    setMonth,
    slotConflict,
    slotSuggestions,
    slotSuggestionsLoading,
    showBlockingAvailabilityLoader,
    slots,
    slotsLoading,
    syncServicesScrollState,
    toggleService,
    totalToPay,
    updateActiveBlockBarber,
    currentMonth,
  } = usePublicBookingFlow();

  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);
  const canGoToConfirm = Boolean(allBlocksComplete);
  const selectedServicesCount = selectedServices.length;
  const hasSelectedDate = Boolean(selectedDate);

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
  }, [bookingBlocks.length, services.length, servicesScrollRef, syncServicesScrollState]);

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

      <div className="citas-agenda-layout public-booking-agenda-stack">
        <motion.div
          className="citas-surface p-4 citas-services-step public-booking-services-surface"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: LANDING_EASE }}
        >
          <div className="public-booking-services-head">
            <h3 className="citas-side-title">Servicios</h3>
            {selectedServicesCount > 0 ? (
              <span className="public-booking-services-count" aria-label={`Servicios seleccionados: ${selectedServicesCount}`}>
                {selectedServicesCount}
              </span>
            ) : null}
          </div>

          <div className="public-booking-block-stepper mt-2">
            <div className="citas-stepper">
              {bookingBlocks.map((block, index) => (
                <button
                  key={block.id}
                  type="button"
                  className={`citas-step-btn ${index === activeBlockIndex ? 'is-active' : ''}`.trim()}
                  onClick={() => setActiveBlock(index)}
                >
                  {block.alias}
                </button>
              ))}
            </div>
          </div>

          <div className="public-booking-active-block-row">
            <div className="public-booking-active-block-label">
              <UserRound size={14} />
              <span>Configurando: {activeBlock?.alias || 'Titular'}</span>
            </div>
            <select
              className="citas-inline-select public-booking-active-barber-select"
              value={activeBlock?.idBarbero || ''}
              onChange={(event) => updateActiveBlockBarber(event.target.value)}
            >
              {barbers.map((barber) => (
                <option key={barber.id_empleado} value={barber.id_empleado}>
                  {barber.nombre_completo}
                </option>
              ))}
            </select>
          </div>

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

          <div className="citas-services-summary-row mt-3">
            <span>Total servicios: {formatCurrencyHnl(totalToPay)}</span>
          </div>
        </motion.div>

        <motion.div
          className="citas-surface public-booking-calendar-surface"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: LANDING_EASE }}
        >
          <div className="citas-calendar-head">
            <h3 className="citas-side-title">Fechas Disponibles</h3>
          </div>

          <div className="citas-calendar-head">
            <button
              type="button"
              className="citas-nav-round"
              onClick={() => setMonth(-1)}
              aria-label="Mes anterior"
              disabled={!canGoPrevMonth}
            >
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
                  minDateKey={minBookingDateKey}
                  selectedDate={selectedDate}
                  onSelect={onSelectDay}
                />
              ))}
            </div>
          </div>
        </motion.div>

        <AnimatePresence initial={false}>
          {hasSelectedDate ? (
            <motion.div
              key={`${activeBlock?.id || 'block'}-${selectedDate}`}
              className="citas-surface public-booking-slots-surface"
              initial={{ opacity: 0, y: 20, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.985 }}
              transition={{ duration: 0.45, ease: LANDING_EASE }}
            >
              <div className="citas-side-panel">
                <h3 className="citas-side-title">Horarios disponibles</h3>
                <p className="citas-selected-date">
                  Fecha seleccionada: {formatFriendlyDate(selectedDate)}
                </p>

                {slotConflict ? (
                  <div className="public-booking-slot-conflict">
                    <p>
                      {slotConflict.conflictingAlias || 'Otro integrante'} ya tiene este barbero en{' '}
                      {formatTime12Hour(slotConflict.timeKey)}.
                    </p>
                    {slotSuggestionsLoading ? (
                      <p className="citas-selected-date">Buscando barberos disponibles para la misma hora...</p>
                    ) : null}
                    {!slotSuggestionsLoading && slotSuggestions.length > 0 ? (
                      <div className="public-booking-slot-suggestions">
                        {slotSuggestions.map((suggestion) => (
                          <Button
                            key={suggestion.idBarbero}
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => selectSuggestedBarber(suggestion.idBarbero)}
                          >
                            Cambiar a {suggestion.nombreBarbero}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                    {!slotSuggestionsLoading && slotSuggestions.length === 0 ? (
                      <p className="citas-selected-date">No hay otro barbero disponible para esta hora. Elige otra hora.</p>
                    ) : null}
                  </div>
                ) : null}

                {slotsLoading ? (
                  <LoadingSpinner />
                ) : (
                  <div className="citas-timeslots">
                    {slots.map((slot) => (
                      <SlotButton
                        key={slot.hora}
                        slot={slot}
                        displayTime={formatTime12Hour(slot.hora)}
                        isDisabled={isPastSlotForToday(selectedDate, slot.hora)}
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
            </motion.div>
          ) : null}
        </AnimatePresence>

        <BookingBlocksSummary bookingBlocksSummary={bookingBlocksSummary} totalToPay={totalToPay} />

        <motion.div
          className="public-booking-actions public-booking-agenda-cta"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12, ease: LANDING_EASE }}
        >
          <Button className="gap-2" onClick={goToConfirm} disabled={!canGoToConfirm}>
            Continuar a confirmar
            <ArrowRight size={15} />
          </Button>
        </motion.div>

        <motion.div
          className="public-booking-actions public-booking-agenda-secondary-cta"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease: LANDING_EASE }}
        >
          <Button
            variant="outline"
            className="gap-2"
            onClick={addCompanionBlock}
            disabled={!allowCompanions || !canAddCompanionBlock}
          >
            <Plus size={15} />
            {!allowCompanions
              ? 'Acompanantes no habilitados'
              : canAddCompanionBlock
                ? 'Agregar integrante'
                : 'Limite de integrantes alcanzado'}
          </Button>
        </motion.div>
      </div>
    </>
  );
}
