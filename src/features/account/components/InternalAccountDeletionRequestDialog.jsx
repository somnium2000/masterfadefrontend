import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog.jsx";
import { Button } from "../../../components/ui/button.jsx";
import { supabase } from "../../../config/supabaseClient.js";
import { useAuth } from "../../../context/AuthContext.jsx";
import {
  createInternalAccountDeletionRequest,
  getInternalAccountDeletionPreview,
} from "../lib/internalAccountDeletionApi.js";
import {
  INTERNAL_ACCOUNT_DELETION_ACKNOWLEDGEMENTS,
  INTERNAL_ACCOUNT_DELETION_PHRASE,
  INTERNAL_ACCOUNT_DELETION_SUCCESS_MESSAGE,
  areInternalAcknowledgementsComplete,
  canSubmitInternalAccountDeletion,
  createInternalAccountDeletionIdempotencyKey,
  getVisibleInternalDependencies,
  isInternalAccountProtected,
  sanitizeInternalAccountDeletionError,
} from "../lib/internalAccountDeletionFlow.js";

const DEFAULT_ACKS = INTERNAL_ACCOUNT_DELETION_ACKNOWLEDGEMENTS.reduce((acc, item) => {
  acc[item.key] = false;
  return acc;
}, {});

async function getFreshInternalAccountDeletionReauthToken({ expectedUserId, email, password }) {
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
    throw new Error("Ingresa tu contrasena para confirmar tu identidad.");
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

function formatCount(value) {
  return new Intl.NumberFormat("es-HN").format(Number(value || 0));
}

export default function InternalAccountDeletionRequestDialog({
  open,
  onOpenChange,
  onCreated,
}) {
  const { user } = useAuth();
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [acks, setAcks] = useState(DEFAULT_ACKS);
  const previewStartedRef = useRef(false);
  const submitStartedRef = useRef(false);
  const idempotencyKeyRef = useRef("");

  const visibleDependencies = useMemo(() => getVisibleInternalDependencies(preview), [preview]);
  const protectedAccount = useMemo(() => isInternalAccountProtected(preview), [preview]);
  const canSubmit = canSubmitInternalAccountDeletion({
    preview,
    phrase: confirmationPhrase,
    acknowledgements: acks,
    submitting,
  });

  const resetState = useCallback(() => {
    setPreview(null);
    setLoadingPreview(false);
    setSubmitting(false);
    setErrorMessage("");
    setPassword("");
    setConfirmationPhrase("");
    setAcks({ ...DEFAULT_ACKS });
    previewStartedRef.current = false;
    submitStartedRef.current = false;
    idempotencyKeyRef.current = "";
  }, []);

  const handleOpenChange = useCallback((nextOpen) => {
    if (!nextOpen && submitting) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  }, [onOpenChange, resetState, submitting]);

  const loadPreview = useCallback(async () => {
    if (previewStartedRef.current) return;
    previewStartedRef.current = true;
    setLoadingPreview(true);
    setErrorMessage("");
    try {
      setPreview(await getInternalAccountDeletionPreview());
    } catch (error) {
      previewStartedRef.current = false;
      setErrorMessage(sanitizeInternalAccountDeletionError(error, "No se pudo revisar tu cuenta para esta solicitud."));
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
  }, [loadPreview, open]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitStartedRef.current) return;
    submitStartedRef.current = true;
    setSubmitting(true);
    setErrorMessage("");
    let reauthToken = "";
    try {
      reauthToken = await getFreshInternalAccountDeletionReauthToken({
        expectedUserId: user?.id_usuario,
        email: user?.email,
        password,
      });
      if (!areInternalAcknowledgementsComplete(acks) || confirmationPhrase !== INTERNAL_ACCOUNT_DELETION_PHRASE) {
        throw new Error("Debes completar todas las confirmaciones requeridas.");
      }
      if (!idempotencyKeyRef.current) {
        const randomId = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now());
        idempotencyKeyRef.current = createInternalAccountDeletionIdempotencyKey(randomId);
      }
      const result = await createInternalAccountDeletionRequest({
        idempotencyKey: idempotencyKeyRef.current,
        reauthToken,
        confirmationPhrase,
        acknowledgements: acks,
      });
      setPassword("");
      setConfirmationPhrase("");
      onCreated(result, result.message || INTERNAL_ACCOUNT_DELETION_SUCCESS_MESSAGE);
      handleOpenChange(false);
    } catch (error) {
      submitStartedRef.current = false;
      setErrorMessage(sanitizeInternalAccountDeletionError(error, "No fue posible enviar la solicitud."));
    } finally {
      reauthToken = "";
      setPassword("");
      setSubmitting(false);
    }
  }, [acks, canSubmit, confirmationPhrase, handleOpenChange, onCreated, password, user?.email, user?.id_usuario]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Solicitar eliminacion de cuenta</DialogTitle>
          <DialogDescription>
            Revisa las dependencias operativas, confirma tu identidad y envia la solicitud para revision administrativa.
          </DialogDescription>
        </DialogHeader>

        {loadingPreview ? (
          <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4" aria-live="polite">
            <div className="flex items-center gap-3 text-sm text-[var(--mf-text)]">
              <Loader2 size={18} className="animate-spin text-[var(--mf-accent)]" />
              Revisando dependencias operativas.
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <div role="alert" className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {errorMessage}
          </div>
        ) : null}

        {!loadingPreview && preview ? (
          <div className="space-y-5">
            {protectedAccount || preview.can_request === false ? (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-200" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--mf-text)]">Esta cuenta esta protegida</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--mf-text-2)]">
                      Esta cuenta esta protegida y no puede solicitar su eliminacion desde este flujo.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {preview.can_request === true ? (
              <>
                <div className="rounded-2xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-200" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--mf-text)]">Revision administrativa obligatoria</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--mf-text-2)]">
                        La cuenta continuara activa. Un administrador debera resolver dependencias antes de aprobar.
                      </p>
                    </div>
                  </div>
                </div>

                {visibleDependencies.length > 0 ? (
                  <div>
                    <p className="text-sm font-semibold text-[var(--mf-text)]">Dependencias encontradas</p>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                      {visibleDependencies.map((item) => (
                        <li key={item.key} className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3">
                          <p className="text-xs text-[var(--mf-text-2)]">{item.label}</p>
                          <p className="mt-1 text-lg font-semibold text-[var(--mf-text)]">{formatCount(item.count)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3 text-sm text-[var(--mf-text-2)]">
                    No hay dependencias operativas con cantidad pendiente.
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold text-[var(--mf-text)]">Consecuencias si se aprueba</p>
                  <ul className="mt-2 space-y-2 text-sm text-[var(--mf-text)]">
                    <li className="flex gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" />
                      <span>Se revocara el acceso y se desactivaran roles internos.</span>
                    </li>
                    <li className="flex gap-2 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-card)] p-3">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--mf-accent)]" />
                      <span>Los registros laborales e historicos se conservaran de forma protegida o anonimizada.</span>
                    </li>
                  </ul>
                </div>

                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-[var(--mf-text)]">Confirmaciones obligatorias</legend>
                  {INTERNAL_ACCOUNT_DELETION_ACKNOWLEDGEMENTS.map((item) => (
                    <label key={item.key} className="flex items-start gap-3 rounded-xl border border-[var(--mf-nav-border)] bg-[var(--mf-btn-bg)] p-3 text-sm text-[var(--mf-text)]">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-[var(--mf-accent)]"
                        checked={acks[item.key]}
                        disabled={submitting}
                        onChange={(event) => setAcks((prev) => ({ ...prev, [item.key]: event.target.checked }))}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </fieldset>

                <div className="space-y-2">
                  <label htmlFor="internal-delete-phrase" className="text-sm font-semibold text-[var(--mf-text)]">
                    Escribe exactamente: {INTERNAL_ACCOUNT_DELETION_PHRASE}
                  </label>
                  <input
                    id="internal-delete-phrase"
                    className="mf-input"
                    value={confirmationPhrase}
                    disabled={submitting}
                    autoComplete="off"
                    onChange={(event) => setConfirmationPhrase(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="internal-delete-password" className="text-sm font-semibold text-[var(--mf-text)]">
                    Contrasena de la cuenta, si tu sesion Supabase no esta disponible
                  </label>
                  <input
                    id="internal-delete-password"
                    type="password"
                    className="mf-input"
                    value={password}
                    disabled={submitting}
                    autoComplete="current-password"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => handleOpenChange(false)}>
            Cerrar
          </Button>
          {preview?.can_request === true ? (
            <Button type="button" disabled={!canSubmit} onClick={handleSubmit} className="gap-2">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {submitting ? "Enviando..." : "Enviar solicitud"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
