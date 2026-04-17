import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, ChevronDown, Clock3, Plus, Scissors, UserRound, Package } from 'lucide-react';
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
  formatDurationHuman,
  formatFriendlyDate,
  formatMonth,
  formatTime12Hour,
} from './bookingUtils.js';

const LANDING_EASE = [0.25, 0.46, 0.45, 0.94];
const SLOT_TIME_PERIODS = [
  { key: 'manana', label: 'Mañana' },
  { key: 'tarde', label: 'Tarde' },
  { key: 'noche', label: 'Noche' },
];

function getSlotPeriodKey(timeKey) {
  const normalized = String(timeKey || '').trim();
  const match = normalized.match(/^(\d{2}):(\d{2})/);
  if (!match) return 'noche';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'noche';
  const totalMinutes = (hour * 60) + minute;
  if (totalMinutes >= 6 * 60 && totalMinutes < 12 * 60) return 'manana';
  if (totalMinutes >= 12 * 60 && totalMinutes < 18 * 60) return 'tarde';
  return 'noche';
}

function BookingBlocksSummary({ bookingBlocksSummary, totalToPay }) {
  const completedBlocks = bookingBlocksSummary.filter((block) => block.isComplete);

  return (
    <div className="citas-surface p-4 public-booking-group-summary">
      <h3 className="citas-side-title">Resumen de citas</h3>

      {completedBlocks.length === 0 ? (
        <p className="citas-selected-date mt-2">
          Aún no hay bloques completos. Selecciona servicio, fecha y hora para titular o acompañantes.
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
                {block.selection_type === 'package'
                  ? `Paquete: ${block.selectedPackage?.nombre_paquete || 'Sin paquete'}`
                  : block.selectedServices.map((service) => service.nombre_servicio).join(', ')}
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
    availabilityLoading,
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
    selectionType,
    selectSelectionType,
    selectedPackage,
    selectedPackageId,
    selectPackage,
    selectedServicesDurationSum,
    selectedServices,
    selectedTime,
    serviceIds,
    services,
    packages,
    packagesLoading,
    servicesAtEnd,
    servicesCanScroll,
    servicesLoading,
    servicesScrollRef,
    setActiveBlock,
    setMonth,
    slotConflict,
    slotSuggestions,
    slotSuggestionsLoading,
    slots,
    slotsLoading,
    syncServicesScrollState,
    toggleService,
    totalToPay,
    updateActiveBlockBarber,
    updateActiveBlockContact,
    currentMonth,
    selectedBarber,
  } = usePublicBookingFlow();

  const calendarCells = useMemo(() => buildCalendarCells(currentMonth), [currentMonth]);
  const canGoToConfirm = Boolean(allBlocksComplete);
  const selectedServicesCount = selectionType === 'package'
    ? (selectedPackage ? 1 : 0)
    : selectedServices.length;
  const hasSelectedDate = Boolean(selectedDate);
  const slotsSectionRef = useRef(null);
  const activeContactName = String(activeBlock?.contactName || '');
  const activeContactEmail = String(activeBlock?.contactEmail || '');
  const activeContactPhone = String(activeBlock?.contactPhone || '');
  const contactNameRequiredMessage = activeBlockIndex === 0
    ? 'Ingresa el nombre del titular para continuar con la selección de servicios.'
    : 'Ingresa el nombre del acompañante antes de elegir servicios.';
  const canSelectServices = Boolean(activeContactName.trim());
  const [preferredSlotPeriod, setPreferredSlotPeriod] = useState('manana');
  const availableSlotsByPeriod = useMemo(() => {
    const grouped = {
      manana: [],
      tarde: [],
      noche: [],
    };
    (Array.isArray(slots) ? slots : []).forEach((slot) => {
      if (!slot?.disponible) return;
      if (selectedDate && isPastSlotForToday(selectedDate, slot?.hora)) return;
      const key = getSlotPeriodKey(slot?.hora);
      grouped[key].push(slot);
    });
    return grouped;
  }, [isPastSlotForToday, selectedDate, slots]);
  const totalAvailableSlots = useMemo(
    () => SLOT_TIME_PERIODS.reduce((total, period) => total + (availableSlotsByPeriod[period.key] || []).length, 0),
    [availableSlotsByPeriod]
  );
  const activeSlotPeriod = useMemo(() => {
    if ((availableSlotsByPeriod[preferredSlotPeriod] || []).length > 0) return preferredSlotPeriod;
    const firstWithAvailable = SLOT_TIME_PERIODS.find((period) => (availableSlotsByPeriod[period.key] || []).length > 0);
    return firstWithAvailable ? firstWithAvailable.key : 'manana';
  }, [availableSlotsByPeriod, preferredSlotPeriod]);
  const currentPeriodSlots = availableSlotsByPeriod[activeSlotPeriod] || [];

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

  useEffect(() => {
    if (!selectedDate || !slotsSectionRef.current) return;
    slotsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedDate]);

  if (servicesLoading || packagesLoading) {
    return (
      <div className="citas-surface p-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (selectionType === 'services' && services.length === 0) {
    return (
      <EmptyState
        icon={Scissors}
        title="Sin servicios disponibles"
        description={selectedBarber
          ? `No hay servicios ofrecidos configurados para ${selectedBarber.nombre_completo}.`
          : 'No hay servicios activos para esta sucursal.'}
      />
    );
  }

  return (
    <>
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
              {activeBlockIndex > 0 ? (
                <option value="">Sin preferencia (asignación automática)</option>
              ) : null}
              {barbers.map((barber) => (
                <option key={barber.id_empleado} value={barber.id_empleado}>
                  {barber.nombre_completo}
                </option>
              ))}
            </select>
          </div>

          <div className="public-booking-contact-card">
            <div className="public-booking-form-grid">
              <div className="public-booking-form-row">
                <label className="mf-label" htmlFor="booking-contact-name">
                  {activeBlockIndex === 0 ? 'Nombre del titular *' : 'Nombre del acompañante *'}
                </label>
                <input
                  id="booking-contact-name"
                  type="text"
                  className="mf-input"
                  value={activeContactName}
                  onChange={(event) => updateActiveBlockContact({ contactName: event.target.value })}
                  placeholder={activeBlockIndex === 0 ? 'Ej. Carlos Ramírez' : 'Ej. José López'}
                />
                {activeBlockIndex > 0 ? (
                  <p className="citas-selected-date">
                    Este nombre se usa para llamarle correctamente en la barbería y evitar confusiones.
                  </p>
                ) : null}
              </div>
              <div className="public-booking-form-row">
                <label className="mf-label" htmlFor="booking-contact-email">
                  {activeBlockIndex === 0 ? 'Correo del titular *' : 'Correo del acompañante (opcional)'}
                </label>
                <input
                  id="booking-contact-email"
                  type="email"
                  className="mf-input"
                  value={activeContactEmail}
                  onChange={(event) => updateActiveBlockContact({ contactEmail: event.target.value })}
                  placeholder={activeBlockIndex === 0 ? 'titular@correo.com' : 'acompanante@correo.com'}
                />
                {activeBlockIndex > 0 ? (
                  <p className="citas-selected-date">
                    Si lo indicas, enviaremos la información de la cita a este correo.
                  </p>
                ) : null}
              </div>
            </div>
            {activeBlockIndex === 0 ? (
              <div className="public-booking-form-row mt-2">
                <label className="mf-label" htmlFor="booking-contact-phone">
                  Teléfono del titular (opcional)
                </label>
                <input
                  id="booking-contact-phone"
                  type="tel"
                  className="mf-input"
                  value={activeContactPhone}
                  onChange={(event) => updateActiveBlockContact({ contactPhone: event.target.value })}
                  placeholder="Ej. +504 9999-9999"
                />
                <p className="citas-selected-date">
                  Lo usaremos para avisarte si hay cambios extraordinarios en fecha u hora.
                </p>
              </div>
            ) : null}
          </div>

          {!canSelectServices ? (
            <p className="citas-selected-date">{contactNameRequiredMessage}</p>
          ) : null}

          <div className="public-booking-selection-tabs">
            <Button
              type="button"
              variant={selectionType === 'services' ? 'default' : 'outline'}
              size="sm"
              onClick={() => selectSelectionType('services')}
            >
              Servicios
            </Button>
            <Button
              type="button"
              variant={selectionType === 'package' ? 'default' : 'outline'}
              size="sm"
              onClick={() => selectSelectionType('package')}
            >
              Paquetes
            </Button>
          </div>

          <div className="citas-services-scroll scrollbar-hide" ref={servicesScrollRef}>
            <div className="citas-services-grid">
              {selectionType === 'services' ? services.map((service) => (
                <ServiceCard
                  key={service.id_servicio}
                  service={service}
                  isSelected={serviceIds.includes(service.id_servicio)}
                  disabled={!canSelectServices}
                  onToggle={() => toggleService(service.id_servicio)}
                />
              )) : packages.map((pkg) => (
                <button
                  key={pkg.id_paquete}
                  type="button"
                  className={`citas-service-card ${selectedPackageId === pkg.id_paquete ? 'is-selected' : ''}`}
                  disabled={!canSelectServices}
                  onClick={() => selectPackage(pkg.id_paquete)}
                >
                  <div className="citas-service-name">{pkg.nombre_paquete || 'Paquete'}</div>
                  <div className="citas-service-meta">
                    <Package size={14} />
                    <span>{Array.isArray(pkg.items) ? `${pkg.items.length} servicios` : 'Paquete'}</span>
                  </div>
                  <div className="citas-service-meta">
                    <span>{formatCurrencyHnl(pkg?.precio_hnl || 0)}</span>
                  </div>
                </button>
              ))}
              {selectionType === 'package' && packages.length === 0 ? (
                <div className="public-booking-packages-empty">
                  <EmptyState
                    icon={Package}
                    title="No hay paquetes disponibles por ahora"
                    description="Puedes continuar reservando por servicios."
                  />
                  <div className="mt-3 flex justify-center">
                    <Button type="button" variant="outline" size="sm" onClick={() => selectSelectionType('services')}>
                      Volver a servicios
                    </Button>
                  </div>
                </div>
              ) : null}
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
          <div className="citas-calendar-head public-booking-calendar-head">
            <h3 className="citas-side-title">Fechas Disponibles</h3>
            {availabilityLoading ? (
              <span className="public-booking-calendar-refresh" aria-live="polite">
                Actualizando disponibilidad...
              </span>
            ) : null}
          </div>

          <>
            <div className="citas-calendar-head" style={{ paddingTop: '0' }}>
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
          </>
        </motion.div>

        <AnimatePresence initial={false}>
          {hasSelectedDate ? (
            <motion.div
              ref={slotsSectionRef}
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
                <div className="public-booking-slot-summary">
                  <span>Duración estimada de la cita: {formatDurationHuman(selectedServicesDurationSum)}</span>
                  <span>Selecciona una hora disponible para continuar con tu reserva.</span>
                </div>
                {selectionType === 'package' && selectedPackage ? (
                  <p className="citas-selected-date">
                    Paquete seleccionado: {selectedPackage.nombre_paquete}
                  </p>
                ) : null}

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
                  <>
                    <div className="public-booking-time-period-tabs">
                      {SLOT_TIME_PERIODS.map((period) => (
                        <button
                          key={period.key}
                          type="button"
                          className={`public-booking-time-period-tab ${activeSlotPeriod === period.key ? 'is-active' : ''}`}
                          onClick={() => setPreferredSlotPeriod(period.key)}
                        >
                          <span>{period.label}</span>
                          <span className="public-booking-time-period-count">{(availableSlotsByPeriod[period.key] || []).length}</span>
                        </button>
                      ))}
                    </div>

                    <div className="public-booking-time-blocks-shell">
                      {totalAvailableSlots === 0 ? (
                        <div className="public-booking-period-empty">
                          <p className="text-sm font-semibold text-[var(--mf-text)]">
                            No hay horarios disponibles para este día.
                          </p>
                          <p className="text-sm text-[var(--mf-text-2)]">Prueba con otra fecha para ver más opciones.</p>
                        </div>
                      ) : (
                        <div className="public-booking-time-block-list">
                          {currentPeriodSlots.length > 0 ? (
                            currentPeriodSlots.map((slot) => (
                              <SlotButton
                                key={slot.hora}
                                slot={slot}
                                selectedTime={selectedTime}
                                onSelect={onSelectTime}
                              />
                            ))
                          ) : (
                            <div className="public-booking-period-empty">
                              <p className="text-sm font-semibold text-[var(--mf-text)]">
                                No hay horarios disponibles en {SLOT_TIME_PERIODS.find((period) => period.key === activeSlotPeriod)?.label || 'esta franja'}.
                              </p>
                              <p className="text-sm text-[var(--mf-text-2)]">Prueba con otra franja del día.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="public-booking-slot-hint">
                  <Clock3 size={14} />
                  <span>Selecciona una hora para habilitar la pantalla de confirmación.</span>
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
              ? 'Acompañantes no habilitados'
              : canAddCompanionBlock
                ? 'Agregar integrante'
                : 'Limite de integrantes alcanzado'}
          </Button>
        </motion.div>
      </div>
    </>
  );
}




