import { ArrowRight, Scissors } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import EmptyState from '../../../components/data/EmptyState.jsx';
import LoadingSpinner from '../../../components/data/LoadingSpinner.jsx';
import { BarberCard } from './PublicBookingBlocks.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';

export default function PublicBookingBarberosStep() {
  const {
    barbers,
    barbersLoading,
    branchList,
    goToAgenda,
    selectedBarberId,
    selectedBranchId,
    selectBarber,
    selectBranch,
  } = usePublicBookingFlow();

  return (
    <>
      <section className="citas-surface p-5">
        <p className="public-booking-kicker">Agendamiento publico</p>
        <h1 className="public-booking-title">Selecciona sucursal y barbero</h1>
        <p className="public-booking-subtitle">
          Este flujo esta disponible sin iniciar sesion y no comparte navbar o sidebar del panel interno.
        </p>

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
      </section>

      {barbersLoading ? (
        <div className="citas-surface p-6">
          <LoadingSpinner />
        </div>
      ) : null}

      {!barbersLoading && barbers.length === 0 ? (
        <EmptyState
          icon={Scissors}
          title="Sin barberos disponibles"
          description="No hay barberos activos para la sucursal seleccionada."
        />
      ) : null}

      {!barbersLoading && barbers.length > 0 ? (
        <section className="citas-surface p-5">
          <div className="citas-barber-grid">
            {barbers.map((barber) => (
              <BarberCard
                key={barber.id_empleado}
                barber={barber}
                isSelected={barber.id_empleado === selectedBarberId}
                onSelect={() => selectBarber(barber.id_empleado)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="public-booking-actions">
        <Button
          className="gap-2"
          disabled={!selectedBranchId || !selectedBarberId}
          onClick={goToAgenda}
        >
          Continuar a servicio y horario
          <ArrowRight size={15} />
        </Button>
      </div>
    </>
  );
}
