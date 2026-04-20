import { ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../../components/ui/dialog.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import {
  formatCurrencyHnl,
  formatDateOnly,
  formatTime12Hour,
  HONDURAS_TIME_ZONE,
} from './bookingUtils.js';

function formatRemainingTime(remainingMs) {
  if (remainingMs == null) return '--:--';
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getServicesLabel(block, bookingBlocksSummary) {
  const source = Array.isArray(bookingBlocksSummary)
    ? bookingBlocksSummary.find((item) => item?.id === block?.id || item?.alias === block?.alias)
    : null;

  if (source?.selection_type === 'package') {
    return `Paquete: ${source?.selectedPackage?.nombre_paquete || 'Sin paquete'}`;
  }

  const services = Array.isArray(source?.selectedServices)
    ? source.selectedServices.map((service) => service?.nombre_servicio).filter(Boolean)
    : [];

  return services.length ? services.join(', ') : 'Sin servicios';
}

function normalizeDateKey(rawDate) {
  const normalized = String(rawDate || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function buildFriendlyReservationCode(holdResult) {
  const sourceId = String(holdResult?.id_grupo_cita || holdResult?.bloques?.[0]?.id_cita || '').replace(/-/g, '').toUpperCase();
  const dateRaw = normalizeDateKey(holdResult?.bloques?.[0]?.fecha);
  const datePart = dateRaw ? dateRaw.replace(/-/g, '') : new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = sourceId.slice(0, 4).padEnd(4, 'X');
  return `MF-${datePart}-${suffix}`;
}

function getConfirmationTitle(holdResult) {
  const blockCount = Array.isArray(holdResult?.bloques) ? holdResult.bloques.length : 0;
  return blockCount > 1 ? 'Reserva grupal confirmada' : 'Cita confirmada';
}

function FinalConfirmationPanel({
  holdResult,
  bookingBlocksSummary,
  onBackHome,
  selectedBranch,
  simulationNoPayment,
}) {
  if (!holdResult) return null;

  const bloques = Array.isArray(holdResult?.bloques) ? holdResult.bloques : [];
  const titular = String(bookingBlocksSummary?.[0]?.contactName || bookingBlocksSummary?.[0]?.alias || 'Titular').trim();
  const firstBlock = bloques[0] || null;
  const branchName = selectedBranch?.nombre_sucursal || 'Sucursal seleccionada';
  const reservationCode = buildFriendlyReservationCode(holdResult);
  const title = getConfirmationTitle(holdResult);

  return (
    <div className="public-booking-success public-booking-final-sheet">
      <div className="public-booking-success-head">
        <CheckCircle2 size={20} />
        <span>{title}</span>
      </div>

      <div className="public-booking-final-code">Código de reserva: <strong>{reservationCode}</strong></div>

      <div className="citas-confirm-row">
        <span>Titular</span>
        <span>{titular || 'Titular'}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Sucursal</span>
        <span>{branchName}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Barbero</span>
        <span>{firstBlock?.nombre_barbero || 'Asignado'}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Fecha y hora</span>
        <span>{formatDateOnly(firstBlock?.fecha || '')} {formatTime12Hour(firstBlock?.hora || '')}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Estado</span>
        <span>Confirmada</span>
      </div>
      <div className="citas-confirm-row">
        <span>Total</span>
        <span>{formatCurrencyHnl(holdResult?.monto_total_hnl || 0)}</span>
      </div>

      <div className="public-booking-payment-note mt-4">
        <span>
          {simulationNoPayment
            ? 'Modo actual: simulación sin pago activa. Esta base queda lista para conectar luego "Continuar al pago".'
            : 'Base de pago preparada: aquí se conectará el flujo real de redirección y confirmación de pago.'}
        </span>
      </div>

      {bloques.length > 0 ? (
        <div className="citas-confirm-services mt-4">
          <h4 className="citas-confirm-subtitle">Resumen por integrante</h4>
          {bloques.map((block) => (
            <div key={block.id_cita || `${block.orden_integrante}-${block.alias}`} className="citas-confirm-service-item">
              <span>
                {block.alias || `Integrante ${block.orden_integrante || ''}`}: {getServicesLabel(block, bookingBlocksSummary)}
              </span>
              <span>{block.nombre_barbero || 'Barbero'} · {formatDateOnly(block.fecha || '')} {formatTime12Hour(block.hora || '')}</span>
              <span>{formatCurrencyHnl(block.monto_total_hnl || 0)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="public-booking-actions is-inline mt-4">
        <Button className="gap-2" onClick={onBackHome}>
          Ir al inicio
        </Button>
      </div>
    </div>
  );
}

export default function PublicBookingConfirmStep() {
  const booking = usePublicBookingFlow();
  const {
    bookingBlocksSummary,
    completeBookingFlow,
    holdExpired,
    holdExpiresAtIso,
    holdRemainingMs,
    holdDurationMin,
    holdResult,
    holdSubmitting,
    mode = 'public',
    paymentRequired,
    selectedBranch,
    simulationNoPayment,
    submitHold,
    totalToPay,
    goToAgenda,
  } = booking;

  const nextActionLabel = simulationNoPayment
    ? (mode === 'preview' ? 'Simular y confirmar reserva' : 'Confirmar reserva')
    : (mode === 'preview' ? 'Preparar confirmación' : 'Confirmar y continuar');

  return (
    <>
      <div className="citas-confirm-wrap">
        <div className="citas-surface p-5">
          <h3 className="citas-confirm-title">
            {mode === 'preview' ? 'Validar reserva grupal' : 'Confirmar reserva'}
          </h3>

          <div className="mt-4">
            <div className="citas-confirm-row">
              <span>Integrantes</span>
              <span>{bookingBlocksSummary.length}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Total servicios</span>
              <span>{formatCurrencyHnl(totalToPay)}</span>
            </div>
            {!simulationNoPayment ? (
              <>
                <div className="citas-confirm-row">
                  <span>Tiempo de confirmación</span>
                  <span>{formatRemainingTime(holdRemainingMs)}</span>
                </div>
                <div className="citas-confirm-row">
                  <span>Vence a las</span>
                  <span>
                    {holdExpiresAtIso
                      ? new Date(holdExpiresAtIso).toLocaleTimeString('es-HN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                        timeZone: HONDURAS_TIME_ZONE,
                      })
                      : 'N/D'}
                  </span>
                </div>
                <div className="citas-confirm-row">
                  <span>Ventana configurada</span>
                  <span>{holdDurationMin} min</span>
                </div>
              </>
            ) : null}
          </div>

          <div className="citas-confirm-services mt-4">
            <h4 className="citas-confirm-subtitle">Resumen por integrante</h4>
            {bookingBlocksSummary.map((block) => (
              <div key={block.id} className="citas-confirm-service-item">
                <span>
                  {block.alias}: {block.selection_type === 'package'
                    ? `Paquete ${block.selectedPackage?.nombre_paquete || 'Sin paquete'}`
                    : (block.selectedServices.map((service) => service.nombre_servicio).join(', ') || 'Sin servicios')}
                  {' '}
                  ({formatDateOnly(block.selectedDate)} {formatTime12Hour(block.selectedTime || '')})
                </span>
                <span>{formatCurrencyHnl(block.total_hnl)}</span>
              </div>
            ))}
          </div>

          <div className="public-booking-payment-note mt-4">
            <span>
              {simulationNoPayment
                ? 'Modo simulado activo: no se ejecuta cobro real. Esta pantalla ya está preparada para evolucionar a estados de pago (redirigiendo, pendiente, confirmado, fallido, cancelado, expirado).'
                : paymentRequired
                  ? 'Pago total obligatorio activo. El botón principal se conectará luego con el proveedor de pago real.'
                  : 'Pago opcional activo. Se integrará el flujo real en la siguiente fase.'}
            </span>
          </div>

          {!simulationNoPayment && holdExpired ? (
            <p className="mt-3 rounded-[12px] border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              El tiempo de confirmación expiró. Si la hora sigue libre, vuelve a agenda para intentarlo de nuevo.
            </p>
          ) : null}

          <div className="public-booking-actions is-inline mt-4">
            <Button variant="outline" className="gap-2" onClick={goToAgenda} disabled={holdSubmitting || Boolean(holdResult)}>
              <ArrowLeft size={15} />
              Volver a agenda
            </Button>
            <Button className="gap-2" onClick={submitHold} disabled={holdSubmitting || Boolean(holdResult)}>
              {holdSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {holdSubmitting
                ? (mode === 'preview' ? 'Procesando simulación...' : 'Confirmando reserva...')
                : nextActionLabel}
            </Button>
          </div>
        </div>

        <Dialog open={Boolean(holdResult)} onOpenChange={() => {}}>
          <DialogContent
            className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>{getConfirmationTitle(holdResult)}</DialogTitle>
              <DialogDescription>
                Revisa los detalles de tu reserva antes de finalizar.
              </DialogDescription>
            </DialogHeader>
            <FinalConfirmationPanel
              holdResult={holdResult}
              bookingBlocksSummary={bookingBlocksSummary}
              selectedBranch={selectedBranch}
              simulationNoPayment={simulationNoPayment}
              onBackHome={completeBookingFlow}
            />
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
