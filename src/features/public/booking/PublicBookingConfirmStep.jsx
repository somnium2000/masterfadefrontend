import { ArrowLeft, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button.jsx';
import { Input } from '../../../components/ui/input.jsx';
import { usePublicBookingFlow } from './PublicBookingFlow.jsx';
import {
  formatCurrencyHnl,
  formatDateOnly,
  getBarberMeta,
  getInitials,
} from './bookingUtils.js';

function HoldResultSummary({ holdResult, holdDurationMin }) {
  if (!holdResult) return null;
  const expiresAt = holdResult.expires_at ? new Date(holdResult.expires_at) : null;

  return (
    <div className="citas-surface p-5 public-booking-success">
      <div className="public-booking-success-head">
        <CheckCircle2 size={18} />
        <span>Reserva creada con exito</span>
      </div>

      <div className="citas-confirm-row">
        <span>ID cita</span>
        <span>{holdResult.id_cita || 'N/D'}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Estado</span>
        <span>{holdResult.estado_cita_codigo || 'en_espera'}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Expira hold</span>
        <span>{expiresAt ? expiresAt.toLocaleString('es-HN') : 'N/D'}</span>
      </div>
      <div className="citas-confirm-row">
        <span>Duracion de hold</span>
        <span>{holdDurationMin} min</span>
      </div>
    </div>
  );
}

export default function PublicBookingConfirmStep() {
  const {
    companionItems,
    companionsCount,
    holdDurationMin,
    holdResult,
    holdSubmitting,
    clientForm,
    paymentRequired,
    selectedBarber,
    selectedDate,
    selectedServices,
    selectedTime,
    submitHold,
    totalToPay,
    updateClientField,
    goToAgenda,
  } = usePublicBookingFlow();

  const selectedBarberMeta = getBarberMeta(selectedBarber);

  return (
    <>
      <div className="citas-confirm-wrap">
        <div className="citas-surface p-5">
          <h3 className="citas-confirm-title">Confirmar reserva</h3>

          <div className="mt-4 flex items-center gap-3">
            <span className="citas-barber-avatar">{getInitials(selectedBarber?.nombre_completo)}</span>
            <div>
              <div className="citas-barber-name">{selectedBarber?.nombre_completo || 'Barbero'}</div>
              <div className="citas-calendar-profile-sub">{selectedBarberMeta.specialty}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="citas-confirm-row">
              <span>Fecha</span>
              <span>{formatDateOnly(selectedDate)}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Hora</span>
              <span>{selectedTime || 'Sin hora'}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Duracion hold</span>
              <span>{holdDurationMin} min</span>
            </div>
            <div className="citas-confirm-row">
              <span>Total a pagar</span>
              <span>{formatCurrencyHnl(totalToPay)}</span>
            </div>
            <div className="citas-confirm-row">
              <span>Acompanantes</span>
              <span>{companionsCount}</span>
            </div>
          </div>

          <div className="citas-confirm-services mt-4">
            <h4 className="citas-confirm-subtitle">Servicios del cliente</h4>
            {selectedServices.length === 0 ? (
              <p className="citas-selected-date">Sin servicios seleccionados.</p>
            ) : (
              selectedServices.map((service) => (
                <div key={`main-${service.id_servicio}`} className="citas-confirm-service-item">
                  <span>{service.nombre_servicio}</span>
                  <span>{formatCurrencyHnl(service.precio_hnl)}</span>
                </div>
              ))
            )}

            {companionItems.length > 0 ? (
              <>
                <h4 className="citas-confirm-subtitle mt-3">Servicios de acompanantes</h4>
                {companionItems.map((item) => (
                  <div key={`companion-${item.index}`} className="citas-confirm-service-item">
                    <span>
                      Acompanante {item.index + 1}: {item.servicio?.nombre_servicio || 'Sin servicio'}
                    </span>
                    <span>{formatCurrencyHnl(item.servicio?.precio_hnl || 0)}</span>
                  </div>
                ))}
              </>
            ) : null}
          </div>

          <div className="public-booking-payment-note mt-4">
            <Clock3 size={14} />
            <span>
              {paymentRequired
                ? 'Pago total obligatorio activo. La pasarela se integra en la siguiente iteracion.'
                : 'La pasarela de pago aun no esta integrada en este flujo.'}
            </span>
          </div>
        </div>

        <div className="citas-surface p-5">
          <h4 className="citas-confirm-subtitle">Datos del cliente</h4>

          <div className="public-booking-form-grid mt-3">
            <div>
              <label className="mf-label" htmlFor="booking-nombre">
                Nombre completo
              </label>
              <Input
                id="booking-nombre"
                className="mf-input mt-1"
                value={clientForm.nombre}
                onChange={(event) => updateClientField('nombre', event.target.value)}
                placeholder="Ej. Juan Perez"
                maxLength={120}
              />
            </div>

            <div>
              <label className="mf-label" htmlFor="booking-telefono">
                Telefono
              </label>
              <Input
                id="booking-telefono"
                className="mf-input mt-1"
                value={clientForm.telefono}
                onChange={(event) => updateClientField('telefono', event.target.value)}
                placeholder="Ej. +50499999999"
                maxLength={20}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mf-label" htmlFor="booking-email">
                Correo
              </label>
              <Input
                id="booking-email"
                className="mf-input mt-1"
                type="email"
                value={clientForm.email}
                onChange={(event) => updateClientField('email', event.target.value)}
                placeholder="cliente@correo.com"
                maxLength={160}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mf-label" htmlFor="booking-notas">
                Notas (opcional)
              </label>
              <textarea
                id="booking-notas"
                className="mf-input mt-1 min-h-[92px] w-full resize-y px-3 py-2"
                value={clientForm.notas}
                onChange={(event) => updateClientField('notas', event.target.value)}
                placeholder="Instrucciones adicionales para la cita"
                maxLength={300}
              />
            </div>
          </div>

          <div className="public-booking-actions is-inline mt-4">
            <Button variant="outline" className="gap-2" onClick={goToAgenda} disabled={holdSubmitting}>
              <ArrowLeft size={15} />
              Volver a agenda
            </Button>
            <Button className="gap-2" onClick={submitHold} disabled={holdSubmitting}>
              {holdSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {holdSubmitting ? 'Creando reserva...' : 'Crear reserva'}
            </Button>
          </div>
        </div>

        <HoldResultSummary holdResult={holdResult} holdDurationMin={holdDurationMin} />
      </div>
    </>
  );
}
