import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import ActionConfirmDialog from "../../../components/feedback/ActionConfirmDialog.jsx";
import { Button } from "../../../components/ui/button.jsx";
import {
  cancelInternalAccountDeletionRequest,
  getCurrentInternalAccountDeletionRequest,
} from "../lib/internalAccountDeletionApi.js";
import {
  INTERNAL_ACCOUNT_DELETION_ACTIVE_MESSAGE,
  INTERNAL_ACCOUNT_DELETION_SUCCESS_MESSAGE,
  isInternalCancellationAllowed,
  mapInternalRequestState,
  sanitizeInternalAccountDeletionError,
} from "../lib/internalAccountDeletionFlow.js";
import InternalAccountDeletionRequestDialog from "../components/InternalAccountDeletionRequestDialog.jsx";

function formatDate(value) {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-HN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
}

export default function InternalAccountDeletionRequestPage() {
  const [currentRequest, setCurrentRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const requestState = useMemo(() => mapInternalRequestState(currentRequest), [currentRequest]);
  const canCancel = isInternalCancellationAllowed(currentRequest);

  const loadCurrentRequest = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const payload = await getCurrentInternalAccountDeletionRequest();
      setCurrentRequest(payload.request);
    } catch (error) {
      setErrorMessage(sanitizeInternalAccountDeletionError(error, "No se pudo cargar tu solicitud actual."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentRequest();
  }, [loadCurrentRequest]);

  const handleCreated = useCallback((result, message) => {
    setCurrentRequest(result?.request || null);
    setNotice(message || INTERNAL_ACCOUNT_DELETION_SUCCESS_MESSAGE);
    setErrorMessage("");
  }, []);

  const handleCancel = useCallback(async () => {
    if (!currentRequest?.id_solicitud || canceling) return;
    setCanceling(true);
    setErrorMessage("");
    setNotice("");
    try {
      await cancelInternalAccountDeletionRequest(currentRequest.id_solicitud);
      setConfirmCancelOpen(false);
      setNotice("La solicitud fue cancelada. Tu cuenta continuara activa.");
      await loadCurrentRequest();
    } catch (error) {
      setErrorMessage(sanitizeInternalAccountDeletionError(error, "No se pudo cancelar la solicitud."));
    } finally {
      setCanceling(false);
    }
  }, [canceling, currentRequest?.id_solicitud, loadCurrentRequest]);

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mf-accent)]">
            Mi cuenta
          </p>
          <h1 className="mf-font-display mt-2 text-3xl font-semibold text-[var(--mf-text)]">
            Eliminacion de cuenta
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--mf-text-2)]">
            El personal interno no se elimina automaticamente. Tu solicitud sera revisada para asegurar que las citas, horarios, permisos y responsabilidades operativas queden resueltos correctamente.
          </p>
        </div>
        <Button
          type="button"
          disabled={loading || Boolean(currentRequest)}
          onClick={() => setDialogOpen(true)}
          className="shrink-0"
        >
          Solicitar eliminacion de mi cuenta
        </Button>
      </div>

      {notice ? (
        <div aria-live="polite" className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {notice}
        </div>
      ) : null}

      {errorMessage ? (
        <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
          {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-5" aria-live="polite">
          <div className="flex items-center gap-3 text-sm text-[var(--mf-text)]">
            <Loader2 size={18} className="animate-spin text-[var(--mf-accent)]" />
            Cargando solicitud actual.
          </div>
        </div>
      ) : currentRequest ? (
        <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-5 shadow-[var(--mf-shadow-soft)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-200">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[var(--mf-text)]">{requestState.title}</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--mf-text-2)]">{requestState.description}</p>
              </div>
            </div>
            {canCancel ? (
              <Button type="button" variant="destructive" onClick={() => setConfirmCancelOpen(true)} className="shrink-0 gap-2">
                <Trash2 size={16} />
                Cancelar solicitud
              </Button>
            ) : null}
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
              <dt className="text-xs text-[var(--mf-text-2)]">Referencia publica</dt>
              <dd className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{currentRequest.referencia_publica || "Sin referencia"}</dd>
            </div>
            <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
              <dt className="text-xs text-[var(--mf-text-2)]">Fecha de solicitud</dt>
              <dd className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{formatDate(currentRequest.solicitado_at)}</dd>
            </div>
            <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3">
              <dt className="text-xs text-[var(--mf-text-2)]">Estado</dt>
              <dd className="mt-1 text-sm font-semibold text-[var(--mf-text)]">{currentRequest.estado_codigo}</dd>
            </div>
          </dl>

          <div className="mt-5 flex gap-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4 text-sm text-[var(--mf-text)]">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" />
            <span>{requestState.accountActiveMessage}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-5">
          <div className="flex gap-3">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" />
            <div>
              <h2 className="text-lg font-semibold text-[var(--mf-text)]">Sin solicitud activa</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--mf-text-2)]">
                {INTERNAL_ACCOUNT_DELETION_ACTIVE_MESSAGE} Puedes iniciar una solicitud cuando necesites revision administrativa.
              </p>
            </div>
          </div>
        </div>
      )}

      <InternalAccountDeletionRequestDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={handleCreated}
      />

      <ActionConfirmDialog
        open={confirmCancelOpen}
        onOpenChange={setConfirmCancelOpen}
        title="Cancelar solicitud?"
        description="La solicitud dejara de estar pendiente y tu cuenta continuara activa."
        cancelLabel="Volver"
        confirmLabel="Cancelar solicitud"
        tone="danger"
        loading={canceling}
        onConfirm={handleCancel}
      />
    </section>
  );
}
