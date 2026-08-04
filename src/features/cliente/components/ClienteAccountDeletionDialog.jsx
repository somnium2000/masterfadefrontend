import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";
import { supabase } from "../../../config/supabaseClient.js";
import {
  confirmClienteAccountDeletionRequest,
  createClienteAccountDeletionRequest,
  getClienteAccountDeletionPreview,
} from "../lib/clienteApi.js";
import { saveAccountDeletionContinuation } from "../lib/accountDeletionContinuation.js";

const CONFIRMATION_TEXT = "ELIMINAR MI CUENTA";
const ACK_FIELDS = [
  {
    key: "acepta_perder_masterpuntos",
    label: "Reconozco que perdere los MasterPuntos disponibles.",
  },
  {
    key: "acepta_cancelar_membresia",
    label: "Reconozco que una membresia activa sera cancelada y sus beneficios no podran recuperarse.",
  },
  {
    key: "acepta_historial_anonimizado",
    label: "Reconozco que cierta historia financiera, fiscal o de auditoria sera retenida de forma anonimizada o protegida.",
  },
  {
    key: "acepta_irreversibilidad",
    label: "Reconozco que la eliminacion es definitiva y perdere el acceso a mi cuenta.",
  },
];

function normalizePayload(response) {
  return response?.data || response;
}

function toMessageList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      code: String(item?.code || "").trim(),
      message: String(item?.message || "").trim(),
    }))
    .filter((item) => item.message);
}

function resolveFunctionalError(error, fallback = "No fue posible completar la operacion. Intenta nuevamente.") {
  const raw = String(error?.data?.error?.message || error?.message || "").trim();
  if (!raw) return fallback;
  const lowered = raw.toLowerCase();
  if (lowered.includes("postgres") || lowered.includes("supabase") || lowered.includes("storage") || lowered.includes("sql")) {
    return fallback;
  }
  return raw;
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("es-HN").format(number);
}

function buildConsequenceDetails(preview) {
  const details = [];
  const membershipPlan = preview?.membership?.active_plan?.nombre_plan;
  const masterpoints = Number(preview?.masterpoints?.balance || 0);
  const pendingOrders = Number(preview?.pending_membership_orders?.count || 0);
  const retained = preview?.retained_history || {};
  const retainedTotal = Number(retained.appointments_count || 0)
    + Number(retained.payments_count || 0)
    + Number(retained.subscriptions_count || 0)
    + Number(retained.points_transactions_count || 0);

  if (preview?.membership?.will_cancel) {
    details.push(`Membresia activa${membershipPlan ? ` (${membershipPlan})` : ""}: sera cancelada.`);
  }
  if (masterpoints > 0) {
    details.push(`MasterPuntos disponibles: ${formatNumber(masterpoints)} puntos seran eliminados.`);
  }
  if (pendingOrders > 0) {
    details.push(`Ordenes pendientes de membresia: ${formatNumber(pendingOrders)} seran canceladas.`);
  }
  if (retainedTotal > 0 || retained?.will_be_anonymized) {
    details.push("Historial financiero, fiscal u operativo: permanecera registrado de forma protegida o anonimizada.");
  }
  details.push("Acceso: perderas definitivamente el ingreso a esta cuenta.");
  details.push("Beneficios: no podras recuperar puntos, membresias ni beneficios cancelados.");
  return details;
}

async function getFreshAccountDeletionReauthToken({ expectedUserId, email, password }) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado para confirmar tu identidad.");
  }
  const safeExpectedUserId = String(expectedUserId || "").trim();
  const safeEmail = String(email || "").trim().toLowerCase();
  if (!safeExpectedUserId) {
    throw new Error("No se pudo validar la identidad de esta sesion.");
  }

  const sessionResult = await supabase.auth.getSession();
  const currentSession = sessionResult?.data?.session;
  if (currentSession?.user?.id && String(currentSession.user.id) === safeExpectedUserId) {
    const refreshed = await supabase.auth.refreshSession();
    const refreshedSession = refreshed?.data?.session;
    const refreshedUserId = String(refreshed?.data?.user?.id || refreshedSession?.user?.id || "").trim();
    const accessToken = String(refreshedSession?.access_token || "").trim();
    if (refreshed?.error) {
      throw new Error("La sesion Supabase no esta disponible para confirmar tu identidad.");
    }
    if (refreshedUserId !== safeExpectedUserId) {
      throw new Error("La identidad confirmada no coincide con tu cuenta.");
    }
    if (!accessToken) {
      throw new Error("No se recibio un token reciente para confirmar tu identidad.");
    }
    return accessToken;
  }

  const safePassword = String(password || "");
  if (!safePassword) {
    throw new Error("Para confirmar tu identidad, cierra sesion, vuelve a ingresar con Google y repite la eliminacion.");
  }
  if (!safeEmail) {
    throw new Error("No se pudo resolver el correo de tu perfil para confirmar tu identidad.");
  }

  const passwordResult = await supabase.auth.signInWithPassword({
    email: safeEmail,
    password: safePassword,
  });
  const userId = String(passwordResult?.data?.user?.id || "").trim();
  const accessToken = String(passwordResult?.data?.session?.access_token || "").trim();
  if (passwordResult?.error) {
    throw new Error("La contrasena no pudo confirmar tu identidad.");
  }
  if (userId !== safeExpectedUserId) {
    throw new Error("La identidad confirmada no coincide con tu cuenta.");
  }
  if (!accessToken) {
    throw new Error("No se recibio un token reciente para confirmar tu identidad.");
  }
  return accessToken;
}

export default function ClienteAccountDeletionDialog({
  open,
  onOpenChange,
  profile,
  expectedUserId,
}) {
  const navigate = useNavigate();
  const [step, setStep] = useState("preview");
  const [preview, setPreview] = useState(null);
  const [requestInfo, setRequestInfo] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [acks, setAcks] = useState(() => ({
    acepta_perder_masterpuntos: false,
    acepta_cancelar_membresia: false,
    acepta_historial_anonimizado: false,
    acepta_irreversibilidad: false,
  }));
  const previewStartedRef = useRef(false);
  const createStartedRef = useRef(false);
  const confirmStartedRef = useRef(false);
  const idempotencyKeyRef = useRef("");

  const blockingReasons = useMemo(() => toMessageList(preview?.blocking_reasons), [preview?.blocking_reasons]);
  const consequences = useMemo(() => toMessageList(preview?.consequences), [preview?.consequences]);
  const consequenceDetails = useMemo(() => buildConsequenceDetails(preview), [preview]);
  const allAcknowledged = ACK_FIELDS.every((item) => acks[item.key] === true);
  const phraseMatches = confirmationText === CONFIRMATION_TEXT;
  const canConfirm = Boolean(requestInfo?.id_solicitud && allAcknowledged && phraseMatches && !confirming && !creatingRequest);

  const resetDialogState = useCallback(() => {
    setStep("preview");
    setPreview(null);
    setRequestInfo(null);
    setLoadingPreview(false);
    setCreatingRequest(false);
    setConfirming(false);
    setErrorMessage("");
    setPassword("");
    setConfirmationText("");
    setAcks({
      acepta_perder_masterpuntos: false,
      acepta_cancelar_membresia: false,
      acepta_historial_anonimizado: false,
      acepta_irreversibilidad: false,
    });
    previewStartedRef.current = false;
    createStartedRef.current = false;
    confirmStartedRef.current = false;
    idempotencyKeyRef.current = "";
  }, []);

  const loadPreview = useCallback(async () => {
    if (previewStartedRef.current) return;
    previewStartedRef.current = true;
    setLoadingPreview(true);
    setErrorMessage("");
    try {
      const payload = await getClienteAccountDeletionPreview();
      setPreview(normalizePayload(payload));
    } catch (error) {
      previewStartedRef.current = false;
      setErrorMessage(resolveFunctionalError(error, "No se pudo revisar si tu cuenta puede eliminarse."));
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const handleOpenChange = useCallback((nextOpen) => {
    if (!nextOpen && confirming) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetDialogState();
    }
  }, [confirming, onOpenChange, resetDialogState]);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
  }, [loadPreview, open]);

  const handleCreateRequest = useCallback(async () => {
    if (!preview?.can_delete || createStartedRef.current) return;
    createStartedRef.current = true;
    setCreatingRequest(true);
    setErrorMessage("");
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `cliente-account-deletion-${crypto.randomUUID()}`;
      }
      const payload = await createClienteAccountDeletionRequest({
        idempotencyKey: idempotencyKeyRef.current,
      });
      const normalized = normalizePayload(payload);
      const nextRequest = normalized?.request || null;
      setRequestInfo(nextRequest);
      if (nextRequest?.estado_codigo === "bloqueada") {
        setPreview(normalized?.preview || preview);
        setStep("blocked");
        return;
      }
      setStep("confirm");
    } catch (error) {
      createStartedRef.current = false;
      setErrorMessage(resolveFunctionalError(error, "No se pudo crear la solicitud de eliminacion."));
    } finally {
      setCreatingRequest(false);
    }
  }, [preview]);

  const handleConfirm = useCallback(async () => {
    if (!canConfirm || confirmStartedRef.current) return;
    confirmStartedRef.current = true;
    setConfirming(true);
    setErrorMessage("");
    let reauthToken = "";
    try {
      reauthToken = await getFreshAccountDeletionReauthToken({
        expectedUserId,
        email: profile?.correo_principal,
        password,
      });
      if (!ACK_FIELDS.every((item) => acks[item.key] === true) || confirmationText !== CONFIRMATION_TEXT) {
        throw new Error("Debes completar todas las confirmaciones requeridas.");
      }
      const payload = await confirmClienteAccountDeletionRequest(requestInfo.id_solicitud, {
        reauth_token: reauthToken,
        confirmacion_texto: confirmationText,
        ...acks,
      });
      const normalized = normalizePayload(payload);
      if (normalized?.ready_for_processing !== true || !normalized?.execution?.token || !normalized?.execution?.expires_at) {
        setPreview(normalized?.preview || preview);
        setStep("blocked");
        setPassword("");
        setConfirmationText("");
        return;
      }
      const saved = saveAccountDeletionContinuation({
        reference: normalized?.request?.referencia_publica || requestInfo?.referencia_publica,
        executionToken: normalized.execution.token,
        executionExpiresAt: normalized.execution.expires_at,
        savedAt: new Date().toISOString(),
      });
      if (!saved) {
        throw new Error("No se pudo resguardar temporalmente la continuacion de la eliminacion.");
      }
      setPassword("");
      setConfirmationText("");
      navigate("/eliminacion-de-cuenta", { replace: true });
    } catch (error) {
      confirmStartedRef.current = false;
      setErrorMessage(resolveFunctionalError(error, "No se pudo confirmar la eliminacion de la cuenta."));
    } finally {
      reauthToken = "";
      setPassword("");
      setConfirming(false);
    }
  }, [acks, canConfirm, confirmationText, expectedUserId, navigate, password, preview, profile?.correo_principal, requestInfo]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Eliminar cuenta</DialogTitle>
          <DialogDescription>
            Revisa las consecuencias y confirma tu identidad antes de solicitar la eliminacion definitiva.
          </DialogDescription>
        </DialogHeader>

        {loadingPreview ? (
          <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4" aria-live="polite">
            <div className="flex items-center gap-3 text-sm text-[var(--mf-text)]">
              <Loader2 size={18} className="animate-spin text-[var(--mf-accent)]" />
              Estamos revisando si tu cuenta puede eliminarse.
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {errorMessage}
          </div>
        ) : null}

        {!loadingPreview && preview && (preview.can_delete === false || step === "blocked") ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-200" />
                <div>
                  <p className="text-sm font-semibold text-[var(--mf-text)]">Tu cuenta no puede eliminarse todavia</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--mf-text-2)]">
                    Debes resolver estas operaciones antes de intentar eliminar tu cuenta.
                  </p>
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {blockingReasons.map((reason) => (
                <li key={`${reason.code}-${reason.message}`} className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text)]">
                  {reason.message}
                  {reason.code ? <span className="mt-1 block text-[11px] uppercase tracking-[0.12em] text-[var(--mf-text-2)]">{reason.code}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {!loadingPreview && preview?.can_delete === true && step === "preview" ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-200" />
                <div>
                  <p className="text-sm font-semibold text-[var(--mf-text)]">Consecuencias de eliminar tu cuenta</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--mf-text-2)]">
                    Esta accion desactiva tu acceso, cancela beneficios activos, elimina MasterPuntos disponibles y anonimiza tu informacion operativa.
                  </p>
                </div>
              </div>
            </div>
            <ul className="space-y-2">
              {[...consequenceDetails, ...consequences.map((item) => item.message)].filter(Boolean).map((message) => (
                <li key={message} className="flex gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3 text-sm text-[var(--mf-text)]">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" />
                  <span>{message}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === "confirm" ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm leading-6 text-[var(--mf-text)]">
              Escribe la frase exacta y confirma cada reconocimiento para continuar. Esta accion no se puede deshacer.
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-[var(--mf-text)]">Reconocimientos obligatorios</legend>
              {ACK_FIELDS.map((item) => (
                <label key={item.key} className="flex items-start gap-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text)]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--mf-accent)]"
                    checked={acks[item.key]}
                    disabled={confirming}
                    onChange={(event) => setAcks((prev) => ({ ...prev, [item.key]: event.target.checked }))}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-2">
              <label htmlFor="account-delete-phrase" className="text-sm font-semibold text-[var(--mf-text)]">
                Escribe exactamente: {CONFIRMATION_TEXT}
              </label>
              <input
                id="account-delete-phrase"
                className="mf-input"
                value={confirmationText}
                disabled={confirming}
                autoComplete="off"
                onChange={(event) => setConfirmationText(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="account-delete-password" className="text-sm font-semibold text-[var(--mf-text)]">
                Contrasena de la cuenta, si tu sesion Supabase no esta disponible
              </label>
              <input
                id="account-delete-password"
                type="password"
                className="mf-input"
                value={password}
                disabled={confirming}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs leading-5 text-[var(--mf-text-2)]">
                Si usas Google y tu sesion social local no puede refrescarse, cierra sesion, vuelve a ingresar con Google y repite la eliminacion.
              </p>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--mf-btn-border)] bg-[var(--mf-card)] px-4 text-sm font-semibold text-[var(--mf-text)]"
            disabled={confirming}
            onClick={() => handleOpenChange(false)}
          >
            Cerrar
          </button>
          {preview?.can_delete === true && step === "preview" ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-red-400/40 bg-red-500/15 px-4 text-sm font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={creatingRequest}
              onClick={handleCreateRequest}
            >
              {creatingRequest ? "Creando solicitud..." : "Continuar"}
            </button>
          ) : null}
          {step === "confirm" ? (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-400/40 bg-red-500/20 px-4 text-sm font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              {confirming ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {confirming ? "Confirmando..." : "Eliminar mi cuenta definitivamente"}
            </button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
