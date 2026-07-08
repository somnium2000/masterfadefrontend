import { AlertCircle, Building2, Scissors } from 'lucide-react';
import EmptyState from '../../../components/data/EmptyState.jsx';
import { Button } from '../../../components/ui/button.jsx';
import { BarberCard } from './PublicBookingBlocks.jsx';
import { usePublicBookingFlow } from './BookingFlowContext.jsx';
import BookingStepHeader from './components/BookingStepHeader.jsx';

export default function PublicBookingBarberosStep() {
  const {
    barbers,
    barbersLoading,
    barbersRefreshing,
    branchList,
    contextError,
    contextLoading,
    fetchContext,
    mode = 'public',
    selectedBranchId,
    selectBarber,
    selectBranch,
  } = usePublicBookingFlow();

  return (
    <>
      <section className="citas-surface p-5 public-booking-barberos-shell">
        <BookingStepHeader
          kicker={mode === 'preview' ? 'Vista previa admin' : 'Agendamiento publico'}
          title="Selecciona sucursal y barbero"
          subtitle={mode === 'preview'
            ? 'Esta vista replica el flujo publico con reglas guardadas para validar comportamiento antes de publicar.'
            : 'Este flujo esta disponible sin iniciar sesion y no comparte navbar o sidebar del panel interno.'}
        />

        {contextLoading ? (
          <div className="public-booking-form-row mt-4">
            <span className="mf-label">Sucursal</span>
            <div className="public-booking-skeleton public-booking-skeleton-select" aria-hidden="true" />
          </div>
        ) : contextError ? (
          <EmptyState
            icon={AlertCircle}
            title="No se pudo cargar el contexto"
            description={contextError}
            action={(
              <Button type="button" variant="outline" onClick={fetchContext}>
                Reintentar
              </Button>
            )}
          />
        ) : branchList.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Sin sucursales activas"
            description="No hay sucursales activas disponibles para agendar en este momento."
          />
        ) : (
          <div className="public-booking-form-row mt-4">
            <label htmlFor="booking-branch" className="mf-label">
              Sucursal
            </label>
            <select
              id="booking-branch"
              className="mf-select"
              value={selectedBranchId}
              onChange={(event) => selectBranch(event.target.value)}
            >
              {branchList.map((branch) => (
                <option key={branch.id_sucursal} value={branch.id_sucursal}>
                  {branch.nombre_sucursal || 'Sucursal'}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {selectedBranchId && barbersLoading && barbers.length === 0 ? (
        <div className="citas-surface p-5 public-booking-barberos-shell">
          <div className="public-booking-barber-grid" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <article key={`barber-skeleton-${index}`} className="public-booking-barber-card public-booking-barber-card-skeleton">
                <div className="public-booking-skeleton public-booking-skeleton-image" />
                <div className="public-booking-barber-card-body">
                  <div className="public-booking-skeleton public-booking-skeleton-title" />
                  <div className="public-booking-skeleton public-booking-skeleton-text" />
                  <div className="public-booking-skeleton public-booking-skeleton-text short" />
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {!contextLoading && !contextError && selectedBranchId && !barbersLoading && barbers.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="Sin barberos disponibles"
          description="No hay barberos activos para la sucursal seleccionada."
        />
      ) : null}

      {barbers.length > 0 ? (
        <section className="citas-surface p-5 public-booking-barberos-shell">
          {barbersRefreshing ? (
            <p className="citas-selected-date mb-3">Actualizando barberos para esta sucursal...</p>
          ) : null}
          <div className="public-booking-barber-grid">
            {barbers.map((barber) => (
              <BarberCard
                key={barber.id_empleado}
                barber={barber}
                onSelect={selectBarber}
              />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
