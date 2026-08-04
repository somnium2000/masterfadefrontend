import { Loader2, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";
import { Button } from "../../../components/ui/button.jsx";
import {
  getAdminAccountDeletionStatusLabel,
  getDependencyResolutionRoute,
} from "../lib/adminAccountDeletionFlow.js";

function formatDate(value) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-HN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function dependencyItems(detail) {
  const deps = detail?.dependencies || {};
  return [
    ["Citas futuras", deps.future_operational_appointments, "INTERNAL_ACCOUNT_DELETION_FUTURE_APPOINTMENTS_PENDING"],
    ["Tarifas activas", deps.active_employee_service_rates, "INTERNAL_ACCOUNT_DELETION_ACTIVE_SERVICE_RATES"],
    ["Promociones activas", deps.active_promotion_references, "INTERNAL_ACCOUNT_DELETION_ACTIVE_PROMOTION_REFERENCES"],
    ["Horarios activos", deps.active_weekly_schedules, null],
    ["Bloqueos de agenda", deps.future_agenda_blocks, null],
    ["Perfil publico", deps.public_barber_profiles, null],
  ].filter(([, count]) => Number(count || 0) > 0);
}

export default function AdminAccountDeletionDetailDialog({
  open,
  detail,
  basePath,
  loading,
  retrying,
  onOpenChange,
  onRefresh,
  onApprove,
  onReject,
  onRetry,
}) {
  const navigate = useNavigate();
  const permissions = detail?.permissions || {};
  const technical = detail?.technical || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Detalle de eliminacion</DialogTitle>
          <DialogDescription>
            Informacion administrativa sanitizada de la solicitud.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4 text-sm text-[var(--mf-text)]" aria-live="polite">
            <Loader2 size={18} className="animate-spin text-[var(--mf-accent)]" />
            Cargando detalle.
          </div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3">
                <p className="text-xs text-[var(--mf-text-2)]">Referencia</p>
                <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{detail.request.referencia_publica}</p>
              </div>
              <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3">
                <p className="text-xs text-[var(--mf-text-2)]">Estado</p>
                <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{getAdminAccountDeletionStatusLabel(detail.request.estado_codigo)}</p>
              </div>
              <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3">
                <p className="text-xs text-[var(--mf-text-2)]">Fecha</p>
                <p className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{formatDate(detail.request.solicitado_at)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-4">
              <h3 className="text-sm font-semibold text-[var(--mf-text)]">{detail.subject.display_name}</h3>
              <p className="mt-2 text-xs text-[var(--mf-text-2)]">
                Roles: {detail.subject.active_roles.join(", ") || "Sin roles activos"}
              </p>
              <p className="mt-1 text-xs text-[var(--mf-text-2)]">
                Sucursales: {detail.subject.branches.join(", ") || "Sin sucursal"}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-[var(--mf-text)]">Dependencias</h3>
                <Button type="button" variant="outline" size="sm" onClick={onRefresh} className="gap-2">
                  <RefreshCw size={14} />
                  Actualizar dependencias
                </Button>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {dependencyItems(detail).map(([label, count, code]) => {
                  const route = code ? getDependencyResolutionRoute(code, basePath) : null;
                  return (
                    <div key={label} className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
                      <p className="text-xs text-[var(--mf-text-2)]">{label}</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--mf-text)]">{Number(count || 0)}</p>
                      {route ? (
                        <button type="button" className="mt-2 text-xs font-semibold text-[var(--mf-accent)]" onClick={() => navigate(route)}>
                          Ir al modulo
                        </button>
                      ) : null}
                    </div>
                  );
                })}
                {dependencyItems(detail).length === 0 ? (
                  <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text-2)]">
                    Sin dependencias pendientes.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-4">
              <h3 className="text-sm font-semibold text-[var(--mf-text)]">Estado tecnico</h3>
              <p className="mt-2 text-sm text-[var(--mf-text-2)]">
                {technical.retryable ? "Reintentable" : "Sin reintento pendiente"}
                {technical.error_code ? ` · ${technical.error_code}` : ""}
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {permissions.can_retry && technical.retryable ? (
            <Button type="button" variant="outline" disabled={retrying} onClick={onRetry}>
              {retrying ? "Reintentando..." : "Reintentar proceso"}
            </Button>
          ) : null}
          {permissions.can_reject ? (
            <Button type="button" variant="destructive" onClick={onReject}>
              Rechazar
            </Button>
          ) : null}
          {permissions.can_approve ? (
            <Button type="button" onClick={onApprove}>
              Aprobar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
