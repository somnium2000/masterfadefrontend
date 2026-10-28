import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// AM: El popup devuelve solo evidencia efimera al opener del mismo origen; nunca persiste credenciales.
function relayDeletionGoogleResult() {
  const url = new URL(window.location.href), nonce = url.searchParams.get('mf_delete_reauth');
  if (!nonce || !window.opener) return;
  const hash = new URLSearchParams(url.hash.slice(1)), token = hash.get('access_token');
  url.hash = ''; url.searchParams.delete('mf_delete_reauth');
  window.history.replaceState({}, '', url.pathname + url.search);
  window.opener.postMessage({ type: 'mf-delete-reauth', nonce, token, failed: Boolean(hash.get('error') || !token) }, url.origin);
  window.close();
}

// AM: Una sesion existente o refresh nunca sustituye password/OAuth nuevos.
async function getFreshInternalAccountDeletionReauthToken({ expectedUserId, email, password, method = 'password', isCurrent = () => true }) {
  if (!supabase || !expectedUserId || !isCurrent()) throw new Error('No se pudo validar la identidad de esta sesion.');
  const startedAt = Math.floor(Date.now() / 1000);
  let token = '';
  if (method === 'google') {
    const nonce = crypto.randomUUID(), origin = window.location.origin;
    const popup = window.open('about:blank', nonce, 'popup,width=480,height=720');
    if (!popup) throw new Error('Permite la ventana de Google para confirmar tu identidad.');
    try {
      token = await new Promise((resolve, reject) => {
        let timer, settled = false;
        const finish = (value, failed) => {
          if (settled) return; settled = true;
          window.removeEventListener('message', receive); window.clearInterval(timer);
          popup.close();
          if (failed) reject(new Error('No se pudo confirmar Google. Intenta nuevamente con la misma cuenta.'));
          else resolve(value);
        };
        const receive = event => {
          if (event.origin !== origin || event.source !== popup || event.data?.type !== 'mf-delete-reauth' || event.data.nonce !== nonce) return;
          finish(event.data.token, event.data.failed || typeof event.data.token !== 'string' || !isCurrent());
        };
        window.addEventListener('message', receive);
        timer = window.setInterval(() => {
          if (popup.closed || !isCurrent() || Date.now() / 1000 - startedAt > 180) { finish('', true); return; }
          // AM: El retorno al mismo origen tambien funciona si el proveedor usa Site URL como fallback.
          try {
            if (popup.location.origin !== origin) return;
            const hash = new URLSearchParams(popup.location.hash.slice(1));
            if (!hash.has('access_token') && !hash.has('error')) return;
            const result = hash.get('access_token');
            popup.history.replaceState({}, '', popup.location.pathname);
            finish(result, Boolean(hash.get('error') || !result));
          } catch { /* AM: Mientras Google sea otro origen, esperar sin leer sus datos. */ }
        }, 250);
        const redirect = new URL(window.location.href); redirect.hash = '';
        redirect.searchParams.set('mf_delete_reauth', nonce);
        // AM: Mantener el formulario en la ventana original y forzar seleccion real de cuenta Google.
        void supabase.auth.signInWithOAuth({ provider: 'google', options: {
          redirectTo: redirect.href, skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account', max_age: '0', login_hint: String(email || '') },
        } }).then(result => {
          if (settled) return;
          if (result.error || !result.data?.url || !isCurrent()) finish('', true);
          else popup.location.replace(result.data.url);
        }).catch(() => finish('', true));
      });
    } finally { popup.close(); }
  } else {
    if (!password || !email) throw new Error('Ingresa tu contrasena para confirmar tu identidad.');
    const result = await supabase.auth.signInWithPassword({ email: String(email).trim().toLowerCase(), password });
    if (result.error || result.data?.user?.id !== expectedUserId) throw new Error('La contrasena no pudo confirmar la misma identidad.');
    token = result.data?.session?.access_token || '';
  }
  if (!token || !isCurrent()) throw new Error('La identidad cambio. Inicia nuevamente la operacion.');
  const verified = await supabase.auth.getUser(token);
  if (verified.error || verified.data?.user?.id !== expectedUserId || !isCurrent()) throw new Error('La identidad confirmada no coincide con tu cuenta.');
  let payload;
  try { payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { /* AM: Evidencia incompleta se rechaza. */ }
  const now = Math.floor(Date.now() / 1000);
  const events = Array.isArray(payload?.amr) ? payload.amr : [];
  const google = verified.data.user.app_metadata?.provider === 'google' || verified.data.user.identities?.some(identity => identity.provider === 'google');
  if (payload?.sub !== expectedUserId || !Number.isInteger(payload?.iat) || now - payload.iat > 300 || payload.iat > now + 60
    || !events.some(event => event.method === (method === 'google' ? 'oauth' : 'password')
      && (method !== 'google' || google) && Number.isInteger(event.timestamp)
      && event.timestamp >= startedAt - 1 && event.timestamp <= now + 60 && event.timestamp <= payload.iat + 60)) {
    throw new Error('Falta una autenticacion reciente valida. Confirma nuevamente tu identidad.');
  }
  return token;
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
  const [reauthMethod, setReauthMethod] = useState("password");
  useEffect(relayDeletionGoogleResult, []);
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
    setReauthMethod("password");
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

  // AM: Invalidar respuestas pendientes cuando cambia la identidad o se cierra el dialogo.
  const generationRef = useRef(0);
  useLayoutEffect(() => {
    generationRef.current += 1;
    resetState();
    return () => { generationRef.current += 1; };
  }, [open, user?.id_usuario, resetState]);

  const loadPreview = useCallback(async () => {
    if (previewStartedRef.current) return;
    previewStartedRef.current = true;
    const generation = generationRef.current;
    setLoadingPreview(true);
    setErrorMessage("");
    try {
      const payload = await getInternalAccountDeletionPreview();
      if (generation === generationRef.current) setPreview(payload);
    } catch (error) {
      if (generation !== generationRef.current) return;
      previewStartedRef.current = false;
      setErrorMessage(sanitizeInternalAccountDeletionError(error, "No se pudo revisar tu cuenta para esta solicitud."));
    } finally {
      if (generation === generationRef.current) setLoadingPreview(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadPreview();
  }, [loadPreview, open, user?.id_usuario]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || submitStartedRef.current) return;
    submitStartedRef.current = true;
    const generation = generationRef.current;
    const current = () => generationRef.current === generation;
    setSubmitting(true);
    setErrorMessage("");
    let reauthToken = "";
    try {
      reauthToken = await getFreshInternalAccountDeletionReauthToken({
        expectedUserId: user?.id_usuario,
        email: user?.email,
        password, method: reauthMethod, isCurrent: current,
      });
      if (!current()) return;
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
      if (!current()) return;
      setPassword("");
      setConfirmationPhrase("");
      onCreated(result, result.message || INTERNAL_ACCOUNT_DELETION_SUCCESS_MESSAGE);
      handleOpenChange(false);
    } catch (error) {
      if (!current()) return;
      submitStartedRef.current = false;
      setErrorMessage(sanitizeInternalAccountDeletionError(error, "No fue posible enviar la solicitud."));
    } finally {
      reauthToken = "";
      if (current()) setPassword("");
      if (current()) setSubmitting(false);
    }
  }, [acks, canSubmit, confirmationPhrase, handleOpenChange, onCreated, password, reauthMethod, user?.email, user?.id_usuario]);

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
                  {/* AM: Cada intento obtiene evidencia nueva; Google conserva el formulario original. */}
                  <label className="text-sm font-semibold" htmlFor="internal-delete-password-method">Metodo de reautenticacion</label>
                  <select id="internal-delete-password-method" className="mf-input w-full" value={reauthMethod} disabled={submitting} onChange={event => { setReauthMethod(event.target.value); setPassword(''); }}>
                    <option value="password">Contrasena</option><option value="google">Google</option>
                  </select>
                  <p className="text-xs text-[var(--mf-text-2)]">Google abrira una ventana nueva. Selecciona la misma cuenta para continuar aqui.</p>

                  <label htmlFor="internal-delete-password" className="text-sm font-semibold text-[var(--mf-text)]">
                    Contrasena de la cuenta
                  </label>
                  <input
                    id="internal-delete-password" hidden={reauthMethod === "google"}
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
